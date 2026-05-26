"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HbxQuantitySelector,
  HbxSegmentCombobox,
  HbxStateCityPicker,
} from "@/components/prospecting-filters";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppModalPayload,
  whatsappModalStatusLabel,
  whatsappModeLabel,
} from "@/lib/whatsapp-center";
import {
  bootstrapWhatsAppAfterConnect,
  buildWhatsAppBootstrapKey,
} from "@/lib/whatsapp-connection-flow";
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
import BotQrConnectionCard from "./_components/BotQrConnectionCard";
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
const GENERIC_ERROR_MESSAGE_TEMPLATE =
  "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Posso te mandar uma ideia rápida para organizar contatos e retornos no WhatsApp?";

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

const PROSPECTING_VARIABLES = [
  { token: "cumprimentacao", label: "Cumprimentação" },
  { token: "cliente", label: "Cliente" },
  { token: "empresaresumo", label: "Empresa resumo" },
  { token: "empresa", label: "Empresa" },
  { token: "funcionario", label: "Funcionário" },
  { token: "cidade", label: "Cidade" },
  { token: "estado", label: "Estado" },
  { token: "segmento", label: "Segmento" },
];

const COMPANY_LEGAL_SUFFIXES = new Set([
  "ltda",
  "me",
  "mei",
  "eireli",
  "epp",
  "sa",
  "s/a",
  "ss",
]);

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
const COMPANY_CONNECTORS = new Set(["e", "de", "da", "do", "das", "dos"]);

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
    if (!selected.length && removedGenericPrefix && COMPANY_DESCRIPTOR_AFTER_GENERIC.has(normalized)) {
      continue;
    }
    selected.push(word);
  }

  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[0]))) selected.shift();
  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[selected.length - 1]))) selected.pop();

  const compact = selected.slice(0, 4).join(" ") || words.slice(0, 3).join(" ");
  return smartCompanyTitle(compact);
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

