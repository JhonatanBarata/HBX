"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChatActionGrid,
  ChatAvatar,
  ChatEmptyState,
  ChatFieldNote,
  ChatGlyph,
  ChatIconButton,
  ChatQueue,
  ChatQueueItem,
  ChatInfoCard,
} from "@/components/chat/PremiumChat";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxConfirmDialog from "@/components/HbxConfirmDialog";
import { HbxPopup2, HbxPopup3 } from "@/components/HbxPopup";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import ConversationActionList from "@/components/workspace/ConversationActionList";
import ConversationContextPanel from "@/components/workspace/ConversationContextPanel";
import ConversationListPane from "@/components/workspace/ConversationListPane";
import ConversationQueueFilterBar, {
  type ConversationQueueFilterValue,
} from "@/components/workspace/ConversationQueueFilterBar";
import WorkspaceSegmentedControl from "@/components/workspace/WorkspaceSegmentedControl";
import ConversationWorkspaceStatus from "@/components/workspace/ConversationWorkspaceStatus";
import {
  buildAtendimentoContextActions,
  buildAtendimentoContextSummary,
  buildAtendimentoRecoveryPaymentHistory,
  buildAtendimentoRecoverySummary,
  formatAtendimentoRecoveryPaymentStatusLabel,
  getAtendimentoRecoveryPaymentDate,
  getAtendimentoConversationStatusMeta,
  hasAtendimentoRecoveryContext,
  isAtendimentoAgendaConversation,
  mapAtendimentoConversationToneToQueueTone,
} from "@/components/workspace/adapters/atendimento";
import { acquirePopupTopbarLock } from "@/lib/popup-visibility";
import {
  getBotAiPlanRedirectFromError,
  hasBotAi,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import {
  getProviderCapabilitiesFromWhatsAppCenter,
  getProviderLabel,
  type ProviderCapabilities,
} from "@/lib/provider-capabilities";
import {
  type WhatsAppCenterPayload,
} from "@/lib/whatsapp-center";
import { apiFetch, getDashboardApiBaseUrl, getToken } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import AgendaStudioModal, { type AgendaStudioTab } from "./_components/AgendaStudioModal";
import TemplatesPanel, { type TemplateComposer } from "./_components/TemplatesPanel";
import type {
  RecoveryMetaTemplateItem,
  RecoveryMetaTemplatesPayload,
} from "@/app/hbx-recovery/recovery-model";
import {
  ATENDIMENTO_QUEUE_EVENT,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  META_TEMPLATES_REQUIRED_MESSAGE,
  buildAgendaActionId,
  fetchBrazilianHolidays,
  formatCurrency,
  getMessagePreview,
  isAtendimentoBotSetupComplete,
  type InboxBootstrapPayload,
  normalizeAgendaConfig,
  normalizeBotConfig,
  sanitizeAtendimentoBotConfigForTenant,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaSimulationPayload,
  type AtendimentoAgendaSimulationResult,
  type AtendimentoBotConfig,
  type InboxConversation,
  type InboxFullBootstrapPayload,
  type InboxMessage,
} from "./inbox-model";
import { renderSafeText } from "@/lib/renderSafeText";
import styles from "./page.module.css";

type InboxTab = "messages" | "automation";
type InboxQueue = "all" | "groups" | "recovery" | "scheduled" | "bot" | "archived" | "blocked";
type ContextTab = "conversa" | "financeiro" | "agenda";
type QueueActionMenuPosition = { top: number; left: number };
type AtendimentoSection = "conversa" | "financeiro" | "agenda" | "automacao";
type AgendaMode = "sales" | "bot";
type StatusFilter = "all" | "new" | "open" | "closed" | "blocked";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type InboxAttachmentPreview = {
  file: File;
  url: string;
  kind: "image" | "video" | "document" | "audio" | "sticker";
  mimeType: string;
  size: number;
  fileName: string;
};

type OpenedInboxAsset = {
  kind: "image" | "document";
  src: string;
  alt: string;
  title?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

type InboxMessagePagePayload = {
  messages: InboxMessage[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

type InboxRealtimeEvent = {
  companyId: number;
  kind: "message" | "status" | "conversation" | "automation";
  conversationId?: string | number | null;
  messageId?: string | number | null;
  automation?: {
    type?: string | null;
    status?: ProspectingAutomationStatusValue | null;
    text?: string | null;
    campaignId?: string | null;
    jobId?: string | null;
    leadId?: string | null;
  } | null;
  at?: string | null;
};

type ProspectingAutomationStatusValue =
  | "parado"
  | "buscando"
  | "importando"
  | "agendando"
  | "enviando"
  | "aguardando"
  | "dormindo"
  | "pausado"
  | "erro";

type ProspectingAutomationLiveStatus = {
  status: ProspectingAutomationStatusValue;
  text: string;
  active: boolean;
  campaign: (ProspectingCampaignConfig & {
    id: string;
    status: string;
    lastStatusText?: string | null;
    lastError?: string | null;
  }) | null;
  counters: {
    pending?: number;
    todayPending?: number;
    sent?: number;
    interested?: number;
    positives?: number;
    archived?: number;
    failed?: number;
    prospectingGreen?: number;
    prospectingYellow?: number;
    prospectingRed?: number;
  };
  nextScheduledAt?: string | null;
  nextAllowedSendAt?: string | null;
  lastSuccessfulSendAt?: string | null;
  lastError?: string | null;
};

type ProspectingCampaignConfig = {
  city: string;
  state: string;
  segment: string;
  engine: "hbx" | "google";
  targetType: "pj" | "pf" | "agenda_pf";
  messageTemplate: string;
  preMessageEnabled: boolean;
  preMessageVariants: string[];
  intervalMinutes: number;
  intervalVarianceMinutes: number;
  botReplyIntervalReductionPercent: number;
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
  whatIsItIntentKeywords: string[];
  neutralIntentKeywords: string[];
  firstContactVariants: string[];
  positiveReplyVariants: string[];
  whatIsItReplyVariants: string[];
  scheduledReplyVariants: string[];
  optOutVariants: string[];
  neutralHandoffVariants: string[];
  optOutMessage: string;
  optOutReplyEnabled: boolean;
  websiteFallbackEnabled: boolean;
  filtersJson?: Record<string, unknown>;
};

function normalizeProspectingStatusText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isStaleProspectingRadarConfigText(value: unknown) {
  const normalized = normalizeProspectingStatusText(value);
  if (!normalized) return false;
  return (
    normalized.includes("campanha sem") &&
    (normalized.includes("cidade") || normalized.includes("segmento")) &&
    normalized.includes("revise a configuracao da prospeccao")
  );
}

function sanitizeProspectingAutomationStatus(
  status: ProspectingAutomationLiveStatus | null,
): ProspectingAutomationLiveStatus | null {
  if (!status) return status;
  const staleText = isStaleProspectingRadarConfigText(status.text);
  const staleError = isStaleProspectingRadarConfigText(status.lastError);
  const campaign = status.campaign
    ? ({
        ...status.campaign,
        lastStatusText: isStaleProspectingRadarConfigText(status.campaign.lastStatusText)
          ? null
          : status.campaign.lastStatusText,
        lastError: isStaleProspectingRadarConfigText(status.campaign.lastError)
          ? null
          : status.campaign.lastError,
      } as ProspectingAutomationLiveStatus["campaign"])
    : null;
  if (!staleText && !staleError) return { ...status, campaign };
  return {
    ...status,
    status: status.status === "erro" ? "aguardando" : status.status,
    text: staleText ? "Aguardando cards do Vendas com WhatsApp para continuar a Prospecção." : status.text,
    lastError: staleError ? null : status.lastError,
    campaign,
  };
}

const DEFAULT_FIRST_CONTACT_VARIANTS = [
  "{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Trabalho ajudando empresas a melhorar processos e automatizar tarefas repetitivas do dia a dia. Posso te explicar rapidinho e ver se faz sentido aí?",
  "{{cumprimentacao}}, tudo certo? Aqui é o Jhonatan. Eu ajudo empresas a organizar melhor a rotina, reduzir retrabalho e implantar soluções simples para ganhar tempo na operação. Posso te mandar uma ideia rápida?",
  "{{cumprimentacao}}! Sou o Jhonatan. Trabalho com consultoria e implantação de automações para empresas que querem parar de perder tempo com processos manuais, controles soltos e tarefas repetidas. Faz sentido eu te explicar em 1 minuto?",
  "{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Eu olho a rotina da empresa, entendo onde está dando retrabalho e ajudo a implantar soluções práticas para deixar o dia a dia mais organizado. Posso te explicar rapidinho?",
  "{{cumprimentacao}}, tudo bem? Trabalho com melhoria de processos para empresas: atendimento, vendas, administrativo, retornos, controles internos e automações conforme a necessidade. Posso te mostrar por alto como funciona?",
];

const DEFAULT_POSITIVE_REPLY_VARIANTS = [
  "Boa! A ideia é entender como funciona a rotina de vocês hoje, onde tem retrabalho, tarefa manual ou informação perdida, e ver se dá para resolver com uma automação ou ajuste simples no processo. Posso te ligar rapidinho?",
  "Perfeito. Primeiro eu entendo o cenário da empresa, porque cada operação tem um gargalo diferente. Pode ser atendimento, vendas, financeiro, planilhas, retornos, cadastros, tarefas internas… aí vejo o que faria sentido implantar. Posso te chamar numa ligação rápida?",
  "Show. Meu trabalho não é empurrar uma ferramenta pronta. Eu entendo o processo, vejo onde a empresa está perdendo tempo e monto uma solução em cima da necessidade real. Posso te ligar 2 minutinhos para entender melhor?",
  "Legal. Normalmente eu converso com o gestor ou responsável pela operação, faço algumas perguntas sobre a rotina e identifico onde uma melhoria simples já poderia economizar tempo. Pode ser uma ligação rápida?",
  "Boa. A ideia é bem prática: entender o que hoje é manual, repetitivo ou bagunçado, e ver se vale implantar alguma automação, organização ou sistema simples para facilitar. Posso te ligar rapidinho?",
];

const DEFAULT_WHAT_IS_IT_REPLY_VARIANTS = [
  "Claro. É sobre consultoria e implantação de melhorias na rotina da empresa. Eu analiso processos manuais, retrabalho, controles espalhados e tarefas repetitivas, e vejo o que pode ser organizado ou automatizado.",
  "É um trabalho para ajudar empresas a ganhar tempo e reduzir bagunça operacional. Eu entendo como a empresa funciona hoje e proponho soluções práticas: automações, sistemas simples, organização de fluxo ou ajustes no processo.",
  "Basicamente eu ajudo a empresa a parar de depender tanto de planilha solta, memória, mensagem perdida e tarefa manual. Primeiro eu entendo o problema, depois implanto o que fizer sentido para aquela operação.",
  "É uma consultoria bem prática. Eu olho áreas como atendimento, vendas, administrativo, retornos, cadastros, controles e tarefas repetitivas, e vejo onde dá para simplificar ou automatizar.",
  "É sobre melhorar a operação da empresa. Não é uma solução única para todo mundo: eu entendo o gargalo, desenho uma forma mais organizada de trabalhar e implanto algo que ajude no dia a dia.",
];

const DEFAULT_SCHEDULED_REPLY_VARIANTS = [
  "Perfeito, {{retorno_label}} eu te chamo por aqui ou te ligo rapidinho.",
  "Combinado, {{retorno_label}} eu retorno com você.",
  "Fechado, deixei anotado para {{retorno_label}}.",
];
const DEFAULT_PRE_MESSAGE_VARIANTS = [
  "{{cumprimentacao}}, tudo bem?",
];

const LEGACY_FIRST_CONTACT_VARIANTS = [
  "{{cumprimentacao}}, tudo bem? Vi a {{empresaresumo}} em {{cidade}}. Posso te mandar uma ideia rápida?",
  "Oi, tudo bem? Vi a {{empresaresumo}} e pensei numa forma simples de organizar retornos pelo WhatsApp. Posso te explicar rapidinho?",
  "Oi! Vi a {{cliente}} em {{cidade}}. Posso te mandar uma explicação curta sobre organização pelo WhatsApp?",
  "Oii, tudo bem? Trabalho com uma ferramenta para organizar contatos e retornos. Posso te explicar em 1 minuto?",
  "Oi, tudo bem? Vi a {{empresaresumo}} em {{cidade}} e queria te mostrar uma ideia simples para melhorar os retornos. Posso mandar?",
];

const LEGACY_POSITIVE_REPLY_VARIANTS = [
  "Perfeito. Vou deixar um resumo curto aqui para o atendimento humano continuar com você.",
  "Boa. Já vou separar uma explicação objetiva para o nosso atendimento te mostrar com calma.",
  "Combinado. Vou te passar para uma pessoa do time continuar sem mensagem automática.",
  "Legal. Vou preparar o próximo passo para um humano te atender por aqui.",
  "Show. Vou marcar como interessado e deixar o atendimento humano seguir com você.",
];

const LEGACY_WHAT_IS_IT_REPLY_VARIANTS = [
  "É uma forma de organizar contatos, orçamentos e retornos pelo WhatsApp. Posso te ligar rapidinho para explicar melhor?",
  "É sobre organização comercial no WhatsApp: menos retorno perdido e mais controle das conversas. Posso te ligar rapidinho?",
  "É uma ferramenta para ajudar no controle de contatos, tarefas e retornos. Posso te explicar em uma ligação curta?",
  "É uma solução para acompanhar conversas, orçamentos e retornos sem depender de planilha solta. Posso te ligar para mostrar?",
  "É para melhorar a rotina de vendas e atendimento pelo WhatsApp. Posso te ligar rapidinho e ver se faz sentido?",
];

const DEFAULT_OPT_OUT_VARIANTS = [
  "Entendi. Vou arquivar este contato e não chamaremos novamente.",
  "Tudo bem. Vou remover este contato da prospecção.",
  "Entendido. Não vamos chamar novamente por aqui.",
  "Certo, vou arquivar e bloquear novos contatos automáticos.",
  "Sem problema. Seu contato fica removido da nossa prospecção.",
];

const DEFAULT_NEUTRAL_HANDOFF_VARIANTS = [
  "Vou passar para uma pessoa do atendimento continuar com você.",
  "Vou deixar isso com o atendimento humano para responder melhor.",
  "Certo. Um humano continua daqui para frente.",
  "Vou encaminhar para o time humano verificar.",
  "Obrigado pelo retorno. Vou deixar o atendimento humano seguir.",
];
const DEFAULT_WHAT_IS_IT_INTENT_KEYWORDS = ["o que é", "oque é", "sobre o que", "como funciona", "me explica", "explica melhor", "do que se trata"];
const DEFAULT_NEUTRAL_INTENT_KEYWORDS = ["vou ver", "mais tarde", "depois", "manda depois", "me chama depois", "entendi", "ok"];

const DEFAULT_PROSPECTING_CAMPAIGN_CONFIG: ProspectingCampaignConfig = {
  city: "",
  state: "",
  segment: "",
  engine: "hbx",
  targetType: "pj",
  messageTemplate: DEFAULT_FIRST_CONTACT_VARIANTS[0],
  preMessageEnabled: false,
  preMessageVariants: DEFAULT_PRE_MESSAGE_VARIANTS,
  intervalMinutes: 15,
  intervalVarianceMinutes: 30,
  botReplyIntervalReductionPercent: 0,
  workingHoursStart: "08:00",
  workingHoursEnd: "18:00",
  dailyLimit: 10,
  minLeadBuffer: 10,
  desiredLeadBuffer: 10,
  maxAttemptsPerLead: 1,
  typingSeconds: 8,
  typingVarianceSeconds: 12,
  positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
  negativeIntentKeywords: ["não tenho interesse", "não quero", "remover", "pare", "não me chame", "spam", "bloqueia", "não autorizei"],
  whatIsItIntentKeywords: DEFAULT_WHAT_IS_IT_INTENT_KEYWORDS,
  neutralIntentKeywords: DEFAULT_NEUTRAL_INTENT_KEYWORDS,
  firstContactVariants: DEFAULT_FIRST_CONTACT_VARIANTS,
  positiveReplyVariants: DEFAULT_POSITIVE_REPLY_VARIANTS,
  whatIsItReplyVariants: DEFAULT_WHAT_IS_IT_REPLY_VARIANTS,
  scheduledReplyVariants: DEFAULT_SCHEDULED_REPLY_VARIANTS,
  optOutVariants: DEFAULT_OPT_OUT_VARIANTS,
  neutralHandoffVariants: DEFAULT_NEUTRAL_HANDOFF_VARIANTS,
  optOutMessage: DEFAULT_OPT_OUT_VARIANTS[0],
  optOutReplyEnabled: false,
  websiteFallbackEnabled: false,
};

const CLICKABLE_FIRST_CONTACT_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com(?:\.br)?|br|net|org|io|app|dev|ai|co|gov|edu|info|biz|me|site|online|store|tech|digital)(?:\/[^\s<>()]*)?/gi;

const PROSPECTING_VARIABLES = [
  { token: "cumprimentacao", label: "Cumprimentação" },
  { token: "cliente", label: "Cliente" },
  { token: "empresaresumo", label: "Empresa resumo" },
  { token: "empresa", label: "Empresa" },
  { token: "funcionario", label: "Funcionário" },
  { token: "cidade", label: "Cidade" },
  { token: "estado", label: "Estado" },
  { token: "segmento", label: "Segmento" },
  { token: "retorno_label", label: "Retorno combinado" },
];

const COMPANY_LEGAL_SUFFIXES = new Set(["ltda", "me", "mei", "eireli", "epp", "sa", "s/a", "ss"]);
const COMPANY_CONNECTORS = new Set(["e", "de", "da", "do", "das", "dos"]);
const COMPANY_LEADING_GENERIC = new Set(["empresa", "empresas", "companhia", "cia"]);
const COMPANY_DESCRIPTOR_AFTER_GENERIC = new Set([
  "maquina",
  "maquinas",
  "equipamento",
  "equipamentos",
  "comercio",
  "comercial",
  "servico",
  "servicos",
  "industria",
]);

type ProspectingPreviewVariables = {
  funcionario: string;
  empresa: string;
};

type InboxAlertKind = "human_queue" | "new_message";

type AgendaGroupEditableField =
  | "title"
  | "slug"
  | "description"
  | "buttonLabel"
  | "actionType"
  | "linkedAgendaId"
  | "customActionKey"
  | "sortOrder"
  | "introMessage"
  | "emptyMessage"
  | "noImmediateAvailabilityMessage"
  | "linkedEmail"
  | "linkedUserName"
  | "connectionStatus"
  | "accentColor"
  | "isActive"
  | "workdays"
  | "visibleBusinessDays"
  | "searchWindowDays"
  | "suggestedSlotsCount"
  | "fallbackFutureSlotsCount"
  | "simpleMode"
  | "capacityPerDay"
  | "reminderMinutes";

type CurrentUserProfile = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
  masterContext?: {
    active?: boolean | null;
    companyName?: string | null;
  } | null;
};

type UserModule = {
  key: string;
  accessible: boolean;
};

type DeletedConversationAliasMap = Record<string, string>;

type VendasAgendaQueueMetadata = {
  active?: boolean;
  leadId?: string | null;
  sourceModule?: string | null;
  sourceBlock?: string | null;
  queueTarget?: string | null;
  routeTarget?: string | null;
  respondedAt?: string | null;
  status?: string | null;
  nextAction?: string | null;
  returnAt?: string | null;
  draftMessage?: string | null;
  draftPending?: boolean;
  syncedAt?: string | null;
  lastManualSendAt?: string | null;
  manualSent?: boolean | string | number | null;
  manualSentAt?: string | null;
  botEligible?: boolean | string | number | null;
  botEntryPending?: boolean | string | number | null;
  humanAssigned?: boolean | string | number | null;
  manualQueueOverride?: string | null;
  manualQueueOverriddenAt?: string | null;
  whatsappAvailabilityStatus?: string | null;
};

type VendasProspeccaoStage =
  | "pending_send"
  | "scheduled_send"
  | "sent_waiting"
  | "reply_received"
  | "expired_no_reply"
  | "needs_review"
  | "no_whatsapp"
  | "negative_reply";

type VendasProspeccaoMetadata = {
  stage?: VendasProspeccaoStage | string | null;
  firstOutboundAt?: string | null;
  lastInboundAt?: string | null;
  replyDeadlineAt?: string | null;
  leadSegment?: string | null;
  campaignSegment?: string | null;
  mismatchReason?: string | null;
};

type CustomerConversationCardPayload = {
  customer: {
    profileId?: string | null;
    name?: string | null;
    phone?: string | null;
    phoneNormalized?: string | null;
    doNotCall?: boolean | null;
    doNotCallReason?: string | null;
    observations?: string | null;
    updatedAt?: string | null;
  };
  lead?: {
    id?: string | null;
    status?: string | null;
    statusLabel?: string | null;
    nextAction?: string | null;
    returnAt?: string | null;
    attemptCount?: number | null;
    timesSeen?: number | null;
    sourceType?: string | null;
    address?: string | null;
    website?: string | null;
    rating?: number | null;
    reviews?: number | null;
    shortNote?: string | null;
    lastContactAt?: string | null;
    updatedAt?: string | null;
  } | null;
  history?: Array<{
    id: string;
    eventType?: string | null;
    title?: string | null;
    description?: string | null;
    resultLabel?: string | null;
    returnAt?: string | null;
    createdAt?: string | null;
  }>;
};

type CustomerConversationCardDraft = {
  doNotCall: boolean;
  returnAt: string;
  observations: string;
};

const INBOX_QUEUE_ORDER: InboxQueue[] = [
  "all",
  "scheduled",
  "bot",
  "recovery",
  "groups",
  "blocked",
];

function buildInboxQueueBooleanMap(value = false): Record<InboxQueue, boolean> {
  return Object.fromEntries(INBOX_QUEUE_ORDER.map((queue) => [queue, value])) as Record<InboxQueue, boolean>;
}

const INBOX_BOT_PLAN_HREF = "/planos?intent=bot_ia&from=inbox_bot";

const INBOX_MANUAL_QUEUE_STORAGE_KEY = "hbx:inbox:manual-queue-overrides";
const INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY = "hbx:inbox:deleted-conversation-aliases";
const INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY = "hbx:inbox:global-bot-enabled";
const INBOX_INITIAL_MIRROR_SESSION_KEY = "hbx:inbox:full-bootstrap:session";
const INBOX_BOOTSTRAP_STAGE_SEQUENCE = [
  { label: "Lendo motor", value: "01/04" },
  { label: "Espelhando conversas", value: "02/04" },
  { label: "Baixando historico", value: "03/04" },
  { label: "Gravando nomes, fotos e midias", value: "04/04" },
] as const;

const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";
const ATENDIMENTO_PROGRESS_STEPS = ["lendo banco", "filtrando negativos", "selecionando melhores cards", "alimentando Vendas/Prospecção"];
const DEFAULT_META_TEMPLATES_PAYLOAD: RecoveryMetaTemplatesPayload = {
  phoneNumberId: null,
  wabaId: null,
  lastSyncAt: null,
  syncError: null,
  counters: {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    hbxActive: 0,
    eligible: 0,
  },
  templates: [],
  history: [],
};

const DEFAULT_TEMPLATE_COMPOSER: TemplateComposer = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  bodyText:
    "Olá, tudo bem? Aqui é da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto financeiro pendente referente ao serviço realizado em {{data_servico}}.\nEu poderia te mostrar opções de pagamentos?",
  footerText: "Recovery",
  buttonsText: "Sim\nNão, obrigado",
  activateInHbx: true,
  headerFormat: "NONE",
  headerText: "",
  headerHandle: "",
  headerMediaUrl: "",
};

const CONTEXT_TAB_ITEMS: Array<{ id: ContextTab; label: string }> = [
  { id: "conversa", label: "Conversa" },
  { id: "financeiro", label: "Financeiro" },
  { id: "agenda", label: "Agenda" },
];

function normalizeInboxTab(value: string | null | undefined): InboxTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "messages") {
    return "messages";
  }
  if (normalized === "automation" || normalized === "recovery") {
    return "automation";
  }
  return null;
}

function normalizeInboxQueueParam(value: string | null | undefined): InboxQueue | null {
  const normalized = String(value || "").trim().toLowerCase();
  return INBOX_QUEUE_ORDER.includes(normalized as InboxQueue) ? (normalized as InboxQueue) : null;
}

function normalizeAtendimentoSectionParam(value: string | null | undefined): AtendimentoSection | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "conversa" || normalized === "financeiro" || normalized === "agenda" || normalized === "automacao") {
    return normalized;
  }
  if (normalized === "automation") return "automacao";
  return null;
}

function getInboxQueueLabel(queue: InboxQueue) {
  switch (queue) {
    case "groups":
      return "Grupos";
    case "recovery":
      return "Recovery";
    case "scheduled":
      return "Atendimento";
    case "bot":
      return "Prospecção";
    case "archived":
      return "Encerrado";
    case "blocked":
      return "Bloqueados";
    default:
      return "Pessoais";
  }
}

function getConversationNoteStorageKey(companyId: number | null | undefined, conversationId: string | null) {
  if (!companyId || !conversationId) return null;
  return `hbx:inbox:note:${companyId}:${conversationId}`;
}

type DockGlyph = "note" | "wallet" | "clock" | "gear" | "spark" | "shield" | "user";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function readStoredGlobalBotEnabled() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function writeStoredGlobalBotEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

function normalizeDeletedConversationAliasMap(raw: unknown): DeletedConversationAliasMap {
  if (Array.isArray(raw)) {
    const fallbackDeletedAt = new Date().toISOString();
    return Object.fromEntries(
      raw
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map((alias) => [alias, fallbackDeletedAt]),
    );
  }

  if (!raw || typeof raw !== "object") {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([alias, deletedAt]) => [String(alias || "").trim(), String(deletedAt || "").trim()] as const)
    .filter(([alias, deletedAt]) => alias && deletedAt);

  return Object.fromEntries(entries);
}

function normalizeInboxConversationId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "nan") return null;
  return normalized;
}

function getInboxConversationRuntimeId(conversation: unknown) {
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    return null;
  }

  const record = conversation as Record<string, unknown>;
  const nestedConversation =
    record.conversation && typeof record.conversation === "object" && !Array.isArray(record.conversation)
      ? (record.conversation as Record<string, unknown>)
      : null;
  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : null;
  const customer =
    record.customer && typeof record.customer === "object" && !Array.isArray(record.customer)
      ? (record.customer as Record<string, unknown>)
      : null;

  const candidates = [
    record.id,
    record.conversationId,
    record.conversation_id,
    nestedConversation?.id,
    nestedConversation?.conversationId,
    metadata?.conversationId,
    metadata?.companyConversationId,
    customer?.conversationId,
  ];

  for (const candidate of candidates) {
    const id = normalizeInboxConversationId(candidate);
    if (id) return id;
  }

  return null;
}

function normalizeInboxConversationPayload(
  conversation: InboxConversation | null | undefined,
) {
  const id = getInboxConversationRuntimeId(conversation);
  if (!id || !conversation) return null;
  return {
    ...conversation,
    id,
  } as InboxConversation;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </svg>
  );
}

function RobotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="6" y="8" width="12" height="10" rx="3" />
      <path d="M12 5v3" />
      <path d="M9.2 13h.01" />
      <path d="M14.8 13h.01" />
      <path d="M10 16h4" />
      <path d="M4 12h2" />
      <path d="M18 12h2" />
      <path d="M9 21h6" />
    </svg>
  );
}

function DockButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: DockGlyph;
  label: string;
  active?: boolean;
  badge?: number | string | null;
  onClick: () => void;
}) {
  const hasBadge = badge !== null && badge !== undefined && badge !== "" && badge !== 0;

  return (
    <button
      type="button"
      className={`${styles.commandDockButton} hbx-tab-glide__item`}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className={styles.commandDockIcon}>
        <ChatGlyph name={icon} />
      </span>
      {hasBadge ? <span className={styles.commandDockBadge}>{badge}</span> : null}
    </button>
  );
}

function formatAutomationStatusLabel(status: ProspectingAutomationStatusValue) {
  switch (status) {
    case "buscando":
      return "Buscando";
    case "importando":
      return "Importando";
    case "agendando":
      return "Agendando";
    case "enviando":
      return "Enviando";
    case "aguardando":
      return "Aguardando";
    case "dormindo":
      return "Bot dormindo";
    case "pausado":
      return "Pausado";
    case "erro":
      return "Erro";
    default:
      return "Parado";
  }
}

function formatAutomationScheduleLabel(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOf(parsed) - startOf(now)) / 86400000);
  const time = parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Próximo envio hoje às ${time}`;
  if (diffDays === 1) return `Próximo envio amanhã às ${time}`;
  return `Próximo envio em ${parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}

function resolveNextProspectionSendAt(status: ProspectingAutomationLiveStatus | null) {
  if (status?.campaign?.status !== "running") return null;
  const lastSuccessfulSendAt = new Date(String(status.lastSuccessfulSendAt || ""));
  const intervalMinutes = Math.max(1, Number(status.campaign?.intervalMinutes || 0) || 0);
  const fallbackNextAllowedAt = Number.isNaN(lastSuccessfulSendAt.getTime())
    ? null
    : new Date(lastSuccessfulSendAt.getTime() + intervalMinutes * 60_000).toISOString();
  const candidates = [status.nextScheduledAt, status.nextAllowedSendAt]
    .concat(fallbackNextAllowedAt ? [fallbackNextAllowedAt] : [])
    .map((value) => {
      const parsed = new Date(String(value || ""));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((value): value is Date => value instanceof Date && value.getTime() > Date.now());
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map((value) => value.getTime()))).toISOString();
}

function formatProspectionCountdownLabel(targetAt: string, now = Date.now()) {
  const target = new Date(targetAt).getTime();
  if (!Number.isFinite(target)) return null;
  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 100) return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}

function ProspectionCountdownBadge({ targetAt }: { targetAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const label = formatProspectionCountdownLabel(targetAt, now);
  if (!label) return null;
  return <span className={styles.commandDockRobotTimer}>{label}</span>;
}

function parseAutomationClock(value: string | null | undefined, fallback: string) {
  const source = /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
  const [hourRaw, minuteRaw] = source.split(":");
  return {
    hour: Math.min(23, Math.max(0, Number(hourRaw) || 0)),
    minute: Math.min(59, Math.max(0, Number(minuteRaw) || 0)),
  };
}

function getNextAutomationWorkingStart(
  campaign: ProspectingAutomationLiveStatus["campaign"],
  reference = new Date(),
) {
  const start = parseAutomationClock(campaign?.workingHoursStart, "09:00");
  const end = parseAutomationClock(campaign?.workingHoursEnd, "17:30");
  const target = new Date(reference);
  target.setSeconds(0, 0);

  const moveToNextBusinessDay = () => {
    do {
      target.setDate(target.getDate() + 1);
    } while (target.getDay() === 0 || target.getDay() === 6);
    target.setHours(start.hour, start.minute, 0, 0);
  };

  if (target.getDay() === 0 || target.getDay() === 6) {
    moveToNextBusinessDay();
    return target;
  }

  const startToday = new Date(reference);
  startToday.setHours(start.hour, start.minute, 0, 0);
  const endToday = new Date(reference);
  endToday.setHours(end.hour, end.minute, 0, 0);

  if (reference.getTime() < startToday.getTime()) return startToday;
  if (reference.getTime() <= endToday.getTime()) return reference;

  moveToNextBusinessDay();
  return target;
}

function isAutomationInsideWorkingWindow(campaign: ProspectingAutomationLiveStatus["campaign"]) {
  if (!campaign || campaign.status !== "running") return true;
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  const start = parseAutomationClock(campaign.workingHoursStart, "09:00");
  const end = parseAutomationClock(campaign.workingHoursEnd, "17:30");
  const startToday = new Date(now);
  startToday.setHours(start.hour, start.minute, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(end.hour, end.minute, 0, 0);
  return now.getTime() >= startToday.getTime() && now.getTime() <= endToday.getTime();
}

function formatAutomationSleepingText(campaign: ProspectingAutomationLiveStatus["campaign"]) {
  const next = getNextAutomationWorkingStart(campaign);
  const today = new Date();
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOf(next) - startOf(today)) / 86400000);
  const time = next.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : `em ${next.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  return `Bot em repouso. Fora do horário operacional; retomada ${dayLabel} às ${time}.`;
}

function getProspectingRobotTone(
  status: ProspectingAutomationLiveStatus | null,
  globalBotEnabled: boolean,
  loading: boolean,
) {
  if (!globalBotEnabled) return "off";
  if (loading) return "working";
  const currentStatus = String(status?.status || "").trim().toLowerCase();
  const campaignStatus = String(status?.campaign?.status || "").trim().toLowerCase();
  const text = String(status?.text || status?.lastError || "").trim().toLowerCase();
  if (currentStatus === "erro" || Boolean(status?.lastError)) return "error";
  if (campaignStatus === "paused" || currentStatus === "pausado") return "paused";
  if (status?.active || campaignStatus === "running") return "working";
  if (
    text.includes("sem card") ||
    text.includes("sem contato") ||
    text.includes("sem lead") ||
    text.includes("no eligible") ||
    text.includes("fila vazia") ||
    text.includes("sem oportunidade")
  ) {
    return "empty";
  }
  const counters = status?.counters || {};
  const pending = Number(counters.pending ?? counters.todayPending ?? 0) || 0;
  if (campaignStatus === "running" && pending <= 0 && ["parado", "aguardando", "pausado"].includes(currentStatus)) {
    return "empty";
  }
  return "off";
}

function normalizeProspectingList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]+/g)
      : fallback;
  const items = source
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : fallback;
}

function normalizeProspectingVariantList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/g)
      : fallback;
  const items = source
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : fallback;
}

function normalizeProspectingVariantSignature(items: string[]) {
  return items
    .map((item) => String(item || "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function replaceLegacyProspectingVariants(items: string[], legacy: string[], nextDefaults: string[]) {
  const currentSignature = normalizeProspectingVariantSignature(items);
  if (!currentSignature) return nextDefaults;
  const legacySignature = normalizeProspectingVariantSignature(legacy);
  const currentSet = new Set(currentSignature.split("\n").filter(Boolean));
  const legacySet = new Set(legacySignature.split("\n").filter(Boolean));
  const onlyLegacyItems = currentSet.size > 0 && Array.from(currentSet).every((item) => legacySet.has(item));
  return currentSignature === legacySignature || onlyLegacyItems ? nextDefaults : items;
}

function joinProspectingVariantList(value: string[]) {
  return normalizeProspectingVariantList(value, []).join("\n");
}

function calculateProspectingCapacity(config: ProspectingCampaignConfig) {
  const [startHour, startMinute] = String(config.workingHoursStart || "08:00").split(":").map((part) => Number(part) || 0);
  const [endHour, endMinute] = String(config.workingHoursEnd || "18:00").split(":").map((part) => Number(part) || 0);
  const windowMinutes = Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute));
  const averageInterval = Math.max(1, Number(config.intervalMinutes || 15)) + Math.max(0, Number(config.intervalVarianceMinutes || 0)) / 2;
  return Math.max(1, Math.min(80, Math.floor(windowMinutes / averageInterval)));
}

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

function normalizeCompanyToken(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:()[\]{}]/g, "")
    .trim()
    .toLowerCase();
}

function smartCompanyTitle(value: string) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const shouldTitle = compact === compact.toUpperCase() || compact === compact.toLowerCase();
  if (!shouldTitle) return compact;
  return compact
    .split(" ")
    .map((word, index) => {
      const normalized = normalizeCompanyToken(word);
      if (index > 0 && COMPANY_CONNECTORS.has(normalized)) return normalized;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR");
    })
    .join(" ");
}

function summarizeCompanyName(value: string) {
  const words = String(value || "")
    .replace(/[|/\\_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length && COMPANY_LEGAL_SUFFIXES.has(normalizeCompanyToken(words[words.length - 1]))) {
    words.pop();
  }

  const selected: string[] = [];
  let removedGenericPrefix = false;
  for (const word of words) {
    const normalized = normalizeCompanyToken(word);
    if (!selected.length && (COMPANY_LEADING_GENERIC.has(normalized) || COMPANY_CONNECTORS.has(normalized))) {
      removedGenericPrefix = true;
      continue;
    }
    if (!selected.length && removedGenericPrefix && COMPANY_DESCRIPTOR_AFTER_GENERIC.has(normalized)) continue;
    selected.push(word);
  }

  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[0]))) selected.shift();
  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[selected.length - 1]))) selected.pop();

  const compact = selected.slice(0, 4).join(" ") || words.slice(0, 3).join(" ");
  return smartCompanyTitle(compact);
}

function renderProspectingPreview(
  template: string,
  config: ProspectingCampaignConfig,
  variables: ProspectingPreviewVariables,
  extraValues: Record<string, string> = {},
) {
  const values: Record<string, string> = {
    cumprimentacao: computeBrasiliaGreeting(),
    cliente: "Cliente Modelo",
    empresaresumo: summarizeCompanyName("Empresa de Máquinas Agrícolas e Pesados LTDA"),
    clienteresumo: summarizeCompanyName("Empresa de Máquinas Agrícolas e Pesados LTDA"),
    empresa: variables.empresa,
    funcionario: variables.funcionario,
    cidade: config.city || "sua região",
    estado: config.state || "BR",
    segmento: config.segment || "seu segmento",
    retorno_label: "amanhã às 09:00",
    horario_retorno: "amanhã às 09:00",
    ...extraValues,
  };
  return String(template || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => values[token] || `[${token}]`)
    .trim();
}

function resolveProspectingPreviewReturnLabel(text: string) {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const timeMatch = normalized.match(/(?:as|apos|depois das|depois de|umas|por volta das)?\s*(\d{1,2})(?::?(\d{2}))?\s*h?\b/);
  const timeLabel = timeMatch
    ? `${String(Math.min(23, Math.max(0, Number(timeMatch[1] || 0)))).padStart(2, "0")}:${String(Math.min(59, Math.max(0, Number(timeMatch[2] || 0)))).padStart(2, "0")}`
    : "";
  const dayLabel =
    normalized.includes("amanha") ? "amanhã"
      : normalized.includes("segunda") ? "segunda-feira"
        : normalized.includes("terca") ? "terça-feira"
          : normalized.includes("quarta") ? "quarta-feira"
            : normalized.includes("quinta") ? "quinta-feira"
              : normalized.includes("sexta") ? "sexta-feira"
                : normalized.includes("sabado") ? "sábado"
                  : normalized.includes("domingo") ? "domingo"
                    : normalized.includes("hoje") ? "hoje"
                      : "";
  if (dayLabel && timeLabel) return `${dayLabel} às ${timeLabel}`;
  if (dayLabel) return dayLabel;
  if (timeLabel) return `hoje às ${timeLabel}`;
  if (normalized.includes("manha")) return "pela manhã";
  if (normalized.includes("tarde")) return "à tarde";
  return "no horário combinado";
}

function computeBrasiliaGreeting() {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  if (hour >= 18 || hour < 3) return "Boa noite";
  if (hour >= 12) return "Boa tarde";
  return "Bom dia";
}

function buildProspectingCampaignConfig(status: ProspectingAutomationLiveStatus | null): ProspectingCampaignConfig {
  const campaign = status?.campaign;
  const campaignFilters: Record<string, unknown> =
    campaign?.filtersJson && typeof campaign.filtersJson === "object" ? campaign.filtersJson : {};
  const campaignMessageTemplate = String(campaign?.messageTemplate || "").trim();
  const campaignOptOutMessage = String(campaign?.optOutMessage || "").trim();
  return {
    ...DEFAULT_PROSPECTING_CAMPAIGN_CONFIG,
    ...(campaign || {}),
    city: String(campaign?.city || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.city),
    state: String(campaign?.state || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.state),
    segment: String(campaign?.segment || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.segment),
    engine: campaign?.engine === "google" ? "google" : "hbx",
    targetType:
      campaign?.targetType === "pf" || campaign?.targetType === "agenda_pf"
        ? campaign.targetType
        : "pj",
    messageTemplate: String(campaign?.messageTemplate || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.messageTemplate),
    preMessageEnabled: Boolean(campaign?.preMessageEnabled ?? campaignFilters.preMessageEnabled ?? DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.preMessageEnabled),
    preMessageVariants: normalizeProspectingVariantList(
      campaign?.preMessageVariants || campaignFilters.preMessageVariants,
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.preMessageVariants,
    ),
    intervalMinutes: Number(campaign?.intervalMinutes || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.intervalMinutes),
    intervalVarianceMinutes: Number(campaign?.intervalVarianceMinutes || campaignFilters.intervalVarianceMinutes || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.intervalVarianceMinutes),
    botReplyIntervalReductionPercent: Number(
      campaign?.botReplyIntervalReductionPercent ??
        campaignFilters.botReplyIntervalReductionPercent ??
        DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.botReplyIntervalReductionPercent,
    ),
    workingHoursStart: String(campaign?.workingHoursStart || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.workingHoursStart),
    workingHoursEnd: String(campaign?.workingHoursEnd || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.workingHoursEnd),
    dailyLimit: Number(campaign?.dailyLimit || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.dailyLimit),
    minLeadBuffer: Number(campaign?.minLeadBuffer || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.minLeadBuffer),
    desiredLeadBuffer: Number(campaign?.desiredLeadBuffer || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.desiredLeadBuffer),
    maxAttemptsPerLead: Math.max(1, Number(campaign?.maxAttemptsPerLead || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.maxAttemptsPerLead)),
    typingSeconds: Number(campaign?.typingSeconds || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.typingSeconds),
    typingVarianceSeconds: Number(campaign?.typingVarianceSeconds || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.typingVarianceSeconds),
    positiveIntentKeywords: Array.isArray(campaign?.positiveIntentKeywords)
      ? campaign.positiveIntentKeywords
      : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.positiveIntentKeywords,
    negativeIntentKeywords: Array.isArray(campaign?.negativeIntentKeywords)
      ? campaign.negativeIntentKeywords
      : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.negativeIntentKeywords,
    whatIsItIntentKeywords: normalizeProspectingList(campaign?.whatIsItIntentKeywords || campaignFilters.whatIsItIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.whatIsItIntentKeywords),
    neutralIntentKeywords: normalizeProspectingList(campaign?.neutralIntentKeywords || campaignFilters.neutralIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.neutralIntentKeywords),
    firstContactVariants: replaceLegacyProspectingVariants(
      normalizeProspectingVariantList(
        campaign?.firstContactVariants || campaignFilters.firstContactVariants || (campaignMessageTemplate ? [campaignMessageTemplate] : null),
        DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.firstContactVariants,
      ),
      LEGACY_FIRST_CONTACT_VARIANTS,
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.firstContactVariants,
    ),
    positiveReplyVariants: replaceLegacyProspectingVariants(
      normalizeProspectingVariantList(campaign?.positiveReplyVariants || campaignFilters.positiveReplyVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.positiveReplyVariants),
      LEGACY_POSITIVE_REPLY_VARIANTS,
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.positiveReplyVariants,
    ),
    whatIsItReplyVariants: replaceLegacyProspectingVariants(
      normalizeProspectingVariantList(campaign?.whatIsItReplyVariants || campaignFilters.whatIsItReplyVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.whatIsItReplyVariants),
      LEGACY_WHAT_IS_IT_REPLY_VARIANTS,
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.whatIsItReplyVariants,
    ),
    scheduledReplyVariants: normalizeProspectingVariantList(
      campaign?.scheduledReplyVariants || campaignFilters.scheduledReplyVariants,
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.scheduledReplyVariants,
    ),
    optOutVariants: normalizeProspectingVariantList(
      campaign?.optOutVariants || campaignFilters.optOutVariants || (campaignOptOutMessage ? [campaignOptOutMessage] : null),
      DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.optOutVariants,
    ),
    neutralHandoffVariants: normalizeProspectingVariantList(campaign?.neutralHandoffVariants || campaignFilters.neutralHandoffVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.neutralHandoffVariants),
    optOutMessage: String(campaign?.optOutMessage || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.optOutMessage),
    optOutReplyEnabled: Boolean(campaign?.optOutReplyEnabled ?? campaignFilters.optOutReplyEnabled ?? DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.optOutReplyEnabled),
    websiteFallbackEnabled: false,
    filtersJson: campaignFilters,
  };
}

function toProspectingCampaignPayload(config: ProspectingCampaignConfig): Record<string, unknown> {
  const preMessageVariants = normalizeProspectingVariantList(config.preMessageVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.preMessageVariants)
    .map((message) => sanitizeFirstContactPreview(message))
    .filter(Boolean);
  const firstContactVariants = normalizeProspectingVariantList(config.firstContactVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.firstContactVariants)
    .map((message) => sanitizeFirstContactPreview(message))
    .filter(Boolean);
  const optOutVariants = normalizeProspectingVariantList(config.optOutVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.optOutVariants);
  const positiveReplyVariants = normalizeProspectingVariantList(config.positiveReplyVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.positiveReplyVariants);
  const whatIsItReplyVariants = normalizeProspectingVariantList(config.whatIsItReplyVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.whatIsItReplyVariants);
  const scheduledReplyVariants = normalizeProspectingVariantList(config.scheduledReplyVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.scheduledReplyVariants);
  const neutralHandoffVariants = normalizeProspectingVariantList(config.neutralHandoffVariants, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.neutralHandoffVariants);
  const whatIsItIntentKeywords = normalizeProspectingList(config.whatIsItIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.whatIsItIntentKeywords);
  const neutralIntentKeywords = normalizeProspectingList(config.neutralIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.neutralIntentKeywords);
  const intervalVarianceMinutes = Math.max(0, Math.trunc(Number(config.intervalVarianceMinutes || 0)));
  const botReplyIntervalReductionPercent = Math.max(0, Math.min(100, Math.trunc(Number(config.botReplyIntervalReductionPercent || 0))));
  return {
    state: config.state.trim().toUpperCase(),
    city: config.city.trim(),
    segment: config.segment.trim(),
    engine: "hbx",
    targetType: "pj",
    messageTemplate: firstContactVariants[0] || sanitizeFirstContactPreview(config.messageTemplate) || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.messageTemplate,
    preMessageEnabled: config.preMessageEnabled,
    preMessageVariants: preMessageVariants.length ? preMessageVariants : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.preMessageVariants,
    dailyLimit: calculateProspectingCapacity(config),
    intervalMinutes: Math.max(1, Math.trunc(Number(config.intervalMinutes || 1))),
    intervalVarianceMinutes,
    botReplyIntervalReductionPercent,
    minLeadBuffer: Math.max(1, Math.trunc(Number(config.minLeadBuffer || 1))),
    desiredLeadBuffer: Math.max(1, Math.trunc(Number(config.desiredLeadBuffer || 1))),
    maxAttemptsPerLead: Math.max(1, Math.trunc(Number(config.maxAttemptsPerLead || 1))),
    workingHoursStart: config.workingHoursStart,
    workingHoursEnd: config.workingHoursEnd,
    typingSeconds: Math.max(0, Math.trunc(Number(config.typingSeconds || 0))),
    typingVarianceSeconds: Math.max(0, Math.trunc(Number(config.typingVarianceSeconds || 0))),
    positiveIntentKeywords: normalizeProspectingList(config.positiveIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.positiveIntentKeywords),
    negativeIntentKeywords: normalizeProspectingList(config.negativeIntentKeywords, DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.negativeIntentKeywords),
    whatIsItIntentKeywords,
    neutralIntentKeywords,
    firstContactVariants: firstContactVariants.length ? firstContactVariants : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.firstContactVariants,
    positiveReplyVariants,
    whatIsItReplyVariants,
    scheduledReplyVariants,
    optOutVariants,
    neutralHandoffVariants,
    optOutMessage: optOutVariants[0] || config.optOutMessage || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.optOutMessage,
    optOutReplyEnabled: config.optOutReplyEnabled,
    websiteFallbackEnabled: false,
    filtersJson: {
      ...(config.filtersJson || {}),
      preMessageEnabled: config.preMessageEnabled,
      preMessageVariants: preMessageVariants.length ? preMessageVariants : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.preMessageVariants,
      intervalVarianceMinutes,
      botReplyIntervalReductionPercent,
      firstContactVariants: firstContactVariants.length ? firstContactVariants : DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.firstContactVariants,
      positiveReplyVariants,
      whatIsItReplyVariants,
      scheduledReplyVariants,
      optOutVariants,
      neutralHandoffVariants,
      whatIsItIntentKeywords,
      neutralIntentKeywords,
      optOutReplyEnabled: config.optOutReplyEnabled,
    },
  };
}

function ProspectingAutomationStatus({
  status,
  loading,
  actionLoading,
  disabled = false,
  onConfigure,
  onPause,
  onResume,
}: {
  status: ProspectingAutomationLiveStatus | null;
  loading: boolean;
  actionLoading: boolean;
  disabled?: boolean;
  onConfigure: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const outsideWorkingHours = Boolean(
    status?.campaign?.status === "running" && !isAutomationInsideWorkingWindow(status.campaign),
  );
  const currentStatus = outsideWorkingHours ? "dormindo" : status?.status || "parado";
  const rawCounters = status?.counters || {};
  const counters = {
    pending: Number(rawCounters.pending ?? rawCounters.todayPending ?? 0) || 0,
    sent: Number(rawCounters.sent ?? 0) || 0,
    interested: Number(rawCounters.interested ?? rawCounters.positives ?? 0) || 0,
    archived: Number(rawCounters.archived ?? 0) || 0,
    failed: Number(rawCounters.failed ?? 0) || 0,
  };
  const nextLabel = formatAutomationScheduleLabel(status?.nextScheduledAt);
  const busy =
    !outsideWorkingHours &&
    (
      loading ||
      currentStatus === "buscando" ||
      currentStatus === "importando" ||
      currentStatus === "agendando" ||
      currentStatus === "enviando"
    );
  const canPause = Boolean(status?.campaign && status.campaign.status === "running" && currentStatus !== "dormindo");
  const canResume = Boolean(status?.campaign && status.campaign.status === "paused");
  const text =
    disabled
      ? "Hbot desativado. Ative o Hbot para controlar a prospecção."
      : outsideWorkingHours
        ? formatAutomationSleepingText(status?.campaign || null)
        : status?.text ||
          nextLabel ||
          (counters.pending > 0 ? `${counters.pending} contatos na fila` : "Automação parada");

  return (
    <section className={styles.automationPulse} data-status={currentStatus} data-disabled={disabled ? "true" : "false"}>
      <div className={styles.automationPulseMain}>
        <span className={styles.automationPulseDot} data-busy={busy ? "true" : "false"} />
        <div className={styles.automationPulseText}>
          <strong>{formatAutomationStatusLabel(currentStatus)}</strong>
          <span>{!disabled && nextLabel && currentStatus === "aguardando" ? nextLabel : text}</span>
        </div>
      </div>
      <div className={styles.automationPulseCounters} aria-label="Resumo da prospecção automática">
        <span>Pendentes <strong>{counters.pending}</strong></span>
        <span>Enviados <strong>{counters.sent}</strong></span>
        <span>Interessados <strong>{counters.interested}</strong></span>
        <span title="Negativos, sem resposta, pulados ou encerrados pela automação">Encerrados <strong>{counters.archived}</strong></span>
        <span>Falhas <strong>{counters.failed}</strong></span>
      </div>
      <div className={styles.automationPulseActions}>
        <button type="button" onClick={onConfigure} disabled={disabled}>
          Configurar
        </button>
        {canPause ? (
          <button type="button" onClick={onPause} disabled={disabled || actionLoading}>
            {actionLoading ? "..." : "Pausar"}
          </button>
        ) : canResume ? (
          <button type="button" onClick={onResume} disabled={disabled || actionLoading}>
            {actionLoading ? "..." : "Ativar"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

type ProspectingVariantField =
  | "preMessageVariants"
  | "firstContactVariants"
  | "positiveReplyVariants"
  | "whatIsItReplyVariants"
  | "scheduledReplyVariants"
  | "optOutVariants"
  | "neutralHandoffVariants";

type ProspectingKeywordField =
  | "positiveIntentKeywords"
  | "negativeIntentKeywords"
  | "whatIsItIntentKeywords"
  | "neutralIntentKeywords";

type ProspectingVariableTarget = "messageTemplate" | "optOutMessage" | ProspectingVariantField;
type ProspectingIntentKind = "positive" | "whatIsIt" | "scheduled" | "neutral" | "negative";

type ProspectingPreviewScenario = {
  kind: ProspectingIntentKind;
  text: string;
};

const PROSPECTING_RISK_CONFIRMATION_KEY = "hbx:prospeccao:risk-confirmation:v1";

type ProspectingValidationField =
  | "workingHoursStart"
  | "workingHoursEnd"
  | "preMessageVariants"
  | "firstContactVariants"
  | "intervalMinutes"
  | "intervalVarianceMinutes"
  | "botReplyIntervalReductionPercent"
  | "typingSeconds"
  | "typingVarianceSeconds"
  | "maxAttemptsPerLead";

const PROSPECTING_VALIDATION_FIELD_LABELS: Record<ProspectingValidationField, string> = {
  workingHoursStart: "horário de início",
  workingHoursEnd: "horário de fim",
  preMessageVariants: "pré-mensagem",
  firstContactVariants: "primeira mensagem",
  intervalMinutes: "intervalo",
  intervalVarianceMinutes: "variação do intervalo",
  botReplyIntervalReductionPercent: "redução ao detectar bot",
  typingSeconds: "typing",
  typingVarianceSeconds: "variação do typing",
  maxAttemptsPerLead: "tentativas por contato",
};

function prospectingInteger(value: unknown) {
  return Math.trunc(Number(value || 0));
}

function prospectingFieldFromBackendMessage(message: string): ProspectingValidationField[] {
  const normalized = String(message || "").toLowerCase();
  const fields: ProspectingValidationField[] = [];
  const add = (field: ProspectingValidationField) => {
    if (!fields.includes(field)) fields.push(field);
  };
  if (normalized.includes("workinghoursstart")) add("workingHoursStart");
  if (normalized.includes("workinghoursend")) add("workingHoursEnd");
  if (normalized.includes("premessagevariants")) add("preMessageVariants");
  if (normalized.includes("firstcontactvariants") || normalized.includes("messagetemplate")) add("firstContactVariants");
  if (normalized.includes("intervalminutes")) add("intervalMinutes");
  if (normalized.includes("intervalvarianceminutes")) add("intervalVarianceMinutes");
  if (normalized.includes("botreplyintervalreductionpercent")) add("botReplyIntervalReductionPercent");
  if (normalized.includes("typingseconds")) add("typingSeconds");
  if (normalized.includes("typingvarianceseconds")) add("typingVarianceSeconds");
  if (normalized.includes("maxattemptsperlead")) add("maxAttemptsPerLead");
  return fields;
}

function prospectingErrorMessage(error: unknown) {
  const payload = (error as { payload?: unknown } | null)?.payload;
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown; error?: unknown }).message;
    if (Array.isArray(message)) return message.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    if (typeof message === "string" && message.trim()) return message.trim();
    const fallback = (payload as { error?: unknown }).error;
    if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "O backend recusou a configuração.";
}

function validateProspectingCampaignConfig(config: ProspectingCampaignConfig) {
  const fields: ProspectingValidationField[] = [];
  const messages: string[] = [];
  if (!String(config.workingHoursStart || "").trim()) {
    fields.push("workingHoursStart");
    messages.push("Informe o horário de início na etapa Mensagem inicial.");
  }
  if (!String(config.workingHoursEnd || "").trim()) {
    fields.push("workingHoursEnd");
    messages.push("Informe o horário de fim na etapa Mensagem inicial.");
  }
  if (!normalizeProspectingVariantList(config.firstContactVariants, []).some((item) => item.trim())) {
    fields.push("firstContactVariants");
    messages.push("Escreva pelo menos uma variação da primeira mensagem.");
  }
  if (config.preMessageEnabled && !normalizeProspectingVariantList(config.preMessageVariants, []).some((item) => item.trim())) {
    fields.push("preMessageVariants");
    messages.push("Escreva pelo menos uma variação da pré-mensagem.");
  }
  const intervalMinutes = prospectingInteger(config.intervalMinutes);
  if (intervalMinutes < 1 || intervalMinutes > 180) {
    fields.push("intervalMinutes");
    messages.push("O intervalo precisa ficar entre 1 e 180 minutos.");
  }
  const intervalVarianceMinutes = prospectingInteger(config.intervalVarianceMinutes);
  if (intervalVarianceMinutes < 0 || intervalVarianceMinutes > 180) {
    fields.push("intervalVarianceMinutes");
    messages.push("A variação do intervalo precisa ficar entre 0 e 180 minutos.");
  }
  const botReplyIntervalReductionPercent = prospectingInteger(config.botReplyIntervalReductionPercent);
  if (botReplyIntervalReductionPercent < 0 || botReplyIntervalReductionPercent > 100) {
    fields.push("botReplyIntervalReductionPercent");
    messages.push("A redução ao detectar bot precisa ficar entre 0% e 100%.");
  }
  const typingSeconds = prospectingInteger(config.typingSeconds);
  if (typingSeconds < 0 || typingSeconds > 45) {
    fields.push("typingSeconds");
    messages.push("O typing precisa ficar entre 0 e 45 segundos.");
  }
  const typingVarianceSeconds = prospectingInteger(config.typingVarianceSeconds);
  if (typingVarianceSeconds < 0 || typingVarianceSeconds > 30) {
    fields.push("typingVarianceSeconds");
    messages.push("A variação do typing precisa ficar entre 0 e 30 segundos.");
  }
  const maxAttemptsPerLead = prospectingInteger(config.maxAttemptsPerLead);
  if (maxAttemptsPerLead < 1 || maxAttemptsPerLead > 3) {
    fields.push("maxAttemptsPerLead");
    messages.push("Tentativas por contato precisa ficar entre 1 e 3.");
  }
  return { ok: fields.length === 0, fields, messages };
}

function ProspectingCampaignStudioModal({
  open,
  config,
  status,
  actionLoading,
  companyName,
  attendantName,
  onClose,
  onChange,
  onSave,
  onStart,
  onPause,
  onResume,
  canActivateProspecting,
  activationBlockedReason,
}: {
  open: boolean;
  config: ProspectingCampaignConfig;
  status: ProspectingAutomationLiveStatus | null;
  actionLoading: string | null;
  companyName: string;
  attendantName: string;
  canActivateProspecting: boolean;
  activationBlockedReason?: string;
  onClose: () => void;
  onChange: (updater: (current: ProspectingCampaignConfig) => ProspectingCampaignConfig) => void;
  onSave: (configOverride?: ProspectingCampaignConfig) => Promise<ProspectingAutomationLiveStatus | null> | void;
  onStart: (configOverride?: ProspectingCampaignConfig) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [variableTarget, setVariableTarget] = useState<ProspectingVariableTarget>("firstContactVariants");
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savePopup, setSavePopup] = useState<{ tone: "info" | "success" | "warning" | "danger"; title: string; text: string } | null>(null);
  const [riskConfirmationOpen, setRiskConfirmationOpen] = useState(false);
  const [invalidFields, setInvalidFields] = useState<ProspectingValidationField[]>([]);
  const [positiveDraft, setPositiveDraft] = useState("");
  const [negativeDraft, setNegativeDraft] = useState("");
  const [whatIsItDraft, setWhatIsItDraft] = useState("");
  const [neutralDraft, setNeutralDraft] = useState("");
  const [previewScenario, setPreviewScenario] = useState<ProspectingPreviewScenario>({
    kind: "scheduled",
    text: "Agora não consigo, amanhã umas 09?",
  });
  const [variantIndexes, setVariantIndexes] = useState<Record<ProspectingVariantField, number>>({
    preMessageVariants: 0,
    firstContactVariants: 0,
    positiveReplyVariants: 0,
    whatIsItReplyVariants: 0,
    scheduledReplyVariants: 0,
    optOutVariants: 0,
    neutralHandoffVariants: 0,
  });
  const messageTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const optOutMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const preMessageVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const firstContactVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const positiveReplyVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const whatIsItReplyVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const scheduledReplyVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const optOutVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const neutralHandoffVariantsRef = useRef<HTMLTextAreaElement | null>(null);
  const campaignStudioWasOpenRef = useRef(false);
  const pendingRiskSaveConfigRef = useRef<ProspectingCampaignConfig | null>(null);

  useEffect(() => {
    if (!open) {
      campaignStudioWasOpenRef.current = false;
      return;
    }
    if (campaignStudioWasOpenRef.current) return;
    campaignStudioWasOpenRef.current = true;
    setPreviewScenario({
      kind: "scheduled",
      text: "Agora não consigo, amanhã umas 09?",
    });
  }, [open]);

  useEffect(() => {
    // Clear the add-chip field after loading a saved campaign.
    setPositiveDraft("");
  }, [config.positiveIntentKeywords]);

  useEffect(() => {
    // Clear the add-chip field after loading a saved campaign.
    setNegativeDraft("");
  }, [config.negativeIntentKeywords]);

  useEffect(() => {
    // Clear the add-chip field after loading a saved campaign.
    setWhatIsItDraft("");
  }, [config.whatIsItIntentKeywords]);

  useEffect(() => {
    // Clear the add-chip field after loading a saved campaign.
    setNeutralDraft("");
  }, [config.neutralIntentKeywords]);

  useEffect(() => {
    if (!savePopup || savePopup.tone !== "success") return;
    const timer = window.setTimeout(() => setSavePopup(null), 3600);
    return () => window.clearTimeout(timer);
  }, [savePopup]);

  if (!open || typeof document === "undefined") return null;

  const hasInvalidField = (field: ProspectingValidationField) => invalidFields.includes(field);
  const clearInvalidField = (field: ProspectingValidationField) => {
    if (!invalidFields.includes(field)) return;
    setInvalidFields((current) => current.filter((item) => item !== field));
  };
  const focusInvalidField = (field: ProspectingValidationField | null | undefined) => {
    if (!field) return;
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-prospecting-field="${field}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = target?.querySelector<HTMLElement>("input, textarea, button");
      input?.focus();
    }, 90);
  };
  const markInvalidFields = (fields: ProspectingValidationField[]) => {
    const uniqueFields = Array.from(new Set(fields));
    setInvalidFields(uniqueFields);
    focusInvalidField(uniqueFields[0]);
  };
  const setField = <K extends keyof ProspectingCampaignConfig,>(field: K, value: ProspectingCampaignConfig[K]) => {
    setSaveFeedback("idle");
    if (field === "workingHoursStart" || field === "workingHoursEnd") {
      clearInvalidField(field);
    }
    onChange((current) => ({ ...current, [field]: value }));
  };
  const setNumberField = (
    field: "intervalMinutes" | "intervalVarianceMinutes" | "botReplyIntervalReductionPercent" | "typingSeconds" | "typingVarianceSeconds",
    value: string,
    min = 0,
    max?: number,
  ) => {
    setSaveFeedback("idle");
    clearInvalidField(field);
    const normalized = Math.max(min, Math.trunc(Number(value) || 0));
    onChange((current) => ({ ...current, [field]: max === undefined ? normalized : Math.min(max, normalized) }));
  };
  const setAdvancedNumberField = (
    field: "maxAttemptsPerLead",
    value: string,
    min = 1,
  ) => {
    setSaveFeedback("idle");
    clearInvalidField(field);
    onChange((current) => ({ ...current, [field]: Math.max(min, Math.trunc(Number(value) || 0)) }));
  };
  const setKeywordItems = (field: ProspectingKeywordField, items: string[]) => {
    setSaveFeedback("idle");
    onChange((current) => ({ ...current, [field]: normalizeProspectingList(items, current[field]) }));
  };
  const addKeywordItem = (
    field: ProspectingKeywordField,
    value: string,
    setValue: (value: string) => void,
    kind: ProspectingIntentKind,
  ) => {
    const additions = normalizeProspectingList(value, []);
    if (!additions.length) return;
    const nextItems = normalizeProspectingList([...(config[field] || []), ...additions], []);
    setKeywordItems(field, nextItems);
    setValue("");
    setPreviewScenario({ kind, text: additions[0] });
  };
  const removeKeywordItem = (field: ProspectingKeywordField, item: string) => {
    const nextItems = (config[field] || []).filter((currentItem) => currentItem !== item);
    if (!nextItems.length) return;
    setKeywordItems(field, nextItems);
    if (previewScenario.text === item) {
      const kindByField: Record<ProspectingKeywordField, ProspectingIntentKind> = {
        positiveIntentKeywords: "positive",
        negativeIntentKeywords: "negative",
        whatIsItIntentKeywords: "whatIsIt",
        neutralIntentKeywords: "neutral",
      };
      setPreviewScenario({ kind: kindByField[field], text: nextItems[0] });
    }
  };
  const getEditableVariantList = (field: ProspectingVariantField) => {
    const items = Array.isArray(config[field]) ? config[field].map((item) => String(item ?? "")) : [];
    return items.length ? items : [""];
  };
  const setVariantListField = (field: ProspectingVariantField, nextList: string[]) => {
    const cleanList = nextList.slice(0, 20).map((item) => String(item ?? ""));
    setSaveFeedback("idle");
    if (field === "firstContactVariants" && cleanList.some((item) => item.trim())) {
      clearInvalidField("firstContactVariants");
    }
    if (field === "preMessageVariants" && cleanList.some((item) => item.trim())) {
      clearInvalidField("preMessageVariants");
    }
    onChange((current) => ({ ...current, [field]: cleanList.length ? cleanList : [""] }));
  };
  const setVariantAt = (field: ProspectingVariantField, index: number, value: string) => {
    const nextList = getEditableVariantList(field);
    nextList[index] = value;
    setVariantListField(field, nextList);
  };
  const clampVariantIndex = (field: ProspectingVariantField, index: number) => {
    const total = getEditableVariantList(field).length;
    return Math.max(0, Math.min(Math.max(0, total - 1), index));
  };
  const setVariantIndex = (field: ProspectingVariantField, index: number) => {
    setVariantIndexes((current) => ({ ...current, [field]: clampVariantIndex(field, index) }));
  };
  const addVariant = (field: ProspectingVariantField) => {
    const nextList = getEditableVariantList(field);
    if (nextList.length >= 20) return;
    const currentIndex = clampVariantIndex(field, variantIndexes[field] || 0);
    nextList.splice(currentIndex + 1, 0, "");
    setVariantListField(field, nextList);
    setVariantIndexes((current) => ({ ...current, [field]: currentIndex + 1 }));
  };
  const removeVariant = (field: ProspectingVariantField) => {
    const nextList = getEditableVariantList(field);
    const currentIndex = clampVariantIndex(field, variantIndexes[field] || 0);
    if (nextList.length <= 1) {
      setVariantListField(field, [""]);
      setVariantIndexes((current) => ({ ...current, [field]: 0 }));
      return;
    }
    nextList.splice(currentIndex, 1);
    setVariantListField(field, nextList);
    setVariantIndexes((current) => ({ ...current, [field]: Math.max(0, Math.min(currentIndex, nextList.length - 1)) }));
  };
  const insertVariable = (token: string) => {
    const field = variableTarget;
    const refs = {
      messageTemplate: messageTemplateRef.current,
      optOutMessage: optOutMessageRef.current,
      preMessageVariants: preMessageVariantsRef.current,
      firstContactVariants: firstContactVariantsRef.current,
      positiveReplyVariants: positiveReplyVariantsRef.current,
      whatIsItReplyVariants: whatIsItReplyVariantsRef.current,
      scheduledReplyVariants: scheduledReplyVariantsRef.current,
      optOutVariants: optOutVariantsRef.current,
      neutralHandoffVariants: neutralHandoffVariantsRef.current,
    };
    const ref = refs[field];
    const variantIndex = Array.isArray(config[field]) ? clampVariantIndex(field as ProspectingVariantField, variantIndexes[field as ProspectingVariantField] || 0) : 0;
    const currentValue = Array.isArray(config[field])
      ? getEditableVariantList(field as ProspectingVariantField)[variantIndex] || ""
      : String(config[field] || "");
    const start = ref?.selectionStart ?? currentValue.length;
    const end = ref?.selectionEnd ?? currentValue.length;
    const insert = `{{${token}}}`;
    const nextValue = `${currentValue.slice(0, start)}${insert}${currentValue.slice(end)}`;
    if (Array.isArray(config[field])) {
      setVariantAt(field as ProspectingVariantField, variantIndex, nextValue);
    } else {
      setField(field, nextValue as ProspectingCampaignConfig[typeof field]);
    }
    setVariablesOpen(false);
    window.setTimeout(() => {
      ref?.focus();
      ref?.setSelectionRange(start + insert.length, start + insert.length);
    }, 0);
  };
  const canPause = Boolean(status?.campaign?.status === "running");
  const canResume = Boolean(status?.campaign?.status === "paused");
  const campaignHasError = Boolean(status?.lastError || status?.status === "erro");
  const activationDisabled = Boolean(actionLoading);
  const activationState = campaignHasError ? "error" : canPause ? "running" : canResume ? "paused" : "idle";
  const activationLabel = canPause ? "Pausar Prospecção" : "Ativar Prospecção";
  const activationBusyLabel = canPause ? "Pausando..." : canResume ? "Ativando..." : "Ativando...";
  const previewVariables = {
    empresa: companyName || "HBX",
    funcionario: attendantName || "time comercial",
  };
  const firstContactText = config.firstContactVariants[0] || config.messageTemplate;
  const sanitizedMessagePreview = sanitizeFirstContactPreview(firstContactText) || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG.messageTemplate;
  const messageTemplateHasLink = hasFirstContactLink(joinProspectingVariantList(config.firstContactVariants));
  const buildConfigWithPendingKeywordDrafts = () => {
    const draftEntries: Array<{
      field: ProspectingKeywordField;
      value: string;
      clear: (value: string) => void;
      kind: ProspectingIntentKind;
    }> = [
      { field: "positiveIntentKeywords", value: positiveDraft, clear: setPositiveDraft, kind: "positive" },
      { field: "whatIsItIntentKeywords", value: whatIsItDraft, clear: setWhatIsItDraft, kind: "whatIsIt" },
      { field: "negativeIntentKeywords", value: negativeDraft, clear: setNegativeDraft, kind: "negative" },
      { field: "neutralIntentKeywords", value: neutralDraft, clear: setNeutralDraft, kind: "neutral" },
    ];
    let nextConfig = config;
    let firstAddedPreview: ProspectingPreviewScenario | null = null;

    draftEntries.forEach((entry) => {
      const additions = normalizeProspectingList(entry.value, []);
      if (!additions.length) return;
      nextConfig = {
        ...nextConfig,
        [entry.field]: normalizeProspectingList([...(nextConfig[entry.field] || []), ...additions], []),
      };
      entry.clear("");
      firstAddedPreview ||= { kind: entry.kind, text: additions[0] };
    });

    if (firstAddedPreview) {
      setPreviewScenario(firstAddedPreview);
      onChange(() => nextConfig);
    }

    return nextConfig;
  };

  const getRiskRules = (nextConfig: ProspectingCampaignConfig) => {
    const risks: string[] = [];
    if (Number(nextConfig.intervalMinutes || 0) < 15) {
      risks.push("Intervalo abaixo de 15 minutos aumenta risco de bloqueio, reclamação e perda do chip.");
    }
    if (Number(nextConfig.maxAttemptsPerLead || 1) > 1) {
      risks.push("Mais de 1 tentativa por contato pode repetir abordagem e gerar percepção de spam.");
    }
    return risks;
  };
  const hasConfirmedRiskRules = () => {
    try {
      return window.localStorage.getItem(PROSPECTING_RISK_CONFIRMATION_KEY) === "confirmed";
    } catch {
      return false;
    }
  };
  const confirmRiskRulesOnce = () => {
    try {
      window.localStorage.setItem(PROSPECTING_RISK_CONFIRMATION_KEY, "confirmed");
    } catch {
      // Local storage can be unavailable in restricted browsers; the current confirmation still proceeds.
    }
  };
  const saveConfigNow = async (nextConfig: ProspectingCampaignConfig) => {
    setSaveFeedback("saving");
    setInvalidFields([]);
    setSavePopup({
      tone: "info",
      title: "Salvando HBot",
      text: "Estou gravando as regras da Prospecção no backend.",
    });
    try {
      const result = await onSave(nextConfig);
      if (result === null) {
        setSaveFeedback("error");
        setSavePopup({
          tone: "danger",
          title: "Não salvou",
          text: "O backend recusou a configuração, mas não informou um campo específico.",
        });
        return;
      }
    } catch (error) {
      const message = prospectingErrorMessage(error);
      const backendFields = prospectingFieldFromBackendMessage(message);
      if (backendFields.length) markInvalidFields(backendFields);
      setSaveFeedback("error");
      setSavePopup({
        tone: "danger",
        title: "Não salvou",
        text: backendFields.length
          ? `${message} Campo: ${backendFields.map((field) => PROSPECTING_VALIDATION_FIELD_LABELS[field]).join(", ")}.`
          : `O backend recusou: ${message}`,
      });
      return;
    }
    setSaveFeedback("saved");
    setInvalidFields([]);
    setSavePopup({
      tone: "success",
      title: "HBot salvo",
      text: "Configuração salva no backend e pronta para a Prospecção.",
    });
    window.setTimeout(() => setSaveFeedback("idle"), 2600);
  };
  const handleSaveClick = async () => {
    const nextConfig = buildConfigWithPendingKeywordDrafts();
    const validation = validateProspectingCampaignConfig(nextConfig);
    if (!validation.ok) {
      markInvalidFields(validation.fields);
      setSaveFeedback("error");
      setSavePopup({
        tone: "danger",
        title: "Não salvou",
        text: validation.messages[0] || "Revise os campos destacados em vermelho.",
      });
      return;
    }
    if (getRiskRules(nextConfig).length && !hasConfirmedRiskRules()) {
      pendingRiskSaveConfigRef.current = nextConfig;
      setRiskConfirmationOpen(true);
      return;
    }
    await saveConfigNow(nextConfig);
  };
  const showCentralBotWarning = () => {
    setSaveFeedback("idle");
    setSavePopup({
      tone: "warning",
      title: "Ative o HBot na central dos bots",
      text: activationBlockedReason || "A Prospecção usa o HBot como central. Ligue o HBot principal antes de ativar a Prospecção.",
    });
  };
  const handleStartClick = () => {
    if (!canActivateProspecting) {
      showCentralBotWarning();
      return;
    }
    const nextConfig = buildConfigWithPendingKeywordDrafts();
    const validation = validateProspectingCampaignConfig(nextConfig);
    if (!validation.ok) {
      markInvalidFields(validation.fields);
      setSaveFeedback("error");
      setSavePopup({
        tone: "danger",
        title: "Não ativou",
        text: validation.messages[0] || "Revise os campos destacados em vermelho.",
      });
      return;
    }
    onStart(nextConfig);
  };
  const handleProspectingActivationClick = () => {
    if (canPause) {
      onPause();
      return;
    }
    if (canResume) {
      if (!canActivateProspecting) {
        showCentralBotWarning();
        return;
      }
      onResume();
      return;
    }
    handleStartClick();
  };
  const openRadarPopup = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("hbx:radar-popup", {
      detail: {
        query: {
          state: config.state,
          city: config.city,
          segment: config.segment,
          engine: config.engine,
          targetType: config.targetType,
        },
      },
    }));
  };
  const confirmRiskAndSave = async () => {
    const nextConfig = pendingRiskSaveConfigRef.current || config;
    confirmRiskRulesOnce();
    pendingRiskSaveConfigRef.current = null;
    setRiskConfirmationOpen(false);
    await saveConfigNow(nextConfig);
  };
  const previewIntentMeta: Record<
    ProspectingIntentKind,
    {
      label: string;
      field: ProspectingKeywordField;
      replyField: ProspectingVariantField;
      final: string;
      confirmationText?: string;
    }
  > = {
    positive: {
      label: "Positiva",
      field: "positiveIntentKeywords",
      replyField: "positiveReplyVariants",
      confirmationText: "Pode me ligar sim.",
      final: "Final: fica piscando em Prospecção como verde. Só vai para Atendimento quando o operador assumir.",
    },
    whatIsIt: {
      label: "O que é?",
      field: "whatIsItIntentKeywords",
      replyField: "whatIsItReplyVariants",
      confirmationText: "Entendi. Pode me ligar rapidinho.",
      final: "Final: fica piscando em Prospecção como verde. Só vai para Atendimento quando o operador assumir.",
    },
    scheduled: {
      label: "Retorno agendado",
      field: "neutralIntentKeywords",
      replyField: "scheduledReplyVariants",
      final: "Final: salva o retorno no card, para a automação e respeita o horário combinado.",
    },
    neutral: {
      label: "Neutra",
      field: "neutralIntentKeywords",
      replyField: "neutralHandoffVariants",
      final: "Final: fica piscando em Prospecção como amarelo para operador decidir o próximo passo.",
    },
    negative: {
      label: "Negativa",
      field: "negativeIntentKeywords",
      replyField: "optOutVariants",
      final: "Final: deletar/arquivar contato, marcar opt-out e não chamar novamente.",
    },
  };
  const selectedPreviewMeta = previewIntentMeta[previewScenario.kind];
  const selectedPreviewText =
    previewScenario.text ||
    config[selectedPreviewMeta.field]?.[0] ||
    DEFAULT_PROSPECTING_CAMPAIGN_CONFIG[selectedPreviewMeta.field][0];
  const previewReturnLabel = previewScenario.kind === "scheduled"
    ? resolveProspectingPreviewReturnLabel(selectedPreviewText)
    : "amanhã às 09:00";
  const previewReplyText = renderProspectingPreview(
    config[selectedPreviewMeta.replyField]?.[0] || DEFAULT_PROSPECTING_CAMPAIGN_CONFIG[selectedPreviewMeta.replyField][0],
    config,
    previewVariables,
    {
      retorno_label: previewReturnLabel,
      horario_retorno: previewReturnLabel,
    },
  );
  const shouldShowPreviewConfirmation = Boolean(selectedPreviewMeta.confirmationText && previewReplyText.includes("?"));
  const renderTriggerPanel = (
    field: ProspectingKeywordField,
    label: string,
    draftValue: string,
    setDraftValue: (value: string) => void,
    helper: string,
    kind: ProspectingIntentKind,
  ) => (
    <div className={styles.campaignClassifierPanel}>
      <strong>{label}</strong>
      <div className={styles.campaignKeywordChips}>
        {normalizeProspectingList(config[field], DEFAULT_PROSPECTING_CAMPAIGN_CONFIG[field]).map((item) => (
          <span key={`${field}-${item}`} className={styles.campaignKeywordChip} data-active={previewScenario.kind === kind && selectedPreviewText === item ? "true" : "false"}>
            <button type="button" onClick={() => setPreviewScenario({ kind, text: item })}>
              {item}
            </button>
            <button type="button" aria-label={`Remover ${item}`} onClick={() => removeKeywordItem(field, item)}>
              x
            </button>
          </span>
        ))}
      </div>
      <div className={styles.campaignKeywordAdd}>
        <input
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addKeywordItem(field, draftValue, setDraftValue, kind);
          }}
          placeholder="Nova frase do cliente"
        />
        <button type="button" onClick={() => addKeywordItem(field, draftValue, setDraftValue, kind)}>
          +
        </button>
      </div>
      <small>{helper}</small>
    </div>
  );
  const renderScheduledTriggerPanel = () => (
    <div className={styles.campaignClassifierPanel}>
      <strong>Pedido de retorno com horário</strong>
      <div className={styles.campaignKeywordChips}>
        {["Agora não consigo, amanhã umas 09?", "Me chama depois das 15h.", "Pode retornar na segunda de manhã?"].map((item) => (
          <span key={`scheduled-${item}`} className={styles.campaignKeywordChip} data-active={previewScenario.kind === "scheduled" && selectedPreviewText === item ? "true" : "false"}>
            <button type="button" onClick={() => setPreviewScenario({ kind: "scheduled", text: item })}>
              {item}
            </button>
          </span>
        ))}
      </div>
      <small>Quando o cliente pede retorno com data ou horário, o HBot responde, salva no card e para.</small>
    </div>
  );
  const renderVariantPager = (
    field: ProspectingVariantField,
    label: string,
    helper: string,
    ref: RefObject<HTMLTextAreaElement | null>,
    options?: { disabled?: boolean; triggerPanel?: ReactNode },
  ) => {
    const list = getEditableVariantList(field);
    const index = clampVariantIndex(field, variantIndexes[field] || 0);
    const disabled = Boolean(options?.disabled);
    const invalid =
      (field === "firstContactVariants" && hasInvalidField("firstContactVariants")) ||
      (field === "preMessageVariants" && hasInvalidField("preMessageVariants"));
    return (
      <div
        className={`${styles.campaignWideField} ${styles.campaignVariantPager}`}
        data-prospecting-field={field}
        data-disabled={disabled ? "true" : "false"}
        data-invalid={invalid ? "true" : "false"}
      >
        <div className={styles.campaignVariantHeader}>
          {options?.triggerPanel || <strong>{label}</strong>}
          <span>{index + 1} de {list.length}</span>
        </div>
        <div className={styles.campaignVariantBody}>
          <textarea
            key={`${field}-${index}`}
            ref={ref}
            value={list[index] || ""}
            disabled={disabled}
            onFocus={() => setVariableTarget(field)}
            onChange={(event) => setVariantAt(field, index, event.target.value)}
            placeholder="Escreva esta variação..."
          />
          <div className={styles.campaignVariantActions}>
            <button type="button" onClick={() => addVariant(field)} disabled={disabled || list.length >= 20} title="Adicionar variação">+</button>
            <button type="button" onClick={() => setVariantIndex(field, index + 1)} disabled={disabled || index >= list.length - 1} title="Próxima variação">&gt;</button>
            <button type="button" onClick={() => setVariantIndex(field, index - 1)} disabled={disabled || index <= 0} title="Variação anterior">&lt;</button>
            <button type="button" onClick={() => removeVariant(field)} disabled={disabled} title="Remover variação">Del</button>
          </div>
        </div>
        <small>{helper}</small>
      </div>
    );
  };

  return createPortal(
    <div className={styles.campaignStudioBackdrop} role="presentation">
      <section
        className={`${styles.campaignStudioFrame} hbx-popup1`}
        data-tone="info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-studio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.campaignStudioHeader}>
          <div>
            <span>Atendimento &gt; Hbot</span>
            <strong id="campaign-studio-title">HBot WhatsApp</strong>
          </div>
          <div className={styles.campaignStudioHeaderActions}>
            <button type="button" className={styles.campaignCloseButton} onClick={onClose}>Fechar</button>
          </div>
        </header>

        <div className={styles.campaignStudioBody}>
          <div className={styles.campaignMessageLayout}>
              <main className={styles.campaignEditorPanel}>
                <div className={styles.campaignSectionHeader}>
                  <div>
                    <span>Primeira etapa</span>
                    <strong>Mensagem, horário e regras do Hbot</strong>
                  </div>
                  <button type="button" className={styles.campaignGhostButton} onClick={() => setVariablesOpen(true)}>
                    Variáveis
                  </button>
                </div>

                <div className={styles.campaignTimeGrid}>
                  <label className={styles.campaignField} data-prospecting-field="workingHoursStart" data-invalid={hasInvalidField("workingHoursStart") ? "true" : "false"}>
                    <span>Início</span>
                    <input type="time" value={config.workingHoursStart} onChange={(event) => setField("workingHoursStart", event.target.value)} />
                  </label>
                  <label className={styles.campaignField} data-prospecting-field="workingHoursEnd" data-invalid={hasInvalidField("workingHoursEnd") ? "true" : "false"}>
                    <span>Fim</span>
                    <input type="time" value={config.workingHoursEnd} onChange={(event) => setField("workingHoursEnd", event.target.value)} />
                  </label>
                </div>

                <div className={styles.campaignMessageCard}>
                  <label className={styles.campaignInlineToggle}>
                    <span>Usar pré-mensagem como filtro</span>
                    <input
                      type="checkbox"
                      checked={config.preMessageEnabled}
                      onChange={(event) => setField("preMessageEnabled", event.target.checked)}
                    />
                  </label>
                  {config.preMessageEnabled ? (
                    <>
                      {renderVariantPager(
                        "preMessageVariants",
                        "Pré-mensagem",
                        "Envia antes do pitch. Se responder bot, o HBot para esse contato e acelera o próximo disparo conforme o ajuste avançado.",
                        preMessageVariantsRef,
                      )}
                    </>
                  ) : null}
                  {renderVariantPager(
                    "firstContactVariants",
                    "Variações da primeira mensagem",
                    config.preMessageEnabled
                      ? "Só dispara depois de uma resposta humana à pré-mensagem. Links continuam sendo removidos automaticamente."
                      : "Primeiro contato não envia links automaticamente. Use as setas para navegar entre as variações.",
                    firstContactVariantsRef,
                  )}
                  {messageTemplateHasLink ? (
                    <div className={styles.campaignRiskNotice}>
                      O link será removido no primeiro contato para proteger o número.
                    </div>
                  ) : null}
                </div>

                <details className={styles.campaignAdvanced} open>
                  <summary>Ajustes avançados</summary>
                  <div className={styles.campaignAdvancedGrid}>
                    <label className={styles.campaignField} data-prospecting-field="intervalMinutes" data-invalid={hasInvalidField("intervalMinutes") ? "true" : "false"}>
                      <span>Intervalo</span>
                      <input type="number" min={1} value={config.intervalMinutes} onChange={(event) => setNumberField("intervalMinutes", event.target.value, 1)} />
                    </label>
                    <label className={styles.campaignField} data-prospecting-field="intervalVarianceMinutes" data-invalid={hasInvalidField("intervalVarianceMinutes") ? "true" : "false"}>
                      <span>Variação do intervalo</span>
                      <input type="number" min={0} value={config.intervalVarianceMinutes} onChange={(event) => setNumberField("intervalVarianceMinutes", event.target.value, 0)} />
                    </label>
                    <label className={styles.campaignField} data-prospecting-field="botReplyIntervalReductionPercent" data-invalid={hasInvalidField("botReplyIntervalReductionPercent") ? "true" : "false"}>
                      <span>Reduzir intervalo se detectar bot (%)</span>
                      <input type="number" min={0} max={100} value={config.botReplyIntervalReductionPercent} onChange={(event) => setNumberField("botReplyIntervalReductionPercent", event.target.value, 0, 100)} />
                    </label>
                    <label className={styles.campaignField} data-prospecting-field="typingSeconds" data-invalid={hasInvalidField("typingSeconds") ? "true" : "false"}>
                      <span>Typing</span>
                      <input type="number" min={0} value={config.typingSeconds} onChange={(event) => setNumberField("typingSeconds", event.target.value, 0)} />
                    </label>
                    <label className={styles.campaignField} data-prospecting-field="typingVarianceSeconds" data-invalid={hasInvalidField("typingVarianceSeconds") ? "true" : "false"}>
                      <span>Variação do typing</span>
                      <input type="number" min={0} value={config.typingVarianceSeconds} onChange={(event) => setNumberField("typingVarianceSeconds", event.target.value, 0)} />
                    </label>
                    <label className={styles.campaignField} data-prospecting-field="maxAttemptsPerLead" data-invalid={hasInvalidField("maxAttemptsPerLead") ? "true" : "false"}>
                      <span>Tentativas por contato</span>
                      <input type="number" min={1} value={config.maxAttemptsPerLead} onChange={(event) => setAdvancedNumberField("maxAttemptsPerLead", event.target.value, 1)} />
                    </label>
                    {renderVariantPager(
                      "positiveReplyVariants",
                      "Respostas positivas",
                      "O pitch fica como rascunho autorizado para o atendimento humano.",
                      positiveReplyVariantsRef,
                      {
                        triggerPanel: renderTriggerPanel(
                          "positiveIntentKeywords",
                          "Positivas",
                          positiveDraft,
                          setPositiveDraft,
                          "Palavras ou frases que indicam interesse.",
                          "positive",
                        ),
                      },
                    )}
                    {renderVariantPager(
                      "whatIsItReplyVariants",
                      'Respostas para "o que é?"',
                      "Use respostas curtas. O atendimento humano continua a partir do rascunho.",
                      whatIsItReplyVariantsRef,
                      {
                        triggerPanel: renderTriggerPanel(
                          "whatIsItIntentKeywords",
                          "O que é?",
                          whatIsItDraft,
                          setWhatIsItDraft,
                          "Frases que identificam pergunta sobre o assunto.",
                          "whatIsIt",
                        ),
                      },
                    )}
                    {renderVariantPager(
                      "scheduledReplyVariants",
                      "Pedido de retorno com horário",
                      "Resposta enviada quando o cliente pede retorno em um horário específico. Use {{retorno_label}} para mostrar o horário detectado.",
                      scheduledReplyVariantsRef,
                      {
                        triggerPanel: renderScheduledTriggerPanel(),
                      },
                    )}
                    {renderVariantPager(
                      "optOutVariants",
                      "Encerramento negativo",
                      "Quando desligado, o contato é arquivado e bloqueado sem resposta automática.",
                      optOutVariantsRef,
                      {
                        disabled: !config.optOutReplyEnabled,
                        triggerPanel: (
                          <div className={styles.campaignClassifierPanelGroup}>
                            {renderTriggerPanel(
                              "negativeIntentKeywords",
                              "Negativas",
                              negativeDraft,
                              setNegativeDraft,
                              "Frases que encerram ou removem o contato.",
                              "negative",
                            )}
                            <label className={styles.campaignInlineToggle}>
                              <span>Responder encerramento negativo</span>
                              <input type="checkbox" checked={config.optOutReplyEnabled} onChange={(event) => setField("optOutReplyEnabled", event.target.checked)} />
                            </label>
                          </div>
                        ),
                      },
                    )}
                    {renderVariantPager(
                      "neutralHandoffVariants",
                      "Resposta neutra para humano",
                      "Mensagem curta para deixar o atendimento humano assumir a conversa.",
                      neutralHandoffVariantsRef,
                      {
                        triggerPanel: renderTriggerPanel(
                          "neutralIntentKeywords",
                          "Neutras para humano",
                          neutralDraft,
                          setNeutralDraft,
                          "Frases que devem virar atendimento humano.",
                          "neutral",
                        ),
                      },
                    )}
                  </div>
                </details>
              </main>
              <aside className={styles.campaignPreviewPanel}>
                <div className={styles.campaignPreviewHeader}>
                  <div>
                    <span>WhatsApp</span>
                    <strong>Prévia ao vivo</strong>
                  </div>
                  <button type="button" className={styles.campaignGhostButton} onClick={() => setVariablesOpen(true)}>
                    Variáveis
                  </button>
                </div>
                <div className={styles.campaignPhonePreview}>
                  <div className={styles.campaignPhoneHeader}>
                    <span className={styles.campaignPhoneAvatar}>HBX</span>
                    <div>
                      <strong>{previewVariables.empresa}</strong>
                      <small>online agora</small>
                    </div>
                    <i aria-hidden="true" />
                  </div>
                  <div className={styles.campaignPhoneBody}>
                    <span>Hoje</span>
                    <div className={styles.campaignCustomerBubble}>Contato recebido na fila.</div>
                    <div className={styles.campaignBotBubble} data-tone="typing">
                      <small>Digitando</small>
                      <p>typing por {config.typingSeconds}s, com variação humana de até {config.typingVarianceSeconds}s.</p>
                    </div>
                    <div className={styles.campaignBotBubble}>
                      <small>Disparo inicial</small>
                      <p>{renderProspectingPreview(sanitizedMessagePreview, config, previewVariables)}</p>
                    </div>
                    <div className={styles.campaignCustomerBubble}>{selectedPreviewText}</div>
                    <div className={styles.campaignSystemBubble}>Detectado: {selectedPreviewMeta.label}</div>
                    {previewScenario.kind === "negative" && !config.optOutReplyEnabled ? (
                      <div className={styles.campaignSystemBubble}>Arquiva, marca opt-out e não envia resposta.</div>
                    ) : (
                      <>
                        <div className={styles.campaignBotBubble} data-tone="typing">
                          <small>Digitando</small>
                          <p>typing por {config.typingSeconds}s, com variação humana de até {config.typingVarianceSeconds}s.</p>
                        </div>
                        <div className={styles.campaignBotBubble}>
                          <small>{selectedPreviewMeta.label}</small>
                          <p>{previewReplyText}</p>
                        </div>
                        {shouldShowPreviewConfirmation ? (
                          <>
                            <div className={styles.campaignCustomerBubble}>{selectedPreviewMeta.confirmationText}</div>
                            <div className={styles.campaignSystemBubble}>Cliente confirmou continuidade.</div>
                          </>
                        ) : null}
                      </>
                    )}
                    <div className={styles.campaignSystemBubble}>{selectedPreviewMeta.final}</div>
                  </div>
                  <div className={styles.campaignPhoneComposer}>
                    <span>Mensagem</span>
                    <strong>+</strong>
                  </div>
                </div>
              </aside>
            </div>
        </div>

        <footer className={styles.campaignStudioFooter}>
          <span>
            {saveFeedback === "saving"
              ? "Salvando alterações..."
              : saveFeedback === "saved"
                ? "Salvo no backend agora."
                : saveFeedback === "error"
                  ? invalidFields.length
                    ? "Não salvou. Corrija o campo em vermelho."
                    : "Não salvou. Leia o aviso vermelho."
                  : campaignHasError
                    ? status?.lastError || status?.text || "Prospecção com erro. Revise o aviso vermelho."
                  : status?.text || "HBot parado"}
          </span>
          <div>
            <button
              type="button"
              className={styles.campaignFooterButton}
              data-state={saveFeedback}
              onClick={() => void handleSaveClick()}
              disabled={Boolean(actionLoading)}
            >
              {actionLoading === "save" || saveFeedback === "saving"
                ? "Salvando..."
                : saveFeedback === "saved"
                  ? "Salvo"
                  : saveFeedback === "error"
                    ? "Tentar salvar"
                    : "Salvar"}
            </button>
            <button
              type="button"
              className={styles.campaignFooterButton}
              onClick={openRadarPopup}
            >
              Radar
            </button>
            <button
              type="button"
              className={styles.campaignFooterButtonPrimary}
              data-state={activationState}
              onClick={handleProspectingActivationClick}
              disabled={activationDisabled}
              title={!canActivateProspecting ? activationBlockedReason || "Ative o HBot na central dos bots." : undefined}
            >
              {actionLoading === "start" || actionLoading === "pause" || actionLoading === "resume"
                ? activationBusyLabel
                : activationLabel}
            </button>
          </div>
        </footer>
        {savePopup ? (
          <HbxPopup2
            open
            tone={savePopup.tone}
            title={savePopup.title}
            onClose={savePopup.tone === "info" ? undefined : () => setSavePopup(null)}
          >
            {savePopup.text}
          </HbxPopup2>
        ) : null}
        <HbxPopup3
          open={riskConfirmationOpen}
          tone="warning"
          eyebrow="HBX Popup 3"
          title="Confirme as regras de risco da Prospecção"
          description="Esses ajustes podem aumentar bloqueios e respostas negativas. Leia antes de salvar."
          items={[
            ...getRiskRules(pendingRiskSaveConfigRef.current || config),
            "A recomendação segura é intervalo mínimo de 15 minutos e 1 tentativa por contato.",
            "Depois de confirmar, este aviso não aparece novamente neste navegador.",
          ]}
          cancelLabel="Voltar"
          confirmLabel="OK, li e quero salvar"
          busy={saveFeedback === "saving"}
          onCancel={() => {
            pendingRiskSaveConfigRef.current = null;
            setRiskConfirmationOpen(false);
          }}
          onConfirm={() => void confirmRiskAndSave()}
        />
        {variablesOpen ? (
          <div className={styles.campaignVariablePopover} role="dialog" aria-modal="true">
            <div className={styles.campaignVariablePopoverCard}>
              <header>
                <strong>Variáveis</strong>
                <button type="button" className={styles.campaignGhostButton} onClick={() => setVariablesOpen(false)}>Fechar</button>
              </header>
              <div className={styles.campaignVariableGrid}>
                {PROSPECTING_VARIABLES.map((variable) => (
                  <button key={variable.token} type="button" className={styles.campaignGhostButton} onClick={() => insertVariable(variable.token)}>
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

function makeClientId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const INBOX_RECENT_MESSAGES_LIMIT = 20;
const INBOX_CONVERSATION_LIST_LIMIT = 20;
const INBOX_CONVERSATION_AUTOFILL_MAX = 120;
const WHATSAPP_ASSET_EXPIRY_GRACE_MS = 5 * 60 * 1000;

function getInboxApiBaseUrl() {
  return getDashboardApiBaseUrl();
}

function getWhatsAppAssetExpiryMs(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, getInboxApiBaseUrl());
    if (!/(^|\.)whatsapp\.net$/i.test(parsed.hostname)) return null;
    const rawExpiry = parsed.searchParams.get("oe");
    if (!rawExpiry) return null;
    const expirySeconds = /^[0-9a-f]+$/i.test(rawExpiry)
      ? Number.parseInt(rawExpiry, 16)
      : Number(rawExpiry);
    if (!Number.isFinite(expirySeconds) || expirySeconds <= 0) return null;
    return expirySeconds * 1000;
  } catch {
    return null;
  }
}

function isExpiredWhatsAppAssetUrl(raw: string) {
  const expiresAt = getWhatsAppAssetExpiryMs(raw);
  return Boolean(expiresAt && expiresAt <= Date.now() + WHATSAPP_ASSET_EXPIRY_GRACE_MS);
}

function parseInboxRealtimeEventBlock(block: string) {
  const lines = block.split("\n");
  let eventName = "";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trimStart() : "";

    if (field === "event") {
      eventName = value;
      continue;
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (eventName && eventName !== "inbox") return null;
  if (!dataLines.length) return null;

  try {
    const payload = JSON.parse(dataLines.join("\n")) as InboxRealtimeEvent;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function readInboxRealtimeStream(input: {
  signal: AbortSignal;
  onEvent: (event: InboxRealtimeEvent) => void;
}) {
  const token = getToken();
  if (!token) return;

  const response = await fetch(`${getInboxApiBaseUrl()}/inbox/events`, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Falha ao conectar stream da inbox (${response.status}).`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!input.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (block) {
          const event = parseInboxRealtimeEventBlock(block);
          if (event) {
            input.onEvent(event);
          }
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function isLikelyImageUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(noQuery);
}

function isLikelyVideoUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(noQuery);
}

function isLikelyAudioUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(mp3|ogg|wav|m4a|opus|aac|webm)$/.test(noQuery);
}

function isLikelyDocumentUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|csv|txt)$/.test(noQuery);
}

function canPreviewDocumentInOverlay(url: string, mimeType?: string | null, fileName?: string | null) {
  const normalizedUrl = String(url || "").trim().toLowerCase();
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const normalizedName = String(fileName || "").trim().toLowerCase();
  return (
    normalizedMime.includes("pdf") ||
    normalizedMime.includes("xml") ||
    normalizedMime.includes("text/") ||
    normalizedMime.includes("json") ||
    /\.(pdf|xml|txt|csv|json|html?)($|\?)/.test(normalizedUrl) ||
    /\.(pdf|xml|txt|csv|json|html?)$/.test(normalizedName)
  );
}

function toUploadedInboxAssetPath(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;

  const relative = value
    .replace(/^\.\//, "")
    .replace(/^public\//i, "")
    .trim();
  if (!relative) return "";
  if (relative.startsWith("uploads/")) return `/${relative}`;
  if (/^[^\\/?#:*"<>|]+\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|mp3|ogg|oga|wav|m4a|opus|aac|pdf|docx?|xlsx?|csv|txt)$/i.test(relative)) {
    return `/uploads/inbox/${relative}`;
  }
  return "";
}

function toAbsoluteAssetUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const assetPath = toUploadedInboxAssetPath(value);
  const apiBase = getInboxApiBaseUrl();
  const resolved = /^https?:\/\//i.test(value)
    ? value
    : assetPath
      ? `${apiBase}${assetPath}`
      : "";
  if (!resolved) return "";
  return isExpiredWhatsAppAssetUrl(resolved) ? "" : resolved;
}

function normalizePathologicalLineBreaks(raw: string) {
  const value = String(raw || "");
  if (!value.includes("\n")) return value;
  const lines = value.split("\n");
  const compact = lines.map((line) => line.trim()).filter(Boolean);
  if (compact.length < 4) return value;

  // Heuristic: if most lines are 1-2 chars, it is likely a broken wrap artifact.
  const shortLines = compact.filter((line) => line.length <= 2).length;
  if (shortLines / compact.length < 0.7) return value;

  return compact.join("");
}

function getInboxMessageMetadata(message?: InboxMessage | null): Record<string, unknown> | null {
  const metadata = message?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function normalizeInboxMessageType(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  const rawType = String(metadata?.normalizedMessageType || message?.messageType || "text")
    .trim()
    .toLowerCase();
  if (rawType.includes("deleted")) return "deleted" as const;
  if (rawType.includes("image")) return "image" as const;
  if (rawType.includes("video") || rawType.includes("ptv")) return "video" as const;
  if (rawType.includes("document")) return "document" as const;
  if (rawType.includes("audio")) return "audio" as const;
  if (rawType.includes("sticker")) return "sticker" as const;
  if (rawType.includes("reaction")) return "reaction" as const;
  if (rawType.includes("interactive") || rawType.includes("button") || rawType.includes("list")) {
    return "interactive" as const;
  }
  return "text" as const;
}

function splitInboxQuotedBlock(raw: string) {
  const value = String(raw || "").trim();
  if (!value.startsWith("> ")) {
    return { quotedText: null as string | null, text: value };
  }

  const lines = value.split("\n");
  const quotedLines: string[] = [];
  let index = 0;
  while (index < lines.length && lines[index].startsWith(">")) {
    quotedLines.push(lines[index].replace(/^>\s?/, ""));
    index += 1;
  }
  if (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  return {
    quotedText: quotedLines.join("\n").trim() || null,
    text: lines.slice(index).join("\n").trim(),
  };
}

function normalizeInboxFileSize(raw: unknown) {
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function formatInboxFileSizeLabel(raw: unknown) {
  const size = normalizeInboxFileSize(raw);
  if (!size) return null;
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function formatInboxDurationLabel(raw: unknown) {
  const totalSeconds = Number(raw || 0);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resolveInboxAttachmentKind(file: { type?: string | null; name?: string | null }) {
  const mimeType = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  if (mimeType === "image/webp" || /\.webp$/.test(name)) return "sticker" as const;
  if (mimeType.startsWith("image/")) return "image" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  if (mimeType.startsWith("audio/")) return "audio" as const;
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("sheet") ||
    mimeType.includes("text/") ||
    mimeType.includes("csv")
  ) {
    return "document" as const;
  }
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image" as const;
  if (/\.(mp4|webm|mov|m4v)$/.test(name)) return "video" as const;
  if (/\.(mp3|ogg|wav|m4a|opus|aac)$/.test(name)) return "audio" as const;
  return "document" as const;
}

function createInboxAttachmentPreview(file: File): InboxAttachmentPreview {
  return {
    file,
    url: URL.createObjectURL(file),
    kind: resolveInboxAttachmentKind(file),
    mimeType: String(file.type || "").trim(),
    size: Number(file.size || 0),
    fileName: String(file.name || "arquivo").trim() || "arquivo",
  };
}

function getInboxGroupSenderColor(seed: string) {
  const palette = ["#53bdeb", "#06cf9c", "#ff8f40", "#ff7292", "#7e8fff", "#ffd279"];
  const source = String(seed || "sender");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function parseInboxMessageMedia(message: InboxMessage, conversation?: InboxConversation | null) {
  const metadata = getInboxMessageMetadata(message);
  const normalizedType = normalizeInboxMessageType(message);
  const isDeleted = Boolean(metadata?.isDeleted || normalizedType === "deleted");
  const rawContent = normalizePathologicalLineBreaks(String(message?.content || "")).trim();
  const quotedParts = splitInboxQuotedBlock(rawContent);
  let text = quotedParts.text;
  if (isDeleted) {
    return {
      kind: "deleted",
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      documentUrl: null,
      fileName: null,
      mimeType: null,
      fileSize: null,
      durationSeconds: null,
      isVoiceNote: false,
      quotedText: null,
      senderName: null,
      senderColor: null,
      text: "Mensagem apagada",
      isDeleted: true,
      mediaExpired: false,
      deletedOriginalText: String(metadata?.deletedOriginalText || "").trim() || null,
      deletedRevealUntil: String(metadata?.deletedRevealUntil || "").trim() || null,
    };
  }
  const explicitMediaUrlRaw = String(metadata?.mediaUrl || metadata?.previewUrl || "").trim();
  const explicitMediaUrl = toAbsoluteAssetUrl(explicitMediaUrlRaw);
  const explicitMediaExpired = Boolean(explicitMediaUrlRaw && !explicitMediaUrl && isExpiredWhatsAppAssetUrl(explicitMediaUrlRaw));
  const firstLine = String(text.split("\n")[0] || "").trim();
  const firstLineIsUrl = Boolean(toAbsoluteAssetUrl(firstLine));
  const fallbackMediaUrlRaw = firstLineIsUrl ? firstLine : "";
  const fallbackMediaUrl = fallbackMediaUrlRaw ? toAbsoluteAssetUrl(fallbackMediaUrlRaw) : "";
  const fallbackMediaExpired = Boolean(fallbackMediaUrlRaw && !fallbackMediaUrl && isExpiredWhatsAppAssetUrl(fallbackMediaUrlRaw));
  let mediaKind = normalizedType;
  const fallbackMediaKindSource = fallbackMediaUrl || fallbackMediaUrlRaw;
  if (mediaKind === "text" && fallbackMediaKindSource) {
    if (isLikelyImageUrl(fallbackMediaKindSource)) mediaKind = "image";
    else if (isLikelyVideoUrl(fallbackMediaKindSource)) mediaKind = "video";
    else if (isLikelyAudioUrl(fallbackMediaKindSource)) mediaKind = "audio";
    else if (isLikelyDocumentUrl(fallbackMediaKindSource)) mediaKind = "document";
  }

  const resolvedMediaUrl = explicitMediaUrl || fallbackMediaUrl;
  const mediaExpired = explicitMediaExpired || fallbackMediaExpired;
  const imageUrl = mediaKind === "image" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const stickerUrl = mediaKind === "sticker" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const videoUrl = mediaKind === "video" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const audioUrl = mediaKind === "audio" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const documentUrl = mediaKind === "document" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const apiBase = getInboxApiBaseUrl();

  if (resolvedMediaUrl && fallbackMediaUrl && firstLine === fallbackMediaUrl.replace(apiBase, "")) {
    text = text.split("\n").slice(1).join("\n").trim();
  } else if (resolvedMediaUrl && fallbackMediaUrl && firstLineIsUrl) {
    text = text.split("\n").slice(1).join("\n").trim();
  } else if (mediaExpired && fallbackMediaUrlRaw && firstLineIsUrl) {
    text = text.split("\n").slice(1).join("\n").trim();
  }

  const senderPhone =
    formatInboxPhoneLabel(String(metadata?.senderPhone || metadata?.participantAlt || metadata?.participant || "")) ||
    null;
  const senderNameCandidate = normalizeConversationDisplayNameCandidate(
    metadata?.senderName,
    String(metadata?.senderPhone || metadata?.participantAlt || metadata?.participant || ""),
  );
  const senderName =
    conversation && isInboxGroupRemoteJid(extractInboxRawContact(conversation))
      ? senderNameCandidate || senderPhone
      : null;

  return {
    kind: mediaKind,
    imageUrl: imageUrl || stickerUrl,
    videoUrl,
    audioUrl,
    documentUrl,
    fileName: String(metadata?.fileName || "").trim() || null,
    mimeType: String(metadata?.mimeType || "").trim() || null,
    fileSize: normalizeInboxFileSize(metadata?.fileSize),
    durationSeconds: normalizeInboxFileSize(metadata?.durationSeconds),
    isVoiceNote: Boolean(metadata?.isVoiceNote),
    quotedText: String(metadata?.quotedPreview || quotedParts.quotedText || "").trim() || null,
    senderName,
    senderColor: senderName ? getInboxGroupSenderColor(String(metadata?.senderPhone || senderName || message.id)) : null,
    text:
      mediaKind === "sticker" && String(text || "").trim().toLowerCase() === "[figurinha recebida]"
        ? ""
        : text || (rawContent ? String(getMessagePreview(message) || "").trim() : String(getMessagePreview(message) || "").trim()),
    isDeleted: false,
    mediaExpired,
    deletedOriginalText: null,
    deletedRevealUntil: null,
  };
}

function getInboxMessageProviderKeyId(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.providerKeyId || "").trim() || null;
}

function getInboxMessageReactionTargetKeyId(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.reactionTargetKeyId || "").trim() || null;
}

function getInboxMessageReactionEmoji(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.reactionEmoji || message?.content || "").trim() || null;
}

function isInboxReactionMessage(message?: InboxMessage | null) {
  return normalizeInboxMessageType(message) === "reaction";
}

function buildInboxReactionIndex(messages?: InboxMessage[] | null) {
  const index = new Map<string, string[]>();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!isInboxReactionMessage(message)) continue;
    const targetKey = getInboxMessageReactionTargetKeyId(message);
    const emoji = getInboxMessageReactionEmoji(message);
    if (!targetKey || !emoji) continue;
    const current = index.get(targetKey) || [];
    current.push(emoji);
    index.set(targetKey, current);
  }
  return index;
}

function shouldHideInboxMessageFromTimeline(message?: InboxMessage | null) {
  const content = String(message?.content || "").trim().toLowerCase();
  if (content === "[mensagem sincronizada]") return true;
  return isInboxReactionMessage(message) && Boolean(getInboxMessageReactionTargetKeyId(message));
}

function getInboxOldestMessageDate(messages?: InboxMessage[] | null) {
  const sorted = sortInboxMessagesChronologically(Array.isArray(messages) ? messages : []);
  return sorted[0]?.createdAt ? String(sorted[0].createdAt) : null;
}

function canRevealDeletedInboxMessage(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  if (!metadata?.deletedRevealUntil || !metadata?.deletedOriginalText) return false;
  const revealUntil = new Date(String(metadata.deletedRevealUntil));
  return !Number.isNaN(revealUntil.getTime()) && revealUntil.getTime() >= Date.now();
}

/** Renders WhatsApp-style inline formatting: *bold*, _italic_, ~strike~, `mono` */
function formatWhatsAppText(raw: string): React.ReactNode {
  if (!raw) return null;
  // Split into lines, process each
  const lines = raw.split("\n");
  const result: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) result.push(<br key={`br${li}`} />);
    // Tokenize: *bold*, _italic_, ~strike~, `mono`, regular
    const regex = /(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(`[^`\n]+`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    const parts: React.ReactNode[] = [];
    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index));
      const token = match[0];
      const key = `${li}-${match.index}`;
      if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(<strong key={key}>{token.slice(1, -1)}</strong>);
      } else if (token.startsWith("_") && token.endsWith("_")) {
        parts.push(<em key={key}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("~") && token.endsWith("~")) {
        parts.push(<del key={key}>{token.slice(1, -1)}</del>);
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(<code key={key} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 3, padding: "0 3px", fontFamily: "monospace", fontSize: "0.9em" }}>{token.slice(1, -1)}</code>);
      }
      last = match.index + token.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    result.push(...parts);
  });
  return result.length ? result : raw;
}

function formatDateLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR");
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLocalCalendarDayDistance(left: Date, right: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(left).getTime() - startOfLocalDay(right).getTime()) / dayMs);
}

function formatTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "-";
  if (!mounted) return parsed.toISOString();

  const now = new Date();
  const dayDistance = getLocalCalendarDayDistance(now, parsed);
  if (dayDistance <= 0) {
    return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (dayDistance === 1) {
    return "Ontem";
  }
  if (dayDistance < 7) {
    return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][parsed.getDay()] ||
      parsed.toLocaleDateString("pt-BR", { weekday: "long" });
  }

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatShortDateTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "-";
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocalValue(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalDateTime(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildTomorrowReturnLocalValue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return formatDateTimeLocalValue(tomorrow.toISOString());
}

function buildCustomerConversationCardDraft(
  payload: CustomerConversationCardPayload | null,
): CustomerConversationCardDraft {
  return {
    doNotCall: Boolean(payload?.customer?.doNotCall),
    returnAt: formatDateTimeLocalValue(payload?.lead?.returnAt || null),
    observations: String(payload?.customer?.observations || payload?.lead?.shortNote || ""),
  };
}

function buildCustomerLeadWebscrapingSummary(payload: CustomerConversationCardPayload | null) {
  const lead = payload?.lead;
  const parts: string[] = [];
  if (lead?.rating != null) parts.push(`Nota ${Number(lead.rating).toFixed(1)}`);
  if (Number(lead?.reviews || 0) > 0) parts.push(`${Number(lead?.reviews)} avaliações`);
  return parts.join(" • ");
}

function getCustomerConversationCardWhatsappAvailability(
  payload: CustomerConversationCardPayload | null,
) {
  const history = Array.isArray(payload?.history) ? payload.history : [];
  for (const event of history) {
    const resultLabel = String(event?.resultLabel || "").trim().toLowerCase();
    if (resultLabel === "unavailable") return "unavailable" as const;
    if (resultLabel === "available") return "available" as const;

    const title = String(event?.title || "").trim().toLowerCase();
    if (title.includes("numero sem whatsapp no motor")) return "unavailable" as const;
    if (title.includes("whatsapp confirmado no motor")) return "available" as const;
  }

  return "unknown" as const;
}

function getInboxConversationWhatsappAvailabilityFromMetadata(conversation?: InboxConversation | null) {
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  if (String(prospeccao?.stage || "").trim().toLowerCase() === "no_whatsapp") return "unavailable" as const;

  const queue = getInboxVendasAgendaQueue(conversation);
  const queueStatus = String(queue?.whatsappAvailabilityStatus || "").trim().toLowerCase();
  if (queueStatus === "unavailable") return "unavailable" as const;
  if (queueStatus === "available") return "available" as const;

  const metadata = getInboxConversationMetadata(conversation);
  const directStatus = String(
    metadata?.whatsappAvailabilityStatus ||
    metadata?.vendasWhatsappAvailabilityStatus ||
    "",
  ).trim().toLowerCase();
  if (directStatus === "unavailable") return "unavailable" as const;
  if (directStatus === "available") return "available" as const;

  return "unknown" as const;
}

function getCustomerConversationCardPhoneDigits(
  payload: CustomerConversationCardPayload | null,
  conversation?: InboxConversation | null,
) {
  return String(payload?.customer?.phoneNormalized || payload?.customer?.phone || conversation?.customer?.phone || "")
    .replace(/\D/g, "");
}

function normalizeConversationDisplayNameCandidate(
  value: unknown,
  phone?: string | null,
) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (lowered === "você" || lowered === "voce" || lowered === "you" || lowered === "eu") {
    return null;
  }
  if (isGenericInboxWhatsAppDisplayName(normalized)) {
    return null;
  }
  if (lowered.includes("@lid") || lowered.includes("@s.whatsapp.net")) {
    return null;
  }
  if (/^\d{14,}$/.test(normalized.replace(/\s+/g, ""))) {
    return null;
  }

  const candidateDigits = normalized.replace(/\D/g, "");
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (candidateDigits && phoneDigits && candidateDigits === phoneDigits) {
    return null;
  }

  return normalized;
}

function isGenericInboxWhatsAppDisplayName(value: string) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    "whatsapp",
    "whats app",
    "contato whatsapp",
    "contato whats app",
    "whatsapp business",
    "whats app business",
  ].includes(normalized);
}

function getInboxConversationMetadata(
  conversation?: InboxConversation | null,
): Record<string, unknown> | null {
  const metadata = conversation?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function parseInboxBooleanFlag(raw: unknown) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
}

function hasConversationUnavailableWhatsapp(
  conversationId: string | null | undefined,
  cache: Map<string, CustomerConversationCardPayload>,
  currentCard: CustomerConversationCardPayload | null,
  conversation?: InboxConversation | null,
) {
  if (getInboxConversationWhatsappAvailabilityFromMetadata(conversation) === "unavailable") return true;
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) return false;
  const payload = currentCard && String(currentCard?.lead?.id || "").trim() !== ""
    ? cache.get(normalizedId) || currentCard
    : cache.get(normalizedId) || currentCard;
  return getCustomerConversationCardWhatsappAvailability(payload) === "unavailable";
}

function isInboxConversationArchived(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (!metadata) return false;
  return [
    metadata.whatsappArchived,
    metadata.chatArchived,
    metadata.isArchived,
    metadata.archived,
    metadata.whatsappChatArchived,
  ].some((value) => parseInboxBooleanFlag(value));
}

function isProspectingInterestedConversation(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (!metadata) return false;
  const automation =
    metadata.vendasAutomation && typeof metadata.vendasAutomation === "object" && !Array.isArray(metadata.vendasAutomation)
      ? (metadata.vendasAutomation as Record<string, unknown>)
      : null;
  const queue =
    metadata.vendasAgendaQueue && typeof metadata.vendasAgendaQueue === "object" && !Array.isArray(metadata.vendasAgendaQueue)
      ? (metadata.vendasAgendaQueue as Record<string, unknown>)
      : null;
  return (
    String(automation?.status || "").trim().toLowerCase() === "interested" ||
    parseInboxBooleanFlag(queue?.interested) ||
    String(queue?.status || "").trim().toLowerCase() === "qualificado"
  );
}

function parseInboxDateOnlyKey(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeInboxComparableDate(value: unknown) {
  const asDateOnly = parseInboxDateOnlyKey(String(value || ""));
  if (asDateOnly) return asDateOnly;
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameInboxCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isInboxWebscrapingToday(conversation?: InboxConversation | null) {
  if (!conversation) return false;
  const vendasAgendaQueue = getInboxVendasAgendaQueue(conversation);
  if (parseInboxBooleanFlag(vendasAgendaQueue?.active)) return true;

  const metadata = getInboxConversationMetadata(conversation);
  const sourceCandidates = [
    conversation.latestSourceModule,
    metadata?.latestSourceModule,
    metadata?.sourceModule,
    metadata?.originFlow,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  const fromWebscraping = sourceCandidates.some((value) => value.includes("webscraping"));
  if (!fromWebscraping) return false;

  const activityAt = normalizeInboxComparableDate(getInboxConversationActivityAt(conversation));
  if (!activityAt) return false;
  return isSameInboxCalendarDay(activityAt, new Date());
}

type InboxBucket = "conversas" | "prospeccao" | "atendimento" | "excluidos" | "recovery" | "groups" | "blocked";

function mapInboxBucketToQueue(bucket: InboxBucket): InboxQueue {
  switch (bucket) {
    case "blocked":
      return "blocked";
    case "excluidos":
      return "archived";
    case "recovery":
      return "recovery";
    case "atendimento":
      return "scheduled";
    case "prospeccao":
      return "bot";
    case "groups":
      return "groups";
    default:
      return "all";
  }
}

function getInboxMetadataText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hasInboxInboundMessage(conversation?: InboxConversation | null) {
  return (conversation?.messages || []).some((message) => String(message.direction || "").trim().toLowerCase() === "inbound");
}

function getInboxAutomationMetadata(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (
    !metadata?.vendasAutomation ||
    typeof metadata.vendasAutomation !== "object" ||
    Array.isArray(metadata.vendasAutomation)
  ) {
    return null;
  }
  return metadata.vendasAutomation as Record<string, unknown>;
}

function isInboxProspectionSource(value: unknown) {
  const source = getInboxMetadataText(value);
  return (
    source === "vendas" ||
    source === "webscraping" ||
    source.includes("vendas") ||
    source.includes("prospeccao") ||
    source.includes("prospect") ||
    source.includes("webscraping")
  );
}

function hasInboxAutomaticProspectionOutbound(conversation?: InboxConversation | null) {
  return (conversation?.messages || []).some((message) => {
    if (String(message.direction || "").trim().toLowerCase() !== "outbound") return false;
    return isInboxProspectionSource(message.sourceModule);
  });
}

function hasInboxProspectionCustomerResponse(conversation?: InboxConversation | null) {
  const queue = getInboxVendasAgendaQueue(conversation);
  const automation = getInboxAutomationMetadata(conversation);
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const automationStatus = getInboxMetadataText(automation?.status);
  const prospeccaoStage = getInboxMetadataText(prospeccao?.stage);
  return (
    hasInboxInboundMessage(conversation) ||
    Boolean(String(queue?.respondedAt || "").trim()) ||
    prospeccaoStage === "reply_received" ||
    ["replied_positive", "replied_negative", "interested", "neutral", "human_assigned"].includes(automationStatus)
  );
}

function hasInboxRealMessage(conversation?: InboxConversation | null) {
  return Boolean(getInboxConversationActivityAt(conversation));
}

function isInboxPersonalContact(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const queue = getInboxVendasAgendaQueue(conversation);
  const manualQueue = getInboxMetadataText(metadata?.inboxManualQueueOverride || queue?.manualQueueOverride);
  const routeTarget = getInboxMetadataText(
    metadata?.queueTarget ||
      metadata?.routeTarget ||
      conversation?.routeTarget ||
      queue?.queueTarget ||
      queue?.routeTarget,
  );
  return (
    parseInboxBooleanFlag(metadata?.inboxPersonalContact) ||
    parseInboxBooleanFlag(metadata?.personalContact) ||
    parseInboxBooleanFlag(metadata?.whatsappPersonalContact) ||
    manualQueue === "all" ||
    routeTarget === "conversas"
  );
}

function hasInboxHbxProspectionOrigin(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const queue = getInboxVendasAgendaQueue(conversation);
  const automation = getInboxAutomationMetadata(conversation);
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const sourceCandidates = [
    conversation?.latestSourceModule,
    metadata?.latestSourceModule,
    metadata?.sourceModule,
    metadata?.originFlow,
    queue?.sourceModule,
    automation?.sourceModule,
    ...(conversation?.messages || []).map((message) => message.sourceModule),
  ].map(getInboxMetadataText);
  const routeTarget = getInboxMetadataText(
    metadata?.queueTarget ||
      metadata?.routeTarget ||
      conversation?.routeTarget ||
      queue?.queueTarget ||
      queue?.routeTarget,
  );
  return (
    Boolean(queue) ||
    Boolean(prospeccao?.stage) ||
    routeTarget === "prospeccao" ||
    routeTarget === "prospection" ||
    sourceCandidates.some(isInboxProspectionSource) ||
    Boolean(String(queue?.leadId || automation?.leadId || "").trim()) ||
    hasInboxAutomaticProspectionOutbound(conversation)
  );
}

function isInboxActiveProspectionConversation(conversation?: InboxConversation | null) {
  if (!hasInboxHbxProspectionOrigin(conversation)) return false;
  const metadata = getInboxConversationMetadata(conversation);
  const queue = getInboxVendasAgendaQueue(conversation);
  const automation = getInboxAutomationMetadata(conversation);
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const routeTarget = getInboxMetadataText(
    metadata?.queueTarget ||
      metadata?.routeTarget ||
      conversation?.routeTarget ||
      queue?.queueTarget ||
      queue?.routeTarget,
  );
  const statuses = [
    conversation?.flowResult,
    queue?.status,
    automation?.status,
    prospeccao?.stage,
  ].map(getInboxMetadataText);
  return (
    routeTarget === "prospeccao" ||
    routeTarget === "prospection" ||
    parseInboxBooleanFlag(queue?.active) ||
    Boolean(String(queue?.leadId || automation?.leadId || automation?.jobId || automation?.campaignId || "").trim()) ||
    statuses.some((status) =>
      [
        "pending_send",
        "scheduled_send",
        "sent_waiting",
        "reply_received",
        "replied_positive",
        "interested",
        "qualificado",
        "call_scheduled",
        "retorno_agendado",
        "prospection_call_scheduled",
        "neutral",
        "human_requested",
        "auto_reply_detected",
        "bot_menu_detected",
        "out_of_hours_auto_reply",
        "awaiting_human",
      ].includes(status),
    )
  );
}

function isInboxExcludedByOperationalState(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const queue = getInboxVendasAgendaQueue(conversation);
  const queueRecord = queue as Record<string, unknown> | null;
  const automation = getInboxAutomationMetadata(conversation);
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const statuses = [
    conversation?.flowResult,
    metadata?.flowResult,
    queue?.status,
    automation?.status,
    prospeccao?.stage,
  ].map(getInboxMetadataText);
  return (
    statuses.some((status) =>
      [
        "encerrado",
        "negative",
        "opt_out",
        "replied_negative",
        "no_response_archived",
        "expired_no_reply",
        "negative_reply",
        "no_whatsapp",
        "prospection_negative",
        "local_deleted",
      ].includes(status),
    ) ||
    [
      metadata?.optOut,
      metadata?.doNotContact,
      metadata?.blacklisted,
      metadata?.blacklist,
      queueRecord?.optOut,
      queueRecord?.doNotContact,
      queueRecord?.blacklisted,
      queueRecord?.blacklist,
    ].some((value) => parseInboxBooleanFlag(value))
  );
}

function getInboxProspectionWaitingSince(conversation?: InboxConversation | null) {
  const queue = getInboxVendasAgendaQueue(conversation);
  const automation = getInboxAutomationMetadata(conversation);
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const candidates = [
    prospeccao?.firstOutboundAt,
    automation?.sentAt,
    queue?.manualSentAt,
    queue?.lastManualSendAt,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized) continue;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function formatInboxWaitingLabel(value: string | null | undefined) {
  const startedAt = new Date(String(value || "")).getTime();
  if (!Number.isFinite(startedAt)) return "Aguardando resposta";
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (minutes < 1) return "Aguardando resposta agora";
  if (minutes < 60) return `Aguardando resposta há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Aguardando resposta há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Aguardando resposta há ${days}d`;
}

const VENDAS_PROSPECCAO_STAGES: VendasProspeccaoStage[] = [
  "pending_send",
  "scheduled_send",
  "sent_waiting",
  "reply_received",
  "expired_no_reply",
  "needs_review",
  "no_whatsapp",
  "negative_reply",
];

type InboxProspectionStatusMeta = {
  stage: VendasProspeccaoStage;
  badge: string;
  preview: string;
  subtitle: string;
  accent: string;
  surface: string;
};

function normalizeProspectionStage(value: unknown): VendasProspeccaoStage | null {
  const normalized = String(value || "").trim().toLowerCase();
  return VENDAS_PROSPECCAO_STAGES.includes(normalized as VendasProspeccaoStage)
    ? (normalized as VendasProspeccaoStage)
    : null;
}

function resolveInboxProspectionStage(conversation?: InboxConversation | null): VendasProspeccaoStage | null {
  if (!hasInboxHbxProspectionOrigin(conversation)) return null;
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const persistedStage = normalizeProspectionStage(prospeccao?.stage);
  if (persistedStage) return persistedStage;

  const queue = getInboxVendasAgendaQueue(conversation);
  const automation = getInboxAutomationMetadata(conversation);
  const statuses = [
    conversation?.flowResult,
    queue?.status,
    automation?.status,
  ].map(getInboxMetadataText);

  if (getInboxConversationWhatsappAvailabilityFromMetadata(conversation) === "unavailable") return "no_whatsapp";
  if (statuses.some((status) => ["negative", "opt_out", "replied_negative", "prospection_negative"].includes(status))) {
    return "negative_reply";
  }
  if (statuses.some((status) => ["no_response_archived", "expired_no_reply"].includes(status))) {
    return "expired_no_reply";
  }
  if (hasInboxProspectionCustomerResponse(conversation)) return "reply_received";
  if (
    parseInboxBooleanFlag(queue?.manualSent) ||
    String(queue?.manualSentAt || queue?.lastManualSendAt || automation?.sentAt || "").trim() ||
    hasInboxAutomaticProspectionOutbound(conversation)
  ) {
    return "sent_waiting";
  }
  if (String(queue?.returnAt || automation?.scheduledAt || "").trim()) return "scheduled_send";
  return "pending_send";
}

function formatProspectionSegment(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getInboxProspectionStatusMeta(conversation?: InboxConversation | null): InboxProspectionStatusMeta | null {
  const stage = resolveInboxProspectionStage(conversation);
  if (!stage) return null;
  const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
  const interestedProspection = isProspectingInterestedConversation(conversation);
  const interestedHandoff = interestedProspection && isInboxExplicitAtendimentoHandoff(conversation);
  const replyReceivedAccent = interestedProspection ? "#16a34a" : "#d97706";
  const replyReceivedSurface = interestedProspection ? "#e8f7ee" : "#fff3d6";
  const leadSegment = formatProspectionSegment(prospeccao?.leadSegment);
  const campaignSegment = formatProspectionSegment(prospeccao?.campaignSegment);
  const mismatchSubtitle =
    prospeccao?.mismatchReason === "segment_mismatch" && (leadSegment || campaignSegment)
      ? `Segmento divergente: ${leadSegment || "sem segmento"} / automação ${campaignSegment || "sem segmento"}`
      : "Revisar segmento antes de enviar";

  const byStage: Record<VendasProspeccaoStage, InboxProspectionStatusMeta> = {
    pending_send: {
      stage,
      badge: "Pendente",
      preview: "Aguardando envio do bot",
      subtitle: "Aguardando envio do bot",
      accent: "#5b8def",
      surface: "#eaf2ff",
    },
    scheduled_send: {
      stage,
      badge: "Agendado",
      preview: "Agendado para envio",
      subtitle: "Agendado para envio",
      accent: "#8b5cf6",
      surface: "#f2eafe",
    },
    sent_waiting: {
      stage,
      badge: "Aguardando",
      preview: "Aguardando resposta",
      subtitle: formatInboxWaitingLabel(getInboxProspectionWaitingSince(conversation)),
      accent: "#2563eb",
      surface: "#e8f1ff",
    },
    reply_received: {
      stage,
      badge: interestedProspection ? "Interessado" : "Resposta",
      preview: interestedProspection ? "Cliente gostou" : "Cliente respondeu",
      subtitle: interestedHandoff
        ? "Transferido para atendimento"
        : interestedProspection
          ? "Aguardando operador em Prospecção"
          : "Aguardando operador em Prospecção",
      accent: replyReceivedAccent,
      surface: replyReceivedSurface,
    },
    expired_no_reply: {
      stage,
      badge: "24h",
      preview: "Sem resposta há 24h",
      subtitle: "Sem resposta há 24h",
      accent: "#d97706",
      surface: "#fff3d6",
    },
    needs_review: {
      stage,
      badge: "Revisar",
      preview: "Revisar segmento antes de enviar",
      subtitle: mismatchSubtitle,
      accent: "#dc2626",
      surface: "#fee2e2",
    },
    no_whatsapp: {
      stage,
      badge: "S/WA",
      preview: "Número sem WhatsApp",
      subtitle: "Número sem WhatsApp",
      accent: "#7f1d1d",
      surface: "#f4d8d8",
    },
    negative_reply: {
      stage,
      badge: "Sem interesse",
      preview: "Sem interesse",
      subtitle: "Sem interesse",
      accent: "#b91c1c",
      surface: "#f3e7e7",
    },
  };
  return byStage[stage];
}

function isInboxExplicitAtendimentoHandoff(
  conversation?: InboxConversation | null,
  manualQueue?: InboxQueue,
  persistedQueue?: string,
) {
  const metadata = getInboxConversationMetadata(conversation);
  const queue = getInboxVendasAgendaQueue(conversation);
  if (manualQueue === "scheduled" || persistedQueue === "scheduled") return true;
  if (conversation?.humanAssigned === true) return true;
  if (parseInboxBooleanFlag(metadata?.humanAssigned) || parseInboxBooleanFlag(queue?.humanAssigned)) return true;

  const flowCandidates = [
    conversation?.flowResult,
    conversation?.currentFlow,
    metadata?.flowResult,
    metadata?.currentFlow,
    metadata?.currentStep,
    metadata?.handoffType,
    metadata?.routeReason,
  ].map(getInboxMetadataText);
  return flowCandidates.some(
    (value) =>
      value === "human_handoff" ||
      value === "recovery_handoff" ||
      value === "human_assigned" ||
      value.includes("human_handoff") ||
      value.includes("atendimento_humano"),
  );
}

function resolveInboxBucket(
  conversation: InboxConversation,
  manualQueueOverrides?: Record<string, InboxQueue>,
): InboxBucket {
  const manualQueue = manualQueueOverrides?.[String(conversation.id)];
  if (isInboxGroupConversation(conversation)) {
    return "groups";
  }
  if (conversation.isBlocked) {
    return "blocked";
  }
  if (manualQueue === "archived") {
    return "excluidos";
  }
  const metadata = getInboxConversationMetadata(conversation);
  const vendasAgendaQueue = getInboxVendasAgendaQueue(conversation);
  const persistedRouteTarget = getInboxMetadataText(
    conversation?.routeTarget ||
      metadata?.queueTarget ||
      metadata?.routeTarget ||
      vendasAgendaQueue?.queueTarget ||
      vendasAgendaQueue?.routeTarget,
  );
  if (persistedRouteTarget === "groups") {
    return "groups";
  }
  if (
    parseInboxBooleanFlag(metadata?.inboxLocalDeleted) ||
    parseInboxBooleanFlag(metadata?.localDeleted) ||
    conversation.isBlocked ||
    getInboxConversationWhatsappAvailabilityFromMetadata(conversation) === "unavailable" ||
    persistedRouteTarget === "excluidos" ||
    persistedRouteTarget === "excluded" ||
    isInboxExcludedByOperationalState(conversation)
  ) {
    return "excluidos";
  }
  const persistedQueue = String(
    metadata?.inboxManualQueueOverride || vendasAgendaQueue?.manualQueueOverride || "",
  )
    .trim()
    .toLowerCase();
  if (persistedQueue === "archived") {
    return "excluidos";
  }
  if (isInboxConversationArchived(conversation)) return "excluidos";
  if (
    Number(conversation.recoveryOpenAmount || 0) > 0 ||
    persistedRouteTarget === "recovery" ||
    getInboxMetadataText(conversation.latestSourceModule).includes("recovery")
  ) return "recovery";
  if (manualQueue && INBOX_QUEUE_ORDER.includes(manualQueue)) {
    return mapInboxQueueToBucket(manualQueue);
  }
  if (INBOX_QUEUE_ORDER.includes(persistedQueue as InboxQueue)) {
    return mapInboxQueueToBucket(persistedQueue as InboxQueue);
  }
  if (isInboxPersonalContact(conversation) || persistedRouteTarget === "conversas") {
    return "conversas";
  }
  const hasProspectionOrigin = hasInboxHbxProspectionOrigin(conversation);
  if (
    persistedRouteTarget === "atendimento" ||
    isInboxExplicitAtendimentoHandoff(conversation, manualQueue, persistedQueue)
  ) return "atendimento";
  if (isInboxActiveProspectionConversation(conversation) || hasProspectionOrigin) {
    return "prospeccao";
  }

  return "conversas";
}

function mapInboxQueueToBucket(queue: InboxQueue): InboxBucket {
  switch (queue) {
    case "blocked":
      return "blocked";
    case "archived":
      return "excluidos";
    case "recovery":
      return "recovery";
    case "scheduled":
      return "atendimento";
    case "bot":
      return "prospeccao";
    case "groups":
      return "groups";
    default:
      return "conversas";
  }
}

function getInboxConversationQueue(
  conversation: InboxConversation,
  manualQueueOverrides?: Record<string, InboxQueue>,
): InboxQueue {
  return mapInboxBucketToQueue(resolveInboxBucket(conversation, manualQueueOverrides));
}

function isInboxConversationVisibleInQueue(
  conversation: InboxConversation,
  queue: InboxQueue,
  manualQueueOverrides?: Record<string, InboxQueue>,
) {
  const conversationQueue = getInboxConversationQueue(conversation, manualQueueOverrides);
  if (queue === "all" && !hasInboxRealMessage(conversation)) return false;
  return conversationQueue === queue;
}

function getInboxConversationUnreadCount(conversation?: InboxConversation | null) {
  if (conversation?.isBlocked) return 0;
  const metadata = getInboxConversationMetadata(conversation);
  const unreadCount = Number(metadata?.whatsappUnreadCount || 0);
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return 0;
  return Math.floor(unreadCount);
}

function getInboxMergedConversationIds(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const mergedIds = Array.isArray(metadata?.__mergedConversationIds)
    ? metadata.__mergedConversationIds
    : null;
  const normalized = (mergedIds || [conversation?.id])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function getInboxVendasAgendaQueue(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (
    !metadata?.vendasAgendaQueue ||
    typeof metadata.vendasAgendaQueue !== "object" ||
    Array.isArray(metadata.vendasAgendaQueue)
  ) {
    return null;
  }
  return metadata.vendasAgendaQueue as VendasAgendaQueueMetadata;
}

function getInboxVendasProspeccaoMetadata(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (
    !metadata?.vendasProspeccao ||
    typeof metadata.vendasProspeccao !== "object" ||
    Array.isArray(metadata.vendasProspeccao)
  ) {
    return null;
  }
  return metadata.vendasProspeccao as VendasProspeccaoMetadata;
}

function getInboxVendasAgendaPendingDraft(conversation?: InboxConversation | null) {
  if (hasInboxHbxProspectionOrigin(conversation)) return null;
  const queue = getInboxVendasAgendaQueue(conversation);
  if (!queue || !parseInboxBooleanFlag(queue.active)) return null;
  if (parseInboxBooleanFlag(queue.manualSent) || String(queue.manualSentAt || "").trim()) return null;
  if (queue.draftPending === false) return null;
  const draftMessage = String(queue.draftMessage || "").trim();
  return draftMessage || null;
}

function isInboxGroupRemoteJid(raw: string | null | undefined) {
  const value = String(raw || "").trim().toLowerCase();
  return value.includes("@g.us");
}

function isInboxGroupConversation(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  return (
    parseInboxBooleanFlag(metadata?.whatsappIsGroup) ||
    parseInboxBooleanFlag(metadata?.isGroup) ||
    isInboxGroupRemoteJid(extractInboxRawContact(conversation))
  );
}

function getInboxStableRemoteKey(conversation?: InboxConversation | null) {
  return String(extractInboxRawContact(conversation) || "").trim().toLowerCase();
}

function resolveInboxAvatarUrl(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    conversation.customer?.avatarUrl,
    metadata?.whatsappAvatarUrl,
    metadata?.avatarUrl,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized) continue;
    return toAbsoluteAssetUrl(normalized);
  }

  return null;
}

function resolveInboxConversationDisplayName(conversation?: InboxConversation | null) {
  if (!conversation) return "Cliente";
  const phone = String(conversation.customer?.phone || "").trim();
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    metadata?.whatsappContactName,
    conversation.customer?.name,
    metadata?.whatsappProfileName,
    metadata?.waNickname,
    metadata?.whatsappName,
    phone,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeConversationDisplayNameCandidate(candidate, phone);
    if (normalized) return normalized;
  }

  return (
    formatInboxPhoneLabel(extractInboxRawContact(conversation)) ||
    formatInboxPhoneLabel(phone) ||
    String(phone || "").trim() ||
    "Contato WhatsApp"
  );
}

function getInboxConversationInitials(conversation?: InboxConversation | null) {
  const displayName = resolveInboxConversationDisplayName(conversation);
  const phone = String(conversation?.customer?.phone || "").trim();
  const digits = displayName.replace(/\D/g, "");
  if (digits && digits === phone.replace(/\D/g, "")) {
    return digits.slice(-2).padStart(2, "0");
  }

  const words = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return displayName.slice(0, 2).toUpperCase();
}

function extractInboxRawContact(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    conversation?.customer?.phone,
    conversation?.contact,
    metadata?.customerPhone,
    metadata?.whatsappPhone,
    metadata?.phone,
    metadata?.whatsappRemoteJidAlt,
    metadata?.remoteJidAlt,
    metadata?.whatsappRemoteJid,
    metadata?.remoteJid,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const lowered = value.toLowerCase();
      if (lowered === "0@s.whatsapp.net") return false;
      if (lowered.includes("@s.whatsapp.net")) {
        const left = lowered.split("@")[0] || "";
        const digits = left.replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 15 && !/^0+$/.test(digits);
      }
      return true;
    });

  const phoneLike = candidates.find((value) => {
    const lowered = value.toLowerCase();
    if (lowered.includes("@lid") || lowered.includes("@g.us") || lowered.includes("@broadcast")) return false;
    return Boolean(extractInboxContactDigits(value));
  });
  if (phoneLike) return phoneLike;

  const nonLid = candidates.find((value) => {
    const lowered = value.toLowerCase();
    return !lowered.includes("@lid") && !lowered.includes("@g.us") && !lowered.includes("@broadcast");
  });
  return nonLid || "";
}

function extractInboxContactDigits(raw: string | null | undefined) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function formatInboxPhoneLabel(raw: string | null | undefined) {
  const digits = extractInboxContactDigits(raw);
  if (!digits) return null;

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

function getInboxConversationDisplayPhone(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  return (
    formatInboxPhoneLabel(conversation.customer?.phone) ||
    formatInboxPhoneLabel(extractInboxRawContact(conversation))
  );
}

function isInboxDisplayNameEquivalentToPhone(displayName: string, rawPhone?: string | null) {
  const nameDigits = displayName.replace(/\D/g, "");
  const phoneDigits = extractInboxContactDigits(rawPhone);
  return Boolean(nameDigits && phoneDigits && nameDigits === phoneDigits);
}

function getInboxConversationIdentityAliases(conversation?: InboxConversation | null) {
  if (!conversation) return ["conversation:none"];
  const aliases = new Set<string>();
  const rawContact = extractInboxRawContact(conversation);
  const stableRemoteKey = getInboxStableRemoteKey(conversation);
  if (stableRemoteKey) aliases.add(`jid:${stableRemoteKey}`);
  const phoneDigits = extractInboxContactDigits(rawContact);
  if (phoneDigits && !isInboxGroupRemoteJid(rawContact)) aliases.add(`phone:${phoneDigits}`);

  const conversationId = normalizeInboxConversationId(conversation.id);
  if (conversationId) aliases.add(`conversation:${conversationId}`);
  return Array.from(aliases);
}

function isInboxConversationHiddenByDelete(
  conversation: InboxConversation | null | undefined,
  deletedAliases: DeletedConversationAliasMap,
) {
  if (!conversation) return false;
  const metadata = getInboxConversationMetadata(conversation);
  if (
    parseInboxBooleanFlag(metadata?.whatsappConversationDeleted) ||
    parseInboxBooleanFlag(metadata?.inboxWhatsAppDeleted)
  ) {
    return true;
  }
  return getInboxConversationIdentityAliases(conversation).some((alias) => Boolean(deletedAliases[alias]));
}

function getInboxConversationQualityScore(conversation: InboxConversation) {
  const hasPhone = Boolean(extractInboxContactDigits(extractInboxRawContact(conversation)));
  const hasAvatar = Boolean(resolveInboxAvatarUrl(conversation));
  const displayName = resolveInboxConversationDisplayName(conversation);
  const hasRealName = !isInboxDisplayNameEquivalentToPhone(
    displayName,
    extractInboxRawContact(conversation),
  );
  const hasSharedProfile = Boolean(String(conversation.customer?.sharedProfile?.profileId || "").trim());
  const hasCustomerProfile = Boolean(String(conversation.customer?.customerProfileId || "").trim());
  const hasRecoveryLink = Boolean(String(conversation.recoveryCustomerId || "").trim());
  const messageCount = Array.isArray(conversation.messages) ? conversation.messages.length : 0;

  return (
    (hasRealName ? 8 : 0) +
    (hasPhone ? 6 : 0) +
    (hasAvatar ? 4 : 0) +
    (hasSharedProfile ? 4 : 0) +
    (hasCustomerProfile ? 3 : 0) +
    (hasRecoveryLink ? 2 : 0) +
    Math.min(messageCount, 3)
  );
}

function mergeInboxMessageLists(
  leftMessages?: InboxMessage[] | null,
  rightMessages?: InboxMessage[] | null,
) {
  const merged = [...(Array.isArray(leftMessages) ? leftMessages : []), ...(Array.isArray(rightMessages) ? rightMessages : [])];
  const byId = new Map<string, InboxMessage>();
  for (const message of merged) {
    byId.set(String(message.id), message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(String(left.createdAt || "")).getTime();
    const rightTime = new Date(String(right.createdAt || "")).getTime();
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

function mergeInboxConversations(
  current: InboxConversation,
  incoming: InboxConversation,
) {
  const currentScore = getInboxConversationQualityScore(current);
  const incomingScore = getInboxConversationQualityScore(incoming);
  const shouldPreferIncoming =
    incomingScore > currentScore ||
    (incomingScore === currentScore &&
      new Date(getInboxConversationActivityAt(incoming)).getTime() >
        new Date(getInboxConversationActivityAt(current)).getTime());
  const primary = shouldPreferIncoming ? incoming : current;
  const secondary = primary === incoming ? current : incoming;

  const mergedMessages = mergeInboxMessageLists(primary.messages, secondary.messages);
  const mergedMetadata = {
    ...((secondary.metadata as Record<string, unknown> | null | undefined) || {}),
    ...((primary.metadata as Record<string, unknown> | null | undefined) || {}),
    __mergedConversationIds: Array.from(
      new Set([
        ...getInboxMergedConversationIds(primary),
        ...getInboxMergedConversationIds(secondary),
      ]),
    ),
  };

  return {
    ...secondary,
    ...primary,
    metadata: mergedMetadata,
    customer: {
      ...secondary.customer,
      ...primary.customer,
      name:
        normalizeConversationDisplayNameCandidate(primary.customer?.name, primary.customer?.phone) ||
        normalizeConversationDisplayNameCandidate(secondary.customer?.name, secondary.customer?.phone) ||
        primary.customer?.name ||
        secondary.customer?.name ||
        null,
      phone:
        extractInboxContactDigits(extractInboxRawContact(primary))
          ? String(primary.customer?.phone || extractInboxRawContact(primary) || "").trim()
          : String(secondary.customer?.phone || extractInboxRawContact(secondary) || "").trim(),
      avatarUrl:
        String(primary.customer?.avatarUrl || "").trim() ||
        String(secondary.customer?.avatarUrl || "").trim() ||
        null,
      sharedProfile: primary.customer?.sharedProfile || secondary.customer?.sharedProfile || null,
    },
    messages: mergedMessages,
  };
}

function mergeDuplicateInboxConversations(conversationList: InboxConversation[]) {
  const source = Array.isArray(conversationList) ? conversationList : [];
  if (source.length <= 1) return source;

  const parent = source.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
    }
  };

  const aliasToFirstIndex = new Map<string, number>();
  source.forEach((conversation, index) => {
    for (const alias of getInboxConversationIdentityAliases(conversation)) {
      const first = aliasToFirstIndex.get(alias);
      if (first === undefined) {
        aliasToFirstIndex.set(alias, index);
      } else {
        union(first, index);
      }
    }
  });

  const groups = new Map<number, InboxConversation[]>();
  source.forEach((conversation, index) => {
    const root = find(index);
    const list = groups.get(root);
    if (list) {
      list.push(conversation);
    } else {
      groups.set(root, [conversation]);
    }
  });

  return Array.from(groups.values()).map((group) =>
    group.slice(1).reduce((acc, item) => mergeInboxConversations(acc, item), group[0]),
  );
}

function getInboxConversationActivityAt(
  conversation?: Partial<Pick<InboxConversation, "lastMessageAt" | "lastRealMessageAt" | "messages">> | null,
) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const latestRealMessage = getInboxLatestRealMessage(messages);
  const messageCandidates = [
    conversation?.lastRealMessageAt || conversation?.lastMessageAt,
    latestRealMessage?.createdAt,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const latestMessageAt = messageCandidates.reduce((latest, candidate) => {
    if (!latest) return candidate;
    const latestTime = new Date(latest).getTime();
    const candidateTime = new Date(candidate).getTime();
    if (!Number.isFinite(candidateTime)) return latest;
    if (!Number.isFinite(latestTime) || candidateTime > latestTime) {
      return candidate;
    }
    return latest;
  }, "");
  return latestMessageAt;
}

function getInboxConversationFreshness(
  conversation?:
    | Pick<InboxConversation, "lastMessageAt" | "lastRealMessageAt" | "messages">
    | null,
) {
  return getInboxConversationActivityAt(conversation);
}

function getInboxConversationPreview(conversation?: InboxConversation | null) {
  const latestMessage = getInboxLatestMessage(conversation?.messages);
  const preview = String(getMessagePreview(latestMessage) || "").trim();
  if (preview) return preview;
  if (!conversation) return "";
  const prospectionStatus = getInboxProspectionStatusMeta(conversation);
  if (prospectionStatus) return prospectionStatus.preview;
  const pendingDraft = getInboxVendasAgendaPendingDraft(conversation);
  if (pendingDraft) return `Roteiro pendente: ${pendingDraft}`;
  if (isAtendimentoAgendaConversation(conversation)) return "Agendamento em andamento";
  if (conversation.isBlocked) return "Contato bloqueado";
  if (conversation.status === "closed") return "Conversa encerrada";
  return "Sem mensagens";
}

function renderInboxConversationPreview(conversation?: InboxConversation | null) {
  const preview = getInboxConversationPreview(conversation);
  const prospectionStatus = getInboxProspectionStatusMeta(conversation);
  if (!prospectionStatus) return preview;
  const subtitle = String(prospectionStatus.subtitle || "").trim();
  return subtitle ? `${preview} · ${prospectionStatus.badge} ${subtitle}` : preview;
}

function getInboxConversationSubtitle(conversation?: InboxConversation | null) {
  if (!conversation) return undefined;
  const rawContact = extractInboxRawContact(conversation);
  if (isInboxGroupRemoteJid(rawContact)) {
    return "Grupo";
  }
  return undefined;
}

function parseTemplateButtonLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeMetaTemplatesPayload(
  payload: RecoveryMetaTemplatesPayload | null | undefined,
): RecoveryMetaTemplatesPayload {
  const counters = payload?.counters;
  return {
    ...DEFAULT_META_TEMPLATES_PAYLOAD,
    ...(payload || {}),
    syncError:
      payload?.syncError !== undefined && payload?.syncError !== null
        ? String(payload.syncError)
        : null,
    counters: {
      total: Number(counters?.total || 0),
      approved: Number(counters?.approved || 0),
      pending: Number(counters?.pending || 0),
      rejected: Number(counters?.rejected || 0),
      hbxActive: Number(counters?.hbxActive || 0),
      eligible: Number(counters?.eligible || 0),
    },
    templates: Array.isArray(payload?.templates) ? payload.templates : [],
    history: Array.isArray(payload?.history) ? payload.history : [],
  };
}

function fillTemplateComposerFromTemplate(template: RecoveryMetaTemplateItem): TemplateComposer {
  const normalized = template.normalized;
  const buttons =
    Array.isArray(normalized?.buttons) && normalized.buttons.length > 0
      ? normalized.buttons.map((button) => String(button.text || "").trim()).filter(Boolean)
      : Array.isArray(template.buttonLabels)
        ? template.buttonLabels
        : [];

  return {
    name: String(template.name || ""),
    category:
      String(template.category || "").toUpperCase() === "MARKETING"
        ? "MARKETING"
        : String(template.category || "").toUpperCase() === "AUTHENTICATION"
          ? "AUTHENTICATION"
          : "UTILITY",
    language: String(template.language || "pt_BR"),
    bodyText: String(normalized?.body?.text ?? template.bodyText ?? ""),
    footerText: String(normalized?.footer?.text ?? template.footerText ?? ""),
    buttonsText: buttons.join("\n"),
    activateInHbx: Boolean(template.hbxActive),
    headerFormat:
      normalized?.header?.format === "TEXT" ||
      normalized?.header?.format === "IMAGE" ||
      normalized?.header?.format === "DOCUMENT" ||
      normalized?.header?.format === "VIDEO"
        ? normalized.header.format
        : "NONE",
    headerText: String(normalized?.header?.text ?? template.headerText ?? ""),
    headerHandle: String(normalized?.header?.exampleHandle ?? template.headerHandle ?? ""),
    headerMediaUrl: String(normalized?.header?.mediaUrl ?? template.headerMediaUrl ?? ""),
  };
}

function shouldReloadInboxConversation(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary) return false;
  if (!detail) return true;
  if (summary.id !== detail.id) return true;
  return getInboxConversationFreshness(summary) !== getInboxConversationFreshness(detail);
}

function mergeInboxConversationSummary(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary && !detail) return null;
  if (!summary) return detail || null;
  if (!detail || detail.id !== summary.id) return summary;

  const summaryMetadata =
    (summary.metadata as Record<string, unknown> | null | undefined) || {};
  const detailMetadata =
    (detail.metadata as Record<string, unknown> | null | undefined) || {};
  const mergedCustomerName =
    normalizeConversationDisplayNameCandidate(detail.customer?.name, detail.customer?.phone) ||
    normalizeConversationDisplayNameCandidate(summary.customer?.name, summary.customer?.phone) ||
    detail.customer?.name ||
    summary.customer?.name ||
    null;

  return {
    ...summary,
    ...detail,
    metadata: {
      ...summaryMetadata,
      ...detailMetadata,
      __mergedConversationIds: Array.from(
        new Set([
          ...getInboxMergedConversationIds(summary),
          ...getInboxMergedConversationIds(detail),
        ]),
      ),
    },
    customer: {
      ...summary.customer,
      ...detail.customer,
      name: mergedCustomerName,
      phone:
        String(detail.customer?.phone || "").trim() ||
        String(summary.customer?.phone || "").trim() ||
        "",
      avatarUrl:
        String(detail.customer?.avatarUrl || "").trim() ||
        String(summary.customer?.avatarUrl || "").trim() ||
        null,
      sharedProfile:
        detail.customer?.sharedProfile || summary.customer?.sharedProfile || null,
    },
    messages:
      Array.isArray(detail.messages) && detail.messages.length > 0
        ? detail.messages
        : summary.messages,
  };
}

function markInboxConversationAsSummaryOnly(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = getInboxConversationMetadata(conversation);
  return {
    ...conversation,
    metadata: {
      ...(metadata || {}),
      __summaryOnly: true,
    },
    messages: [],
  } as InboxConversation;
}

function clearInboxConversationSummaryOnly(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = { ...(getInboxConversationMetadata(conversation) || {}) };
  delete metadata.__summaryOnly;
  return {
    ...conversation,
    metadata,
  } as InboxConversation;
}

function isInboxConversationSummaryOnly(conversation?: InboxConversation | null) {
  return Boolean(getInboxConversationMetadata(conversation)?.__summaryOnly);
}

function areInboxMessageListsEquivalent(
  leftMessages?: InboxMessage[] | null,
  rightMessages?: InboxMessage[] | null,
) {
  const left = Array.isArray(leftMessages) ? leftMessages : [];
  const right = Array.isArray(rightMessages) ? rightMessages : [];
  if (left.length !== right.length) return false;

  return left.every((message, index) => {
    const candidate = right[index];
    if (!candidate) return false;
    return (
      String(message.id) === String(candidate.id) &&
      String(message.createdAt || "") === String(candidate.createdAt || "") &&
      String(message.direction || "") === String(candidate.direction || "") &&
      String(message.senderType || "") === String(candidate.senderType || "") &&
      String(message.status || "") === String(candidate.status || "") &&
      String(message.content || "") === String(candidate.content || "")
    );
  });
}

function didInboxConversationViewChange(
  current?: InboxConversation | null,
  next?: InboxConversation | null,
) {
  if (!current && !next) return false;
  if (!current || !next) return true;
  if (current.id !== next.id) return true;

  const comparableFields = [
    "status",
    "routeTarget",
    "routeReason",
    "currentFlow",
    "flowResult",
    "latestSourceModule",
    "isBlocked",
    "blockedAt",
    "blockedReason",
    "humanAssigned",
    "botActive",
    "updatedAt",
    "lastMessageAt",
    "recoveryCustomerId",
    "recoveryCurrentStep",
    "recoveryStatus",
    "recoveryOpenAmount",
    "recoveryTotalPaid",
  ] as const;

  if (
    comparableFields.some(
      (field) => String(current[field] ?? "") !== String(next[field] ?? ""),
    )
  ) {
    return true;
  }

  if (getInboxConversationFreshness(current) !== getInboxConversationFreshness(next)) return true;
  if (
    resolveInboxConversationDisplayName(current) !== resolveInboxConversationDisplayName(next)
  ) {
    return true;
  }
  if (String(current.customer?.phone || "") !== String(next.customer?.phone || "")) return true;
  if (String(resolveInboxAvatarUrl(current) || "") !== String(resolveInboxAvatarUrl(next) || "")) return true;
  if (String(current.customer?.customerProfileId || "") !== String(next.customer?.customerProfileId || "")) return true;
  if (String(current.customer?.email || "") !== String(next.customer?.email || "")) return true;
  if (String(current.customer?.document || "") !== String(next.customer?.document || "")) return true;
  if (String(current.customer?.customerProfileStatus || "") !== String(next.customer?.customerProfileStatus || "")) return true;
  if (String(current.customer?.registrationStatus || "") !== String(next.customer?.registrationStatus || "")) return true;

  return !areInboxMessageListsEquivalent(current.messages, next.messages);
}

function getInboxConversationSortAtForQueue(conversation: InboxConversation, queue?: InboxQueue) {
  if (queue === "bot") {
    const prospeccao = getInboxVendasProspeccaoMetadata(conversation);
    const agenda = getInboxVendasAgendaQueue(conversation);
    const automation = getInboxAutomationMetadata(conversation);
    const candidates = [
      prospeccao?.firstOutboundAt,
      agenda?.manualSentAt,
      agenda?.lastManualSendAt,
      automation?.sentAt,
      agenda?.syncedAt,
      automation?.scheduledAt,
      agenda?.returnAt,
      conversation.updatedAt,
      getInboxConversationActivityAt(conversation),
    ];
    return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  }
  return getInboxConversationActivityAt(conversation);
}

function sortInboxConversationsByActivity(conversationList: InboxConversation[], queue?: InboxQueue) {
  return [...conversationList].sort((left, right) => {
    const leftTime = new Date(getInboxConversationSortAtForQueue(left, queue)).getTime();
    const rightTime = new Date(getInboxConversationSortAtForQueue(right, queue)).getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    if (safeRight !== safeLeft) return safeRight - safeLeft;
    const leftCreated = new Date(String(left.createdAt || "")).getTime();
    const rightCreated = new Date(String(right.createdAt || "")).getTime();
    const safeLeftCreated = Number.isFinite(leftCreated) ? leftCreated : 0;
    const safeRightCreated = Number.isFinite(rightCreated) ? rightCreated : 0;
    if (safeRightCreated !== safeLeftCreated) return safeRightCreated - safeLeftCreated;
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    return (Number.isFinite(rightId) ? rightId : 0) - (Number.isFinite(leftId) ? leftId : 0);
  });
}

function countInboxConversationsInQueue(
  conversationList: InboxConversation[],
  queue: InboxQueue,
  manualQueueOverrides?: Record<string, InboxQueue>,
) {
  return conversationList.reduce((total, conversation) => {
    return isInboxConversationVisibleInQueue(conversation, queue, manualQueueOverrides) ? total + 1 : total;
  }, 0);
}

function sortInboxMessagesChronologically(messages: InboxMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(String(left.createdAt || "")).getTime();
    const rightTime = new Date(String(right.createdAt || "")).getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    if (safeLeft !== safeRight) return safeLeft - safeRight;
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    return (Number.isFinite(leftId) ? leftId : 0) - (Number.isFinite(rightId) ? rightId : 0);
  });
}

function getInboxMessageStableKey(message?: InboxMessage | null) {
  if (!message) return "";
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  return String(
    metadata.providerMessageId ||
      metadata.rawProviderMessageId ||
      message.id ||
      `${message.direction}:${message.createdAt}:${message.content}`,
  );
}

function getInboxLatestMessage(messages?: InboxMessage[] | null) {
  const sorted = sortInboxMessagesChronologically(Array.isArray(messages) ? messages : []);
  return sorted[sorted.length - 1] || null;
}

function isInboxRealMessage(message?: InboxMessage | null) {
  if (!message) return false;
  const direction = String(message.direction || "").trim().toLowerCase();
  if (direction !== "inbound" && direction !== "outbound") return false;
  const messageType = String(message.messageType || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    ? message.metadata
    : null;
  return messageType !== "system_event" && senderType !== "system" && !metadata?.isLocalHidden && !metadata?.isDeleted;
}

function getInboxLatestRealMessage(messages?: InboxMessage[] | null) {
  const sorted = sortInboxMessagesChronologically(Array.isArray(messages) ? messages.filter(isInboxRealMessage) : []);
  return sorted[sorted.length - 1] || null;
}

function isInboxInboundMessage(message?: InboxMessage | null) {
  if (!message) return false;
  return String(message.direction || "").trim().toLowerCase() === "inbound";
}

function formatInboxIncomingNotice(conversation: InboxConversation, message: InboxMessage) {
  const name = resolveInboxConversationDisplayName(conversation) || "Contato";
  const preview = getMessagePreview(message).trim() || "Nova mensagem recebida.";
  return `${name}: ${preview.length > 90 ? `${preview.slice(0, 90)}...` : preview}`;
}

function normalizeInboxConversationList(conversationList: InboxConversation[]) {
  const normalized = (Array.isArray(conversationList) ? conversationList : [])
    .map((conversation) => normalizeInboxConversationPayload(conversation))
    .filter((conversation): conversation is InboxConversation => Boolean(conversation));

  return sortInboxConversationsByActivity(
    mergeDuplicateInboxConversations(sortInboxConversationsByActivity(normalized)),
  );
}

function areInboxConversationListsEquivalent(
  currentList?: InboxConversation[] | null,
  nextList?: InboxConversation[] | null,
) {
  const current = Array.isArray(currentList) ? currentList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  if (current.length !== next.length) return false;

  return current.every((conversation, index) =>
    !didInboxConversationViewChange(conversation, next[index]),
  );
}

function mapInboxBubbleTone(message: InboxMessage) {
  const direction = String(message.direction || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "system") return "system" as const;
  if (senderType === "human") return "human" as const;
  if (direction === "outbound") return "outbound" as const;
  return "inbound" as const;
}

function formatInboxMessageTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInboxMessageDayLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString().slice(0, 10);
  const today = new Date();
  const isSameDay =
    parsed.getDate() === today.getDate() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getFullYear() === today.getFullYear();
  if (isSameDay) return "Hoje";
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function isMobileAtendimentoViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 820px)").matches;
}

function isInboxSameCalendarDay(
  leftDate: string | null | undefined,
  rightDate: string | null | undefined,
) {
  if (!leftDate || !rightDate) return false;
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  return (
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear()
  );
}

function removeButtonFromSections(config: AtendimentoBotConfig, actionId: string): AtendimentoBotConfig {
  return {
    ...config,
    welcomeButtons: config.welcomeButtons.filter((button) => button.actionId !== actionId),
    returningCustomerButtons: config.returningCustomerButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    mainMenuButtons: config.mainMenuButtons.filter((button) => button.actionId !== actionId),
    recoveryDetectedButtons: config.recoveryDetectedButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    postActionButtons: config.postActionButtons.filter((button) => button.actionId !== actionId),
  };
}

const COMMON_EMOJIS = [
  "😀", "😂", "🥲", "😊", "🥰", "😍", "😘", "😭", "😅", "🤣",
  "😤", "😡", "🤔", "😴", "🤗", "😱", "😎", "🥺", "😒", "😔",
  "👍", "👏", "🙏", "🤝", "💪", "🫡", "🫶", "✌️", "👀", "💯",
  "❤️", "🔥", "⭐", "✨", "🎉", "✅", "❌", "🚀", "💬", "😬",
];

function MessageStatusTick({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  if (s === "read") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Lido">
        <svg width={18} height={10} viewBox="0 0 18 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L13 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5l4 4L17 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "delivered") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Entregue">
        <svg width={18} height={10} viewBox="0 0 18 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L13 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5l4 4L17 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "sent") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Enviado">
        <svg width={12} height={10} viewBox="0 0 12 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L11 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "failed" || s === "error") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3, color: "#ff6b6b", fontWeight: 700, fontSize: "0.78rem" }} title="Falha no envio">!</span>
    );
  }
  if (s === "pending" || s === "queued" || s === "processing") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Enviando">
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <circle cx="5" cy="5" r="4" stroke="#8696a0" strokeWidth="1.5" />
          <path d="M5 2.5V5l2 1.5" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return null;
}

export default function InboxClientPage() {
  const router = useRouter();
  const [mobileBlocked, setMobileBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 820px)");
    const sync = () => setMobileBlocked(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (mobileBlocked) router.replace("/vendas");
  }, [mobileBlocked, router]);

  if (mobileBlocked) {
    return (
      <main className={styles.mobileAtendimentoRedirect} aria-live="polite">
        <div>
          <span>HBX Mobile</span>
          <strong>Abrindo Vendas</strong>
        </div>
      </main>
    );
  }

  return <InboxDesktopClientPage />;
}

function InboxDesktopClientPage() {
  const hasToken = useRequireModule("atendimento");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = useMemo(
    () => normalizeInboxTab(searchParams?.get("atendimentoTab")) || "messages",
    [searchParams],
  );
  const requestedQueue = useMemo(
    () => normalizeInboxQueueParam(searchParams?.get("atendimentoQueue") || searchParams?.get("queue")),
    [searchParams],
  );
  const requestedSection = useMemo(
    () => normalizeAtendimentoSectionParam(searchParams?.get("atendimentoSection")),
    [searchParams],
  );
  const requestedAgendaStudioOpen = useMemo(
    () => searchParams?.get("agendaStudio") === "1",
    [searchParams],
  );
  const requestedAgendaMode = useMemo<AgendaMode>(
    () => (searchParams?.get("agendaMode") === "sales" ? "sales" : "bot"),
    [searchParams],
  );
  const requestedAgendaReturnTo = useMemo(
    () => String(searchParams?.get("returnTo") || "").trim(),
    [searchParams],
  );
  const requestedConversationId = useMemo(
    () => normalizeInboxConversationId(searchParams?.get("conversationId") || searchParams?.get("selectedConversationId")),
    [searchParams],
  );
  const requestedSupportPhone = useMemo(() => {
    if (searchParams?.get("support") !== "1") return "";
    return String(searchParams?.get("phone") || "").replace(/\D/g, "");
  }, [searchParams]);
  const requestedSupportMessage = useMemo(() => {
    if (searchParams?.get("support") !== "1") return "";
    return String(searchParams?.get("message") || "Olá, preciso de ajuda com o HBX!").trim();
  }, [searchParams]);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>(requestedTab);
  const [inboxQueue, setInboxQueue] = useState<InboxQueue>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newConversationPhone, setNewConversationPhone] = useState("");
  const [newConversationName, setNewConversationName] = useState("");
  const [newConversationBusy, setNewConversationBusy] = useState(false);
  const [manualQueueOverrides, setManualQueueOverrides] = useState<Record<string, InboxQueue>>({});
  const [deletedConversationAliases, setDeletedConversationAliases] = useState<DeletedConversationAliasMap>({});
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null);
  const [draggedQueueId, setDraggedQueueId] = useState<InboxQueue | null>(null);
  const [dropOverQueue, setDropOverQueue] = useState<InboxQueue | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [whatsappSession, setWhatsappSession] = useState<InboxBootstrapPayload["whatsappSession"]>(null);
  const [whatsappSessionCleanup, setWhatsappSessionCleanup] =
    useState<InboxBootstrapPayload["whatsappSessionCleanup"]>(null);
  const [whatsappSessionCleanupBusy, setWhatsappSessionCleanupBusy] = useState<"merge" | "discard" | null>(null);
  const [whatsappAccessBlocked, setWhatsappAccessBlocked] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [conversationListHasMoreByQueue, setConversationListHasMoreByQueue] = useState<Record<InboxQueue, boolean>>(
    () => buildInboxQueueBooleanMap(false),
  );
  const conversationListHasMore = conversationListHasMoreByQueue[inboxQueue] ?? false;
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [olderMessagesHasMore, setOlderMessagesHasMore] = useState(false);
  const [olderMessagesBefore, setOlderMessagesBefore] = useState<string | null>(null);
  const [loadingBot, setLoadingBot] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [atendimentoVisualCount, setAtendimentoVisualCount] = useState(0);
  const [agendaDirty, setAgendaDirty] = useState(false);
  const [botConfigDirtyFromAgendaReset, setBotConfigDirtyFromAgendaReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationListError, setConversationListError] = useState<string | null>(null);
  const [conversationDetailError, setConversationDetailError] = useState<string | null>(null);
  const [inboxRealtimeFallbackActive, setInboxRealtimeFallbackActive] = useState(false);
  const [lastConversationSyncAt, setLastConversationSyncAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<InboxMessage | null>(null);
  const [imagePreview, setImagePreview] = useState<InboxAttachmentPreview | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string; mimeType: string; seconds: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [openedAsset, setOpenedAsset] = useState<OpenedInboxAsset | null>(null);
  const [failedInboxMediaUrls, setFailedInboxMediaUrls] = useState<Record<string, true>>({});
  const [queueActionConversationId, setQueueActionConversationId] = useState<string | null>(null);
  const [queueActionMenuPosition, setQueueActionMenuPosition] = useState<QueueActionMenuPosition | null>(null);
  const [messageReactionTargetId, setMessageReactionTargetId] = useState<string | null>(null);
  const [blockDialog, setBlockDialog] = useState<{ conversationId: string; reason: string } | null>(null);
  const [deleteMessageDialog, setDeleteMessageDialog] = useState<{ messageId: string } | null>(null);

  useEffect(() => {
    if (!requestedSupportPhone) return;
    setActiveTab("messages");
    setInboxQueue("all");
    setConversationSearch(requestedSupportPhone);
    if (requestedSupportMessage) {
      setSendText(requestedSupportMessage);
      sendTextDirtyRef.current = true;
    }
    setNotice({
      tone: "info",
      text: "Suporte HBX preparado no Inbox com a mensagem pronta.",
    });
  }, [requestedSupportMessage, requestedSupportPhone]);
  const [revealedDeletedMessageIds, setRevealedDeletedMessageIds] = useState<Record<string, boolean>>({});
  const [customerConversationCard, setCustomerConversationCard] =
    useState<CustomerConversationCardPayload | null>(null);
  const [customerConversationCardDraft, setCustomerConversationCardDraft] =
    useState<CustomerConversationCardDraft>({
      doNotCall: false,
      returnAt: "",
      observations: "",
    });
  const [loadingCustomerConversationCard, setLoadingCustomerConversationCard] = useState(false);
  const [savingCustomerConversationCard, setSavingCustomerConversationCard] = useState(false);
  const [customerConversationCardError, setCustomerConversationCardError] = useState<string | null>(null);
  const [customerCardShortcutOpen, setCustomerCardShortcutOpen] = useState(false);
  const [agendaStudioOpen, setAgendaStudioOpen] = useState(false);
  const [templatesStudioOpen, setTemplatesStudioOpen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("conversa");
  const [internalNote, setInternalNote] = useState("");
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [prospectingAutomationStatus, setProspectingAutomationStatus] =
    useState<ProspectingAutomationLiveStatus | null>(null);
  const [prospectingAutomationLoading, setProspectingAutomationLoading] = useState(false);
  const [prospectingAutomationAction, setProspectingAutomationAction] = useState<string | null>(null);
  const [campaignStudioOpen, setCampaignStudioOpen] = useState(false);
  const [campaignConfig, setCampaignConfig] = useState<ProspectingCampaignConfig>(DEFAULT_PROSPECTING_CAMPAIGN_CONFIG);
  const campaignConfigDirtyRef = useRef(false);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(
    DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  );
  const [metaTemplates, setMetaTemplates] = useState<RecoveryMetaTemplatesPayload>(
    DEFAULT_META_TEMPLATES_PAYLOAD,
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editingTemplateLabel, setEditingTemplateLabel] = useState<string | null>(null);
  const [templateComposer, setTemplateComposer] = useState<TemplateComposer>(
    DEFAULT_TEMPLATE_COMPOSER,
  );
  const [whatsappCenterPayload, setWhatsappCenterPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<InboxAlertKind | "system_notice", boolean>>({
    human_queue: false,
    new_message: false,
    system_notice: false,
  });
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<InboxAlertKind, boolean>>({
    human_queue: false,
    new_message: false,
  });
  const previousHumanCountRef = useRef(0);
  const previousNewCountRef = useRef(0);
  const humanAlertTimerRef = useRef<number | null>(null);
  const newAlertTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const skipNotePersistRef = useRef(false);
  const chatTimelineRef = useRef<HTMLDivElement | null>(null);
  const chatComposerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationListScrollRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const queueActionMenuRef = useRef<HTMLDivElement | null>(null);
  const messageReactionPickerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMaxPeakRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);
  const customerReturnInputRef = useRef<HTMLInputElement | null>(null);
  const customerReturnAutoSaveTimerRef = useRef<number | null>(null);
  const conversationSearchInputRef = useRef<HTMLInputElement | null>(null);
  const conversationsRef = useRef<InboxConversation[]>([]);
  const loadingMoreConversationsRef = useRef(false);
  const conversationListHasMoreByQueueRef = useRef<Record<InboxQueue, boolean>>(buildInboxQueueBooleanMap(false));
  const conversationDetailCacheRef = useRef<Map<string, InboxConversation>>(new Map());
  const customerConversationCardCacheRef = useRef<Map<string, CustomerConversationCardPayload>>(new Map());
  const manualQueueOverridesRef = useRef<Record<string, InboxQueue>>({});
  const deletedConversationAliasesRef = useRef<DeletedConversationAliasMap>({});
  const selectedIdRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<InboxConversation | null>(null);
  const activeConversationLatestMessageKeyRef = useRef<Record<string, string>>({});
  const inboxQueueRef = useRef<InboxQueue>("all");
  const conversationLoadTokenRef = useRef(0);
  const customerConversationCardLoadTokenRef = useRef(0);
  const botConfigLoadedRef = useRef(false);
  const agendaConfigLoadedRef = useRef(false);
  const sendTextDirtyRef = useRef(false);
  const restoreComposerFocusAfterSendRef = useRef(false);
  const lastSectionChangeRef = useRef<{ section: AtendimentoSection | null; at: number }>({
    section: null,
    at: 0,
  });
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const inboxBootstrapLaunchNotice = useQuickLaunchNotice();
  const initialMirrorBootstrapStartedRef = useRef(false);
  const [inboxBootstrapProgressLabel, setInboxBootstrapProgressLabel] = useState<string | null>(null);
  const [inboxBootstrapProgressValueLabel, setInboxBootstrapProgressValueLabel] = useState<string | null>(null);
  const [inboxBootstrapDetailRows, setInboxBootstrapDetailRows] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [inboxBootstrapCelebrate, setInboxBootstrapCelebrate] = useState(false);
  const inboxBootstrapStageTimerRef = useRef<number | null>(null);
  const botAiActive = hasBotAi(commercialPlans);
  const botSetupComplete = isAtendimentoBotSetupComplete(botConfig);
  const globalBotEnabled = botAiActive && botSetupComplete && botConfig.routingRules.globalBotEnabled !== false;

  const openBotPlans = useCallback(() => {
    setNotice({
      tone: "info",
      text: "Bot de atendimento está disponível no HBX Full — Bot e IA.",
    });
    router.push(INBOX_BOT_PLAN_HREF);
  }, [router]);

  const openBotPlansFromError = useCallback((error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "ATENDIMENTO_BOT_SETUP_INCOMPLETE") {
      setNotice({
        tone: "info",
        text: "Conclua a configuração guiada antes de ativar o Bot no Inbox.",
      });
      router.push("/tutorial?start=bot&from=inbox_bot");
      return true;
    }
    const redirectTo = getBotAiPlanRedirectFromError(error, INBOX_BOT_PLAN_HREF);
    if (!redirectTo) return false;
    setNotice({
      tone: "info",
      text: "Bot de atendimento está disponível no HBX Full — Bot e IA.",
    });
    router.push(redirectTo);
    return true;
  }, [router]);

  const requireBotAi = useCallback(() => {
    if (botAiActive) return true;
    openBotPlans();
    return false;
  }, [botAiActive, openBotPlans]);

  const openBotSetupTutorial = useCallback(() => {
    setNotice({
      tone: "info",
      text: "Conclua a configuração guiada antes de ativar o Bot no Inbox.",
    });
    router.push("/tutorial?start=bot&from=inbox_bot");
  }, [router]);

  const requireBotReady = useCallback(() => {
    if (!requireBotAi()) return false;
    if (botSetupComplete) return true;
    openBotSetupTutorial();
    return false;
  }, [botSetupComplete, openBotSetupTutorial, requireBotAi]);

  const markInboxMediaUrlFailed = useCallback((url?: string | null) => {
    const normalized = String(url || "").trim();
    if (!normalized) return;
    setFailedInboxMediaUrls((current) =>
      current[normalized] ? current : { ...current, [normalized]: true },
    );
  }, []);

  useEffect(() => {
    setFailedInboxMediaUrls((current) => (Object.keys(current).length ? {} : current));
  }, [selectedId, selectedConversation?.updatedAt, selectedConversation?.messages?.length]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handle = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!openedAsset) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedAsset(null);
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openedAsset]);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (
        queueActionMenuRef.current &&
        !queueActionMenuRef.current.contains(event.target as Node)
      ) {
        setQueueActionConversationId(null);
      }
      if (
        messageReactionPickerRef.current &&
        !messageReactionPickerRef.current.contains(event.target as Node)
      ) {
        setMessageReactionTargetId(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (!queueActionConversationId) {
      setQueueActionMenuPosition(null);
      return;
    }

    const closeMenu = () => {
      setQueueActionConversationId(null);
      setQueueActionMenuPosition(null);
    };

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [queueActionConversationId]);

  const toggleQueueConversationMenu = useCallback(
    (conversationId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setQueueActionConversationId((current) => {
        if (current === conversationId) {
          setQueueActionMenuPosition(null);
          return null;
        }
        setQueueActionMenuPosition({
          top: rect.bottom + 8,
          left: Math.max(12, rect.right - 144),
        });
        return conversationId;
      });
    },
    [],
  );

  useEffect(() => {
    if (requestedTab !== "automation") return;
    if (!commercialPlans) return;
    if (!botAiActive) {
      router.replace(INBOX_BOT_PLAN_HREF, { scroll: false });
      return;
    }
    router.replace(botSetupComplete ? "/atendimento/automacao?tab=flow" : "/tutorial?start=bot&from=inbox_bot", {
      scroll: false,
    });
  }, [botAiActive, botSetupComplete, commercialPlans, requestedTab, router]);

  useEffect(() => {
    if (requestedQueue) {
      setInboxQueue(requestedQueue);
    }
    if (!requestedSection) return;

    setActiveTab("messages");
    setTemplatesStudioOpen(false);
    if (requestedSection === "agenda") {
      setAgendaStudioOpen(requestedAgendaStudioOpen);
      setContextTab("agenda");
      return;
    }
    if (requestedSection === "automacao") {
      if (!commercialPlans) return;
      if (!botAiActive) {
        router.replace(INBOX_BOT_PLAN_HREF, { scroll: false });
        return;
      }
      if (!botSetupComplete) {
        router.replace("/tutorial?start=bot&from=inbox_bot", { scroll: false });
        return;
      }
      setAgendaStudioOpen(false);
      setTemplatesStudioOpen(false);
      setCampaignStudioOpen(true);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.delete("atendimentoSection");
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(nextUrl, { scroll: false });
      return;
    }
    setAgendaStudioOpen(false);
    setContextTab(requestedSection);
  }, [botAiActive, botSetupComplete, commercialPlans, pathname, requestedAgendaStudioOpen, requestedQueue, requestedSection, router, searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INBOX_MANUAL_QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, InboxQueue>;
      if (!parsed || typeof parsed !== "object") return;
      const nextEntries = Object.entries(parsed).filter(
        ([, queue]) => typeof queue === "string" && INBOX_QUEUE_ORDER.includes(queue),
      );
      setManualQueueOverrides(Object.fromEntries(nextEntries));
    } catch {
      // ignore persisted parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const normalized = normalizeDeletedConversationAliasMap(parsed);
      setDeletedConversationAliases(normalized);
      deletedConversationAliasesRef.current = normalized;
    } catch {
      setDeletedConversationAliases({});
      deletedConversationAliasesRef.current = {};
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INBOX_MANUAL_QUEUE_STORAGE_KEY, JSON.stringify(manualQueueOverrides));
  }, [manualQueueOverrides]);

  useEffect(() => {
    deletedConversationAliasesRef.current = deletedConversationAliases;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY,
      JSON.stringify(deletedConversationAliases),
    );
  }, [deletedConversationAliases]);

  useEffect(() => {
    if (!agendaStudioOpen && !templatesStudioOpen) return;
    const releaseTopbarLock = acquirePopupTopbarLock();
    return releaseTopbarLock;
  }, [agendaStudioOpen, templatesStudioOpen]);

  useEffect(() => {
    if (!agendaStudioOpen && !templatesStudioOpen) {
      setOverlayVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setOverlayVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [agendaStudioOpen, templatesStudioOpen]);


  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    loadingMoreConversationsRef.current = loadingMoreConversations;
  }, [loadingMoreConversations]);

  useEffect(() => {
    conversationListHasMoreByQueueRef.current = conversationListHasMoreByQueue;
  }, [conversationListHasMoreByQueue]);

  useEffect(() => {
    manualQueueOverridesRef.current = manualQueueOverrides;
  }, [manualQueueOverrides]);

  useEffect(() => {
    inboxQueueRef.current = inboxQueue;
  }, [inboxQueue]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation, selectedId]);

  const rememberConversationDetail = useCallback((conversation?: InboxConversation | null) => {
    if (!conversation || isInboxConversationSummaryOnly(conversation)) return;
    conversationDetailCacheRef.current.set(conversation.id, clearInboxConversationSummaryOnly(conversation) || conversation);
  }, []);

  const clearInboxBootstrapStageTimer = useCallback(() => {
    if (inboxBootstrapStageTimerRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(inboxBootstrapStageTimerRef.current);
    }
    inboxBootstrapStageTimerRef.current = null;
  }, []);

  const closeInboxBootstrapLaunchDialog = useCallback(() => {
    clearInboxBootstrapStageTimer();
    setInboxBootstrapProgressLabel(null);
    setInboxBootstrapProgressValueLabel(null);
    setInboxBootstrapDetailRows([]);
    setInboxBootstrapCelebrate(false);
    inboxBootstrapLaunchNotice.clear();
  }, [clearInboxBootstrapStageTimer, inboxBootstrapLaunchNotice]);

  const buildInboxBootstrapDetailRows = useCallback(
    (payload?: Partial<InboxFullBootstrapPayload> | null) => [
      {
        label: "Motor",
        value: payload?.connected === false ? "Offline" : "Online",
      },
      {
        label: "Contatos",
        value: String(Math.max(0, Number(payload?.contactsSynced || 0))),
      },
      {
        label: "Conversas",
        value: `${Math.max(0, Number(payload?.conversationsMirrored || 0))}/${Math.max(
          0,
          Number(payload?.conversationsDiscovered || 0),
        )}`,
      },
      {
        label: "Mensagens",
        value: String(Math.max(0, Number(payload?.messagesMirrored || 0))),
      },
    ],
    [],
  );

  const runInitialInboxMirrorBootstrap = useCallback(async () => {
    if (typeof window === "undefined") return null;
    if (window.sessionStorage.getItem(INBOX_INITIAL_MIRROR_SESSION_KEY) === "done") {
      return null;
    }

    clearInboxBootstrapStageTimer();
    setInboxBootstrapCelebrate(false);
    setInboxBootstrapDetailRows(buildInboxBootstrapDetailRows());
    setInboxBootstrapProgressLabel(INBOX_BOOTSTRAP_STAGE_SEQUENCE[0].label);
    setInboxBootstrapProgressValueLabel(INBOX_BOOTSTRAP_STAGE_SEQUENCE[0].value);
    inboxBootstrapLaunchNotice.start({
      loadingTitle: "Carregando WhatsApp",
      loadingDescription:
        "Baixando conversas, nomes, fotos e midias do motor para deixar a inbox pronta no backend.",
      successTitle: "Inbox pronta",
      successDescription: "Tudo espelhado no backend. Vamos abrir o Atendimento.",
      ctaLabel: "Abrir inbox",
      onOpen: closeInboxBootstrapLaunchDialog,
    });

    let stageIndex = 0;
    inboxBootstrapStageTimerRef.current = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, INBOX_BOOTSTRAP_STAGE_SEQUENCE.length - 1);
      const stage = INBOX_BOOTSTRAP_STAGE_SEQUENCE[stageIndex];
      setInboxBootstrapProgressLabel(stage.label);
      setInboxBootstrapProgressValueLabel(stage.value);
    }, 900);

    try {
      const payload = await apiFetch<InboxFullBootstrapPayload>("/inbox/bootstrap/full/background?take=120", {
        method: "POST",
      });
      clearInboxBootstrapStageTimer();
      setInboxBootstrapProgressLabel(
        payload.heavySync ? "Espelhamento pesado concluido" : "Espelhamento concluido",
      );
      setInboxBootstrapProgressValueLabel(
        payload.pagesFetched > 0 ? `${payload.pagesFetched} pag.` : "100%",
      );
      setInboxBootstrapDetailRows(buildInboxBootstrapDetailRows(payload));
      setInboxBootstrapCelebrate(Boolean(payload.heavySync));
      window.sessionStorage.setItem(INBOX_INITIAL_MIRROR_SESSION_KEY, "done");
      if (payload.message) {
        setNotice({ tone: "success", text: payload.message });
      }
      inboxBootstrapLaunchNotice.markSuccess({
        successDescription:
          payload.message ||
          "Conversas, nomes, fotos e historico foram puxados do motor e gravados no backend.",
      });
      return payload;
    } catch (bootstrapError) {
      clearInboxBootstrapStageTimer();
      closeInboxBootstrapLaunchDialog();
      throw bootstrapError;
    }
  }, [
    buildInboxBootstrapDetailRows,
    clearInboxBootstrapStageTimer,
    closeInboxBootstrapLaunchDialog,
    inboxBootstrapLaunchNotice,
  ]);

  const bootstrapInbox = useCallback(async (options?: { take?: number }) => {
    const take = Math.max(
      1,
      Math.min(
        120,
        Number(options?.take || INBOX_CONVERSATION_LIST_LIMIT) || INBOX_CONVERSATION_LIST_LIMIT,
      ),
    );
    setBootstrapReady(false);
    setLoadingList(true);
    setLoadingConversation(true);
    setError(null);
    setConversationListError(null);
    setConversationDetailError(null);
    try {
      const query = new URLSearchParams({ take: String(take) });
      const payload = await apiFetch<InboxBootstrapPayload>(`/inbox/bootstrap?${query.toString()}`, {
        requireAuth: true,
        timeoutMs: 25000,
      });
      setWhatsappSession(payload?.whatsappSession || null);
      setWhatsappSessionCleanup(payload?.whatsappSessionCleanup || null);
      const blocked = payload?.whatsappSession?.accessible === false || payload?.providerWarning?.code === "WHATSAPP_REQUIRED";
      setWhatsappAccessBlocked(blocked);
      if (blocked) {
        setConversations([]);
        setSelectedId(null);
        setSelectedConversation(null);
        selectedIdRef.current = null;
        selectedConversationRef.current = null;
        setOlderMessagesBefore(null);
        setOlderMessagesHasMore(false);
        setBootstrapReady(true);
        return;
      }
      const nextList = normalizeInboxConversationList(
        Array.isArray(payload?.conversations) ? payload.conversations : [],
      ).filter(
        (conversation) =>
          !isInboxConversationHiddenByDelete(conversation, deletedConversationAliasesRef.current),
      );
      const normalizedDetail = normalizeInboxConversationPayload(payload?.selectedConversation);
      const detail =
        normalizedDetail &&
        !isInboxConversationHiddenByDelete(normalizedDetail, deletedConversationAliasesRef.current)
          ? normalizedDetail
          : null;
      const preferredId = detail?.id || nextList[0]?.id || null;
      const summary = preferredId
        ? nextList.find((conversation) => conversation.id === preferredId) || null
        : null;
      const mergedSelected = mergeInboxConversationSummary(summary, detail);

      setConversations(nextList);
      setSelectedId(mergedSelected?.id || preferredId);
      setSelectedConversation(mergedSelected);
      rememberConversationDetail(mergedSelected);
      setOlderMessagesBefore(getInboxOldestMessageDate(mergedSelected?.messages));
      setOlderMessagesHasMore((mergedSelected?.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      setConversationListHasMoreByQueue(buildInboxQueueBooleanMap(nextList.length >= take));
      setLastConversationSyncAt(new Date().toISOString());
      setBootstrapReady(true);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar a inbox.";
      setConversationListError(message);
      setError(message);
      if (message.toLowerCase().includes("sem whatsapp") || message.toLowerCase().includes("whatsapp/celular")) {
        setWhatsappAccessBlocked(true);
        setConversations([]);
        setSelectedId(null);
        setSelectedConversation(null);
      }
    } finally {
      setLoadingList(false);
      setLoadingConversation(false);
    }
  }, [rememberConversationDetail]);

  const resolveWhatsappSessionCleanup = useCallback(async (mode: "merge" | "discard") => {
    setWhatsappSessionCleanupBusy(mode);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string }>("/inbox/whatsapp-sessions/cleanup", {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      conversationDetailCacheRef.current.clear();
      setConversations([]);
      setSelectedId(null);
      setSelectedConversation(null);
      setOlderMessagesBefore(null);
      setOlderMessagesHasMore(false);
      if (mode === "discard") setManualQueueOverrides({});
      setWhatsappSessionCleanup(null);
      setNotice({
        tone: "success",
        text:
          String(payload?.message || "").trim() ||
          (mode === "merge"
            ? "Histórico antigo mesclado na sessão atual."
            : "Histórico antigo descartado do HBX."),
      });
      await bootstrapInbox({ take: INBOX_CONVERSATION_LIST_LIMIT });
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Falha ao limpar sessões antigas.");
    } finally {
      setWhatsappSessionCleanupBusy(null);
    }
  }, [bootstrapInbox]);

  const loadConversation = useCallback(async (
    id: string | null | undefined,
    options?: { silent?: boolean; forceRefresh?: boolean },
  ) => {
    const silent = options?.silent ?? false;
    const forceRefresh = options?.forceRefresh ?? false;
    const conversationId = normalizeInboxConversationId(id);
    if (!conversationId) {
      const message = "Conversa sem identificador valido. Recarregue a fila para sincronizar novamente.";
      setConversationDetailError(message);
      setError(message);
      setOlderMessagesBefore(null);
      setOlderMessagesHasMore(false);
      if (!silent) setLoadingConversation(false);
      return;
    }

    const requestToken = ++conversationLoadTokenRef.current;
    const summary =
      conversationsRef.current.find((conversation) => conversation.id === conversationId) || null;
    const cachedDetail =
      conversationDetailCacheRef.current.get(conversationId) ||
      (selectedConversationRef.current?.id === conversationId &&
        !isInboxConversationSummaryOnly(selectedConversationRef.current)
        ? selectedConversationRef.current
        : null);
    const cachedDetailIsFresh = cachedDetail
      ? !shouldReloadInboxConversation(summary, cachedDetail)
      : false;
    const mergedSummary = mergeInboxConversationSummary(
      summary,
      cachedDetail,
    );
    setSelectedId(conversationId);
    selectedIdRef.current = conversationId;
    if (mergedSummary) {
      const nextConversation =
        cachedDetail || (silent && selectedConversationRef.current?.id === conversationId)
          ? mergedSummary
          : markInboxConversationAsSummaryOnly(mergedSummary);
      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
    } else if (!silent || selectedConversationRef.current?.id !== conversationId) {
      setSelectedConversation(null);
      selectedConversationRef.current = null;
    }
    setConversationDetailError(null);
    if (cachedDetail && cachedDetailIsFresh && !forceRefresh) {
      setOlderMessagesBefore(getInboxOldestMessageDate(cachedDetail.messages));
      setOlderMessagesHasMore((cachedDetail.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      setLoadingConversation(false);
      setBootstrapReady(true);
      return;
    }
    if (!silent && !cachedDetail) setLoadingConversation(true);
    try {
      const rawData = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}`, {
        requireAuth: true,
        timeoutMs: 10000,
      });
      const data = normalizeInboxConversationPayload(rawData);
      if (!data) {
        throw new Error("Conversa sem identificador valido retornada pelo servidor.");
      }

      if (requestToken !== conversationLoadTokenRef.current) {
        return;
      }

      if (isInboxConversationHiddenByDelete(data, deletedConversationAliasesRef.current)) {
        if (selectedIdRef.current === conversationId) {
          setSelectedId(null);
          setSelectedConversation(null);
          selectedIdRef.current = null;
          selectedConversationRef.current = null;
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }
        return;
      }

      const detailedConversation = clearInboxConversationSummaryOnly(data);
      setSelectedConversation((current) =>
        detailedConversation && !(silent && !didInboxConversationViewChange(current, detailedConversation))
          ? detailedConversation
          : current,
      );
      if (detailedConversation) {
        selectedConversationRef.current = detailedConversation;
        rememberConversationDetail(detailedConversation);
        const latestMessage = getInboxLatestMessage(detailedConversation.messages);
        const latestKey = getInboxMessageStableKey(latestMessage);
        if (latestKey) {
          activeConversationLatestMessageKeyRef.current[detailedConversation.id] = latestKey;
        }
        setConversations((current) =>
          sortInboxConversationsByActivity(current.map((conversation) =>
            conversation.id === detailedConversation.id
              ? {
                  ...conversation,
                  lastRealMessageAt: detailedConversation.lastRealMessageAt || detailedConversation.lastMessageAt || null,
                  lastMessageAt: detailedConversation.lastRealMessageAt || detailedConversation.lastMessageAt || null,
                  updatedAt: latestMessage?.createdAt || detailedConversation.updatedAt || conversation.updatedAt,
                  messages: detailedConversation.messages,
                }
              : conversation,
          )),
        );
        setOlderMessagesBefore(getInboxOldestMessageDate(detailedConversation.messages));
        setOlderMessagesHasMore((detailedConversation.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      }
      if (data) {
        setSelectedId(data.id);
      }
      setConversationDetailError(null);
      setBootstrapReady(true);
    } catch (loadError) {
      if (requestToken !== conversationLoadTokenRef.current) {
        return;
      }
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setConversationDetailError(message);
      setError(message);
      if (message.toLowerCase().includes("sem whatsapp") || message.toLowerCase().includes("whatsapp/celular")) {
        setWhatsappAccessBlocked(true);
      }
    } finally {
      if (!silent && requestToken === conversationLoadTokenRef.current) {
        setLoadingConversation(false);
      }
    }
  }, [rememberConversationDetail]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = normalizeInboxConversationId(selectedIdRef.current || selectedId);
    const currentConversation =
      selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null;
    const before = olderMessagesBefore || getInboxOldestMessageDate(currentConversation?.messages);
    if (!conversationId || !before || loadingOlderMessages) return;

    const timeline = chatTimelineRef.current;
    const previousScrollHeight = timeline?.scrollHeight || 0;
    const previousScrollTop = timeline?.scrollTop || 0;
    setLoadingOlderMessages(true);
    setConversationDetailError(null);
    try {
      const payload = await apiFetch<InboxMessagePagePayload>(
        `/inbox/conversations/${conversationId}/messages?limit=${INBOX_RECENT_MESSAGES_LIMIT}&before=${encodeURIComponent(before)}`,
      );
      const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      const baseConversation =
        selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : currentConversation;
      if (!baseConversation) return;

      const byId = new Map<string, InboxMessage>();
      for (const message of [...olderMessages, ...(baseConversation.messages || [])]) {
        byId.set(String(message.id), message);
      }
      const nextConversation = {
        ...baseConversation,
        messages: sortInboxMessagesChronologically(Array.from(byId.values())),
      };
      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
      rememberConversationDetail(nextConversation);
      setOlderMessagesBefore(payload?.nextBefore || getInboxOldestMessageDate(nextConversation.messages));
      setOlderMessagesHasMore(Boolean(payload?.hasMore));
      if (timeline && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const nextScrollHeight = timeline.scrollHeight;
          timeline.scrollTop = Math.max(0, nextScrollHeight - previousScrollHeight + previousScrollTop);
        });
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar mensagens antigas.";
      setConversationDetailError(message);
      setError(message);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages, olderMessagesBefore, rememberConversationDetail, selectedId]);

  const refreshSelectedConversationMessages = useCallback(async () => {
    const conversationId = normalizeInboxConversationId(selectedIdRef.current);
    if (!conversationId) return;

    try {
      const currentConversation =
        selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null;
      if (!currentConversation || isInboxConversationSummaryOnly(currentConversation)) {
        await loadConversation(conversationId, { silent: true, forceRefresh: true });
        return;
      }

      const payload = await apiFetch<InboxMessagePagePayload>(
        `/inbox/conversations/${conversationId}/messages?limit=${INBOX_RECENT_MESSAGES_LIMIT}`,
        {
          requireAuth: true,
          timeoutMs: 15000,
        },
      );
      const latestMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      if (!latestMessages.length) return;

      const byId = new Map<string, InboxMessage>();
      for (const message of [...(currentConversation.messages || []), ...latestMessages]) {
        byId.set(String(message.id), message);
      }
      const nextMessages = sortInboxMessagesChronologically(Array.from(byId.values()));
      if (areInboxMessageListsEquivalent(currentConversation.messages, nextMessages)) return;

      const latestMessage = getInboxLatestMessage(nextMessages);
      const latestRealMessage = getInboxLatestRealMessage(nextMessages);
      const latestKey = getInboxMessageStableKey(latestMessage);
      const previousKey = activeConversationLatestMessageKeyRef.current[conversationId] || "";
      const nextConversation: InboxConversation = {
        ...currentConversation,
        messages: nextMessages,
        lastRealMessageAt: latestRealMessage?.createdAt || currentConversation.lastRealMessageAt || currentConversation.lastMessageAt || null,
        lastMessageAt: latestRealMessage?.createdAt || currentConversation.lastRealMessageAt || currentConversation.lastMessageAt || null,
        updatedAt: latestMessage?.createdAt || currentConversation.updatedAt,
      };

      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
      rememberConversationDetail(nextConversation);
      setOlderMessagesBefore(getInboxOldestMessageDate(nextMessages));
      setOlderMessagesHasMore((nextMessages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT || Boolean(payload?.hasMore));
      setLastConversationSyncAt(new Date().toISOString());

      setConversations((current) =>
        sortInboxConversationsByActivity(current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                lastRealMessageAt: nextConversation.lastRealMessageAt,
                lastMessageAt: nextConversation.lastMessageAt,
                updatedAt: nextConversation.updatedAt,
                messages: nextMessages,
              }
            : conversation,
        )),
      );

      if (latestKey) {
        activeConversationLatestMessageKeyRef.current[conversationId] = latestKey;
      }
      if (
        previousKey &&
        latestKey &&
        previousKey !== latestKey &&
        latestMessage &&
        isInboxInboundMessage(latestMessage) &&
        !nextConversation.isBlocked
      ) {
        setNotice({ tone: "info", text: formatInboxIncomingNotice(nextConversation, latestMessage) });
      }
    } catch (refreshError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Falha ao atualizar mensagens da conversa aberta.", refreshError);
      }
    }
  }, [loadConversation, rememberConversationDetail]);

  const loadConversations = useCallback(
    async (options?: { preferredId?: string | null; silent?: boolean; append?: boolean }) => {
      const silent = options?.silent ?? false;
      const append = options?.append ?? false;
      const currentList = conversationsRef.current;
      const appendQueue = inboxQueueRef.current;
      const manualOverrides = manualQueueOverridesRef.current;
      const take = append
        ? INBOX_CONVERSATION_LIST_LIMIT
        : Math.max(
            INBOX_CONVERSATION_LIST_LIMIT,
            Math.min(120, currentList.length || INBOX_CONVERSATION_LIST_LIMIT),
          );
      const skip = append
        ? countInboxConversationsInQueue(currentList, appendQueue, manualOverrides)
        : 0;
      if (append) {
        if (
          loadingMoreConversationsRef.current ||
          !conversationListHasMoreByQueueRef.current[appendQueue]
        ) {
          return;
        }
        setLoadingMoreConversations(true);
      } else if (!silent) {
        setLoadingList(true);
      }
      setError(null);
      setConversationListError(null);
      try {
        const query = new URLSearchParams({
          take: String(take),
          skip: String(skip),
        });
        if (append || appendQueue === "blocked") {
          query.set("queue", appendQueue);
        }
        const response = await apiFetch<InboxConversation[]>(
          `/inbox/conversations?${query.toString()}`,
          {
            requireAuth: true,
            timeoutMs: 15000,
          },
        );
        const rawPage = normalizeInboxConversationList(Array.isArray(response) ? response : []).filter(
          (conversation) => !isInboxConversationHiddenByDelete(conversation, deletedConversationAliasesRef.current),
        );
        const page = append || appendQueue === "blocked"
          ? rawPage.filter((conversation) =>
              isInboxConversationVisibleInQueue(conversation, appendQueue, manualOverrides),
            )
          : rawPage;
        const data = append
          ? normalizeInboxConversationList([...currentList, ...page])
          : page;
        const nextHasMore = Array.isArray(response) && response.length >= take;
        if (append) {
          setConversationListHasMoreByQueue((current) => ({
            ...current,
            [appendQueue]: nextHasMore,
          }));
        } else {
          setConversationListHasMoreByQueue(buildInboxQueueBooleanMap(nextHasMore));
        }
        const listChanged = !areInboxConversationListsEquivalent(currentList, data);

        if (listChanged) {
          setConversations(data);
        }
        setConversationListError(null);
        setBootstrapReady(true);
        if (listChanged || currentList.length === 0) {
          setLastConversationSyncAt(new Date().toISOString());
        }
        if (append) return;

        const preferredId = options && Object.prototype.hasOwnProperty.call(options, "preferredId")
          ? options.preferredId
          : selectedIdRef.current;
        const selectedSummary =
          preferredId ? data.find((conversation) => conversation.id === preferredId) || null : null;
        const currentQueue = inboxQueueRef.current;
        const fallbackSummary =
          (currentQueue === "all"
            ? data[0]
            : data.find((conversation) => getInboxConversationQueue(conversation) === currentQueue)) ??
          data[0] ??
          null;
        const nextSummary = selectedSummary || fallbackSummary;
        const nextId = nextSummary?.id ?? null;

        if (nextId !== selectedIdRef.current) {
          setSelectedId(nextId);
        }

        const mergedConversation = mergeInboxConversationSummary(
          nextSummary,
          selectedConversationRef.current?.id === nextId
            ? selectedConversationRef.current
            : nextId
              ? conversationDetailCacheRef.current.get(nextId) || null
              : null,
        );

        if (mergedConversation) {
          setSelectedConversation((current) =>
            !listChanged && silent && !didInboxConversationViewChange(current, mergedConversation)
              ? current
              : mergedConversation,
          );
        } else if (!nextId) {
          setSelectedConversation(null);
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }

        if (
          listChanged &&
          nextId &&
          shouldReloadInboxConversation(nextSummary, selectedConversationRef.current)
        ) {
          void loadConversation(nextId, { silent: true, forceRefresh: true });
        } else if (nextSummary && selectedConversationRef.current?.id === nextId) {
          setSelectedConversation((current) =>
            current && current.id === nextId
              ? didInboxConversationViewChange(current, {
                  ...current,
                  ...nextSummary,
                  messages: current.messages,
                })
                ? {
                    ...current,
                    ...nextSummary,
                    messages: current.messages,
                  }
                : current
              : current,
          );
          } else if (!nextSummary) {
          setSelectedConversation(null);
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setConversationListError(message);
        if (!silent || conversationsRef.current.length === 0) {
          setError(message);
        }
        if (message.toLowerCase().includes("sem whatsapp") || message.toLowerCase().includes("whatsapp/celular")) {
          setWhatsappAccessBlocked(true);
          setConversations([]);
          setSelectedId(null);
          setSelectedConversation(null);
        }
      } finally {
        if (!silent) setLoadingList(false);
        if (append) setLoadingMoreConversations(false);
      }
    },
    [loadConversation],
  );

  const loadMoreConversations = useCallback(() => {
    void loadConversations({ silent: true, append: true });
  }, [loadConversations]);

  const startManualConversation = useCallback(async () => {
    const phone = newConversationPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      setError("Informe um telefone com DDD para iniciar a conversa.");
      return;
    }
    setNewConversationBusy(true);
    setError(null);
    try {
      const rawConversation = await apiFetch<InboxConversation>("/inbox/conversations/start", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 12000,
        body: JSON.stringify({
          phone: newConversationPhone,
          name: newConversationName.trim() || null,
        }),
      });
      const conversation = normalizeInboxConversationPayload(rawConversation);
      if (!conversation) throw new Error("O backend não retornou a conversa criada.");
      rememberConversationDetail(clearInboxConversationSummaryOnly(conversation));
      setConversations((current) =>
        sortInboxConversationsByActivity(
          normalizeInboxConversationList([
            conversation,
            ...current.filter((item) => item.id !== conversation.id),
          ]),
        ),
      );
      setInboxQueue("all");
      setConversationSearch("");
      setNewConversationOpen(false);
      setNewConversationPhone("");
      setNewConversationName("");
      setNotice({ tone: "success", text: "Conversa criada. Digite a mensagem e envie pelo WhatsApp." });
      await loadConversation(conversation.id, { forceRefresh: true });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Falha ao iniciar conversa.");
    } finally {
      setNewConversationBusy(false);
    }
  }, [loadConversation, newConversationName, newConversationPhone, rememberConversationDetail]);

  useEffect(() => {
    if (hasToken !== true) return;
    void bootstrapInbox({ take: INBOX_CONVERSATION_LIST_LIMIT });
  }, [bootstrapInbox, hasToken]);

  useEffect(() => {
    if (hasToken !== true || !requestedConversationId) return;
    setActiveTab("messages");
    void loadConversations({ preferredId: requestedConversationId, silent: true });
    void loadConversation(requestedConversationId, { silent: true });
  }, [hasToken, loadConversation, loadConversations, requestedConversationId]);

  const loadCustomerConversationCard = useCallback(async (conversationId: string | null | undefined) => {
    const normalizedId = normalizeInboxConversationId(conversationId);
    const requestToken = ++customerConversationCardLoadTokenRef.current;
    if (!normalizedId) {
      setCustomerConversationCard(null);
      setCustomerConversationCardDraft({
        doNotCall: false,
        returnAt: "",
        observations: "",
      });
      setCustomerConversationCardError(null);
      return;
    }
    const cached = customerConversationCardCacheRef.current.get(normalizedId);
    if (cached) {
      setCustomerConversationCard(cached);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(cached));
      setCustomerConversationCardError(null);
      setLoadingCustomerConversationCard(false);
      return;
    }
    setLoadingCustomerConversationCard(true);
    setCustomerConversationCardError(null);
    try {
      const payload = await apiFetch<CustomerConversationCardPayload>(
        `/inbox/conversations/${normalizedId}/status-card`,
      );
      if (
        requestToken !== customerConversationCardLoadTokenRef.current ||
        normalizeInboxConversationId(selectedIdRef.current) !== normalizedId
      ) {
        return;
      }
      customerConversationCardCacheRef.current.set(normalizedId, payload);
      setCustomerConversationCard(payload);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(payload));
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar card do cliente.";
      setCustomerConversationCardError(message);
    } finally {
      if (requestToken === customerConversationCardLoadTokenRef.current) {
        setLoadingCustomerConversationCard(false);
      }
    }
  }, []);

  const saveCustomerConversationCard = useCallback(
    async (
      patch?: Partial<{
        doNotCall: boolean;
        returnAt: string | null;
        observations: string;
      }>,
    ) => {
      if (!selectedId) return;
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
        customerReturnAutoSaveTimerRef.current = null;
      }

      const hasDoNotCallPatch =
        Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, "doNotCall");
      const nextDoNotCall = hasDoNotCallPatch
        ? Boolean(patch?.doNotCall)
        : customerConversationCardDraft.doNotCall;
      const nextReturnAt =
        patch && Object.prototype.hasOwnProperty.call(patch, "returnAt")
          ? patch.returnAt ?? null
          : toIsoFromLocalDateTime(customerConversationCardDraft.returnAt);
      const nextObservations = patch?.observations ?? customerConversationCardDraft.observations;
      const body: Record<string, unknown> = {
        returnAt: nextReturnAt,
        observations: nextObservations,
      };
      if (hasDoNotCallPatch || customerConversationCardDraft.doNotCall) {
        body.doNotCall = nextDoNotCall;
      }

      setSavingCustomerConversationCard(true);
      setCustomerConversationCardError(null);
      try {
        const payload = await apiFetch<CustomerConversationCardPayload>(
          `/inbox/conversations/${selectedId}/status-card`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        customerConversationCardCacheRef.current.set(selectedId, payload);
        setCustomerConversationCard(payload);
        setCustomerConversationCardDraft(buildCustomerConversationCardDraft(payload));
        setNotice({ tone: "success", text: "Card do cliente salvo." });
        await loadConversations({ preferredId: selectedId, silent: true });
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : "Falha ao salvar card do cliente.";
        setCustomerConversationCardError(message);
        setNotice({ tone: "error", text: message });
      } finally {
        setSavingCustomerConversationCard(false);
      }
    },
    [customerConversationCardDraft, loadConversations, selectedId],
  );

  const handleCustomerReturnChange = useCallback(
    (value: string) => {
      setCustomerConversationCardDraft((current) => ({ ...current, returnAt: value }));
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
        customerReturnAutoSaveTimerRef.current = null;
      }
      const isoValue = toIsoFromLocalDateTime(value);
      if (!isoValue) return;
      customerReturnAutoSaveTimerRef.current = window.setTimeout(() => {
        void saveCustomerConversationCard({
          ...(customerConversationCardDraft.doNotCall ? { doNotCall: false } : {}),
          returnAt: isoValue,
        });
      }, 700);
    },
    [customerConversationCardDraft.doNotCall, saveCustomerConversationCard],
  );

  const scheduleCustomerReturnTomorrow = useCallback(() => {
    const localValue = buildTomorrowReturnLocalValue();
    setCustomerConversationCardDraft((current) => ({
      ...current,
      doNotCall: false,
      returnAt: localValue,
    }));
    const isoValue = toIsoFromLocalDateTime(localValue);
    void saveCustomerConversationCard({
      ...(customerConversationCardDraft.doNotCall ? { doNotCall: false } : {}),
      returnAt: isoValue,
    });
  }, [customerConversationCardDraft.doNotCall, saveCustomerConversationCard]);

  const markCustomerDoNotCall = useCallback(() => {
    setCustomerConversationCardDraft((current) => ({
      ...current,
      doNotCall: true,
      returnAt: "",
    }));
    void saveCustomerConversationCard({ doNotCall: true, returnAt: null });
  }, [saveCustomerConversationCard]);

  const openCustomerReturnPicker = useCallback(() => {
    const input = customerReturnInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    input?.showPicker?.();
    input?.focus();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setCustomerConversationCard(null);
      setCustomerCardShortcutOpen(false);
      return;
    }
    if (contextTab !== "conversa") return;
    setCustomerCardShortcutOpen(false);
    const cached = customerConversationCardCacheRef.current.get(selectedId);
    if (cached) {
      setCustomerConversationCard(cached);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(cached));
      setCustomerConversationCardError(null);
      setLoadingCustomerConversationCard(false);
      return;
    }
    setCustomerConversationCard(null);
    setCustomerConversationCardDraft({
      doNotCall: false,
      returnAt: "",
      observations: "",
    });
    setCustomerConversationCardError(null);
    void loadCustomerConversationCard(selectedId);
  }, [contextTab, loadCustomerConversationCard, selectedId]);

  useEffect(() => {
    return () => {
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
      }
    };
  }, []);

  const loadCommercialPlans = useCallback(async () => {
    try {
      const data = await apiFetch<CommercialPlansPayload>("/commercial-plans/me");
      setCommercialPlans(data);
      return data;
    } catch {
      setCommercialPlans(null);
      return null;
    }
  }, []);

  const loadProspectingAutomationStatus = useCallback(async (background = false) => {
    if (!commercialPlans || !hasBotAi(commercialPlans)) {
      setProspectingAutomationStatus(null);
      return null;
    }
    if (!background) setProspectingAutomationLoading(true);
    try {
      const data = sanitizeProspectingAutomationStatus(
        await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/live-status"),
      );
      setProspectingAutomationStatus(data);
      if (!campaignConfigDirtyRef.current) {
        setCampaignConfig(buildProspectingCampaignConfig(data));
      }
      return data;
    } catch {
      if (!background) {
        setProspectingAutomationStatus((current) => current || null);
      }
      return null;
    } finally {
      if (!background) setProspectingAutomationLoading(false);
    }
  }, [commercialPlans]);

  const runProspectingAutomationAction = useCallback(
    async (action: "pause" | "resume") => {
      if (action === "resume" && !globalBotEnabled) {
        setNotice({
          tone: "error",
          text: "Ligue o HBot antes de ativar a Prospecção.",
        });
        return;
      }
      setProspectingAutomationAction(action);
      try {
        const data = sanitizeProspectingAutomationStatus(
          await apiFetch<ProspectingAutomationLiveStatus>(`/vendas/automation/prospecting/${action}`, {
            method: "POST",
          }),
        );
        setProspectingAutomationStatus(data);
      } catch (actionError) {
        setNotice({
          tone: "error",
          text: actionError instanceof Error ? actionError.message : "Falha ao controlar a prospecção automática.",
        });
      } finally {
        setProspectingAutomationAction(null);
      }
    },
    [globalBotEnabled],
  );

  const updateCampaignConfig = useCallback((updater: (current: ProspectingCampaignConfig) => ProspectingCampaignConfig) => {
    campaignConfigDirtyRef.current = true;
    setCampaignConfig((current) => updater(current));
  }, []);

  const saveProspectingCampaignConfig = useCallback(async (configOverride?: ProspectingCampaignConfig) => {
    const payload = toProspectingCampaignPayload(configOverride || campaignConfig);
    setProspectingAutomationAction("save");
    try {
      const data = sanitizeProspectingAutomationStatus(
        await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      );
      campaignConfigDirtyRef.current = false;
      setCampaignConfig(buildProspectingCampaignConfig(data));
      setProspectingAutomationStatus(data);
      setNotice({ tone: "success", text: "HBot salvo." });
      return data;
    } catch (saveError) {
      setNotice({
        tone: "error",
        text: saveError instanceof Error ? saveError.message : "Falha ao salvar o HBot.",
      });
      throw saveError;
    } finally {
      setProspectingAutomationAction(null);
    }
  }, [campaignConfig]);

  const startProspectingCampaign = useCallback(async (configOverride?: ProspectingCampaignConfig) => {
    const nextConfig = configOverride || campaignConfig;
    const payload = toProspectingCampaignPayload(nextConfig);
    setProspectingAutomationAction("start");
    try {
      await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = sanitizeProspectingAutomationStatus(
        await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/start", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      campaignConfigDirtyRef.current = false;
      setCampaignConfig(buildProspectingCampaignConfig(data));
      setProspectingAutomationStatus(data);
      setNotice({ tone: "success", text: "Prospecção ativada." });
    } catch (startError) {
      setNotice({
        tone: "error",
        text: startError instanceof Error ? startError.message : "Falha ao ativar o HBot.",
      });
    } finally {
      setProspectingAutomationAction(null);
    }
  }, [campaignConfig]);

  const loadBotConfig = useCallback(async (options?: { force?: boolean }) => {
    if (botConfigLoadedRef.current && !options?.force) return;
    if (commercialPlans && !hasBotAi(commercialPlans)) {
      setBotConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
      return;
    }
    setLoadingBot(true);
    try {
      const data = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config");
      const normalized = normalizeBotConfig(data);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      botConfigLoadedRef.current = true;
    } catch (loadError) {
      if (openBotPlansFromError(loadError)) return;
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar editor.";
      setError(message);
    } finally {
      setLoadingBot(false);
    }
  }, [commercialPlans, openBotPlansFromError]);

  useEffect(() => {
    const stored = readStoredGlobalBotEnabled();
    if (stored === null) return;
    setBotConfig((current) =>
      normalizeBotConfig({
        ...current,
        routingRules: {
          ...current.routingRules,
          globalBotEnabled: stored,
        },
      }),
    );
  }, []);

  const loadAgendaConfig = useCallback(async (options?: { force?: boolean }) => {
    if (agendaConfigLoadedRef.current && !options?.force) return;
    setLoadingAgenda(true);
    try {
      const data = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda");
      setAgendaConfig(normalizeAgendaConfig(data));
      setAgendaDirty(false);
      agendaConfigLoadedRef.current = true;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar agenda.";
      setError(message);
    } finally {
      setLoadingAgenda(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiFetch<CurrentUserProfile>("/profile/current-user");
      setCurrentUserProfile(data || null);
    } catch {
      setCurrentUserProfile(null);
    }
  }, []);

  const loadUserModules = useCallback(async () => {
    try {
      const data = await apiFetch<UserModule[]>("/modules/me");
      setUserModules(Array.isArray(data) ? data : []);
    } catch {
      setUserModules([]);
    }
  }, []);

  const loadWhatsAppCenter = useCallback(async () => {
    try {
      const data = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      setWhatsappCenterPayload(data || null);
    } catch {
      setWhatsappCenterPayload(null);
    }
  }, []);

  useEffect(() => () => clearInboxBootstrapStageTimer(), [clearInboxBootstrapStageTimer]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (initialMirrorBootstrapStartedRef.current) return;
    initialMirrorBootstrapStartedRef.current = true;
    let cancelled = false;
    let stopPolling: (() => void) | undefined;

    void (async () => {
      await bootstrapInbox({ take: INBOX_CONVERSATION_LIST_LIMIT });
      if (cancelled) return;
      stopPolling = startSmartPolling(() => loadConversations({ silent: true }), {
        intervalMs: 90000,
        immediate: false,
      });
    })();

    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, [bootstrapInbox, hasToken, loadConversations]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (activeTab !== "messages") return;

    const QUICK_STREAM_FAILURE_MS = 8000;
    const MAX_QUICK_STREAM_FAILURES = 2;
    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let scheduledRefresh: number | null = null;
    let consecutiveQuickFailures = 0;

    const scheduleRefresh = () => {
      if (scheduledRefresh !== null) return;
      scheduledRefresh = window.setTimeout(() => {
        scheduledRefresh = null;
        void refreshSelectedConversationMessages();
      }, 180);
    };

    const waitBeforeReconnect = () =>
      new Promise<void>((resolve) => {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          resolve();
        }, 2000);
      });

    const recordStreamDisconnect = (startedAt: number) => {
      if (controller.signal.aborted) return;
      const lifetimeMs = Date.now() - startedAt;
      if (lifetimeMs < QUICK_STREAM_FAILURE_MS) {
        consecutiveQuickFailures += 1;
        if (consecutiveQuickFailures >= MAX_QUICK_STREAM_FAILURES) {
          setInboxRealtimeFallbackActive(true);
        }
        return;
      }

      consecutiveQuickFailures = 0;
      setInboxRealtimeFallbackActive(false);
    };

    const connect = async () => {
      while (!controller.signal.aborted) {
        const startedAt = Date.now();
        try {
          await readInboxRealtimeStream({
            signal: controller.signal,
            onEvent: (event) => {
              if (event.kind === "automation") {
                void loadProspectingAutomationStatus(true);
                if (event.automation?.type === "lead_interested" || event.automation?.type === "lead_neutral") {
                  void loadConversations({ silent: true });
                }
              }
              const selectedConversationId = normalizeInboxConversationId(selectedIdRef.current);
              const eventConversationId = normalizeInboxConversationId(event.conversationId);
              if (!selectedConversationId || !eventConversationId) return;
              if (selectedConversationId !== eventConversationId) return;
              scheduleRefresh();
            },
          });
          recordStreamDisconnect(startedAt);
        } catch {
          // Silent reconnect: transient network hiccups should not spam the console.
          recordStreamDisconnect(startedAt);
        }

        if (controller.signal.aborted) return;
        await waitBeforeReconnect();
      }
    };

    void connect();

    return () => {
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (scheduledRefresh !== null) window.clearTimeout(scheduledRefresh);
    };
  }, [activeTab, hasToken, loadConversations, loadProspectingAutomationStatus, refreshSelectedConversationMessages]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (activeTab !== "messages") return;
    if (!inboxRealtimeFallbackActive) return;

    const stopConversationPolling = startSmartPolling(() => refreshSelectedConversationMessages(), {
      intervalMs: 5000,
      immediate: true,
    });
    const stopQueuePolling = startSmartPolling(() => loadConversations({ silent: true }), {
      intervalMs: 15000,
      immediate: true,
    });

    return () => {
      stopConversationPolling();
      stopQueuePolling();
    };
  }, [activeTab, hasToken, inboxRealtimeFallbackActive, loadConversations, refreshSelectedConversationMessages]);

  useEffect(() => {
    if (!bootstrapReady) return;
    if (activeTab !== "messages") return;
    if (inboxQueue !== "all") return;
    if (conversationSearch.trim()) return;
    if (!conversationListHasMore || loadingMoreConversations) return;
    if (conversations.length >= INBOX_CONVERSATION_AUTOFILL_MAX) return;

    const visibleConversations = countInboxConversationsInQueue(
      conversations,
      inboxQueue,
      manualQueueOverrides,
    );
    if (visibleConversations >= INBOX_CONVERSATION_LIST_LIMIT) return;

    loadMoreConversations();
  }, [
    activeTab,
    bootstrapReady,
    conversationListHasMore,
    conversationSearch,
    conversations,
    inboxQueue,
    loadMoreConversations,
    loadingMoreConversations,
    manualQueueOverrides,
  ]);

  useEffect(() => {
    if (hasToken === false) return;
    void (async () => {
      await loadCurrentUser();
      await loadUserModules();
      await loadWhatsAppCenter();
      await loadCommercialPlans();
    })();
  }, [hasToken, loadCommercialPlans, loadCurrentUser, loadUserModules, loadWhatsAppCenter]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (activeTab !== "messages") return;
    void loadProspectingAutomationStatus();
    const stopPolling = startSmartPolling(() => {
      void loadProspectingAutomationStatus(true);
    }, {
      intervalMs: 30000,
      immediate: false,
    });
    return () => stopPolling();
  }, [activeTab, hasToken, loadProspectingAutomationStatus]);

  useEffect(() => {
    if (hasToken === false) return;
    if (!commercialPlans) return;
    if (!hasBotAi(commercialPlans)) return;
    void loadBotConfig();
  }, [commercialPlans, hasToken, loadBotConfig]);

  useEffect(() => {
    if (hasToken === false) return;
    if (!agendaStudioOpen) return;
    void loadAgendaConfig();
  }, [agendaStudioOpen, hasToken, loadAgendaConfig]);

  const queueByConversationId = useMemo(() => {
    const entries = conversations.map((conversation) => [
      conversation.id,
      getInboxConversationQueue(conversation, manualQueueOverrides),
    ] as const);
    return Object.fromEntries(entries) as Record<string, InboxQueue>;
  }, [conversations, manualQueueOverrides]);

  useEffect(() => {
    conversationListScrollRef.current?.scrollTo({ top: 0 });
  }, [deferredConversationSearch, inboxQueue]);

  const queueCounts = useMemo(() => {
    const base: Record<InboxQueue, number> = {
      all: 0,
      archived: 0,
      blocked: 0,
      groups: 0,
      recovery: 0,
      scheduled: 0,
      bot: 0,
    };
    for (const conversation of conversations) {
      for (const queue of INBOX_QUEUE_ORDER) {
        if (isInboxConversationVisibleInQueue(conversation, queue, manualQueueOverrides)) {
          base[queue] += 1;
        }
      }
    }
    return base;
  }, [conversations, manualQueueOverrides]);

  const queueUnreadCounts = useMemo(() => {
    const base: Record<InboxQueue, number> = {
      all: 0,
      archived: 0,
      blocked: 0,
      groups: 0,
      recovery: 0,
      scheduled: 0,
      bot: 0,
    };
    for (const conversation of conversations) {
      const unreadCount = getInboxConversationUnreadCount(conversation);
      for (const queue of INBOX_QUEUE_ORDER) {
        if (isInboxConversationVisibleInQueue(conversation, queue, manualQueueOverrides)) {
          base[queue] += unreadCount;
        }
      }
    }
    return base;
  }, [conversations, manualQueueOverrides]);

  const prospectionSignalCounts = useMemo(() => {
    const counters = prospectingAutomationStatus?.counters || {};
    const automationActive = Boolean(
      prospectingAutomationStatus?.active &&
        prospectingAutomationStatus?.campaign?.status === "running",
    );
    const currentStatus = String(prospectingAutomationStatus?.status || "").trim().toLowerCase();
    const campaignStatus = String(prospectingAutomationStatus?.campaign?.status || "").trim().toLowerCase();
    const hasError = currentStatus === "erro" || Boolean(prospectingAutomationStatus?.lastError);
    const state: "running" | "paused" | "error" | "idle" | "off" =
      !globalBotEnabled
        ? "off"
        : hasError
        ? "error"
        : campaignStatus === "paused" || currentStatus === "pausado"
          ? "paused"
          : automationActive
            ? "running"
            : "idle";
    const statusText =
      state === "error"
        ? "Erro"
        : state === "paused"
          ? "Pausada"
          : state === "running"
            ? "Rodando"
            : globalBotEnabled
              ? "Parada"
              : "HBot off";
    return {
      active: globalBotEnabled && automationActive,
      state,
      green: Math.max(0, Number(counters.prospectingGreen ?? counters.interested ?? counters.positives ?? 0) || 0),
      yellow: Math.max(0, Number(counters.prospectingYellow ?? 0) || 0),
      red: Math.max(0, Number(counters.prospectingRed ?? counters.archived ?? 0) || 0),
      nextSendAt: globalBotEnabled ? resolveNextProspectionSendAt(prospectingAutomationStatus) : null,
      statusText,
    };
  }, [globalBotEnabled, prospectingAutomationStatus]);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = deferredConversationSearch.trim().toLowerCase();
    const filtered = conversations.filter((conversation) => {
      if (!isInboxConversationVisibleInQueue(conversation, inboxQueue, manualQueueOverrides)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        resolveInboxConversationDisplayName(conversation),
        conversation.customer?.phone,
        getInboxConversationSubtitle(conversation),
        getInboxConversationPreview(conversation),
        getInboxProspectionStatusMeta(conversation)?.subtitle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return sortInboxConversationsByActivity(filtered, inboxQueue);
  }, [conversations, deferredConversationSearch, inboxQueue, manualQueueOverrides]);

  const inboxQueueDiagnostics = useMemo(
    () => [
      {
        label: "Sessao",
        value: hasToken === true ? "ativa" : hasToken === false ? "sem token" : "validando",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Recebidas",
        value: String(conversations.length),
      },
      {
        label: "Visiveis",
        value: String(filteredConversations.length),
      },
      {
        label: "Selecionada",
        value: selectedId || "--",
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [conversations.length, filteredConversations.length, hasToken, inboxQueue, lastConversationSyncAt, mounted, selectedId],
  );

  const inboxDetailDiagnostics = useMemo(
    () => [
      {
        label: "Conversa",
        value: selectedId || "--",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Mensagens em cache",
        value: String(selectedConversation?.messages.length || 0),
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [inboxQueue, lastConversationSyncAt, mounted, selectedConversation?.messages.length, selectedId],
  );

  const retryConversationList = useCallback(() => {
    if (!bootstrapReady && conversationsRef.current.length === 0) {
      void bootstrapInbox({ take: INBOX_CONVERSATION_LIST_LIMIT });
      return;
    }
    void loadConversations({ preferredId: selectedIdRef.current });
  }, [bootstrapInbox, bootstrapReady, loadConversations]);

  const retryConversationDetail = useCallback(() => {
    if (!selectedIdRef.current) return;
    void loadConversation(selectedIdRef.current);
  }, [loadConversation]);

  useEffect(() => {
    if (!bootstrapReady) return;
    if (activeTab !== "messages") return;

    const currentConversationId = selectedConversation?.id ?? selectedId ?? null;
    const nextConversation = currentConversationId
      ? filteredConversations.find((conversation) => conversation.id === currentConversationId) || null
      : null;

    if (nextConversation) {
      if (selectedId !== nextConversation.id) {
        setSelectedId(nextConversation.id);
      }
      return;
    }

    const fallbackConversation = filteredConversations[0] ?? null;
    if (!fallbackConversation) {
      if (selectedId !== null) setSelectedId(null);
      if (selectedConversation !== null) setSelectedConversation(null);
      return;
    }

    if (selectedId === fallbackConversation.id || loadingConversation) return;
    void loadConversation(fallbackConversation.id);
  }, [
    activeTab,
    bootstrapReady,
    filteredConversations,
    loadConversation,
    loadingConversation,
    selectedConversation,
    selectedId,
  ]);

  useEffect(() => {
    if (activeTab !== "messages") return;
    const timeline = chatTimelineRef.current;
    if (!timeline) return;

    const handleScroll = () => {
      if (timeline.scrollTop > 80) return;
      if (loadingConversation || loadingOlderMessages || !olderMessagesHasMore) return;
      void loadOlderMessages();
    };

    timeline.addEventListener("scroll", handleScroll, { passive: true });
    return () => timeline.removeEventListener("scroll", handleScroll);
  }, [
    activeTab,
    loadOlderMessages,
    loadingConversation,
    loadingOlderMessages,
    olderMessagesHasMore,
  ]);

  const pendingAtendimentoConversations = useMemo(
    () =>
      [...conversations]
        .filter(
          (conversation) =>
            getInboxConversationQueue(conversation, manualQueueOverrides) !== "archived" &&
            resolveInboxBucket(conversation, manualQueueOverrides) === "atendimento" &&
            (conversation.status === "new" || conversation.status === "open"),
        )
        .sort((left, right) => sortInboxConversationsByActivity([left, right])[0] === left ? -1 : 1),
    [conversations, manualQueueOverrides],
  );

  const pendingAtendimentoCount = pendingAtendimentoConversations.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ATENDIMENTO_PENDING_STORAGE_KEY, String(pendingAtendimentoCount));
    } catch {
      // ignore storage errors
    }

    try {
      window.dispatchEvent(
        new CustomEvent<{ count: number }>(ATENDIMENTO_QUEUE_EVENT, {
          detail: { count: pendingAtendimentoCount },
        }),
      );
    } catch {
      // ignore event dispatch errors
    }
  }, [pendingAtendimentoCount]);

  const humanAttentionConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "open"),
    [pendingAtendimentoConversations],
  );

  const newInboundConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "new"),
    [pendingAtendimentoConversations],
  );

  const hasRecoveryCapability = useMemo(
    () => {
      const trialModule = String(whatsappCenterPayload?.company.trialModuleSelection || "")
        .trim()
        .toLowerCase();
      if (trialModule === "recovery") return true;
      return userModules.some(
        (module) => module.accessible && module.key === "hbx_recovery",
      );
    },
    [userModules, whatsappCenterPayload?.company.trialModuleSelection],
  );

  const canManageAgenda = useMemo(() => {
    if (currentUserProfile?.isSystemMaster) return true;
    const role = String(currentUserProfile?.role || "").trim().toUpperCase();
    return role === "ADMIN";
  }, [currentUserProfile?.isSystemMaster, currentUserProfile?.role]);

  const providerCapabilities = useMemo<ProviderCapabilities>(
    () => getProviderCapabilitiesFromWhatsAppCenter(whatsappCenterPayload),
    [whatsappCenterPayload],
  );

  const sanitizeBotConfigForCurrentTenant = useCallback(
    (config: Partial<AtendimentoBotConfig> | null | undefined) =>
      sanitizeAtendimentoBotConfigForTenant(config, {
        providerCapabilities,
        recoveryEnabled: hasRecoveryCapability,
      }),
    [hasRecoveryCapability, providerCapabilities],
  );

  useEffect(() => {
    setBotConfig((current) => sanitizeBotConfigForCurrentTenant(current));
  }, [sanitizeBotConfigForCurrentTenant]);

  const conversationForView = useMemo(
    () => {
      const summary = selectedId
        ? conversations.find((conversation) => conversation.id === selectedId) || null
        : null;
      if (selectedConversation?.id === selectedId) {
        return selectedConversation;
      }
      return summary;
    },
    [conversations, selectedConversation, selectedId],
  );

  const isConversationStageSwitching = Boolean(
    loadingConversation &&
      selectedId &&
      conversationForView &&
      conversationForView.id !== selectedId,
  );

  const selectedStatus = conversationForView?.status ?? "new";
  const selectedBlocked = Boolean(conversationForView?.isBlocked);
  const selectedConversationIsPersonal = isInboxPersonalContact(conversationForView);
  const selectedConversationDisplayName = resolveInboxConversationDisplayName(conversationForView);
  const selectedConversationStatusMeta = conversationForView
    ? getAtendimentoConversationStatusMeta(conversationForView, hasRecoveryCapability)
    : null;
  const customerCardName =
    customerConversationCard?.customer?.name || selectedConversationDisplayName || "Cliente";
  const customerCardPhone =
    customerConversationCard?.customer?.phone ||
    conversationForView?.customer?.phone ||
    customerConversationCard?.customer?.phoneNormalized ||
    "";
  const customerCardPhoneLabel =
    customerCardPhone
      ? formatInboxPhoneLabel(customerCardPhone) || customerCardPhone
      : selectedConversationDisplayName && selectedConversationDisplayName !== "Contato WhatsApp"
        ? selectedConversationDisplayName
        : "WhatsApp";
  const customerCardPhoneDigits = getCustomerConversationCardPhoneDigits(
    customerConversationCard,
    conversationForView,
  );
  const selectedConversationWhatsappAvailability =
    getCustomerConversationCardWhatsappAvailability(customerConversationCard);
  const selectedConversationWithoutWhatsapp =
    selectedConversationWhatsappAvailability === "unavailable" ||
    getInboxConversationWhatsappAvailabilityFromMetadata(conversationForView) === "unavailable";
  const selectedConversationInteractionBlocked =
    selectedBlocked || selectedConversationWithoutWhatsapp;
  const customerCardCanOpenWhatsapp =
    Boolean(customerCardPhoneDigits) && !selectedConversationWithoutWhatsapp;
  const customerCardReturnAt = customerConversationCard?.lead?.returnAt || null;
  const customerCardLastContactAt =
    customerConversationCard?.lead?.lastContactAt ||
    customerConversationCard?.lead?.updatedAt ||
    conversationForView?.updatedAt ||
    null;
  const customerCardAttempts = Number(customerConversationCard?.lead?.attemptCount || 0);
  const customerCardTimesSeen = Math.max(1, Number(customerConversationCard?.lead?.timesSeen || 1));
  const customerCardWebscrapingSummary = buildCustomerLeadWebscrapingSummary(customerConversationCard);
  const customerCardHistory = useMemo(
    () => (Array.isArray(customerConversationCard?.history) ? customerConversationCard.history : []),
    [customerConversationCard?.history],
  );
  const selectedConversationIsAgenda = conversationForView
    ? isAtendimentoAgendaConversation(conversationForView)
    : false;
  const selectedVendasAgendaDraftMessage = useMemo(
    () => getInboxVendasAgendaPendingDraft(conversationForView),
    [conversationForView],
  );
  const conversationMessagesForView = useMemo(
    () => sortInboxMessagesChronologically(
      (Array.isArray(conversationForView?.messages) ? conversationForView.messages : []).filter(
        (message) => !shouldHideInboxMessageFromTimeline(message),
      ),
    ),
    [conversationForView],
  );
  const latestVisibleMessageKey = useMemo(
    () => getInboxMessageStableKey(getInboxLatestMessage(conversationMessagesForView)),
    [conversationMessagesForView],
  );
  const conversationReactionIndex = useMemo(
    () => buildInboxReactionIndex(conversationForView?.messages),
    [conversationForView],
  );
  const selectedConversationHasRecoveryContext =
    hasRecoveryCapability && conversationForView
      ? hasAtendimentoRecoveryContext(conversationForView)
      : false;
  const selectedConversationIsInterested = isProspectingInterestedConversation(conversationForView);

  useEffect(() => {
    if (!selectedId || selectedBlocked) return;
    if (conversationSearchInputRef.current && document.activeElement === conversationSearchInputRef.current) return;
    if (conversationSearch.trim()) return;
    const frame = window.requestAnimationFrame(() => {
      chatComposerInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationSearch, selectedBlocked, selectedId]);

  const noteStorageKey = useMemo(
    () =>
      getConversationNoteStorageKey(
        currentUserProfile?.company?.id ?? null,
        selectedConversation?.id ?? null,
      ),
    [currentUserProfile?.company?.id, selectedConversation?.id],
  );
  const activeDockSection = inboxQueue === "blocked"
    ? "bloqueados"
    : templatesStudioOpen
      ? "templates"
      : campaignStudioOpen
        ? "automacao"
        : agendaStudioOpen || contextTab === "agenda"
          ? "agenda"
          : contextTab === "financeiro"
            ? "financeiro"
            : "conversa";
  const openBlockedConversations = useCallback(() => {
    inboxQueueRef.current = "blocked";
    setInboxQueue("blocked");
    setContextTab("conversa");
    setCampaignStudioOpen(false);
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(false);
    void loadConversations({ silent: true });
  }, [loadConversations]);
  const prospectingRobotTone = getProspectingRobotTone(
    prospectingAutomationStatus,
    globalBotEnabled,
    prospectingAutomationLoading,
  );
  const nextProspectionSendAt = globalBotEnabled ? resolveNextProspectionSendAt(prospectingAutomationStatus) : null;

  useEffect(() => {
    if (hasRecoveryCapability || contextTab !== "financeiro") return;
    setContextTab("conversa");
  }, [contextTab, hasRecoveryCapability]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!noteStorageKey) {
      setInternalNote("");
      return;
    }
    skipNotePersistRef.current = true;
    try {
      setInternalNote(window.localStorage.getItem(noteStorageKey) || "");
    } catch {
      setInternalNote("");
    }
  }, [noteStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !noteStorageKey) return;
    if (skipNotePersistRef.current) {
      skipNotePersistRef.current = false;
      return;
    }
    try {
      if (internalNote.trim()) {
        window.localStorage.setItem(noteStorageKey, internalNote);
      } else {
        window.localStorage.removeItem(noteStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [internalNote, noteStorageKey]);
  const handleSectionChange = useCallback((nextSection: AtendimentoSection) => {
    if (nextSection === "financeiro" && !hasRecoveryCapability) {
      setNotice({
        tone: "info",
        text: "Recovery nao esta liberado no plano desta empresa.",
      });
      return;
    }

    const now = Date.now();
    if (lastSectionChangeRef.current.section === nextSection && now - lastSectionChangeRef.current.at < 400) {
      return;
    }
    lastSectionChangeRef.current = { section: nextSection, at: now };

    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextSection === "automacao") {
      if (!requireBotReady()) return;
      setActiveTab("messages");
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      setCampaignStudioOpen(true);
      params.delete("atendimentoTab");
    } else if (nextSection === "agenda") {
      setActiveTab("messages");
      setCampaignStudioOpen(false);
      setAgendaStudioOpen(true);
      setTemplatesStudioOpen(false);
      setContextTab("agenda");
      params.delete("atendimentoTab");
    } else {
      setCampaignStudioOpen(false);
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      setContextTab(nextSection);
      params.delete("atendimentoTab");
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [hasRecoveryCapability, pathname, requireBotReady, router, searchParams]);

  const resetTemplateComposer = useCallback(() => {
    setTemplateComposer(DEFAULT_TEMPLATE_COMPOSER);
    setEditingTemplateLabel(null);
  }, []);

  const loadMetaTemplates = useCallback(async (refresh = false) => {
    if (!providerCapabilities.canUseTemplates) {
      setLoadingTemplates(false);
      return;
    }
    setLoadingTemplates(true);
    try {
      const query = refresh ? "?refresh=true" : "";
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(`/hbx-recovery/meta-templates${query}`);
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      if (safePayload.syncError) {
        setNotice({ tone: "error", text: `Falha ao carregar templates Meta: ${safePayload.syncError}` });
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setLoadingTemplates(false);
    }
  }, [providerCapabilities.canUseTemplates]);

  const syncMetaTemplatesNow = useCallback(async () => {
    if (!providerCapabilities.canUseTemplates) {
      setNotice({
        tone: "info",
        text: META_TEMPLATES_REQUIRED_MESSAGE,
      });
      return;
    }
    setSyncingTemplates(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setNotice({
        tone: safePayload.syncError ? "error" : "success",
        text: safePayload.syncError || "Templates Meta sincronizados com sucesso.",
      });
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Falha ao sincronizar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setSyncingTemplates(false);
    }
  }, [providerCapabilities.canUseTemplates]);

  const openTemplatesSettings = useCallback(() => {
    if (!providerCapabilities.canUseTemplates) {
      setTemplatesStudioOpen(false);
      setNotice({
        tone: "info",
        text: META_TEMPLATES_REQUIRED_MESSAGE,
      });
      return;
    }
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(true);
    void loadMetaTemplates();
  }, [loadMetaTemplates, providerCapabilities.canUseTemplates]);

  const editMetaTemplate = useCallback((template: RecoveryMetaTemplateItem) => {
    setTemplateComposer(fillTemplateComposerFromTemplate(template));
    setEditingTemplateLabel(`${template.name} • ${template.language}`);
  }, []);

  const toggleTemplateActivation = useCallback(
    async (template: RecoveryMetaTemplateItem, active: boolean) => {
      if (!providerCapabilities.canUseTemplates) {
        setNotice({
          tone: "info",
          text: META_TEMPLATES_REQUIRED_MESSAGE,
        });
        return;
      }
      try {
        const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
          "/hbx-recovery/meta-templates/activation",
          {
            method: "PATCH",
            body: JSON.stringify({
              name: template.name,
              language: template.language,
              active,
            }),
          },
        );
        setMetaTemplates(normalizeMetaTemplatesPayload(payload));
        setNotice({
          tone: "success",
          text: active
            ? `Template ${template.name} ativado no HBX.`
            : `Template ${template.name} ocultado no HBX.`,
        });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar template.";
        setNotice({ tone: "error", text: message });
      }
    },
    [providerCapabilities.canUseTemplates],
  );

  const deleteMetaTemplate = useCallback(async (template: RecoveryMetaTemplateItem) => {
    if (!providerCapabilities.canUseTemplates) {
      setNotice({
        tone: "info",
        text: META_TEMPLATES_REQUIRED_MESSAGE,
      });
      return;
    }
    const deletingKey = `${template.name}:${template.language}`;
    setDeletingTemplateId(deletingKey);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates", {
        method: "DELETE",
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          language: template.language,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${template.name} excluido com sucesso.` });
      if (editingTemplateLabel?.startsWith(template.name)) {
        resetTemplateComposer();
      }
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Falha ao excluir template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setDeletingTemplateId(null);
    }
  }, [editingTemplateLabel, providerCapabilities.canUseTemplates, resetTemplateComposer]);

  const createMetaTemplate = useCallback(async () => {
    if (!providerCapabilities.canUseTemplates) {
      setNotice({
        tone: "info",
        text: META_TEMPLATES_REQUIRED_MESSAGE,
      });
      return;
    }
    const normalizedName = String(templateComposer.name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const bodyText = String(templateComposer.bodyText || "").trim();
    if (!normalizedName) {
      setNotice({ tone: "error", text: "Informe um nome interno valido para o template." });
      return;
    }
    if (bodyText.length < 10) {
      setNotice({ tone: "error", text: "O corpo do template ainda esta muito curto." });
      return;
    }
    setCreatingTemplate(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/create", {
        method: "POST",
        body: JSON.stringify({
          name: normalizedName,
          category: templateComposer.category,
          language: templateComposer.language || "pt_BR",
          headerFormat:
            templateComposer.headerFormat === "NONE" ? undefined : templateComposer.headerFormat,
          headerText: templateComposer.headerText || "",
          headerHandle: templateComposer.headerHandle || "",
          headerMediaUrl: templateComposer.headerMediaUrl || "",
          bodyText,
          footerText: templateComposer.footerText || "",
          buttons: parseTemplateButtonLines(templateComposer.buttonsText),
          variableExamples: {},
          activateInHbx: templateComposer.activateInHbx,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${normalizedName} enviado para aprovacao.` });
      resetTemplateComposer();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Falha ao criar template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setCreatingTemplate(false);
    }
  }, [providerCapabilities.canUseTemplates, resetTemplateComposer, templateComposer]);

  useEffect(() => {
    if (!templatesStudioOpen) return;
    if (metaTemplates.templates.length > 0) return;
    void loadMetaTemplates();
  }, [loadMetaTemplates, metaTemplates.templates.length, templatesStudioOpen]);

  useEffect(() => {
    if (providerCapabilities.canUseTemplates || !templatesStudioOpen) return;
    setTemplatesStudioOpen(false);
  }, [providerCapabilities.canUseTemplates, templatesStudioOpen]);

  const initialAgendaStudioTab = useMemo<AgendaStudioTab>(
    () => (requestedAgendaMode === "sales" ? "sales" : "bot"),
    [requestedAgendaMode],
  );

  const closeAgendaStudio = useCallback(() => {
    setAgendaStudioOpen(false);
    if (requestedAgendaMode === "sales") {
      router.push(requestedAgendaReturnTo || "/vendas");
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("agendaStudio");
    params.delete("agendaMode");
    params.delete("returnTo");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, requestedAgendaMode, requestedAgendaReturnTo, router, searchParams]);

  const renderAgendaPanel = () => (
    <AgendaStudioModal
      initialTab={initialAgendaStudioTab}
      allowSalesTab={requestedAgendaMode === "sales"}
      onClose={closeAgendaStudio}
      agendaConfig={agendaConfig}
      loadingAgenda={loadingAgenda}
      savingAgenda={savingAgenda}
      botAgendaDirty={agendaDirty}
      currentUserEmail={String(currentUserProfile?.email || "")}
      currentUserName={String(currentUserProfile?.name || "")}
      canManageAgenda={canManageAgenda}
      onAddGroup={addAgendaGroup}
      onRemoveGroup={removeAgendaGroup}
      onResetBotAgenda={resetBotAgendaToDefault}
      onConfigureSimpleGlaucoAgenda={configureSimpleGlaucoAgenda}
      onLinkCurrentUser={linkAgendaToCurrentUser}
      onSaveBotAgenda={() => {
        setNotice(null);
        void saveAgenda();
      }}
      onUpdateGroup={updateAgendaGroup}
      onAddSlot={addAgendaSlot}
      onRemoveSlot={removeAgendaSlot}
      onUpdateSlot={updateAgendaSlot}
    />
  );

  const updateStatus = useCallback(
    async (status: Exclude<StatusFilter, "all" | "blocked">) => {
      if (!selectedId) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setNotice({ tone: "success", text: `Conversa atualizada para ${status}.` });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
        setError(message);
      }
    },
    [loadConversations, rememberConversationDetail, selectedId],
  );

  const togglePersonalContact = useCallback(
    async () => {
      if (!selectedId) return;
      const personal = !isInboxPersonalContact(selectedConversationRef.current || conversationForView);
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/personal`, {
          method: "PATCH",
          body: JSON.stringify({ personal }),
        });
        const normalizedData = normalizeInboxConversationPayload(data) || data;
        if (personal) {
          inboxQueueRef.current = "all";
          setInboxQueue("all");
        }
        setManualQueueOverrides((current) => {
          const next = { ...current };
          if (personal) {
            next[selectedId] = "all";
          } else if (next[selectedId] === "all") {
            delete next[selectedId];
          }
          return next;
        });
        setSelectedConversation(data);
        rememberConversationDetail(normalizedData);
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === normalizedData.id ? normalizedData : conversation,
          ),
        );
        setNotice({
          tone: "success",
          text: personal
            ? "Contato marcado como pessoal. Bot e cadastro ficam desativados para este número."
            : "Contato pessoal desativado.",
        });
        await loadConversations({ preferredId: normalizedData.id, silent: true });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar contato pessoal.";
        setError(message);
      }
    },
    [conversationForView, loadConversations, rememberConversationDetail, selectedId],
  );

  const toggleGlobalBot = useCallback(async () => {
    const enabled = !globalBotEnabled;
    if (enabled) {
      if (!requireBotReady()) return;
    } else if (!requireBotAi()) {
      return;
    }
    const nextConfig = sanitizeBotConfigForCurrentTenant({
      ...botConfig,
      routingRules: {
        ...botConfig.routingRules,
        globalBotEnabled: enabled,
      },
    });
    setSavingBot(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = sanitizeBotConfigForCurrentTenant(payload);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      const topbarMessage = enabled
        ? "Bot global ativado para novas mensagens."
        : "Bot global desativado para novas mensagens.";
      setNotice({
        tone: "success",
        text: topbarMessage,
      });
      dispatchTopbarProgress({
        source: "atendimento-bot",
        phase: "success",
        title: enabled ? "Bot global ativado" : "Bot global desativado",
        status: topbarMessage,
        progress: 100,
        metrics: [{ label: "Bot", value: enabled ? "Ativo" : "Off" }],
      });
      window.setTimeout(() => clearTopbarProgress("atendimento-bot"), 3600);
    } catch (toggleError) {
      if (openBotPlansFromError(toggleError)) {
        setBotConfig(botConfig);
        return;
      }
      setError(toggleError instanceof Error ? toggleError.message : "Falha ao atualizar Bot global.");
      setBotConfig(botConfig);
    } finally {
      setSavingBot(false);
    }
  }, [botConfig, globalBotEnabled, openBotPlansFromError, requireBotAi, requireBotReady, sanitizeBotConfigForCurrentTenant]);

  const moveConversationToQueue = useCallback(
    async (
      conversationId: string,
      targetQueue: InboxQueue,
      options?: { skipReload?: boolean; skipBotSync?: boolean },
    ) => {
      if (!conversationId || !targetQueue) return;
      const numericConversationId = Number(conversationId);
      if (!Number.isFinite(numericConversationId)) return;
      if (targetQueue === "bot" && !requireBotReady()) return;

      setError(null);
      try {
        if (!options?.skipBotSync && (targetQueue === "bot" || targetQueue === "all")) {
          await apiFetch(`/inbox/conversations/bulk-bot`, {
            method: "PATCH",
            body: JSON.stringify({ ids: [numericConversationId], enabled: targetQueue === "bot" }),
          });
        }

        const updatedConversation = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}/queue`, {
          method: "PATCH",
          body: JSON.stringify({ queue: targetQueue }),
        });
        const normalizedUpdatedConversation = normalizeInboxConversationPayload(updatedConversation);
        if (normalizedUpdatedConversation) {
          rememberConversationDetail(normalizedUpdatedConversation);
          setSelectedConversation((current) =>
            current?.id === normalizedUpdatedConversation.id ? normalizedUpdatedConversation : current,
          );
        }

        setManualQueueOverrides((current) => ({
          ...current,
          [conversationId]: targetQueue,
        }));

        if (!options?.skipReload) {
          await loadConversations({ preferredId: conversationId, silent: true });
        }
      } catch (moveError) {
        if (openBotPlansFromError(moveError)) return;
        const message = moveError instanceof Error ? moveError.message : "Falha ao mover conversa de fila.";
        setError(message);
        throw moveError;
      }
    },
    [loadConversations, openBotPlansFromError, rememberConversationDetail, requireBotReady],
  );

  const moveQueueToQueue = useCallback(
    async (sourceQueue: InboxQueue, targetQueue: InboxQueue) => {
      if (!sourceQueue || !targetQueue || sourceQueue === targetQueue) return;

      const conversationIds = conversationsRef.current
        .filter(
          (conversation) =>
            getInboxConversationQueue(conversation, manualQueueOverridesRef.current) === sourceQueue,
        )
        .map((conversation) => conversation.id)
        .filter(Boolean);

      if (!conversationIds.length) {
        setNotice({
          tone: "error",
          text: `Nenhuma conversa encontrada em ${getInboxQueueLabel(sourceQueue)}.`,
        });
        return;
      }
      if (targetQueue === "bot" && !requireBotReady()) return;

      setError(null);
      try {
        const numericIds = conversationIds
          .map((conversationId) => Number(conversationId))
          .filter((conversationId) => Number.isFinite(conversationId));

        if (numericIds.length && (targetQueue === "bot" || targetQueue === "all")) {
          await apiFetch(`/inbox/conversations/bulk-bot`, {
            method: "PATCH",
            body: JSON.stringify({ ids: numericIds, enabled: targetQueue === "bot" }),
          });
        }

        let failedMoves = 0;
        for (const conversationId of conversationIds) {
          try {
            await moveConversationToQueue(conversationId, targetQueue, {
              skipReload: true,
              skipBotSync: true,
            });
          } catch {
            failedMoves += 1;
          }
        }

        await loadConversations({ preferredId: selectedIdRef.current, silent: true });
        setInboxQueue(targetQueue);

        if (failedMoves > 0) {
          const movedCount = conversationIds.length - failedMoves;
          const message = `Falha ao mover ${failedMoves} conversa(s) de ${getInboxQueueLabel(sourceQueue)}.`;
          setError(message);
          setNotice({
            tone: movedCount > 0 ? "success" : "error",
            text:
              movedCount > 0
                ? `${movedCount} de ${conversationIds.length} conversa(s) foram enviadas para ${getInboxQueueLabel(targetQueue)}.`
                : message,
          });
          return;
        }

        setNotice({
          tone: "success",
          text: `${conversationIds.length} conversa(s) enviadas para ${getInboxQueueLabel(targetQueue)}.`,
        });
      } catch (bulkMoveError) {
        if (openBotPlansFromError(bulkMoveError)) return;
        const message = bulkMoveError instanceof Error ? bulkMoveError.message : "Falha ao mover a fila inteira.";
        setError(message);
      }
    },
    [loadConversations, moveConversationToQueue, openBotPlansFromError, requireBotReady],
  );

  const handleQueueDrop = useCallback(
    (targetQueue: InboxQueue) => {
      if (draggedQueueId) {
        void moveQueueToQueue(draggedQueueId, targetQueue);
      } else if (draggedConversationId) {
        void moveConversationToQueue(draggedConversationId, targetQueue);
      } else {
        return;
      }
      setDropOverQueue(null);
      setDraggedConversationId(null);
      setDraggedQueueId(null);
    },
    [draggedConversationId, draggedQueueId, moveConversationToQueue, moveQueueToQueue],
  );

  const blockConversationById = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const targetConversation =
      conversationsRef.current.find((conversation) => conversation.id === conversationId) ||
      (selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null);
    setBlockDialog({
      conversationId,
      reason: targetConversation?.blockedReason || "Bloqueado manualmente pelo operador.",
    });
  }, []);

  const confirmBlockConversation = useCallback(async () => {
    if (!blockDialog?.conversationId) return;
    const conversationId = blockDialog.conversationId;
    const reason = blockDialog.reason;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      if (selectedIdRef.current === conversationId) {
        setSelectedConversation(data);
      }
      rememberConversationDetail(data);
      inboxQueueRef.current = "blocked";
      setInboxQueue("blocked");
      setConversations((current) =>
        current.map((conversation) => (conversation.id === data.id ? data : conversation)),
      );
      setQueueActionConversationId(null);
      setQueueActionMenuPosition(null);
      setBlockDialog(null);
      setNotice({ tone: "success", text: "Contato bloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Falha ao bloquear contato.";
      setError(message);
    }
  }, [blockDialog, loadConversations, rememberConversationDetail]);

  const blockConversation = useCallback(async () => {
    if (!selectedId) return;
    await blockConversationById(selectedId);
  }, [blockConversationById, selectedId]);

  const unblockConversation = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/unblock`, {
        method: "PATCH",
      });
      if (inboxQueueRef.current === "blocked") {
        inboxQueueRef.current = "all";
        setInboxQueue("all");
      }
      setSelectedConversation(data);
      rememberConversationDetail(data);
      setConversations((current) =>
        current.map((conversation) => (conversation.id === data.id ? data : conversation)),
      );
      setNotice({ tone: "success", text: "Contato desbloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao desbloquear contato.";
      setError(message);
    }
  }, [loadConversations, rememberConversationDetail, selectedId]);

  const reactToMessage = useCallback(
    async (messageId: string, reaction: string) => {
      if (!selectedId || !messageId || !reaction) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(
          `/inbox/conversations/${selectedId}/messages/${messageId}/reaction`,
          {
            method: "POST",
            body: JSON.stringify({ reaction }),
          },
        );
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setMessageReactionTargetId(null);
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (reactionError) {
        const message = reactionError instanceof Error ? reactionError.message : "Falha ao reagir à mensagem.";
        setError(message);
      }
    },
    [loadConversations, rememberConversationDetail, selectedId],
  );

  const deleteSentMessage = useCallback(
    async (messageId: string) => {
      if (!selectedId || !messageId) return;
      setDeleteMessageDialog({ messageId });
    },
    [selectedId],
  );

  const confirmDeleteSentMessage = useCallback(
    async () => {
      const messageId = deleteMessageDialog?.messageId;
      if (!selectedId || !messageId) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(
          `/inbox/conversations/${selectedId}/messages/${messageId}`,
          {
            method: "DELETE",
          },
        );
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setMessageReactionTargetId(null);
        setDeleteMessageDialog(null);
        setNotice({ tone: "success", text: "Mensagem apagada para todos." });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "Falha ao apagar mensagem.";
        setError(message);
      }
    },
    [deleteMessageDialog?.messageId, loadConversations, rememberConversationDetail, selectedId],
  );

  const sendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId || selectedConversationInteractionBlocked) return;
      if (!sendText.trim() && !imagePreview) return;
      restoreComposerFocusAfterSendRef.current = document.activeElement === chatComposerInputRef.current;
      setSending(true);
      setError(null);
      try {
        let content = sendText.trim();
        let uploadedAttachment:
          | {
              kind: InboxAttachmentPreview["kind"];
              url: string;
              previewUrl: string;
              mimeType: string;
              fileName: string;
              fileSize: number;
            }
          | null = null;
        if (imagePreview) {
          const formData = new FormData();
          formData.append("file", imagePreview.file);
          const mediaResult = await apiFetch<{
            url: string;
            filename: string;
            mimeType: string;
            size: number;
          }>(`/inbox/conversations/${selectedId}/media`, {
            method: "POST",
            body: formData,
          });
          uploadedAttachment = {
            kind: imagePreview.kind,
            url: mediaResult.url,
            previewUrl: mediaResult.url,
            mimeType: mediaResult.mimeType,
            fileName: imagePreview.fileName || mediaResult.filename,
            fileSize: mediaResult.size,
          };
          content = content ? `${mediaResult.url}\n${content}` : mediaResult.url;
        }
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
          method: "POST",
          body: JSON.stringify({
            content,
            quotedMessageId: replyingTo?.id,
            quotedContent: replyingTo ? getMessagePreview(replyingTo).slice(0, 200) : undefined,
            attachmentKind: uploadedAttachment?.kind,
            attachmentUrl: uploadedAttachment?.url,
            attachmentPreviewUrl: uploadedAttachment?.previewUrl,
            attachmentMimeType: uploadedAttachment?.mimeType,
            attachmentFileName: uploadedAttachment?.fileName,
            attachmentFileSize: uploadedAttachment?.fileSize,
          }),
        });
        if (imagePreview) {
          URL.revokeObjectURL(imagePreview.url);
          setImagePreview(null);
        }
        setSendText("");
        sendTextDirtyRef.current = false;
        setReplyingTo(null);
        setSelectedConversation(data);
        selectedConversationRef.current = data;
        rememberConversationDetail(data);
        const latestMessage = getInboxLatestMessage(data.messages);
        const latestKey = getInboxMessageStableKey(latestMessage);
        if (latestKey) {
          activeConversationLatestMessageKeyRef.current[data.id] = latestKey;
        }
        setNotice({ tone: "success", text: "Mensagem manual enfileirada com sucesso." });
        void loadConversations({ preferredId: data.id, silent: true });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Falha ao enviar mensagem.";
        setError(message);
      } finally {
        setSending(false);
        if (restoreComposerFocusAfterSendRef.current) {
          window.requestAnimationFrame(() => {
            chatComposerInputRef.current?.focus();
          });
        }
        restoreComposerFocusAfterSendRef.current = false;
      }
    },
    [
      loadConversations,
      rememberConversationDetail,
      selectedConversationInteractionBlocked,
      selectedId,
      sendText,
      replyingTo,
      imagePreview,
    ],
  );

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingLevelTimerRef.current) {
      clearInterval(recordingLevelTimerRef.current);
      recordingLevelTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const context = new AudioContextCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        const samples = new Float32Array(analyser.fftSize);
        analyser.fftSize = 2048;
        source.connect(analyser);
        recordingAudioContextRef.current = context;
        recordingAnalyserRef.current = analyser;
        recordingMaxPeakRef.current = 0;
        recordingLevelTimerRef.current = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let peak = 0;
          for (const value of samples) {
            peak = Math.max(peak, Math.abs(value));
          }
          recordingMaxPeakRef.current = Math.max(recordingMaxPeakRef.current, peak);
        }, 200);
      }
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (recordingLevelTimerRef.current) {
          clearInterval(recordingLevelTimerRef.current);
          recordingLevelTimerRef.current = null;
        }
        recordingAnalyserRef.current = null;
        const audioContext = recordingAudioContextRef.current;
        recordingAudioContextRef.current = null;
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close().catch(() => undefined);
        }
        stream.getTracks().forEach((t) => t.stop());
        const baseMime = mimeType.split(";")[0];
        const blob = new Blob(audioChunksRef.current, { type: baseMime });
        const maxPeak = recordingMaxPeakRef.current;
        recordingMaxPeakRef.current = 0;
        if (!blob.size || maxPeak < 0.005) {
          setAudioPreview(null);
          setError("Não detectei som no microfone. Verifique o dispositivo de entrada do Windows antes de gravar áudio.");
          audioChunksRef.current = [];
          return;
        }
        const url = URL.createObjectURL(blob);
        setAudioPreview({ blob, url, mimeType: baseMime, seconds: recordingSecondsRef.current });
        audioChunksRef.current = [];
      };
      recorder.start(200);
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds((s) => {
          const next = s + 1;
          if (next >= 120) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setError("Microfone não acessível. Verifique as permissões do navegador.");
    }
  }, [stopRecording]);

  const sendAudioPreview = useCallback(async () => {
    if (!selectedId || !audioPreview) return;
    setSending(true);
    setError(null);
    try {
      const ext = audioPreview.mimeType.includes("ogg") ? ".ogg" : ".webm";
      const file = new File([audioPreview.blob], `voz_${Date.now()}${ext}`, { type: audioPreview.mimeType });
      const formData = new FormData();
      formData.append("file", file);
      const mediaResult = await apiFetch<{ url: string; filename: string; mimeType: string; size: number }>(
        `/inbox/conversations/${selectedId}/media`,
        { method: "POST", body: formData },
      );
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
        method: "POST",
        body: JSON.stringify({
          content: mediaResult.url,
          attachmentKind: "audio",
          attachmentUrl: mediaResult.url,
          attachmentPreviewUrl: mediaResult.url,
          attachmentMimeType: mediaResult.mimeType,
          attachmentFileName: mediaResult.filename,
          attachmentFileSize: mediaResult.size,
          attachmentDurationSeconds: audioPreview.seconds,
        }),
      });
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
      setSelectedConversation(data);
      selectedConversationRef.current = data;
      rememberConversationDetail(data);
      setNotice({ tone: "success", text: "Áudio enfileirado com sucesso." });
      void loadConversations({ preferredId: data.id, silent: true });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Falha ao enviar áudio.";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [audioPreview, loadConversations, rememberConversationDetail, selectedId]);

  const handleComposerPaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (selectedBlocked || sending) return;

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const fileFromItem = clipboardItems.find((item) => item.kind === "file")?.getAsFile() || null;
      const fileFromList = Array.from(event.clipboardData?.files || [])[0] || null;
      const file = fileFromItem || fileFromList;
      if (!file) return;

      event.preventDefault();
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview.url);
      }
      setImagePreview(createInboxAttachmentPreview(file));
    },
    [imagePreview, selectedBlocked, sending],
  );

  const inboxWorkspaceComponents = useMemo(
    () => ({
      list: () => (
        <ConversationListPane
          eyebrow={undefined}
          title={undefined}
          description={undefined}
          count={undefined}
          actions={undefined}
          className={`${styles.workspaceDockPanel} ${styles.inboxListPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxListBody}`}
        >
          <div className={styles.listSearchRow}>
            <label className={styles.listSearchField}>
              <SearchIcon className={styles.listSearchIcon} />
              <input
                ref={conversationSearchInputRef}
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa, telefone ou trecho..."
                className={styles.listSearchInput}
                aria-label="Buscar conversa"
              />
            </label>
            <button
              type="button"
              className={styles.listSearchAction}
              onClick={() => setConversationSearch("")}
              disabled={!conversationSearch.trim()}
            >
              Limpar
            </button>
            <button
              type="button"
              className={styles.listSearchNewAction}
              onClick={() => setNewConversationOpen(true)}
              aria-label="Nova conversa"
              title="Nova conversa"
            >
              +
            </button>
          </div>
          <ConversationQueueFilterBar
            value={inboxQueue as ConversationQueueFilterValue}
            counts={queueCounts as Record<ConversationQueueFilterValue, number>}
            unreadCounts={queueUnreadCounts as Record<ConversationQueueFilterValue, number>}
            showArchived
            archivedLabel="Encerrado"
            botSignalCounts={prospectionSignalCounts}
            dropOverQueue={dropOverQueue as ConversationQueueFilterValue | null}
            allowQueueCardDrag
            draggedQueue={draggedQueueId as ConversationQueueFilterValue | null}
            onChange={(value) => setInboxQueue(value as InboxQueue)}
            onQueueCardDragStart={(queue) => {
              setDraggedConversationId(null);
              setDraggedQueueId(queue as InboxQueue);
            }}
            onQueueCardDragEnd={() => {
              setDraggedQueueId(null);
              setDropOverQueue(null);
            }}
            onQueueDragOver={(queue) => setDropOverQueue(queue as InboxQueue)}
            onQueueDragLeave={() => setDropOverQueue(null)}
            onQueueDrop={(queue) => handleQueueDrop(queue as InboxQueue)}
          />
          {loadingList ? (
            <ChatEmptyState title="Carregando conversas">A fila sera montada assim que a leitura inicial terminar.</ChatEmptyState>
          ) : conversationListError && filteredConversations.length === 0 ? (
            <ConversationWorkspaceStatus
              title="Falha ao carregar conversas"
              description={conversationListError}
              tone="error"
              diagnostics={inboxQueueDiagnostics}
              onRetry={retryConversationList}
              retryLabel="Recarregar fila"
            />
          ) : filteredConversations.length === 0 ? (
            <ChatEmptyState title="Nenhuma conversa encontrada">Ajuste o filtro ou aguarde novas mensagens entrarem na fila.</ChatEmptyState>
          ) : (
            <ChatQueue
              key={inboxQueue}
              ref={conversationListScrollRef}
              className={styles.conversationList}
              onScroll={(event) => {
                const target = event.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (remaining < 96) loadMoreConversations();
              }}
            >
              {filteredConversations.map((conversation, idx) => {
                const active = conversation.id === selectedId;
                const unreadCount = getInboxConversationUnreadCount(conversation);
                const statusMeta = getAtendimentoConversationStatusMeta(
                  conversation,
                  hasRecoveryCapability,
                );
                const conversationWithoutWhatsapp = hasConversationUnavailableWhatsapp(
                  conversation.id,
                  customerConversationCardCacheRef.current,
                  conversation.id === selectedId ? customerConversationCard : null,
                  conversation,
                );
                const displayName = resolveInboxConversationDisplayName(conversation);
                const previewLabel = renderInboxConversationPreview(conversation);
                const prospectionStatusMeta = getInboxProspectionStatusMeta(conversation);
                const interested = isProspectingInterestedConversation(conversation);
                const activityAt = getInboxConversationActivityAt(conversation);
                const activityAtLabel = activityAt ? formatTimeLabel(activityAt, mounted) : "Sem mensagens";
                const itemStyle = {
                  "--reveal-index": idx,
                  ...(prospectionStatusMeta
                    ? {
                        "--conversation-prospeccao-accent": prospectionStatusMeta.accent,
                        "--conversation-prospeccao-surface": prospectionStatusMeta.surface,
                      }
                    : {}),
                } as CSSProperties;
                return (
                  <ChatQueueItem
                    key={conversation.id}
                    active={active}
                    onClick={() => loadConversation(conversation.id)}
                    style={itemStyle}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(conversation.id));
                      setDraggedQueueId(null);
                      setDraggedConversationId(String(conversation.id));
                    }}
                    onDragEnd={() => {
                      setDraggedConversationId(null);
                      setDraggedQueueId(null);
                      setDropOverQueue(null);
                    }}
                    initials={getInboxConversationInitials(conversation)}
                    imageUrl={resolveInboxAvatarUrl(conversation)}
                    label={conversationWithoutWhatsapp ? "S/WA" : statusMeta.shortLabel}
                    tone={
                      conversationWithoutWhatsapp
                        ? "danger"
                        : interested
                          ? "success"
                          : mapAtendimentoConversationToneToQueueTone(statusMeta.tone)
                    }
                    title={displayName}
                    subtitle={undefined}
                    preview={previewLabel}
                    badges={
                      unreadCount > 0 || interested ? (
                        <span className={styles.conversationBadgeStack}>
                          {interested ? (
                            <span className={styles.conversationInterestedBadge}>Interessado</span>
                          ) : null}
                          {unreadCount > 0 ? (
                            <span className={styles.conversationUnreadBadge}>
                              {unreadCount === 1 ? "1 não lida" : `${unreadCount} não lidas`}
                            </span>
                          ) : null}
                        </span>
                      ) : undefined
                    }
                    meta={
                      <div className={styles.conversationQueueMetaStack}>
                        <span className={styles.conversationQueueMetaTime}>{activityAtLabel}</span>
                        <div className={styles.conversationQueueMetaMenuWrap}>
                          <button
                            type="button"
                            className={styles.conversationQueueMetaButton}
                            aria-label="Abrir ações da conversa"
                            title="Ações da conversa"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => toggleQueueConversationMenu(conversation.id, event)}
                          >
                            <ChatGlyph name="gear" />
                          </button>
                        </div>
                      </div>
                    }
                    className={joinClassNames(
                      styles.conversationQueueItem,
                      queueActionConversationId === conversation.id && styles.conversationQueueItemMenuOpen,
                      (conversation.isBlocked || isInboxConversationArchived(conversation))
                        && styles.conversationQueueItemMuted,
                      conversationWithoutWhatsapp && styles.conversationQueueItemUnavailable,
                      unreadCount > 0 && styles.conversationQueueItemUnread,
                      interested && styles.conversationQueueItemInterested,
                      prospectionStatusMeta && styles.conversationQueueItemProspection,
                    )}
                    data-unread={unreadCount > 0 ? "true" : "false"}
                    data-prospection-stage={prospectionStatusMeta?.stage || undefined}
                    aria-label={`${displayName}${unreadCount > 0 ? `, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : ""}`}
                  />
                );
              })}
              {conversationListHasMore ? (
                <div className={styles.whatsAppOlderMessagesRow}>
                  <button
                    type="button"
                    className={styles.whatsAppOlderMessagesButton}
                    onClick={loadMoreConversations}
                    disabled={loadingMoreConversations}
                  >
                    {loadingMoreConversations ? "Carregando..." : "Carregar mais conversas"}
                  </button>
                </div>
              ) : null}
            </ChatQueue>
          )}
        </ConversationListPane>
      ),
      main: () => (
        <section className={`${styles.workspaceDockPanel} ${styles.inboxMainPanel} ${styles.chatStagePanel}`}>
          {conversationDetailError && selectedId && !conversationForView ? (
            <ConversationWorkspaceStatus
              title="Falha ao abrir conversa"
              description={conversationDetailError}
              tone="error"
              diagnostics={inboxDetailDiagnostics}
              onRetry={retryConversationDetail}
              retryLabel="Reabrir conversa"
            />
          ) : !conversationForView ? (
            <ChatEmptyState title="Nenhuma conversa selecionada">Escolha uma conversa na fila para abrir o chat.</ChatEmptyState>
          ) : (
            <section
              key={conversationForView.id}
              className={`${styles.whatsAppConversationShell} hbx-page-mobile-enter ${
                isConversationStageSwitching ? styles.whatsAppConversationShellLoading : ""
              } ${selectedConversationIsPersonal ? styles.whatsAppConversationShellPersonal : ""}`}
            >
              {isConversationStageSwitching ? (
                <div className={styles.whatsAppConversationLoadingMask} aria-hidden="true">
                  <span className={styles.whatsAppConversationLoadingChip}>Abrindo conversa...</span>
                </div>
              ) : null}
              <header className={styles.whatsAppConversationHeader}>
                <div className={styles.whatsAppConversationIdentity}>
                  <ChatAvatar
                    initials={getInboxConversationInitials(conversationForView)}
                    imageUrl={resolveInboxAvatarUrl(conversationForView)}
                    tone={
                      selectedConversationWithoutWhatsapp
                        ? "danger"
                        : selectedConversationIsInterested
                          ? "success"
                          : mapAtendimentoConversationToneToQueueTone(selectedConversationStatusMeta?.tone || "bot")
                    }
                  />
                  <div className={styles.whatsAppConversationIdentityText}>
                    <strong>{selectedConversationDisplayName}</strong>
                    <div className={styles.conversationIdentityMeta}>
                      {selectedConversationWithoutWhatsapp ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone="danger"
                        >
                          Sem WhatsApp
                        </span>
                      ) : null}
                      {selectedConversationStatusMeta ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone={selectedConversationStatusMeta.tone}
                        >
                          {selectedConversationStatusMeta.label}
                        </span>
                      ) : null}
                      {selectedConversationIsInterested ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone="success"
                        >
                          Interessado
                        </span>
                      ) : null}
                      {selectedConversationIsPersonal ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone="personal"
                        >
                          Contato pessoal
                        </span>
                      ) : null}
                      {getInboxConversationSubtitle(conversationForView) ? (
                        <span className={styles.conversationIdentitySubtitle}>
                          {getInboxConversationSubtitle(conversationForView)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className={styles.whatsAppConversationActions}>
                  {selectedConversationHasRecoveryContext ? (
                    <ChatIconButton
                      icon="wallet"
                      onClick={() => setContextTab("financeiro")}
                      title="Abrir contexto financeiro"
                      aria-label="Abrir contexto financeiro"
                    />
                  ) : null}
                  {selectedConversationIsAgenda ? (
                    <ChatIconButton
                      icon="clock"
                      onClick={() => setContextTab("agenda")}
                      title="Abrir contexto de agenda"
                      aria-label="Abrir contexto de agenda"
                    />
                  ) : null}
                  <button
                    type="button"
                    className={styles.personalContactToggle}
                    data-active={selectedConversationIsPersonal ? "true" : "false"}
                    onClick={() => void togglePersonalContact()}
                    aria-pressed={selectedConversationIsPersonal}
                  >
                    <span className={styles.personalContactSwitch} aria-hidden="true">
                      <span />
                    </span>
                    Contato Pessoal
                  </button>
                </div>
              </header>

              <div ref={chatTimelineRef} className={styles.whatsAppTimeline}>
                {loadingConversation || isInboxConversationSummaryOnly(conversationForView) ? (
                  <ChatEmptyState title="Carregando conversa">Preparando historico do cliente.</ChatEmptyState>
                ) : conversationMessagesForView.length === 0 ? (
                  selectedVendasAgendaDraftMessage ? (
                    <ChatEmptyState title="Roteiro carregado">
                      A mensagem de Vendas esta pre-carregada abaixo para envio manual.
                    </ChatEmptyState>
                  ) : (
                    <ChatEmptyState title="Sem mensagens">Esta conversa ainda nao tem historico registrado.</ChatEmptyState>
                  )
                ) : (
                  <>
                    {olderMessagesHasMore ? (
                      <div className={styles.whatsAppOlderMessagesRow}>
                        <button
                          type="button"
                          className={styles.whatsAppOlderMessagesButton}
                          onClick={() => void loadOlderMessages()}
                          disabled={loadingOlderMessages}
                        >
                          {loadingOlderMessages ? "Carregando..." : "Carregar mensagens anteriores"}
                        </button>
                      </div>
                    ) : null}
                    {conversationMessagesForView.map((message, index) => {
                    const tone = mapInboxBubbleTone(message);
                    let rendered = parseInboxMessageMedia(message, conversationForView);
                    const mediaFailedInBrowser = Boolean(
                      (rendered.imageUrl && failedInboxMediaUrls[rendered.imageUrl]) ||
                        (rendered.videoUrl && failedInboxMediaUrls[rendered.videoUrl]) ||
                        (rendered.audioUrl && failedInboxMediaUrls[rendered.audioUrl]) ||
                        (rendered.documentUrl && failedInboxMediaUrls[rendered.documentUrl]),
                    );
                    if (mediaFailedInBrowser) {
                      rendered = {
                        ...rendered,
                        imageUrl: null,
                        videoUrl: null,
                        audioUrl: null,
                        documentUrl: null,
                        mediaExpired: true,
                      };
                    }
                    const previousMessage =
                      index > 0 ? conversationMessagesForView[index - 1] : null;
                    const showDayDivider = !previousMessage
                      || !isInboxSameCalendarDay(previousMessage.createdAt, message.createdAt);
                    const isOutbound = tone === "human" || tone === "outbound";
                    const showGroupSender =
                      !isOutbound
                      && tone !== "system"
                      && isInboxGroupRemoteJid(extractInboxRawContact(conversationForView))
                      && Boolean(rendered.senderName);
                    const reactionKey = getInboxMessageProviderKeyId(message);
                    const reactionEmojis = reactionKey
                      ? conversationReactionIndex.get(reactionKey) || []
                      : [];
                    const canDeleteMessage =
                      isOutbound &&
                      !rendered.isDeleted &&
                      Boolean(reactionKey);
                    const canRevealDeleted = rendered.isDeleted && canRevealDeletedInboxMessage(message);
                    const isDeletedRevealed = Boolean(revealedDeletedMessageIds[message.id]);
                    const canPreviewDocument =
                      Boolean(rendered.documentUrl) &&
                      canPreviewDocumentInOverlay(
                        rendered.documentUrl || "",
                        rendered.mimeType,
                        rendered.fileName,
                      );
                    return (
                      <div key={message.id} className={styles.whatsAppMessageBlock}>
                        {showDayDivider ? (
                          <div className={styles.whatsAppDayDivider}>
                            <span>{formatInboxMessageDayLabel(message.createdAt, mounted)}</span>
                          </div>
                        ) : null}
                        <div
                          className={`${styles.whatsAppMessageRow} ${
                            isOutbound
                              ? styles.whatsAppMessageRowOutbound
                              : tone === "system"
                                ? styles.whatsAppMessageRowSystem
                                : styles.whatsAppMessageRowInbound
                          }`}
                        >
                          {tone !== "system" ? (
                            <div
                              className={`${styles.whatsAppHoverActionRail} ${
                                isOutbound
                                  ? styles.whatsAppHoverActionRailOutbound
                                  : styles.whatsAppHoverActionRailInbound
                              }`}
                            >
                              <button
                                type="button"
                                className={styles.whatsAppReplyButtonHover}
                                title="Responder"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setReplyingTo(message);
                                  chatComposerInputRef.current?.focus();
                                }}
                              >
                                ↩
                              </button>
                              <button
                                type="button"
                                className={styles.whatsAppReplyButtonHover}
                                title="Reagir"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  setMessageReactionTargetId((current) =>
                                    current === message.id ? null : message.id,
                                  )
                                }
                              >
                                <ChatGlyph name="smile" />
                              </button>
                              {canDeleteMessage ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppReplyButtonHover}
                                  title="Apagar para todos"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => void deleteSentMessage(message.id)}
                                >
                                  <ChatGlyph name="trash" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className={styles.whatsAppBubbleWrap}>
                            <div
                              className={`${styles.whatsAppBubble} ${
                                isOutbound
                                  ? styles.whatsAppBubbleOutbound
                                  : tone === "system"
                                    ? styles.whatsAppBubbleSystem
                                    : styles.whatsAppBubbleInbound
                              } ${rendered.imageUrl ? styles.whatsAppBubbleWithMedia : ""} ${
                                ["image", "video", "document", "audio", "sticker"].includes(String(rendered.kind || ""))
                                  ? styles.whatsAppBubbleWithAttachment
                                  : ""
                              }`}
                            >
                              {rendered.quotedText ? (
                                <div className={styles.whatsAppQuotedSnippet}>
                                  <span className={styles.whatsAppQuotedSnippetLabel}>Mensagem respondida</span>
                                  <p className={styles.whatsAppQuotedSnippetText}>
                                    {formatWhatsAppText(rendered.quotedText)}
                                  </p>
                                </div>
                              ) : null}
                              {showGroupSender ? (
                                <span
                                  className={styles.whatsAppBubbleSender}
                                  style={rendered.senderColor ? { color: rendered.senderColor } : undefined}
                                >
                                  {rendered.senderName}
                                </span>
                              ) : null}
                              {rendered.mediaExpired ? (
                                <div className={styles.whatsAppExpiredMediaCard}>
                                  <span className={styles.whatsAppDocumentIcon}>EXP</span>
                                  <span className={styles.whatsAppDocumentBody}>
                                    <strong>Midia temporaria expirada</strong>
                                    <span>Atualize a conversa para tentar obter um novo link.</span>
                                  </span>
                                </div>
                              ) : null}
                              {rendered.imageUrl ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppBubbleImageButton}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setOpenedAsset({
                                      kind: "image",
                                      src: rendered.imageUrl || "",
                                      alt: "Imagem da conversa",
                                    })
                                  }
                                  aria-label="Abrir imagem"
                                  title="Abrir imagem"
                                >
                                  <img
                                    src={rendered.imageUrl}
                                    alt="Imagem enviada"
                                    className={styles.whatsAppBubbleImage}
                                    loading="lazy"
                                    onError={() => markInboxMediaUrlFailed(rendered.imageUrl)}
                                  />
                                </button>
                              ) : null}
                              {rendered.videoUrl ? (
                                <video
                                  className={styles.whatsAppBubbleVideo}
                                  controls
                                  preload="metadata"
                                  onError={() => markInboxMediaUrlFailed(rendered.videoUrl)}
                                >
                                  <source src={rendered.videoUrl} />
                                </video>
                              ) : null}
                              {rendered.documentUrl || rendered.kind === "document" ? (
                                rendered.documentUrl ? (
                                  <button
                                    type="button"
                                    className={styles.whatsAppDocumentCard}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (canPreviewDocument) {
                                        setOpenedAsset({
                                          kind: "document",
                                          src: rendered.documentUrl || "",
                                          alt: rendered.fileName || "Documento",
                                          title: rendered.fileName || "Documento",
                                          mimeType: rendered.mimeType,
                                          fileName: rendered.fileName,
                                        });
                                        return;
                                      }
                                      window.open(rendered.documentUrl || "", "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    <span className={styles.whatsAppDocumentIcon}>DOC</span>
                                    <span className={styles.whatsAppDocumentBody}>
                                      <strong>{rendered.fileName || "Documento"}</strong>
                                      <span>
                                        {[rendered.mimeType, formatInboxFileSizeLabel(rendered.fileSize)]
                                          .filter(Boolean)
                                          .join(" • ") || "Abrir documento"}
                                      </span>
                                    </span>
                                  </button>
                                ) : (
                                  <div className={styles.whatsAppDocumentCard}>
                                    <span className={styles.whatsAppDocumentIcon}>DOC</span>
                                    <span className={styles.whatsAppDocumentBody}>
                                      <strong>{rendered.fileName || "Documento"}</strong>
                                      <span>
                                        {[rendered.mimeType, formatInboxFileSizeLabel(rendered.fileSize)]
                                          .filter(Boolean)
                                          .join(" • ") || "Documento recebido"}
                                      </span>
                                    </span>
                                  </div>
                                )
                              ) : null}
                              {rendered.audioUrl || rendered.kind === "audio" ? (
                                <div className={styles.whatsAppAudioCard}>
                                  <span className={styles.whatsAppAudioIcon}>
                                    {rendered.isVoiceNote ? "VOZ" : "AUDIO"}
                                  </span>
                                  <div className={styles.whatsAppAudioBody}>
                                    {rendered.audioUrl ? (
                                      <audio
                                        key={rendered.audioUrl}
                                        className={styles.whatsAppAudioPlayer}
                                        controls
                                        preload="metadata"
                                        src={rendered.audioUrl}
                                        onError={() => markInboxMediaUrlFailed(rendered.audioUrl)}
                                      />
                                    ) : (
                                      <div className={styles.whatsAppAudioWavePlaceholder} />
                                    )}
                                    <span className={styles.whatsAppAudioMeta}>
                                      {rendered.isVoiceNote ? "Mensagem de voz" : "Áudio recebido"}
                                      {rendered.durationSeconds ? ` • ${formatInboxDurationLabel(rendered.durationSeconds)}` : ""}
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                              {rendered.text ? (
                                <p className={styles.whatsAppBubbleText}>{formatWhatsAppText(rendered.text)}</p>
                              ) : null}
                              {rendered.isDeleted && canRevealDeleted ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppDeletedRevealButton}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setRevealedDeletedMessageIds((current) => ({
                                      ...current,
                                      [message.id]: !current[message.id],
                                    }))
                                  }
                                >
                                  {isDeletedRevealed && rendered.deletedOriginalText
                                    ? formatWhatsAppText(rendered.deletedOriginalText)
                                    : "Toque para revelar por 7 dias"}
                                </button>
                              ) : null}
                              <span
                                className={`${styles.whatsAppBubbleMeta} ${
                                  rendered.imageUrl ? styles.whatsAppBubbleMetaOnMedia : ""
                                }`}
                              >
                                {formatInboxMessageTimeLabel(message.createdAt, mounted)}
                                {isOutbound ? (
                                  <MessageStatusTick status={message.status} />
                                ) : null}
                              </span>
                            </div>
                            {reactionEmojis.length ? (
                              <div className={styles.whatsAppReactionChipRow}>
                                {Array.from(new Set(reactionEmojis)).map((emoji) => {
                                  const count = reactionEmojis.filter((item) => item === emoji).length;
                                  return (
                                    <span key={`${message.id}:${emoji}`} className={styles.whatsAppReactionChip}>
                                      <span>{emoji}</span>
                                      {count > 1 ? <strong>{count}</strong> : null}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                            {messageReactionTargetId === message.id ? (
                              <div
                                ref={messageReactionPickerRef}
                                className={`${styles.whatsAppReactionPickerBubble} ${
                                  isOutbound
                                    ? styles.whatsAppReactionPickerBubbleOutbound
                                    : styles.whatsAppReactionPickerBubbleInbound
                                }`}
                              >
                                {["👍", "❤️", "😂", "🙏", "😮", "😢"].map((emoji) => (
                                  <button
                                    key={`${message.id}:${emoji}`}
                                    type="button"
                                    className={styles.whatsAppReactionPickerItem}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => void reactToMessage(message.id, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </>
                )}
              </div>

              <form className={styles.whatsAppComposerForm} onSubmit={sendMessage}>
                {replyingTo ? (
                  <div className={styles.whatsAppReplyBar}>
                    <div className={styles.whatsAppReplyBarContent}>
                      <span className={styles.whatsAppReplyBarLabel}>Respondendo a</span>
                      <p className={styles.whatsAppReplyBarText}>{getMessagePreview(replyingTo).slice(0, 100)}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.whatsAppReplyBarClose}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancelar resposta"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                {imagePreview ? (
                  <div className={styles.whatsAppImagePreviewBar}>
                    {imagePreview.kind === "image" || imagePreview.kind === "sticker" ? (
                      <img src={imagePreview.url} alt="preview" className={styles.whatsAppImagePreviewThumb} />
                    ) : (
                      <div className={styles.whatsAppAttachmentPreviewIcon}>
                        {imagePreview.kind === "audio"
                          ? "AUDIO"
                          : imagePreview.kind === "video"
                            ? "VIDEO"
                            : "DOC"}
                      </div>
                    )}
                    <div className={styles.whatsAppAttachmentPreviewBody}>
                      <span className={styles.whatsAppImagePreviewName}>{imagePreview.fileName}</span>
                      <small className={styles.whatsAppAttachmentPreviewMeta}>
                        {[imagePreview.kind, formatInboxFileSizeLabel(imagePreview.size)]
                          .filter(Boolean)
                          .join(" • ")}
                      </small>
                      <button
                        type="button"
                        className={styles.whatsAppImagePreviewClose}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          URL.revokeObjectURL(imagePreview.url);
                          setImagePreview(null);
                        }}
                        aria-label="Remover imagem"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : null}
                {audioPreview ? (
                  <div className={styles.whatsAppAudioPreviewBar}>
                    <audio controls src={audioPreview.url} className={styles.whatsAppAudioPreviewPlayer} />
                    <span className={styles.whatsAppAudioPreviewMeta}>
                      🎙️ {audioPreview.seconds}s · pronto para enviar
                    </span>
                    <button
                      type="button"
                      className={`btn ${styles.whatsAppAudioPreviewSend}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void sendAudioPreview()}
                      disabled={sending}
                    >
                      {sending ? "Enviando..." : "Enviar áudio"}
                    </button>
                    <button
                      type="button"
                      className={styles.whatsAppImagePreviewClose}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        URL.revokeObjectURL(audioPreview.url);
                        setAudioPreview(null);
                      }}
                      aria-label="Cancelar áudio"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                <div className={styles.whatsAppComposerRow}>
                  <div className={styles.whatsAppEmojiWrapper} ref={emojiPickerRef}>
                    <button
                      type="button"
                      className={styles.whatsAppEmojiButton}
                      onClick={() => setEmojiPickerOpen((prev) => !prev)}
                      title="Emojis"
                      aria-label="Abrir seletor de emojis"
                    >
                      😊
                    </button>
                    {emojiPickerOpen ? (
                      <div className={styles.whatsAppEmojiPicker}>
                        {COMMON_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={styles.whatsAppEmojiItem}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const textarea = chatComposerInputRef.current;
                              if (!textarea) {
                                sendTextDirtyRef.current = true;
                                setSendText((prev) => prev + emoji);
                                setEmojiPickerOpen(false);
                                return;
                              }
                              const start = textarea.selectionStart ?? textarea.value.length;
                              const end = textarea.selectionEnd ?? textarea.value.length;
                              const next = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
                              sendTextDirtyRef.current = true;
                              setSendText(next);
                              setEmojiPickerOpen(false);
                              window.requestAnimationFrame(() => {
                                textarea.focus();
                                const cur = start + [...emoji].length;
                                textarea.setSelectionRange(cur, cur);
                              });
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.whatsAppAttachButton}
                    title="Anexar arquivo"
                    aria-label="Anexar arquivo"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={selectedConversationInteractionBlocked || sending || isRecording}
                  >
                    📎
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,audio/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (imagePreview) URL.revokeObjectURL(imagePreview.url);
                      setImagePreview(createInboxAttachmentPreview(file));
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={`${styles.whatsAppAttachButton} ${isRecording ? styles.whatsAppMicActive : ""}`}
                    title={isRecording ? `Parar gravação (${recordingSeconds}s)` : "Gravar áudio"}
                    aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (isRecording ? stopRecording() : void startRecording())}
                    disabled={selectedConversationInteractionBlocked || sending}
                  >
                    {isRecording ? `🔴 ${recordingSeconds}s` : "🎙️"}
                  </button>
                  <textarea
                    id="atendimento-chat-reply"
                    name="atendimentoChatReply"
                    ref={chatComposerInputRef}
                    className={`field ${styles.whatsAppComposerInput}`}
                    rows={1}
                    spellCheck={true}
                    lang="pt-BR"
                    value={sendText}
                    onChange={(event) => {
                      sendTextDirtyRef.current = true;
                      setSendText(event.target.value);
                    }}
                    onPaste={handleComposerPaste}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      chatComposerInputRef.current?.focus();
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={
                      selectedBlocked
                        ? "Contato bloqueado. Desbloqueie para responder."
                        : selectedConversationWithoutWhatsapp
                          ? "Número sem WhatsApp. O envio manual fica bloqueado."
                        : "Digite uma mensagem"
                    }
                    disabled={selectedConversationInteractionBlocked || sending}
                  />
                  <button
                    type="submit"
                    className={`btn ${styles.whatsAppComposerButton} ${selectedConversationWithoutWhatsapp ? styles.whatsAppComposerButtonUnavailable : ""}`}
                    disabled={
                      sending
                      || (!sendText.trim() && !imagePreview)
                      || selectedConversationInteractionBlocked
                    }
                    aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
                    title={
                      selectedConversationWithoutWhatsapp
                        ? "Motor confirmou que este número não possui WhatsApp."
                        : sending
                          ? "Enviando..."
                          : "Enviar"
                    }
                  >
                    {sending ? <span className={styles.whatsAppComposerButtonSpinner} aria-hidden="true" /> : "➤"}
                  </button>
                </div>
                {selectedBlocked ? (
                  <small className={styles.whatsAppComposerHint}>
                    Contato bloqueado. Desbloqueie para responder.
                  </small>
                ) : selectedConversationWithoutWhatsapp ? (
                  <small className={`${styles.whatsAppComposerHint} ${styles.whatsAppComposerHintUnavailable}`}>
                    Motor confirmou que este número não possui WhatsApp. O envio manual fica bloqueado.
                  </small>
                ) : selectedVendasAgendaDraftMessage ? (
                  <small className={styles.whatsAppComposerHint}>
                    Roteiro de Vendas carregado. Revise e envie manualmente.
                  </small>
                ) : null}
              </form>

              {openedAsset ? (
                <div
                  className={styles.whatsAppImageLightbox}
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    openedAsset.kind === "document"
                      ? "Visualizador de documento"
                      : "Visualizador de imagem"
                  }
                  onClick={() => setOpenedAsset(null)}
                >
                  <button
                    type="button"
                    className={styles.whatsAppImageLightboxClose}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setOpenedAsset(null)}
                    aria-label="Fechar visualizador"
                  >
                    ✕
                  </button>
                  <div
                    className={
                      openedAsset.kind === "document"
                        ? styles.whatsAppDocumentLightboxCard
                        : styles.whatsAppImageLightboxCard
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    {openedAsset.kind === "document" ? (
                      <>
                        <div className={styles.whatsAppDocumentLightboxHeader}>
                          <div className={styles.whatsAppDocumentLightboxTitle}>
                            <strong>{openedAsset.title || openedAsset.fileName || "Documento"}</strong>
                            {openedAsset.mimeType ? <span>{openedAsset.mimeType}</span> : null}
                          </div>
                          <a
                            href={openedAsset.src}
                            target="_blank"
                            rel="noreferrer"
                            className={`btn btn-secondary btn-sm ${styles.whatsAppDocumentLightboxLink}`}
                          >
                            Abrir em nova guia
                          </a>
                        </div>
                        <iframe
                          src={openedAsset.src}
                          title={openedAsset.title || openedAsset.fileName || "Documento"}
                          className={styles.whatsAppDocumentLightboxFrame}
                        />
                      </>
                    ) : (
                      <img
                        src={openedAsset.src}
                        alt={openedAsset.alt}
                        className={styles.whatsAppImageLightboxImage}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </section>
      ),
      context: () => (
        <ConversationContextPanel
          eyebrow={undefined}
          title={undefined}
          description={undefined}
          count={undefined}
          actions={
            selectedConversation ? (
              <WorkspaceSegmentedControl
                items={CONTEXT_TAB_ITEMS}
                value={contextTab}
                onChange={(nextValue) => setContextTab(nextValue as ContextTab)}
                className={`${styles.contextTabs} hbx-tab-glide`}
                highlightClassName={`${styles.contextTabHighlight} hbx-tab-glide__item`}
                buttonClassName={`${styles.contextTab} hbx-tab-glide__item`}
                activeButtonClassName={styles.contextTabActive}
                role="tablist"
                buttonRole="tab"
                ariaLabel="Abas de contexto do cliente"
              />
            ) : undefined
          }
          className={`${styles.workspaceDockPanel} ${styles.inboxContextPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxContextBody}`}
        >
          {!selectedConversation ? (
            <ChatEmptyState title="Sem contexto ativo">Abra uma conversa para liberar os atalhos operacionais.</ChatEmptyState>
          ) : (
            <div className={`${styles.contextStack} ${selectedConversationIsPersonal ? styles.contextStackPersonal : ""}`}>
              {contextTab === "conversa" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard
                    title="Card do cliente"
                    meta={selectedConversationWithoutWhatsapp ? "Sem WhatsApp" : customerConversationCard?.lead?.statusLabel || "Vendas"}
                  >
                    <LiquidGlassCard
                      accentTone={selectedConversationWithoutWhatsapp ? "danger" : "success"}
                      header={
                        <div className={styles.customerCardHeader}>
                          <div>
                            <strong className={glassCardStyles.title}>{customerCardName}</strong>
                            <span className={glassCardStyles.subtitle}>{customerCardPhoneLabel}</span>
                          </div>
                          <div className={styles.customerCardHeaderActions}>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                              onClick={() => setCustomerCardShortcutOpen((current) => !current)}
                            >
                              Cadastro
                            </button>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                              onClick={openCustomerReturnPicker}
                            >
                              Retorno
                            </button>
                          </div>
                        </div>
                      }
                      lead={
                        <div className={glassCardStyles.stack}>
                          {customerCardShortcutOpen ? (
                            <div className={`${styles.customerCardShortcut} ${glassCardStyles.subtlePanel}`}>
                              <strong>{customerCardName}</strong>
                              <span>Perfil #{customerConversationCard?.customer?.profileId || "--"}</span>
                              <span>
                                {selectedConversationWithoutWhatsapp
                                  ? "Sem WhatsApp confirmado no motor"
                                  : customerConversationCardDraft.doNotCall
                                    ? "Não ligar mais"
                                    : "Contato liberado"}
                              </span>
                            </div>
                          ) : null}

                          <div className={`${styles.customerCardReturnLine} ${glassCardStyles.subtlePanel}`}>
                            <span>
                              {customerCardReturnAt
                                ? `Retorno ${formatShortDateTimeLabel(customerCardReturnAt, mounted)}`
                                : `Hoje · ${formatShortDateTimeLabel(customerCardLastContactAt, mounted)}`}
                            </span>
                            {selectedConversationWithoutWhatsapp ? (
                              <em>Sem WhatsApp</em>
                            ) : customerConversationCardDraft.doNotCall ? <em>Não ligar mais</em> : null}
                          </div>
                        </div>
                      }
                      actions={
                        <div className={glassCardStyles.cluster}>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${selectedConversationWithoutWhatsapp ? glassCardStyles.actionDanger : glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                            onClick={() => {
                              if (!customerCardCanOpenWhatsapp) return;
                              window.open(`https://wa.me/${customerCardPhoneDigits}`, "_blank", "noopener,noreferrer");
                            }}
                            disabled={!customerCardCanOpenWhatsapp}
                          >
                            {selectedConversationWithoutWhatsapp ? "Sem WhatsApp" : "WhatsApp"}
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                            onClick={() => {
                              if (!customerCardPhoneDigits) return;
                              window.location.href = `tel:+${customerCardPhoneDigits}`;
                            }}
                            disabled={!customerCardPhoneDigits}
                          >
                            Ligar
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                            onClick={scheduleCustomerReturnTomorrow}
                            disabled={savingCustomerConversationCard}
                          >
                            Amanhã
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionDanger} ${glassCardStyles.noBreak}`}
                            onClick={markCustomerDoNotCall}
                            disabled={savingCustomerConversationCard || customerConversationCardDraft.doNotCall}
                          >
                            Não ligar mais
                          </button>
                        </div>
                      }
                      highlight={
                        <div className={glassCardStyles.stack}>
                          <div className={styles.customerCardSummaryBox}>
                            {customerConversationCard?.lead?.address ? (
                              <div className={glassCardStyles.subtlePanel}>
                                <span className={glassCardStyles.sectionLabel}>Endereço</span>
                                <p className={glassCardStyles.bodyText}>{customerConversationCard.lead.address}</p>
                              </div>
                            ) : null}
                            {customerCardWebscrapingSummary ? (
                              <div className={glassCardStyles.subtlePanel}>
                                <span className={glassCardStyles.sectionLabel}>Radar Digital</span>
                                <p className={glassCardStyles.bodyText}>{customerCardWebscrapingSummary}</p>
                              </div>
                            ) : null}
                            {customerConversationCard?.lead?.website ? (
                              <div className={glassCardStyles.cluster}>
                                <a className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} href={customerConversationCard.lead.website} target="_blank" rel="noreferrer">
                                  Site
                                </a>
                              </div>
                            ) : null}
                            <label>
                              <span>Observações</span>
                              <textarea
                                className={`field ${styles.customerCardTextarea}`}
                                rows={4}
                                value={customerConversationCardDraft.observations}
                                onChange={(event) =>
                                  setCustomerConversationCardDraft((current) => ({
                                    ...current,
                                    observations: event.target.value,
                                  }))
                                }
                                placeholder="Digite o contexto comercial, combinado ou restrição..."
                              />
                            </label>
                          </div>

                          <div className={styles.customerCardReturnEditor}>
                            <label>
                              <span>Retorno</span>
                              <input
                                ref={customerReturnInputRef}
                                type="datetime-local"
                                className="field"
                                value={customerConversationCardDraft.returnAt}
                                onChange={(event) => handleCustomerReturnChange(event.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                              onClick={() => void saveCustomerConversationCard()}
                              disabled={savingCustomerConversationCard}
                            >
                              {savingCustomerConversationCard ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </div>
                      }
                      metrics={
                        <div className={glassCardStyles.metricGrid}>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Tentativas</span>
                            <strong className={glassCardStyles.metricValue}>{customerCardAttempts}</strong>
                          </div>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Reaparicoes</span>
                            <strong className={glassCardStyles.metricValue}>{customerCardTimesSeen}</strong>
                          </div>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Ultimo contato</span>
                            <strong className={glassCardStyles.metricValue}>{formatShortDateTimeLabel(customerCardLastContactAt, mounted)}</strong>
                          </div>
                        </div>
                      }
                    >
                      <div className={styles.customerCardHistory}>
                        <div className={styles.customerCardHistoryHeader}>
                          <strong>Histórico</strong>
                          <span>{loadingCustomerConversationCard ? "Carregando" : `${customerCardHistory.length}`}</span>
                        </div>
                        {customerConversationCardError ? (
                          <ChatFieldNote>{customerConversationCardError}</ChatFieldNote>
                        ) : customerCardHistory.length > 0 ? (
                          customerCardHistory.slice(0, 5).map((event) => (
                            <article key={event.id} className={styles.customerCardHistoryItem}>
                              <strong>{event.title || "Atualização"}</strong>
                              <p>{event.description || event.resultLabel || "Registro salvo no histórico."}</p>
                              <span>{formatShortDateTimeLabel(event.createdAt, mounted)}</span>
                            </article>
                          ))
                        ) : (
                          <ChatFieldNote>Nenhum histórico comercial registrado para este telefone.</ChatFieldNote>
                        )}
                      </div>
                    </LiquidGlassCard>
                  </ChatInfoCard>

                  <ChatInfoCard title="Acoes rapidas" meta="Operacao">
                    <ChatActionGrid className={styles.quickActionsGrid}>
                      <ConversationActionList
                        actions={buildAtendimentoContextActions({
                          conversation: selectedConversation,
                          selectedStatus,
                          selectedBlocked,
                          allowRecoveryCapability: hasRecoveryCapability,
                          openFinance: () => handleSectionChange("financeiro"),
                          openAutomation: () => handleSectionChange("automacao"),
                          openAgenda: () => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          },
                          updateStatus,
                          blockConversation,
                          unblockConversation,
                        })}
                      />
                    </ChatActionGrid>
                  </ChatInfoCard>
                </div>
              ) : null}

              {contextTab === "financeiro" ? (
                selectedConversationHasRecoveryContext ? (
                  <div className={styles.contextGrid}>
                    <ChatInfoCard title="Resumo financeiro" meta={selectedConversation.recoveryStatus || "cobranca"}>
                      {buildAtendimentoRecoverySummary({
                        conversation: selectedConversation,
                        formatCurrency,
                      }).map((item) => (
                        <p key={item.label}>
                          <strong>{item.label}:</strong> {item.value}
                        </p>
                      ))}
                    </ChatInfoCard>

                    <ChatInfoCard title="Inadimplencia" meta={selectedConversation.recoveryCurrentStep || "ativa"}>
                      <p>
                        <strong>Valor pendente:</strong> {formatCurrency(Number(selectedConversation.recoveryOpenAmount || 0))}
                      </p>
                      <p>
                        <strong>Status:</strong> {selectedConversation.recoveryStatus || "-"}
                      </p>
                      <p>
                        <strong>Fluxo atual:</strong> {selectedConversation.currentFlow || "-"}
                      </p>
                      <p>
                        <strong>Origem:</strong> {selectedConversation.latestSourceModule || "-"}
                      </p>
                      <div className={styles.contextButtonRow}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void updateStatus("open")}
                          disabled={selectedBlocked}
                        >
                          Atendimento humano
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          }}
                        >
                          Abrir agenda
                        </button>
                      </div>
                    </ChatInfoCard>

                    <ChatInfoCard title="Historico de pagamentos" meta={selectedConversation.recoveryTotalPaid > 0 ? formatCurrency(selectedConversation.recoveryTotalPaid) : "sem baixa"}>
                      <p>
                        <strong>Total recuperado:</strong> {formatCurrency(Number(selectedConversation.recoveryTotalPaid || 0))}
                      </p>
                      <p>
                        <strong>Eventos recentes:</strong> {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}
                      </p>
                      <p>
                        <strong>Ultima atualizacao:</strong> {formatDateLabel(selectedConversation.updatedAt, mounted)}
                      </p>
                    </ChatInfoCard>

                    <ChatInfoCard title="Pagamentos recentes" meta={buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}>
                      {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length > 0 ? (
                        <div className={styles.recoveryPaymentHistory}>
                          {buildAtendimentoRecoveryPaymentHistory(selectedConversation).map((payment) => (
                            <article key={payment.id} className={styles.recoveryPaymentRow}>
                              <div>
                                <strong>{formatCurrency(payment.amount)}</strong>
                                <p>
                                  {formatAtendimentoRecoveryPaymentStatusLabel(payment.status)}
                                  {payment.chargeType
                                    ? ` • ${payment.chargeType === "parcelado" ? "Parcelado" : "A vista"}`
                                    : ""}
                                </p>
                                <p>{formatDateLabel(getAtendimentoRecoveryPaymentDate(payment), mounted)}</p>
                              </div>
                              {payment.paymentUrl ? (
                                <span className={styles.recoveryPaymentLinkText}>Link disponivel no financeiro</span>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <ChatFieldNote>Nenhum pagamento recente vinculado a esta cobranca.</ChatFieldNote>
                      )}
                    </ChatInfoCard>
                  </div>
                ) : (
                  <ChatEmptyState title="Sem contexto financeiro">Esta conversa ainda nao tem sinais financeiros relevantes. O foco continua na conversa central.</ChatEmptyState>
                )
              ) : null}

              {contextTab === "agenda" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard title="Agenda" meta={`${agendaConfig.groups.length} guias`}>
                    <p>
                      <strong>Contexto:</strong>{" "}
                      {selectedConversationIsAgenda
                        ? "Cliente em jornada de agendamento ou follow-up agendado."
                        : "Nenhum sinal forte de agenda nesta conversa agora."}
                    </p>
                    <p>
                      <strong>Guias ativas:</strong> {agendaConfig.groups.filter((group) => group.isActive).length}
                    </p>
                    <p>
                      <strong>Conexoes prontas:</strong>{" "}
                      {
                        agendaConfig.groups.filter((group) => group.connectionStatus === "connected")
                          .length
                      }
                    </p>
                  </ChatInfoCard>

                  <ChatInfoCard title="Operacao de agenda" meta="Acesso rapido" muted>
                    <div className={styles.contextButtonRow}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAgendaStudioOpen(true);
                        }}
                      >
                        Abrir agenda
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSectionChange("automacao")}
                      >
                        Ver automacao
                      </button>
                    </div>
                    <ChatFieldNote>
                      A agenda continua separada como configuracao, mas aparece aqui como contexto da mesma inbox.
                    </ChatFieldNote>
                  </ChatInfoCard>
                </div>
              ) : null}

            </div>
          )}
        </ConversationContextPanel>
      ),
    }),
    [
      agendaConfig.groups,
      blockConversation,
      conversationDetailError,
      conversationListError,
      conversationSearch,
      contextTab,
      customerCardAttempts,
      customerCardCanOpenWhatsapp,
      customerCardHistory,
      customerCardLastContactAt,
      customerCardName,
      customerCardPhoneLabel,
      customerCardPhoneDigits,
      customerCardReturnAt,
      customerCardShortcutOpen,
      customerCardTimesSeen,
      customerCardWebscrapingSummary,
      customerConversationCard,
      customerConversationCardDraft,
      customerConversationCardError,
      conversationListHasMore,
      hasRecoveryCapability,
      filteredConversations,
      handleSectionChange,
      handleComposerPaste,
      handleCustomerReturnChange,
      inboxDetailDiagnostics,
      inboxQueue,
      inboxQueueDiagnostics,
      isConversationStageSwitching,
      isRecording,
      deleteSentMessage,
      draggedQueueId,
      failedInboxMediaUrls,
      loadConversation,
      loadMoreConversations,
      loadOlderMessages,
      loadingConversation,
      loadingCustomerConversationCard,
      loadingList,
      loadingMoreConversations,
      loadingOlderMessages,
      markCustomerDoNotCall,
      markInboxMediaUrlFailed,
      mounted,
      openCustomerReturnPicker,
      openedAsset,
      olderMessagesHasMore,
      prospectionSignalCounts,
      queueActionConversationId,
      queueCounts,
      queueUnreadCounts,
      reactToMessage,
      recordingSeconds,
      retryConversationDetail,
      retryConversationList,
      revealedDeletedMessageIds,
      selectedConversationInteractionBlocked,
      selectedBlocked,
      selectedConversation,
      conversationForView,
      conversationMessagesForView,
      conversationReactionIndex,
      selectedConversationDisplayName,
      selectedConversationHasRecoveryContext,
      selectedConversationIsInterested,
      selectedConversationIsAgenda,
      selectedConversationIsPersonal,
      selectedConversationStatusMeta,
      selectedConversationWithoutWhatsapp,
      selectedVendasAgendaDraftMessage,
      selectedId,
      selectedStatus,
      saveCustomerConversationCard,
      savingCustomerConversationCard,
      scheduleCustomerReturnTomorrow,
      dropOverQueue,
      handleQueueDrop,
      sendMessage,
      sendText,
      sending,
      emojiPickerOpen,
      setEmojiPickerOpen,
      setOpenedAsset,
      replyingTo,
      setReplyingTo,
      audioPreview,
      imagePreview,
      sendAudioPreview,
      setImagePreview,
      messageReactionTargetId,
      startRecording,
      stopRecording,
      togglePersonalContact,
      toggleQueueConversationMenu,
      unblockConversation,
      updateStatus,
    ],
  );

  const addAgendaGroup = useCallback(() => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: makeClientId("agenda_group"),
          slug: `nova_guia_${current.groups.length + 1}`,
          title: `Nova guia ${current.groups.length + 1}`,
          description: "Explique rapidamente quando esse time deve ser usado.",
          buttonLabel: "Nova guia",
          actionType: "abrir_agenda",
          linkedAgendaId: "",
          customActionKey: null,
          sortOrder: current.groups.length,
          introMessage:
            "Esses sao os horarios disponiveis para {{agenda_nome}}.\n\n{{agenda_slots}}",
          emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
          noImmediateAvailabilityMessage:
            "Nao encontrei disponibilidade imediata para esta guia. Vou priorizar os proximos horarios futuros.",
          linkedEmail: String(currentUserProfile?.email || "").trim().toLowerCase(),
          linkedUserName: String(currentUserProfile?.name || "").trim(),
          connectionStatus: currentUserProfile?.email ? "pending" : "not_linked",
          accentColor: ["#4da36f", "#5d83ff", "#e57b47", "#9b59b6"][current.groups.length % 4],
          isActive: true,
          workdays: [1, 2, 3, 4, 5],
          visibleBusinessDays: 7,
          searchWindowDays: 7,
          suggestedSlotsCount: 3,
          fallbackFutureSlotsCount: 3,
          simpleMode: false,
          capacityPerDay: 1,
          reminderMinutes: 60,
          slots: [],
        },
      ],
    }));
  }, [currentUserProfile?.email, currentUserProfile?.name]);

  const removeAgendaGroup = useCallback((groupId: string) => {
    setAgendaDirty(true);
    const actionId = buildAgendaActionId(groupId);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    setBotConfig((current) => {
      const next = removeButtonFromSections(current, actionId);
      return {
        ...next,
        actionCatalog: next.actionCatalog.map((action) =>
          action.agendaGroupId === groupId ? { ...action, agendaGroupId: null } : action,
        ),
      };
    });
  }, []);

  const resetBotAgendaToDefault = useCallback(() => {
    setAgendaDirty(true);
    setBotConfigDirtyFromAgendaReset(true);
    setAgendaConfig(normalizeAgendaConfig(DEFAULT_ATENDIMENTO_AGENDA_CONFIG));
    setBotConfig((current) => ({
      ...current,
      actionCatalog: current.actionCatalog.map((action) =>
        ["schedule_service", "reschedule_service", "cancel_appointment"].includes(action.actionId)
          ? { ...action, agendaGroupId: "agenda_glauco" }
          : action,
      ),
    }));
  }, []);

  const configureSimpleGlaucoAgenda = useCallback(() => {
    const email = String(currentUserProfile?.email || "").trim().toLowerCase();
    const name = String(currentUserProfile?.name || "Glauco").trim() || "Glauco";
    setAgendaDirty(true);
    setBotConfigDirtyFromAgendaReset(true);
    setAgendaConfig((current) => {
      const base = normalizeAgendaConfig(DEFAULT_ATENDIMENTO_AGENDA_CONFIG).groups[0];
      const simpleGroup = {
        ...base,
        linkedEmail: email,
        linkedUserName: name,
        connectionStatus: email ? ("pending" as const) : ("not_linked" as const),
      };
      const groups = current.groups.some((group) => group.id === "agenda_glauco")
        ? current.groups.map((group) => (group.id === "agenda_glauco" ? { ...group, ...simpleGroup } : group))
        : [simpleGroup, ...current.groups].map((group, index) => ({ ...group, sortOrder: index }));
      return normalizeAgendaConfig({ ...current, groups });
    });
    setBotConfig((current) => ({
      ...current,
      actionCatalog: current.actionCatalog.map((action) =>
        ["schedule_service", "reschedule_service", "cancel_appointment"].includes(action.actionId)
          ? { ...action, agendaGroupId: "agenda_glauco" }
          : action,
      ),
    }));
  }, [currentUserProfile?.email, currentUserProfile?.name]);

  const updateAgendaGroup = useCallback(
    (
      groupId: string,
      field: AgendaGroupEditableField,
      value: string | boolean | number | number[],
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, [field]: value } : group,
        ),
      }));
    },
    [],
  );

  const moveAgendaGroup = useCallback((groupId: string, direction: -1 | 1) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => {
      const index = current.groups.findIndex((group) => group.id === groupId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.groups.length) return current;
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(nextIndex, 0, group);
      return {
        ...current,
        groups: groups.map((item, itemIndex) => ({
          ...item,
          sortOrder: itemIndex,
        })),
      };
    });
  }, []);

  const linkAgendaToCurrentUser = useCallback(
    (groupId: string) => {
      const email = String(currentUserProfile?.email || "").trim().toLowerCase();
      if (!email) return;
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                linkedEmail: email,
                linkedUserName: String(currentUserProfile?.name || "").trim(),
                connectionStatus: "pending",
              }
            : group,
        ),
      }));
    },
    [currentUserProfile?.email, currentUserProfile?.name],
  );

  const addAgendaSlot = useCallback((groupId: string) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              slots: [
                ...group.slots,
                {
                  id: makeClientId(`${groupId}_slot`),
                  label: "Novo horario",
                  dayOfWeek: 1,
                  startTime: "09:00",
                  endTime: "10:00",
                  enabled: true,
                },
              ],
            }
          : group,
      ),
    }));
  }, []);

  const removeAgendaSlot = useCallback((groupId: string, slotId: string) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, slots: group.slots.filter((slot) => slot.id !== slotId) }
          : group,
      ),
    }));
  }, []);

  const updateAgendaSlot = useCallback(
    (
      groupId: string,
      slotId: string,
      field: "label" | "dayOfWeek" | "startTime" | "endTime" | "enabled",
      value: string | number | boolean,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                slots: group.slots.map((slot) =>
                  slot.id === slotId ? { ...slot, [field]: value } : slot,
                ),
              }
            : group,
        ),
      }));
    },
    [],
  );

  const updateAgendaHolidays = useCallback((holidays: string[]) => {
    setAgendaConfig((current) => ({
      ...current,
      holidays: holidays.sort(),
    }));
  }, []);

  const updateAgendaInitialMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["initialMessage"],
      value: string,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        initialMessage: {
          ...current.initialMessage,
          [field]: value,
        },
      }));
    },
    [],
  );

  const updateAgendaFlowMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["flowMessages"],
      value: string,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        flowMessages: {
          ...current.flowMessages,
          [field]: value,
        },
      }));
    },
    [],
  );

  const loadAgendaHolidaysFromAPI = useCallback(async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    try {
      const holidays = await fetchBrazilianHolidays(currentYear);
      if (holidays.length === 0) {
        setError("Nenhum feriado encontrado para o ano atual.");
        return;
      }
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        holidays: Array.from(new Set([...current.holidays, ...holidays])).sort(),
      }));
      setNotice({ tone: "success", text: `${holidays.length} feriados carregados com sucesso.` });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar feriados.";
      setError(message);
    }
  }, []);

  const saveAgenda = useCallback(async () => {
    setSavingAgenda(true);
    setError(null);
    if (botConfigDirtyFromAgendaReset && !requireBotAi()) {
      setSavingAgenda(false);
      return;
    }
    try {
      const payload = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda", {
        method: "PATCH",
        body: JSON.stringify(agendaConfig),
      });
      if (botConfigDirtyFromAgendaReset) {
        const botPayload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
          method: "PATCH",
          body: JSON.stringify(sanitizeBotConfigForCurrentTenant(botConfig)),
        });
        setBotConfig(sanitizeBotConfigForCurrentTenant(botPayload));
        setBotConfigDirtyFromAgendaReset(false);
      }
      setAgendaConfig(normalizeAgendaConfig(payload));
      setAgendaDirty(false);
      setNotice({ tone: "success", text: "Agenda salva com sucesso." });
    } catch (saveError) {
      if (openBotPlansFromError(saveError)) return;
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar agenda.";
      setError(message);
    } finally {
      setSavingAgenda(false);
    }
  }, [agendaConfig, botConfig, botConfigDirtyFromAgendaReset, openBotPlansFromError, requireBotAi, sanitizeBotConfigForCurrentTenant]);

  const simulateAgendaFlow = useCallback(
    async (payload: AtendimentoAgendaSimulationPayload) => {
      return apiFetch<AtendimentoAgendaSimulationResult>("/inbox/agenda/simulate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    [],
  );

  const syncBotConfig = useCallback((nextConfig: AtendimentoBotConfig) => {
    setBotConfig(sanitizeBotConfigForCurrentTenant(nextConfig));
  }, [sanitizeBotConfigForCurrentTenant]);

  const saveBot = useCallback(async (nextConfig: AtendimentoBotConfig = botConfig) => {
    if (!requireBotAi()) return;
    setSavingBot(true);
    setError(null);
    const sanitizedNextConfig = sanitizeBotConfigForCurrentTenant(nextConfig);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(sanitizedNextConfig),
      });
      const normalized = sanitizeBotConfigForCurrentTenant(payload);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      setNotice({ tone: "success", text: "Editor do bot salvo com sucesso." });
    } catch (saveError) {
      if (openBotPlansFromError(saveError)) return;
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar editor.";
      setError(message);
    } finally {
      setSavingBot(false);
    }
  }, [botConfig, openBotPlansFromError, requireBotAi, sanitizeBotConfigForCurrentTenant]);

  function scheduleAlertCollapse(
    key: InboxAlertKind | "system_notice",
    timerRef: { current: number | null },
  ) {
    if (typeof window === "undefined") return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setExpandedAlerts((current) => ({ ...current, [key]: false }));
    }, 5000);
  }

  useEffect(() => {
    if (!selectedConversation || !chatTimelineRef.current) return;
    if (typeof window === "undefined") return;
    const timeline = chatTimelineRef.current;
    const scrollToBottom = () => {
      timeline.scrollTop = timeline.scrollHeight;
    };
    const frame = window.requestAnimationFrame(scrollToBottom);
    const shortTimer = window.setTimeout(scrollToBottom, 80);
    const mediaTimer = window.setTimeout(scrollToBottom, 300);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(shortTimer);
      window.clearTimeout(mediaTimer);
    };
  }, [latestVisibleMessageKey, selectedConversation?.id]);

  // Clear composer state when switching conversations
  useEffect(() => {
    setReplyingTo(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setOpenedAsset(null);
    setSendText("");
    sendTextDirtyRef.current = false;
    setQueueActionConversationId(null);
    setMessageReactionTargetId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !requestedSupportPhone || !requestedSupportMessage) return;
    const normalizedSearch = conversationSearch.replace(/\D/g, "");
    if (normalizedSearch !== requestedSupportPhone) return;
    setSendText((current) => {
      if (String(current || "").trim()) return current;
      sendTextDirtyRef.current = true;
      return requestedSupportMessage;
    });
  }, [conversationSearch, requestedSupportMessage, requestedSupportPhone, selectedId]);

  useEffect(() => {
    if (!selectedId || selectedBlocked || !selectedVendasAgendaDraftMessage) return;
    setSendText((current) => {
      const normalizedCurrent = String(current || "").trim();
      if (sendTextDirtyRef.current && normalizedCurrent) return current;
      if (normalizedCurrent && normalizedCurrent !== selectedVendasAgendaDraftMessage) return current;
      sendTextDirtyRef.current = false;
      return selectedVendasAgendaDraftMessage;
    });
  }, [selectedBlocked, selectedId, selectedVendasAgendaDraftMessage]);

  useEffect(() => {
    if (humanAlertTimerRef.current !== null) {
      window.clearTimeout(humanAlertTimerRef.current);
      humanAlertTimerRef.current = null;
    }
    if (humanAttentionConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, human_queue: false }));
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      previousHumanCountRef.current = 0;
      return;
    }
    if (humanAttentionConversations.length > previousHumanCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      setExpandedAlerts((current) => ({ ...current, human_queue: true }));
      scheduleAlertCollapse("human_queue", humanAlertTimerRef);
    }
    previousHumanCountRef.current = humanAttentionConversations.length;
  }, [humanAttentionConversations.length]);

  useEffect(() => {
    const live = loadingList || loadingConversation || loadingMoreConversations || loadingBot || loadingAgenda || prospectingAutomationLoading;
    if (!live) {
      setAtendimentoVisualCount(0);
      clearTopbarProgress("atendimento");
      return undefined;
    }
    const target = Math.max(1, conversations.length || 12);
    setAtendimentoVisualCount(1);
    const timer = window.setInterval(() => {
      setAtendimentoVisualCount((current) => Math.min(target, current + 1));
    }, 220);
    return () => window.clearInterval(timer);
  }, [
    conversations.length,
    loadingAgenda,
    loadingBot,
    loadingConversation,
    loadingList,
    loadingMoreConversations,
    prospectingAutomationLoading,
  ]);

  useEffect(() => {
    const live = loadingList || loadingConversation || loadingMoreConversations || loadingBot || loadingAgenda || prospectingAutomationLoading;
    if (!live || notice || error) return;
    const progress = loadingList ? 28 : loadingConversation ? 54 : loadingMoreConversations ? 66 : prospectingAutomationLoading ? 74 : 42;
    const title = loadingList
      ? "Carregando Atendimento"
      : prospectingAutomationLoading
        ? "Sincronizando Prospecção"
        : loadingBot
          ? "Lendo Bot IA"
          : loadingAgenda
            ? "Lendo Agenda"
            : "Atualizando conversa";
    dispatchTopbarProgress({
      source: "atendimento",
      phase: "loading",
      title,
      status: "Motores ligando: lendo banco, filtrando bloqueios e preparando conversas elegíveis.",
      progress,
      steps: ATENDIMENTO_PROGRESS_STEPS,
      activeStepIndex: loadingList ? 0 : loadingConversation ? 2 : 3,
      cardFeed: conversations.slice(0, Math.max(1, atendimentoVisualCount)).slice(-4).map((conversation) => ({
        id: `atendimento:${conversation.id}`,
        title: resolveInboxConversationDisplayName(conversation) || "Conversa",
        meta: getInboxConversationQueue(conversation),
        score: getInboxConversationUnreadCount(conversation) || undefined,
      })),
      metrics: [
        { label: "Conversas", value: String(conversations.length) },
        { label: "Fila", value: inboxQueue },
        { label: "Novas", value: String(newInboundConversations.length) },
      ],
    });
  }, [
    atendimentoVisualCount,
    conversations,
    error,
    inboxQueue,
    loadingAgenda,
    loadingBot,
    loadingConversation,
    loadingList,
    loadingMoreConversations,
    newInboundConversations.length,
    notice,
    prospectingAutomationLoading,
  ]);

  useEffect(() => {
    if (newAlertTimerRef.current !== null) {
      window.clearTimeout(newAlertTimerRef.current);
      newAlertTimerRef.current = null;
    }
    if (newInboundConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, new_message: false }));
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      previousNewCountRef.current = 0;
      return;
    }
    if (newInboundConversations.length > previousNewCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      setExpandedAlerts((current) => ({ ...current, new_message: true }));
      scheduleAlertCollapse("new_message", newAlertTimerRef);
    }
    previousNewCountRef.current = newInboundConversations.length;
  }, [newInboundConversations.length]);

  useEffect(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (!notice) {
      setExpandedAlerts((current) => ({ ...current, system_notice: false }));
      clearTopbarProgress("atendimento-notice");
      return;
    }
    setExpandedAlerts((current) => ({ ...current, system_notice: true }));
    if (typeof window === "undefined") return;
    dispatchTopbarProgress({
      source: "atendimento-notice",
      phase: notice.tone === "error" ? "warning" : "success",
      title: notice.text,
      status: notice.tone === "error" ? "Ação não concluída no atendimento." : "Atendimento atualizado.",
      progress: notice.tone === "error" ? 74 : 100,
      metrics: [{ label: notice.tone === "error" ? "Atenção" : "Status", value: notice.tone === "info" ? "Aviso" : notice.tone === "error" ? "Erro" : "OK" }],
    });
    noticeTimerRef.current = window.setTimeout(() => {
      setExpandedAlerts((current) => ({ ...current, system_notice: false }));
      setNotice(null);
      noticeTimerRef.current = null;
    }, 5000);
  }, [notice]);

  useEffect(() => {
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (!error) {
      clearTopbarProgress("atendimento-error");
      return;
    }
    if (typeof window === "undefined") return;
    dispatchTopbarProgress({
      source: "atendimento-error",
      phase: "warning",
      title: error,
      status: "Ação não concluída no atendimento.",
      progress: 68,
      metrics: [{ label: "Status", value: "Atenção" }],
    });
    errorTimerRef.current = window.setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, 6500);
  }, [error]);

  useEffect(
    () => () => {
      [humanAlertTimerRef, newAlertTimerRef, noticeTimerRef, errorTimerRef].forEach((timerRef) => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
      });
    },
    [],
  );

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <>
      <DashboardScaffold
        title="Atendimento"
        description="Centralize conversas para não perder vendas."
        hideHeader={true}
        hideNavigationRail={true}
        layoutMode="workspace"
      >
        {whatsappAccessBlocked ? (
          <section className={styles.whatsappAccessGate}>
            <div className={styles.whatsappAccessGatePanel}>
              <span className={styles.whatsappAccessGateKicker}>WhatsApp desconectado</span>
              <h1>Atendimento fechado</h1>
              <p>Vincule um celular por QR Code ou conecte a Meta para acessar as conversas do Atendimento.</p>
              <div className={styles.whatsappAccessGateActions}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => window.dispatchEvent(new CustomEvent("hbx:open-whatsapp-qr", { detail: { focus: "qr" } }))}
                >
                  Conectar WhatsApp
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void bootstrapInbox({ take: INBOX_CONVERSATION_LIST_LIMIT })}
                >
                  Verificar novamente
                </button>
              </div>
            </div>
          </section>
        ) : activeTab === "messages" ? (
          <section className={styles.premiumInboxShell} data-ui-no-reveal="true">
            <section className={styles.inboxCanvas}>
              <div className="hbx-guide4-slot">
              <aside className={`${styles.commandDock} hbx-guide4`}>
                <div className={styles.commandDockTop}>
                  <button
                    type="button"
                    className={styles.commandDockBrand}
                    data-active={globalBotEnabled ? "true" : "false"}
                    onClick={() => void toggleGlobalBot()}
                    aria-label={
                      botAiActive
                        ? !botSetupComplete
                          ? "Configurar Bot antes de ativar"
                          : globalBotEnabled
                            ? "Desativar Bot global"
                            : "Ativar Bot global"
                        : "Ver planos do Bot de atendimento"
                    }
                    title={
                      botAiActive
                        ? !botSetupComplete
                          ? "Concluir configuração guiada do Bot"
                          : globalBotEnabled
                            ? "Bot global ativo"
                            : "Bot global desativado"
                        : "Bot de atendimento está disponível no HBX Full — Bot e IA"
                    }
                  >
                    <span>Hbot</span>
                  </button>
                  <button
                    type="button"
                    className={styles.commandDockRobotButton}
                    data-busy={prospectingAutomationLoading ? "true" : "false"}
                    data-enabled={globalBotEnabled ? "true" : "false"}
                    data-tone={prospectingRobotTone}
                    onClick={() => handleSectionChange("automacao")}
                    aria-label="Abrir automação de prospecção"
                    title="Automação de prospecção"
                  >
                    <RobotIcon className={styles.commandDockRobotIcon} />
                    {globalBotEnabled ? (
                      <span className={styles.commandDockRobotStatus} aria-hidden="true" />
                    ) : null}
                    {nextProspectionSendAt ? <ProspectionCountdownBadge targetAt={nextProspectionSendAt} /> : null}
                  </button>
                </div>
                <div className={styles.commandDockNav}>
                  <DockButton
                    icon="note"
                    label="Conversas"
                    active={activeDockSection === "conversa"}
                    badge={newInboundConversations.length || null}
                    onClick={() => {
                      if (inboxQueueRef.current === "blocked") {
                        inboxQueueRef.current = "all";
                        setInboxQueue("all");
                      }
                      handleSectionChange("conversa");
                    }}
                  />
                  <DockButton
                    icon="shield"
                    label="Bloqueados"
                    active={activeDockSection === "bloqueados"}
                    badge={queueCounts.blocked || null}
                    onClick={openBlockedConversations}
                  />
                  {hasRecoveryCapability ? (
                    <DockButton
                      icon="wallet"
                      label="Financeiro"
                      active={activeDockSection === "financeiro"}
                      badge={queueCounts.recovery || null}
                      onClick={() => {
                        if (inboxQueueRef.current === "blocked") {
                          inboxQueueRef.current = "all";
                          setInboxQueue("all");
                        }
                        handleSectionChange("financeiro");
                      }}
                    />
                  ) : null}
                  <DockButton
                    icon="clock"
                    label="Agenda"
                    active={activeDockSection === "agenda"}
                    badge={selectedConversationIsAgenda ? "!" : null}
                    onClick={() => {
                      if (inboxQueueRef.current === "blocked") {
                        inboxQueueRef.current = "all";
                        setInboxQueue("all");
                      }
                      handleSectionChange("agenda");
                    }}
                  />
                  <DockButton
                    icon="gear"
                    label="Configurar Bot"
                    active={false}
                    badge={botAiActive && !botSetupComplete ? "!" : queueCounts.bot || null}
                    onClick={() => router.push("/atendimento/automacao?tab=flow")}
                  />
                  {providerCapabilities.canUseTemplates ? (
                    <DockButton
                      icon="spark"
                      label="Templates"
                      active={activeDockSection === "templates"}
                      badge={metaTemplates.counters.approved || null}
                      onClick={openTemplatesSettings}
                    />
                  ) : null}
                </div>
                <div className={styles.commandDockBottom}>
                  <DockButton
                    icon="user"
                    label="Operador"
                    active={false}
                    badge={null}
                    onClick={() => {
                      if (inboxQueueRef.current === "blocked") {
                        inboxQueueRef.current = "all";
                        setInboxQueue("all");
                      }
                      handleSectionChange("conversa");
                    }}
                  />
                </div>
              </aside>
              </div>

              <div className={styles.inboxStageList}>
                {inboxWorkspaceComponents.list()}
              </div>
              <div className={styles.inboxStageMain}>
                {inboxWorkspaceComponents.main()}
              </div>
              <div className={styles.inboxStageContext}>
                {inboxWorkspaceComponents.context()}
              </div>
            </section>
          </section>
        ) : null}

      </DashboardScaffold>

      {agendaStudioOpen ? (
        renderAgendaPanel()
      ) : null}

      {typeof document !== "undefined" &&
      queueActionConversationId &&
      queueActionMenuPosition
        ? createPortal(
            <div
              ref={queueActionMenuRef}
              className={`${styles.conversationQueueMetaPopup} ${styles.conversationQueueMetaPopupPortal} hbx-qr-card-pop`}
              style={{
                top: `${queueActionMenuPosition.top}px`,
                left: `${queueActionMenuPosition.left}px`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.conversationQueueMetaPopupAction}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void blockConversationById(queueActionConversationId);
                }}
              >
                Bloquear
              </button>
            </div>,
            document.body,
          )
        : null}

      {templatesStudioOpen && providerCapabilities.canUseTemplates ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Automacao</p>
                <strong>Templates Meta</strong>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadMetaTemplates(true)}>
                  Recarregar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={syncMetaTemplatesNow} disabled={syncingTemplates}>
                  {syncingTemplates ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setTemplatesStudioOpen(false);
                    router.push("/atendimento/automacao?tab=flow");
                  }}
                >
                  Configurar Bot
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>
              <TemplatesPanel
                loadingTemplates={loadingTemplates}
                syncingTemplates={syncingTemplates}
                metaTemplates={metaTemplates}
                templateComposer={templateComposer}
                creatingTemplate={creatingTemplate}
                deletingTemplateId={deletingTemplateId}
                editingTemplateLabel={editingTemplateLabel}
                onReload={() => void loadMetaTemplates(true)}
                onSync={() => void syncMetaTemplatesNow()}
                onToggleActivation={(template, active) => void toggleTemplateActivation(template, active)}
                onComposerChange={(updater) => setTemplateComposer((current) => updater(current))}
                onCreateTemplate={() => void createMetaTemplate()}
                onDeleteTemplate={(template) => void deleteMetaTemplate(template)}
                onEditTemplate={editMetaTemplate}
                onResetComposer={resetTemplateComposer}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ProspectingCampaignStudioModal
        open={campaignStudioOpen}
        config={campaignConfig}
        status={prospectingAutomationStatus}
        actionLoading={prospectingAutomationAction}
        companyName={
          currentUserProfile?.masterContext?.active
            ? currentUserProfile.masterContext.companyName || currentUserProfile?.company?.name || "HBX"
            : currentUserProfile?.company?.name || "HBX"
        }
        attendantName={currentUserProfile?.name || currentUserProfile?.username || "time comercial"}
        canActivateProspecting={globalBotEnabled}
        activationBlockedReason={
          botAiActive && botSetupComplete
            ? "Ligue o HBot no botão principal antes de ativar a Prospecção."
            : "Conclua e ligue o HBot antes de ativar a Prospecção."
        }
        onClose={() => setCampaignStudioOpen(false)}
        onChange={updateCampaignConfig}
        onSave={saveProspectingCampaignConfig}
        onStart={(configOverride) => void startProspectingCampaign(configOverride)}
        onPause={() => void runProspectingAutomationAction("pause")}
        onResume={() => void runProspectingAutomationAction("resume")}
      />

      <HbxConfirmDialog
        open={newConversationOpen}
        title="Nova conversa"
        description="Digite o telefone com DDD. O HBX cria a conversa local e você envia a primeira mensagem pelo composer."
        confirmLabel="Abrir conversa"
        busy={newConversationBusy}
        confirmDisabled={newConversationPhone.replace(/\D/g, "").length < 10}
        onCancel={() => {
          if (newConversationBusy) return;
          setNewConversationOpen(false);
        }}
        onConfirm={() => void startManualConversation()}
      >
        <label className={styles.manualConversationField}>
          <span>Telefone</span>
          <input
            autoFocus
            value={newConversationPhone}
            onChange={(event) => setNewConversationPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void startManualConversation();
            }}
            placeholder="(19) 99999-9999"
            inputMode="tel"
          />
        </label>
        <label className={styles.manualConversationField}>
          <span>Nome opcional</span>
          <input
            value={newConversationName}
            onChange={(event) => setNewConversationName(event.target.value)}
            placeholder="Nome para aparecer no HBX"
          />
        </label>
      </HbxConfirmDialog>

      <HbxConfirmDialog
        open={blockDialog !== null}
        title="Bloquear contato"
        description="O contato ficará bloqueado no Atendimento até ser liberado novamente."
        confirmLabel="Bloquear"
        destructive
        onCancel={() => setBlockDialog(null)}
        onConfirm={() => void confirmBlockConversation()}
      >
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Motivo do bloqueio
        </label>
        <textarea
          className="field min-h-24"
          value={blockDialog?.reason || ""}
          onChange={(event) =>
            setBlockDialog((current) => current ? { ...current, reason: event.target.value } : current)
          }
        />
      </HbxConfirmDialog>

      <PremiumLaunchDialog
        notice={inboxBootstrapLaunchNotice.notice}
        onOpen={closeInboxBootstrapLaunchDialog}
        progressLabel={inboxBootstrapProgressLabel}
        progressValueLabel={inboxBootstrapProgressValueLabel}
        detailRows={inboxBootstrapDetailRows}
        celebrate={inboxBootstrapCelebrate}
      />

      {whatsappSessionCleanup?.required ? (
        <HbxPopup2
          open
          tone="warning"
          title="Sessões antigas do WhatsApp"
          action={
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={whatsappSessionCleanupBusy !== null}
                onClick={() => void resolveWhatsappSessionCleanup("discard")}
              >
                {whatsappSessionCleanupBusy === "discard" ? "Limpando..." : "Não, descartar"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={whatsappSessionCleanupBusy !== null}
                onClick={() => void resolveWhatsappSessionCleanup("merge")}
              >
                {whatsappSessionCleanupBusy === "merge" ? "Mesclando..." : "Sim, mesclar"}
              </button>
            </>
          }
        >
          {`${whatsappSessionCleanup.oldSessionCount || 0} sessão(ões) antiga(s), ${whatsappSessionCleanup.oldConversationCount || 0} conversa(s) e ${whatsappSessionCleanup.oldMessageCount || 0} mensagem(ns) ficaram antes da queda. Recuperar só a última camada e limpar o restante?`}
        </HbxPopup2>
      ) : null}

      <HbxConfirmDialog
        open={deleteMessageDialog !== null}
        title="Apagar mensagem"
        description="A mensagem será apagada para todos quando o provedor aceitar a operação."
        confirmLabel="Apagar para todos"
        destructive
        onCancel={() => setDeleteMessageDialog(null)}
        onConfirm={() => void confirmDeleteSentMessage()}
      />
    </>
  );
}