function renderProspectingPreview(
  template: string,
  config: ProspectingAutomationConfig,
  variables: ProspectingPreviewVariables,
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
  };
  return String(template || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => values[token] || `[${token}]`)
    .trim();
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
    maxAttemptsPerLead: 1,
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
  const messageTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const optOutMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const messageTemplateHasLink = hasFirstContactLink(config.messageTemplate);
  const sanitizedMessagePreview = sanitizeFirstContactPreview(config.messageTemplate) || GENERIC_ERROR_MESSAGE_TEMPLATE;
  const cityRequired = requiresProspectingCity(config);
  const radarSourceReady = Boolean(config.city.trim() && config.segment.trim());
  const radarSourceLabel = radarSourceReady
    ? `${config.segment.trim()} · ${config.city.trim()}${config.state.trim() ? `/${config.state.trim().toUpperCase()}` : ""}`
    : "Selecione uma fonte do Radar";

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
  const setListField = (field: "positiveIntentKeywords" | "negativeIntentKeywords", value: string) => {
    onChange((current) => ({ ...current, [field]: normalizeTextList(value, current[field]) }));
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
          <span className={styles.sectionEyebrow}>Campanha WhatsApp</span>
          <h3 className={styles.cardTitle}>{liveStatus?.text || "Fonte Radar pronta"}</h3>
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
              <strong>Fonte Radar</strong>
            </div>
          </div>
          <div className={styles.radarSourceCard} data-ready={radarSourceReady ? "true" : "false"}>
            <span>Radar Digital</span>
            <strong>{radarSourceLabel}</strong>
            <button type="button" className={styles.inlineGhostButton} onClick={() => { window.location.href = "/radar-digital"; }}>
              Abrir Radar
            </button>
          </div>
          <div className={styles.prospectingFormGrid}>
            <div className={styles.prospectingWideField}>
              <HbxStateCityPicker
                state={config.state}
                city={config.city}
                onStateChange={setStateField}
                onCityChange={(value) => setField("city", value)}
                requiredCity={cityRequired}
                helperText=""
              />
            </div>
            <HbxSegmentCombobox
              value={config.segment}
              onChange={(value) => setField("segment", value)}
              helperText=""
            />
            <HbxQuantitySelector
              value={config.dailyLimit}
              onChange={(value) => setNumberField("dailyLimit", String(value), 1)}
              options={[10, 15, 20, 30, 40, 50]}
              limitLabel="Novos contatos por dia"
            />
          </div>
        </section>

        <section className={styles.prospectingPanel}>
          <div className={styles.editorSectionHeader}>
            <div>
              <strong>Janela de envio</strong>
            </div>
          </div>
          <div className={styles.prospectingFormGrid}>
            <label>
              <span>Início</span>
              <input className={styles.inputField} type="time" value={config.workingHoursStart} onChange={(event) => setField("workingHoursStart", event.target.value)} />
            </label>
            <label>
              <span>Fim</span>
              <input className={styles.inputField} type="time" value={config.workingHoursEnd} onChange={(event) => setField("workingHoursEnd", event.target.value)} />
            </label>
          </div>
        </section>

        <section className={`${styles.prospectingPanel} ${styles.prospectingMessagePanel}`}>
        <div className={styles.prospectingMessageWorkbench}>
          <div className={styles.prospectingMessageEditorStack}>
            <div className={styles.editorSectionHeader}>
              <div>
                <strong>Mensagem inicial</strong>
                <span>Sem link no primeiro contato. O backend remove automaticamente.</span>
              </div>
            </div>
            <div className={styles.prospectingMessageGrid}>
              <label className={styles.prospectingWideField}>
                <span>Mensagem inicial</span>
                <textarea
                  ref={messageTemplateRef}
                  className={styles.editorTextarea}
                  value={config.messageTemplate}
                  onFocus={() => setVariableTarget("messageTemplate")}
                  onChange={(event) => {
                    setField("messageTemplate", event.target.value);
                  }}
                />
                <small>Primeiro contato não envia links automaticamente. Links só depois que a pessoa responder.</small>
              </label>
            </div>
            {messageTemplateHasLink ? (
              <div className={styles.riskNotice}>
                O link será removido no primeiro contato para proteger o número.
              </div>
            ) : null}
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
        <details className={styles.prospectingAdvanced}>
          <summary>Ajustes avançados</summary>
          <div className={styles.prospectingAdvancedGrid}>
            <label>
              <span>Intervalo entre envios</span>
              <input className={styles.inputField} type="number" min={1} value={config.intervalMinutes} onChange={(event) => setNumberField("intervalMinutes", event.target.value, 1)} />
            </label>
            <label>
              <span>Typing</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingSeconds} onChange={(event) => setNumberField("typingSeconds", event.target.value, 0)} />
            </label>
            <label>
              <span>Variação</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingVarianceSeconds} onChange={(event) => setNumberField("typingVarianceSeconds", event.target.value, 0)} />
            </label>
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
            <label className={styles.toggleCard}>
              <span>
                <strong>Responder encerramento negativo</strong>
              </span>
              <input type="checkbox" checked={config.optOutReplyEnabled} onChange={(event) => setField("optOutReplyEnabled", event.target.checked)} />
            </label>
            <label className={styles.prospectingWideField}>
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
        </details>
        <div className={styles.variablePreviewCard} aria-label="Valores atuais das variáveis">
          <div>
            <span>{"{{empresaresumo}}"}</span>
            <strong>{summarizeCompanyName("Empresa de Máquinas Agrícolas e Pesados LTDA")}</strong>
          </div>
          <div>
            <span>{"{{funcionario}}"}</span>
            <strong>{previewVariables.funcionario}</strong>
          </div>
          <div>
            <span>{"{{empresa}}"}</span>
            <strong>{previewVariables.empresa}</strong>
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
      </div>

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
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionAction, setConnectionAction] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<BotQrWorkspaceTab>("flow");
  const [connectionPaired, setConnectionPaired] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [prospectingConfig, setProspectingConfig] = useState<ProspectingAutomationConfig>(DEFAULT_PROSPECTING_CONFIG);
  const [prospectingStatus, setProspectingStatus] = useState<ProspectingAutomationLiveStatus | null>(null);
  const [, setProspectingLoading] = useState(false);
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
  const connectionBootstrapInFlightRef = useRef(false);
  const lastConnectionBootstrapKeyRef = useRef<string | null>(null);
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

  const ensureConnectionQrMode = useCallback(async () => {
    if (centerPayload?.center.mode === "QR") return centerPayload;
    const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
      method: "PATCH",
      body: JSON.stringify({ mode: "QR" }),
    });
    setCenterPayload(next);
    return next;
  }, [centerPayload]);

  const runConnectionAction = useCallback(async (action: "generate_qr" | "reconnect" | "disconnect") => {
    if (connectionAction) return;
    setConnectionAction(action);
    setNotice(null);
    try {
      let nextPayload: WhatsAppModalPayload;

      if (action === "disconnect") {
        nextPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/disconnect", {
          method: "POST",
        });
      } else {
        const requestQrOnly =
          action === "generate_qr" &&
          modalPayload !== null &&
          modalPayload.status === "waiting_qr" &&
          !modalPayload.data.qrCodeDataUrl;

        if (!requestQrOnly) {
          await ensureConnectionQrMode();
        }

        nextPayload = requestQrOnly
          ? await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr")
          : await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/start", {
              method: "POST",
            });

        if (shouldLoadModalQr(nextPayload, true) && !nextPayload.data.qrCodeDataUrl) {
          const qrPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
          nextPayload = mergeModalPayload(nextPayload, qrPayload);
        }
      }

      setModalPayload(nextPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (planRedirect) {
        setNotice({ tone: "error", text: nextPayload.message });
        router.push(planRedirect);
        return;
      }

      dispatchModulesChanged({
        reason: action === "disconnect" ? "whatsapp_disconnected" : "whatsapp_connection_updated",
      });
      setNotice({
        tone: nextPayload.success ? "success" : "error",
        text:
          action === "disconnect"
            ? "WhatsApp desconectado."
            : nextPayload.data.qrCodeDataUrl
              ? "QR pronto para leitura."
              : nextPayload.status === "connected"
                ? "WhatsApp conectado."
                : nextPayload.message || "Solicitação enviada ao motor WhatsApp.",
      });
      void loadConnection(true, action !== "disconnect");
    } catch (actionError) {
      setNotice({
        tone: "error",
        text: actionError instanceof Error ? actionError.message : "Falha ao atualizar a conexão WhatsApp.",
      });
    } finally {
      setConnectionAction(null);
    }
  }, [connectionAction, ensureConnectionQrMode, loadConnection, modalPayload, router]);

  const runConnectionBootstrapAfterConnect = useCallback(async (payload: WhatsAppModalPayload) => {
    const bootstrapKey = buildWhatsAppBootstrapKey(payload);
    if (
      payload.status !== "connected" ||
      connectionBootstrapInFlightRef.current ||
      lastConnectionBootstrapKeyRef.current === bootstrapKey
    ) {
      return;
    }

    connectionBootstrapInFlightRef.current = true;
    lastConnectionBootstrapKeyRef.current = bootstrapKey;
    setNotice({ tone: "info", text: "Espelhando conversas e clientes..." });

    try {
      await bootstrapWhatsAppAfterConnect(payload);
      setNotice({ tone: "success", text: "WhatsApp conectado. Fila atualizada." });
      void loadConnection(true, false);
    } catch (bootstrapError) {
      setNotice({
        tone: "error",
        text: bootstrapError instanceof Error
          ? bootstrapError.message
          : "WhatsApp conectou, mas falhou ao espelhar conversas e clientes.",
      });
    } finally {
      connectionBootstrapInFlightRef.current = false;
    }
  }, [loadConnection]);

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
    const requestedMode = String(searchParams.get("mode") || "").trim().toLowerCase();
    if (requestedMode === "mobile") {
      router.replace("/vendas");
      return;
    }
    if (requestedTab === "prospeccao") {
      router.replace("/atendimento?atendimentoSection=automacao");
      return;
    }
    if (
      requestedTab === "connection" ||
      requestedTab === "atendimento" ||
      requestedTab === "flow" ||
      requestedTab === "recovery"
    ) {
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

    if (
      activeTab === "connection" &&
      modalPayload?.status === "connected" &&
      previousStatus &&
      previousStatus !== "connected"
    ) {
      void runConnectionBootstrapAfterConnect(modalPayload);
    }

    if (currentStatus !== "connected" || previousStatus === "connected") return;

    dispatchModulesChanged({ reason: "whatsapp_connected" });
    if (!previousStatus) return;

    setConnectionPaired(true);
    window.dispatchEvent(new Event(QR_PAIRED_EVENT));
    const timer = window.setTimeout(() => setConnectionPaired(false), 3200);
    return () => window.clearTimeout(timer);
  }, [activeTab, modalPayload, runConnectionBootstrapAfterConnect]);

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
        const message = "Informe a cidade da Fonte Radar.";
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
              connectionPanel={
                <BotQrConnectionCard
                  loading={connectionLoading}
                  actionLoading={connectionAction}
                  error={modalPayload?.data.lastError || null}
                  statusLabel={modalPayload ? whatsappModalStatusLabel(modalPayload.status) : centerPayload?.center.statusLabel || "Em leitura"}
                  centerModeLabel={whatsappModeLabel(centerPayload?.center.mode)}
                  mainNote={modalPayload?.message || centerPayload?.center.statusHint || "Conecte por QR ou WebWhats sem sair da Automação."}
                  phone={modalPayload?.data.phone || centerPayload?.center.qrConnection.displayNumber || null}
                  updatedAt={modalPayload?.data.updatedAt || centerPayload?.generatedAt || null}
                  connectedAt={modalPayload?.data.connectedAt || centerPayload?.center.qrConnection.connectedAt || null}
                  qrCodeDataUrl={modalPayload?.data.qrCodeDataUrl || centerPayload?.center.qrConnection.qrCodeDataUrl || null}
                  isQrPrimary={centerPayload?.center.mode === "QR"}
                  onGenerateQr={() => void runConnectionAction("generate_qr")}
                  onReconnect={() => void runConnectionAction("reconnect")}
                  onDisconnect={() => void runConnectionAction("disconnect")}
                  onRefresh={() => void loadConnection(false, true)}
                />
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
