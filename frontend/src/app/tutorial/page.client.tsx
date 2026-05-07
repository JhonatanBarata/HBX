"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import WhatsAppOperationalDialog from "@/components/WhatsAppOperationalDialog";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import {
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  normalizeBotConfig,
  type AtendimentoBotConfig,
  type AtendimentoBotType,
} from "@/app/atendimento/inbox-model";
import type { CommercialPlansPayload } from "@/lib/commercial-plans";
import { mergeThemeConfigChain, playThemeWaveTransition, type HbxThemeSelection } from "@/lib/design-tokens";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import {
  getProviderCapabilitiesFromWhatsAppCenter,
  getProviderLabel,
  type ChannelProvider,
} from "@/lib/provider-capabilities";
import { HBX_THEME_IDS, HBX_THEME_PALETTES, type HbxThemeId, type HbxThemeMode } from "@/lib/theme-palettes";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppDiagnosticFocus,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import { dispatchModulesChanged } from "@/lib/module-events";
import styles from "./page.module.css";
import finalBotDark from "../../../cards/Tutorial/RDARK.png";
import finalBotLight from "../../../cards/Tutorial/RLIGHT.png";

type TutorialStep =
  | "theme"
  | "webscraping"
  | "vendas"
  | "atendimento"
  | "whatsapp-config"
  | "qr"
  | "bot-type"
  | "bot-channel"
  | "bot-voice"
  | "bot-rules"
  | "bot-review"
  | "bot-built"
  | "final";
type OperationalStatusChip = {
  key: "token" | "meta" | "webwhats" | "payment" | "access";
  active: boolean;
  value?: string | null;
  tone?: string | null;
};
type OperationalStatusPayload = {
  statuses?: OperationalStatusChip[];
};

const TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:v1";
const STEP_TRANSITION_MS = 760;
const TUTORIAL_STEP_ORDER: TutorialStep[] = [
  "theme",
  "webscraping",
  "vendas",
  "atendimento",
  "whatsapp-config",
  "qr",
  "bot-type",
  "bot-channel",
  "bot-voice",
  "bot-rules",
  "bot-review",
  "bot-built",
  "final",
];

function hasModule(modules: UserModule[], key: string) {
  return modules.some((moduleItem) => {
    const normalized = normalizeUserModuleKey(moduleItem.key);
    return normalized === key && moduleItem.accessible && moduleItem.visible !== false;
  });
}

function isWhatsAppConnected(center: WhatsAppCenterPayload | null, modal: WhatsAppModalPayload | null, operational: OperationalStatusPayload | null) {
  if (modal?.status === "connected") return true;
  if (center?.center.official.connected) return true;
  if (center?.center.qrConnection.liveStatus === "connected") return true;
  return Boolean((operational?.statuses || []).find((chip) => (chip.key === "meta" || chip.key === "webwhats") && chip.active));
}

function stepIndex(step: TutorialStep) {
  return TUTORIAL_STEP_ORDER.indexOf(step);
}

function firstAvailableStep(input: { hasWebscraping: boolean; hasVendasAccess: boolean; hasAtendimento: boolean }): TutorialStep {
  if (input.hasWebscraping) return "webscraping";
  if (input.hasVendasAccess) return "vendas";
  if (input.hasAtendimento) return "atendimento";
  return "final";
}

function getNextThemeId(themeId: HbxThemeId) {
  const currentIndex = HBX_THEME_IDS.indexOf(themeId);
  return HBX_THEME_IDS[(currentIndex + 1) % HBX_THEME_IDS.length];
}

function tutorialStepPage(step: TutorialStep) {
  const index = stepIndex(step);
  return index >= 0 && index < 6 ? index + 1 : null;
}

type BotSetupDraft = {
  botType: TutorialBotType;
  responseStyle: "support" | "prospecting" | "recovery";
  unknownHandling: "human" | "menu";
  businessHoursMode: "always" | "business";
  firstContactRules: TutorialFirstContactRules;
  messages: BotMessageDraft;
};

type TutorialBotType = Extract<AtendimentoBotType, "atendimento" | "prospeccao" | "recovery">;

type TutorialFirstContactRules = {
  canInitiateConversation: boolean;
  messageIntervalSeconds: number;
  nextContactDelayMinutes: number;
  replyDelaySeconds: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  maxFirstContactsPerHour: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxFollowUps: number;
  followUpDelayHours: number;
  requireOptIn: boolean;
  stopIntentKeywords: string[];
  positiveIntentKeywords: string[];
  optOutMessage: string;
  handoffPolicy: string;
};

type BotMessageDraft = {
  morning: string;
  afternoon: string;
  night: string;
  welcomeMessage: string;
  returningCustomerMessage: string;
  mainMenuPrompt: string;
  recoveryDetectedMessage: string;
  primaryButtonLabel: string;
  agendaButtonLabel: string;
  infoButtonLabel: string;
  humanButtonLabel: string;
  primaryResponse: string;
  infoResponse: string;
  postActionPrompt: string;
  humanAckMessage: string;
  closeTopicMessage: string;
};

const DEFAULT_BOT_SETUP_DRAFT: BotSetupDraft = {
  botType: "atendimento",
  responseStyle: "support",
  unknownHandling: "human",
  businessHoursMode: "always",
  firstContactRules: getDefaultFirstContactRules("atendimento"),
  messages: getDefaultBotMessages("atendimento"),
};

const BOT_TYPE_OPTIONS: Array<{
  id: TutorialBotType;
  title: string;
  description: string;
  lockReason?: string;
}> = [
  {
    id: "atendimento",
    title: "Atendimento",
    description: "Responde quem chamou, mantém contexto, agenda e passa para humano quando precisa.",
  },
  {
    id: "prospeccao",
    title: "Prospecção",
    description: "Inicia conversas com leads, respeita cadência e encerra se a pessoa não quiser.",
  },
  {
    id: "recovery",
    title: "Recovery",
    description: "Inicia tratativa financeira com cuidado, negociação e handoff em contestação.",
    lockReason: "Disponível no plano com Recovery.",
  },
];

function resolveTutorialProvider(center: WhatsAppCenterPayload | null | undefined): ChannelProvider {
  return getProviderCapabilitiesFromWhatsAppCenter(center).provider;
}

function resolveTutorialChannelMode(center: WhatsAppCenterPayload | null | undefined): "QR" | "OFFICIAL" {
  return center?.center.mode === "OFFICIAL" ? "OFFICIAL" : "QR";
}

function makeTutorialButton(sectionKey: string, actionId: string, title: string, index: number) {
  return {
    buttonId: `${sectionKey}_${actionId}_${index + 1}`.toLowerCase().replace(/[^a-z0-9_:]/g, "_").slice(0, 80),
    actionId,
    title,
  };
}

function normalizeTutorialBotType(value: AtendimentoBotType | null | undefined): TutorialBotType {
  if (value === "prospeccao" || value === "recovery" || value === "atendimento") return value;
  return "atendimento";
}

function getTutorialResponseStyle(botType: TutorialBotType): BotSetupDraft["responseStyle"] {
  if (botType === "prospeccao") return "prospecting";
  if (botType === "recovery") return "recovery";
  return "support";
}

function getTutorialBotLabel(botType: TutorialBotType) {
  if (botType === "prospeccao") return "Prospecção";
  if (botType === "recovery") return "Recovery";
  return "Atendimento";
}

function getDefaultFirstContactRules(botType: TutorialBotType): TutorialFirstContactRules {
  if (botType === "prospeccao") {
    return {
      canInitiateConversation: true,
      messageIntervalSeconds: 35,
      nextContactDelayMinutes: 12,
      replyDelaySeconds: 75,
      typingSeconds: 8,
      typingVarianceSeconds: 6,
      maxFirstContactsPerHour: 5,
      quietHoursStart: "18:30",
      quietHoursEnd: "09:00",
      maxFollowUps: 2,
      followUpDelayHours: 24,
      requireOptIn: false,
      stopIntentKeywords: ["nao tenho interesse", "nao quero", "pare", "remover", "spam"],
      positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
      optOutMessage: "Tudo bem, obrigado por responder. Nao vou insistir e encerro este contato por aqui.",
      handoffPolicy: "Rejeicao clara, irritacao ou pedido de remocao encerra sem nova tentativa automatica.",
    };
  }

  if (botType === "recovery") {
    return {
      canInitiateConversation: true,
      messageIntervalSeconds: 45,
      nextContactDelayMinutes: 8,
      replyDelaySeconds: 60,
      typingSeconds: 7,
      typingVarianceSeconds: 5,
      maxFirstContactsPerHour: 6,
      quietHoursStart: "19:00",
      quietHoursEnd: "09:00",
      maxFollowUps: 3,
      followUpDelayHours: 24,
      requireOptIn: true,
      stopIntentKeywords: ["nao reconheco", "ja paguei", "contestacao", "atendente", "pare"],
      positiveIntentKeywords: ["pagar", "pix", "boleto", "parcelar", "negociar"],
      optOutMessage: "Entendi. Vou pausar a cobranca automatica e deixar o atendimento humano verificar com cuidado.",
      handoffPolicy: "Contestacao, pagamento informado, duvida de valor ou tom irritado vai para humano antes de novo disparo.",
    };
  }

  return {
    canInitiateConversation: false,
    messageIntervalSeconds: 18,
    nextContactDelayMinutes: 0,
    replyDelaySeconds: 22,
    typingSeconds: 5,
    typingVarianceSeconds: 4,
    maxFirstContactsPerHour: 0,
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    maxFollowUps: 1,
    followUpDelayHours: 6,
    requireOptIn: false,
    stopIntentKeywords: ["parar", "bloquear", "atendente", "reclamacao"],
    positiveIntentKeywords: ["suporte", "agenda", "financeiro", "ajuda"],
    optOutMessage: "Sem problema. Vou encerrar por aqui e deixo um atendente assumir se voce precisar.",
    handoffPolicy: "Atendimento responde inbound. Reclamacao, audio confuso ou pedido de humano pausa o bot.",
  };
}

function getDefaultBotMessages(botTypeRaw: AtendimentoBotType): BotMessageDraft {
  const botType = normalizeTutorialBotType(botTypeRaw);
  if (botType === "prospeccao") {
    return {
      morning: "Bom dia",
      afternoon: "Boa tarde",
      night: "Boa noite",
      welcomeMessage: "{{cumprimentacao}}, {{cliente}}. Aqui é da {{empresa}}. Posso te mandar uma ideia rápida para melhorar seu atendimento pelo WhatsApp?",
      returningCustomerMessage: "{{cliente}}, voltando rapidinho: se ainda fizer sentido, eu te mostro em poucas linhas. Se não fizer, encerro por aqui.",
      mainMenuPrompt: "{{cliente}}, prometo ser breve. Faz sentido eu te mostrar uma ideia rápida ou prefere que eu não te chame mais?",
      recoveryDetectedMessage: "{{cliente}}, vi que existe um contexto financeiro. Vou pausar a prospecção e deixar isso com o atendimento certo.",
      primaryButtonLabel: "Tenho interesse",
      agendaButtonLabel: "Falar depois",
      infoButtonLabel: "Ver detalhes",
      humanButtonLabel: "Humano",
      primaryResponse: "Perfeito. Vou seguir com calma: posso te passar o caminho mais simples, chamar uma pessoa do time ou encerrar sem insistência.",
      infoResponse: "Claro. Vou te mandar um resumo objetivo, sem compromisso. Se fizer sentido, seguimos; se não fizer, eu encerro por aqui.",
      postActionPrompt: "Posso montar uma proposta, chamar uma pessoa do time ou parar por aqui sem insistência.",
      humanAckMessage: "Vou chamar uma pessoa do time para continuar de forma mais direta.",
      closeTopicMessage: "Tudo bem, obrigado por responder. Não vou insistir e encerro este contato por aqui.",
    };
  }

  if (botType === "recovery") {
    return {
      morning: "Bom dia",
      afternoon: "Boa tarde",
      night: "Boa noite",
      welcomeMessage: "{{cumprimentacao}}, {{cliente}}. Aqui é da {{empresa}}. Estou te chamando com cuidado sobre um assunto financeiro.",
      returningCustomerMessage: "{{cliente}}, estou retomando sua conversa financeira por aqui. Vou ser objetivo e te dar opções simples.",
      mainMenuPrompt: "{{cliente}}, encontrei uma pendência e posso te ajudar com pagamento, negociação ou atendimento humano.",
      recoveryDetectedMessage: "{{cliente}}, consta um valor em aberto de {{valor_formatado}}. Posso te mostrar o histórico, gerar pagamento, negociar ou pausar para um atendente verificar.",
      primaryButtonLabel: "Pagar agora",
      agendaButtonLabel: "Negociar",
      infoButtonLabel: "Ver pagamentos",
      humanButtonLabel: "Atendente",
      primaryResponse: "Perfeito. Vou gerar a ação financeira para você seguir agora.",
      infoResponse: "Vou abrir o histórico de pagamentos e continuar por aqui com você.",
      postActionPrompt: "Obrigado por responder. Posso continuar pelo financeiro, chamar uma pessoa ou deixar registrado para retorno.",
      humanAckMessage: "Vou pausar a automação e encaminhar para uma pessoa verificar com cuidado antes de qualquer nova mensagem.",
      closeTopicMessage: "Entendido. Vou encerrar esta automação por agora. Se precisar, a equipe pode retomar manualmente.",
    };
  }

  return {
    morning: "Bom dia",
    afternoon: "Boa tarde",
    night: "Boa noite",
    welcomeMessage: "{{cumprimentacao}}, tudo bem?\nSou o atendimento da {{empresa}} e vou te ajudar com calma por aqui.",
    returningCustomerMessage: "Que bom te ver de novo, {{cliente}}. Vou continuar daqui sem perder o contexto da conversa.",
    mainMenuPrompt: "Escolha abaixo como deseja continuar no Atendimento:",
    recoveryDetectedMessage: "{{cliente}}, encontrei uma pendência e posso te ajudar pelo financeiro sem perder o atendimento atual.",
    primaryButtonLabel: "Suporte",
    agendaButtonLabel: "Agendar visita",
    infoButtonLabel: "Financeiro",
    humanButtonLabel: "Atendente",
    primaryResponse: "Certo. Vou organizar sua solicitação e seguir pelo caminho mais direto.",
    infoResponse: "Posso te orientar com informações da empresa, agenda, financeiro e encaminhamento para humano.",
    postActionPrompt: "Se precisar, posso continuar pelo Atendimento, voltar ao financeiro ou encaminhar para agenda e humano.",
    humanAckMessage: "Perfeito. Vou encaminhar sua conversa para um atendente agora.",
    closeTopicMessage: "Entendido. Vou encerrar esta conversa por agora. Quando precisar, é só chamar.",
  };
}

function findButtonLabel(config: AtendimentoBotConfig, actionId: string, fallback: string) {
  const button = (config.mainMenuButtons || []).find((item) => item.actionId === actionId);
  return String(button?.title || fallback).trim() || fallback;
}

function findActionResponse(config: AtendimentoBotConfig, actionId: string, fallback: string) {
  const action = (config.actionCatalog || []).find((item) => item.actionId === actionId);
  return String(action?.responseMessage || fallback).trim() || fallback;
}

function makeDraftFromBotConfig(config: AtendimentoBotConfig): BotSetupDraft {
  const normalized = normalizeBotConfig(config);
  const botType = normalizeTutorialBotType(normalized.setup.botType);
  const defaults = getDefaultBotMessages(botType);
  const greeting = normalized.smartVariables?.greeting || {};
  const hasHumanFallback = (normalized.postActionButtons || []).some((button) => button.actionId === "talk_human");
  const primaryActionId = botType === "recovery" ? "pay_now" : botType === "prospeccao" ? "continue_journey" : "support_request";
  const firstContactMetadata =
    (normalized.sceneRules || []).find(
      (rule) => rule.sceneId === `first_contact_rules_${botType}` && rule.conditionType === "first_contact_rules",
    )?.metadata || {};
  const defaultRules = getDefaultFirstContactRules(botType);
  return {
    botType,
    responseStyle: getTutorialResponseStyle(botType),
    unknownHandling: hasHumanFallback ? "human" : "menu",
    businessHoursMode: Number(greeting.morningStartHour || 3) >= 7 ? "business" : "always",
    firstContactRules: {
      ...defaultRules,
      ...(firstContactMetadata as Partial<TutorialFirstContactRules>),
      canInitiateConversation: botType === "atendimento" ? false : Boolean(firstContactMetadata.canInitiateConversation ?? defaultRules.canInitiateConversation),
    },
    messages: {
      morning: String(greeting.morning || defaults.morning),
      afternoon: String(greeting.afternoon || defaults.afternoon),
      night: String(greeting.night || defaults.night),
      welcomeMessage: String(normalized.welcomeMessage || defaults.welcomeMessage),
      returningCustomerMessage: String(normalized.returningCustomerMessage || defaults.returningCustomerMessage),
      mainMenuPrompt: String(normalized.mainMenuPrompt || defaults.mainMenuPrompt),
      recoveryDetectedMessage: String(normalized.recoveryDetectedMessage || defaults.recoveryDetectedMessage),
      primaryButtonLabel: findButtonLabel(normalized, primaryActionId, defaults.primaryButtonLabel),
      agendaButtonLabel: findButtonLabel(normalized, "schedule_service", defaults.agendaButtonLabel),
      infoButtonLabel: findButtonLabel(normalized, botType === "recovery" ? "view_payments" : botType === "prospeccao" ? "prospect_details" : "enter_recovery", defaults.infoButtonLabel),
      humanButtonLabel: findButtonLabel(normalized, "talk_human", defaults.humanButtonLabel),
      primaryResponse: findActionResponse(normalized, primaryActionId, defaults.primaryResponse),
      infoResponse: findActionResponse(normalized, botType === "recovery" ? "view_payments" : botType === "prospeccao" ? "prospect_details" : "support_request", defaults.infoResponse),
      postActionPrompt: String(normalized.postActionPrompt || defaults.postActionPrompt),
      humanAckMessage: String(normalized.humanAckMessage || defaults.humanAckMessage),
      closeTopicMessage: String(normalized.closeTopicMessage || defaults.closeTopicMessage),
    },
  };
}

function mergeTutorialActionCatalog(base: AtendimentoBotConfig, draft: BotSetupDraft) {
  const actions = [...base.actionCatalog];
  const upsert = (action: AtendimentoBotConfig["actionCatalog"][number]) => {
    const index = actions.findIndex((item) => item.actionId === action.actionId);
    if (index >= 0) {
      actions[index] = { ...actions[index], ...action };
      return;
    }
    actions.push(action);
  };

  upsert({
    actionId: "support_request",
    title: draft.messages.primaryButtonLabel,
    description: "Abre a tratativa principal do Atendimento com contexto salvo.",
    route: "atendimento",
    kind: "reply",
    enabled: true,
    responseMessage: draft.messages.primaryResponse,
    custom: true,
  });

  upsert({
    actionId: "prospect_details",
    title: draft.botType === "prospeccao" ? draft.messages.infoButtonLabel : "Ver detalhes",
    description: "Envia uma explicacao curta e humana antes de pedir decisao.",
    route: "atendimento",
    kind: "reply",
    enabled: true,
    responseMessage: draft.messages.infoResponse,
    custom: true,
  });

  upsert({
    actionId: "prospect_later",
    title: draft.messages.agendaButtonLabel,
    description: "Agenda uma retomada leve sem insistir no mesmo momento.",
    route: "atendimento",
    kind: "reply",
    enabled: true,
    responseMessage: "Combinado. Vou deixar para retomar em outro momento e nao vou ficar insistindo por aqui.",
    custom: true,
  });

  return actions;
}

function withTutorialFirstContactRules(base: AtendimentoBotConfig, draft: BotSetupDraft) {
  const sceneRules = (base.sceneRules || []).filter(
    (rule) => !(rule.sceneId === `first_contact_rules_${draft.botType}` && rule.conditionType === "first_contact_rules"),
  );
  return [
    ...sceneRules,
    {
      sceneId: `first_contact_rules_${draft.botType}`,
      conditionType: "first_contact_rules",
      enabled: true,
      metadata: {
        ...draft.firstContactRules,
        guideId: draft.botType,
        canInitiateConversation: draft.botType === "atendimento" ? false : draft.firstContactRules.canInitiateConversation,
      },
    },
  ];
}

function buildTutorialBotConfig(
  baseConfig: AtendimentoBotConfig | null,
  draft: BotSetupDraft,
  provider: ChannelProvider,
  channelMode: "QR" | "OFFICIAL",
): AtendimentoBotConfig {
  const base = normalizeBotConfig(baseConfig || DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const isRecovery = draft.botType === "recovery";
  const isProspecting = draft.botType === "prospeccao";
  const isBusinessHours = draft.businessHoursMode === "business";
  const unknownGoesHuman = draft.unknownHandling === "human";
  const messages = draft.messages;
  const mainMenuButtons = isRecovery
    ? [
        makeTutorialButton("main_menu", "view_payments", messages.infoButtonLabel, 0),
        makeTutorialButton("main_menu", "pay_now", messages.primaryButtonLabel, 1),
        makeTutorialButton("main_menu", "negotiate_debt", messages.agendaButtonLabel, 2),
        makeTutorialButton("main_menu", "talk_human", messages.humanButtonLabel, 3),
      ]
    : isProspecting
      ? [
          makeTutorialButton("main_menu", "continue_journey", messages.primaryButtonLabel, 0),
          makeTutorialButton("main_menu", "prospect_details", messages.infoButtonLabel, 1),
          makeTutorialButton("main_menu", "prospect_later", messages.agendaButtonLabel, 2),
          makeTutorialButton("main_menu", "close_topic", "Não tenho interesse", 3),
        ]
      : [
          makeTutorialButton("main_menu", "support_request", messages.primaryButtonLabel, 0),
          makeTutorialButton("main_menu", "schedule_service", messages.agendaButtonLabel, 1),
          makeTutorialButton("main_menu", "enter_recovery", messages.infoButtonLabel, 2),
          makeTutorialButton("main_menu", "talk_human", messages.humanButtonLabel, 3),
        ];

  return normalizeBotConfig({
    ...base,
    setup: {
      completed: true,
      completedAt: new Date().toISOString(),
      botType: draft.botType,
      channelMode,
      provider,
      configuredFrom: "tutorial",
    },
    actionCatalog: mergeTutorialActionCatalog(base, draft),
    sceneRules: withTutorialFirstContactRules(base, draft),
    routingRules: {
      ...base.routingRules,
      globalBotEnabled: true,
      autoReopenClosedConversation: true,
      notifyOnNewInbound: true,
      checkRecoveryBeforeReply: base.routingRules.checkRecoveryBeforeReply,
      autoRouteDebtorsToRecovery: base.routingRules.autoRouteDebtorsToRecovery,
    },
    smartVariables: {
      ...base.smartVariables,
      greeting: {
        ...(base.smartVariables?.greeting || {}),
        timezone: base.smartVariables?.greeting?.timezone || "America/Sao_Paulo",
        morning: messages.morning,
        afternoon: messages.afternoon,
        night: messages.night,
        morningStartHour: isBusinessHours ? 8 : 3,
        afternoonStartHour: 12,
        nightStartHour: isBusinessHours ? 18 : 18,
      },
    },
    welcomeMessage: messages.welcomeMessage,
    returningCustomerMessage: messages.returningCustomerMessage,
    mainMenuPrompt: messages.mainMenuPrompt,
    mainMenuButtons,
    recoveryDetectedMessage: messages.recoveryDetectedMessage,
    recoveryDetectedButtons: [
      makeTutorialButton("recovery_detected", "view_payments", "Ver pagamentos", 0),
      makeTutorialButton("recovery_detected", "pay_now", "Pagar agora", 1),
      makeTutorialButton("recovery_detected", "negotiate_debt", "Negociar", 2),
      makeTutorialButton("recovery_detected", "talk_human", "Já paguei / ajuda", 3),
      makeTutorialButton("recovery_detected", "continue_attendance", "Continuar atendimento", 4),
    ],
    postActionPrompt: unknownGoesHuman
      ? messages.postActionPrompt
      : "Posso voltar ao menu principal e tentar outro caminho.",
    postActionButtons: unknownGoesHuman
      ? [
          makeTutorialButton("post_action", "show_main_menu", "Menu", 0),
          makeTutorialButton("post_action", "talk_human", messages.humanButtonLabel, 1),
        ]
      : [makeTutorialButton("post_action", "show_main_menu", "Voltar ao menu", 0)],
    humanAckMessage: messages.humanAckMessage,
    closeTopicMessage: messages.closeTopicMessage,
  });
}

export default function TutorialClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { replayGlobalTransition } = useInterfaceTransition();
  const { selection, setSelection, themeState } = useHbxTheme();
  const [plans, setPlans] = useState<CommercialPlansPayload | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatusPayload | null>(null);
  const [whatsAppCenter, setWhatsAppCenter] = useState<WhatsAppCenterPayload | null>(null);
  const [whatsAppModal, setWhatsAppModal] = useState<WhatsAppModalPayload | null>(null);
  const [step, setStep] = useState<TutorialStep>("theme");
  const [previousStep, setPreviousStep] = useState<TutorialStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setQrLoading] = useState(false);
  const [qrSuccess, setQrSuccess] = useState(false);
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [techFocus, setTechFocus] = useState<WhatsAppDiagnosticFocus>("official");
  const [techBusy, setTechBusy] = useState<string | null>(null);
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig | null>(null);
  const [botDraft, setBotDraft] = useState<BotSetupDraft>(DEFAULT_BOT_SETUP_DRAFT);
  const [botSaving, setBotSaving] = useState(false);
  const botStartAppliedRef = useRef(false);
  const previousQrConnectedRef = useRef<boolean | null>(null);

  const entitlements = plans?.current.entitlements;
  const hasWebscraping = Boolean(entitlements?.webscraping || hasModule(modules, "webscraping"));
  const hasVendasAccess = Boolean(entitlements?.vendas || hasModule(modules, "vendas"));
  const hasAtendimento = Boolean(entitlements?.atendimento_chat || hasModule(modules, "atendimento"));
  const hasBot = Boolean(entitlements?.bot_ia);
  const hasRecoveryModule = modules.some((moduleItem) => {
    const key = String(moduleItem.key || "").trim().toLowerCase();
    return key === "hbx_recovery" && moduleItem.accessible && moduleItem.visible !== false;
  });
  const hasRecoveryCapability = Boolean((entitlements as Record<string, boolean> | undefined)?.recovery || hasRecoveryModule);
  const hasProspectionCapability = Boolean(hasVendasAccess && hasBot);
  const whatsappConnected = isWhatsAppConnected(whatsAppCenter, whatsAppModal, operationalStatus);
  const blockedFeature = !hasAtendimento || !hasBot;
  const qrCode = whatsAppModal?.data.qrCodeDataUrl || whatsAppCenter?.center.qrConnection.qrCodeDataUrl || null;
  const channelMode = resolveTutorialChannelMode(whatsAppCenter);
  const provider = resolveTutorialProvider(whatsAppCenter);
  const providerLabel = getProviderLabel(provider);
  const providerCapabilities = getProviderCapabilitiesFromWhatsAppCenter(whatsAppCenter);
  const botSetupComplete = Boolean(botConfig?.setup?.completed);

  const loadTutorialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansPayload, modulesPayload, operationalPayload, centerPayload, modalPayload] = await Promise.all([
        apiFetch<CommercialPlansPayload>("/commercial-plans/me"),
        apiFetch<UserModule[]>("/modules/me"),
        apiFetch<OperationalStatusPayload>("/companies/me/operational-status").catch(() => null),
        apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null),
        apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null),
      ]);
      const botPayload = plansPayload.current.entitlements.bot_ia
        ? await apiFetch<AtendimentoBotConfig>("/inbox/bot-config").catch(() => null)
        : null;
      setPlans(plansPayload);
      setModules(Array.isArray(modulesPayload) ? modulesPayload : []);
      setOperationalStatus(operationalPayload);
      setWhatsAppCenter(centerPayload);
      setWhatsAppModal(modalPayload);
      if (botPayload) {
        const normalizedBot = normalizeBotConfig(botPayload);
        setBotConfig(normalizedBot);
        setBotDraft(makeDraftFromBotConfig(normalizedBot));
      } else {
        setBotConfig(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o tutorial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken === true) void loadTutorialData();
  }, [hasToken, loadTutorialData]);

  useEffect(() => {
    if (loading || botStartAppliedRef.current) return;
    const start = String(searchParams?.get("start") || "").trim().toLowerCase();
    if (start !== "bot") return;
    botStartAppliedRef.current = true;
    if (!hasBot) {
      router.replace("/planos?intent=bot_ia&from=inbox_bot");
      return;
    }
    setStep(botSetupComplete ? "bot-built" : "bot-type");
  }, [botSetupComplete, hasBot, loading, router, searchParams]);

  const progressLabel = useMemo(() => {
    const current = Math.max(0, stepIndex(step)) + 1;
    return `${current}/${TUTORIAL_STEP_ORDER.length}`;
  }, [step]);
  const currentStepIndex = stepIndex(step);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < TUTORIAL_STEP_ORDER.length - 1;

  useEffect(() => {
    if (!previousStep) return undefined;
    const timeout = window.setTimeout(() => setPreviousStep(null), STEP_TRANSITION_MS);
    return () => window.clearTimeout(timeout);
  }, [previousStep, step]);

  const goToStep = useCallback((nextStep: TutorialStep) => {
    if (nextStep === step || previousStep) return;
    setPreviousStep(step);
    setStep(nextStep);
  }, [previousStep, step]);

  useEffect(() => {
    if (step !== "qr" || whatsappConnected) return undefined;
    if (!qrCode && whatsAppCenter?.center.mode !== "QR") return undefined;

    let mounted = true;

    async function refreshQrConnection() {
      try {
        const [centerPayload, modalPayload, operationalPayload] = await Promise.all([
          apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center").catch(() => null),
          apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status").catch(() => null),
          apiFetch<OperationalStatusPayload>("/companies/me/operational-status?refresh=true").catch(() => null),
        ]);
        if (!mounted) return;
        if (centerPayload) setWhatsAppCenter(centerPayload);
        if (modalPayload) setWhatsAppModal(modalPayload);
        if (operationalPayload) setOperationalStatus(operationalPayload);
      } catch {
        // A tela continua com o QR atual; o próximo ciclo tenta novamente.
      }
    }

    const interval = window.setInterval(() => {
      void refreshQrConnection();
    }, 2800);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [qrCode, step, whatsAppCenter?.center.mode, whatsappConnected]);

  useEffect(() => {
    if (step !== "qr") {
      previousQrConnectedRef.current = whatsappConnected;
      setQrSuccess(false);
      return undefined;
    }

    const wasConnected = previousQrConnectedRef.current;
    previousQrConnectedRef.current = whatsappConnected;

    if (whatsappConnected && wasConnected !== true) {
      setQrSuccess(true);
      dispatchModulesChanged({ reason: "whatsapp_connected" });

      const advanceTimer = window.setTimeout(() => {
        setQrSuccess(false);
        goToStep(hasBot ? "bot-type" : "final");
      }, 2600);

      return () => {
        window.clearTimeout(advanceTimer);
      };
    }

    return undefined;
  }, [goToStep, hasBot, step, whatsappConnected]);

  function goToPreviousStep() {
    if (!canGoBack) return;
    goToStep(TUTORIAL_STEP_ORDER[currentStepIndex - 1]);
  }

  function goToNextStep() {
    if (!canGoNext) return;
    goToStep(TUTORIAL_STEP_ORDER[currentStepIndex + 1]);
  }

  function resolveThemeTransitionOrigin(target?: EventTarget | null) {
    const sourceElement = target instanceof Element ? target : document.activeElement instanceof Element ? document.activeElement : null;
    const rect = sourceElement?.getBoundingClientRect();

    if (!rect) {
      return { x: window.innerWidth / 2, y: Math.min(112, window.innerHeight * 0.18) };
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function applyThemeSelection(nextSelection: HbxThemeSelection, target?: EventTarget | null) {
    playThemeWaveTransition(
      nextSelection,
      resolveThemeTransitionOrigin(target),
      mergeThemeConfigChain(themeState.resolved, { selection: nextSelection }),
    );
    setSelection(nextSelection);
    replayGlobalTransition();
  }

  function chooseThemeMode(mode: HbxThemeMode, target?: EventTarget | null) {
    applyThemeSelection({
      themeId: selection.mode === mode ? getNextThemeId(selection.themeId) : selection.themeId,
      mode,
    }, target);
  }

  function goToWebscraping() {
    window.localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
    router.push("/radar-digital");
  }

  function goToPlans() {
    router.push("/planos");
  }

  function exitTutorial() {
    router.push("/vendas");
  }

  function nextFromWebscraping() {
    goToStep(hasVendasAccess ? "vendas" : "final");
  }

  function nextFromVendas() {
    goToStep(hasAtendimento ? "atendimento" : "final");
  }

  function nextFromAtendimento() {
    goToStep(whatsappConnected && hasBot ? "bot-type" : whatsappConnected ? "final" : "whatsapp-config");
  }

  async function requestMetaSupport() {
    setTechBusy("migration");
    setNotice(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center/migration-interest", {
        method: "POST",
        body: JSON.stringify({ source: "tutorial_whatsapp_config" }),
      });
      setWhatsAppCenter(next);
      setTechFocus("official");
      setTechDialogOpen(true);
      setNotice("Pedido técnico registrado. O time consegue avaliar a configuração oficial pela Meta.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao registrar o pedido técnico.");
    } finally {
      setTechBusy(null);
    }
  }

  function startAvailableFlow() {
    goToStep(firstAvailableStep({ hasWebscraping, hasVendasAccess, hasAtendimento }));
  }

  function startQrFromChoice() {
    goToStep("qr");
    void generateQrCode();
  }

  async function chooseWhatsAppMode(mode: "QR" | "OFFICIAL") {
    setTechBusy(mode);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
      setWhatsAppCenter(next);
    } finally {
      setTechBusy(null);
    }
  }

  async function generateQrCode() {
    setQrLoading(true);
    setNotice(null);
    setError(null);
    try {
      await chooseWhatsAppMode("QR");
      const started = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/start", { method: "POST" });
      let nextPayload = started;
      if (started.status !== "connected" && !started.data.qrCodeDataUrl && started.data.available) {
        nextPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
      }
      setWhatsAppModal(nextPayload);
      const redirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (redirect) {
        router.push(redirect);
        return;
      }
      setNotice(nextPayload.status === "connected" ? "WhatsApp conectado. Você já pode atender conversas pelo HBX." : "QR Code pronto para leitura.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao gerar QR Code.");
    } finally {
      setQrLoading(false);
    }
  }

  function canUseTutorialBotType(botType: TutorialBotType) {
    if (botType === "recovery") return hasRecoveryCapability;
    if (botType === "prospeccao") return hasProspectionCapability;
    return hasAtendimento && hasBot;
  }

  function chooseBotType(botType: TutorialBotType) {
    if (!canUseTutorialBotType(botType)) return;
    setBotDraft((current) => ({
      ...current,
      botType,
      responseStyle: getTutorialResponseStyle(botType),
      firstContactRules: getDefaultFirstContactRules(botType),
      messages: getDefaultBotMessages(botType),
    }));
  }

  function updateBotDraft(patch: Partial<BotSetupDraft>) {
    setBotDraft((current) => ({ ...current, ...patch }));
  }

  function updateBotMessage(field: keyof BotMessageDraft, value: string) {
    setBotDraft((current) => ({
      ...current,
      messages: {
        ...current.messages,
        [field]: value,
      },
    }));
  }

  async function completeBotSetup(nextStep: TutorialStep = "bot-built") {
    if (botSaving) return;
    if (!hasBot) {
      goToPlans();
      return;
    }
    setBotSaving(true);
    setError(null);
    setNotice(null);
    try {
      const nextConfig = buildTutorialBotConfig(botConfig, botDraft, provider, channelMode);
      const saved = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      setBotConfig(normalizeBotConfig(saved));
      window.localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
      setNotice("Configuração salva e aplicada. Bot ativo no Inbox.");
      goToStep(nextStep);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar configuração do bot.");
    } finally {
      setBotSaving(false);
    }
  }

  if (hasToken === null || loading) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <span className={styles.statusBadge}>Tutorial HBX</span>
          <div className={styles.brandMark}>HBX</div>
          <p className={styles.footerHint}>Carregando sua jornada...</p>
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  const floatingCardsPage = tutorialStepPage(step);

  function renderStepContent(renderStep: TutorialStep) {
    const titleId = `tutorial-title-${renderStep}`;
    const botMap = (
      <BotLiveOrganogram
        draft={botDraft}
        provider={provider}
        channelMode={channelMode}
        activeStep={renderStep}
      />
    );

    if (renderStep === "theme") {
      return (
        <>
          <h1 id={titleId} className={`${styles.title} ${styles.titleCompact}`}>Escolha como quer visualizar o HBX.</h1>
          <p className={styles.subtitle}>
            O HBX acompanha o estilo visual escolhido desde a entrada. Você pode trabalhar em modo claro ou escuro,
            mantendo a mesma identidade nos módulos, cards, menus e telas operacionais.
          </p>
          <div className={styles.themeGrid}>
            <ThemeMockup
              tone="light"
              title="Claro"
              themeLabel={HBX_THEME_PALETTES[selection.themeId].label}
              selected={selection.mode === "light"}
              onSelect={(target) => chooseThemeMode("light", target)}
            />
            <ThemeMockup
              tone="dark"
              title="Escuro"
              themeLabel={HBX_THEME_PALETTES[selection.themeId].label}
              selected={selection.mode === "dark"}
              onSelect={(target) => chooseThemeMode("dark", target)}
            />
          </div>
          <BulletList items={[
            "Modo claro para leitura direta durante o dia.",
            "Modo escuro para operação prolongada e foco.",
            "Os módulos herdam o tema escolhido automaticamente.",
          ]} />
          <div className={styles.actions}>
            <button type="button" className={styles.primaryAction} onClick={startAvailableFlow}>Continuar</button>
            <button type="button" className={styles.secondaryAction} onClick={goToWebscraping}>Ir para o HBX</button>
          </div>
          <p className={styles.footerHint}>Você poderá ajustar o visual novamente depois, sem perder configurações.</p>
        </>
      );
    }

    if (renderStep === "webscraping") {
      return (
        <StepFrame
          titleId={titleId}
          title="Encontre oportunidades reais para trabalhar."
          text="O Radar Digital ajuda você a buscar possíveis clientes por cidade e segmento. Você escolhe o público, revisa os resultados e pode transformar contatos promissores em oportunidades para o time comercial."
          points={["Busque por cidade e segmento.", "Revise contatos antes de trabalhar.", "Envie bons resultados para Vendas."]}
          visual={<WebscrapingMockup />}
          previousLabel="Anterior"
          onPrevious={() => goToStep("theme")}
          primaryLabel="Próximo"
          onPrimary={nextFromWebscraping}
        />
      );
    }

    if (renderStep === "vendas") {
      return (
        <StepFrame
          titleId={titleId}
          title="Organize os contatos em uma rotina comercial."
          text="Em Vendas, os contatos viram cards de trabalho. Você acompanha novos leads, retornos, atrasados e agenda, sem perder o histórico do que precisa ser feito."
          points={["Filtros mostram onde agir primeiro.", "Cards ajudam a mover vários contatos com rapidez.", "Agenda evita perder retornos importantes."]}
          visual={<VendasMockup />}
          previousLabel="Anterior"
          onPrevious={() => goToStep("webscraping")}
          primaryLabel="Próximo"
          onPrimary={hasAtendimento ? nextFromVendas : goToWebscraping}
          upgradeText={!hasAtendimento ? "No próximo nível, o HBX pode levar os contatos para o WhatsApp e Atendimento, filtrando conversas válidas e abrindo espaço para automação." : undefined}
        />
      );
    }

    if (renderStep === "atendimento") {
      return (
        <StepFrame
          titleId={titleId}
          title="Centralize conversas e continue o atendimento."
          text="O Atendimento reúne conversas, histórico e próximos passos. Quando o WhatsApp está conectado, a equipe consegue responder com contexto e manter a operação andando."
          points={["Conversas ficam organizadas por status.", "Histórico ajuda qualquer pessoa a continuar.", "WhatsApp conectado libera operação em tempo real."]}
          visual={<AtendimentoMockup connected={whatsappConnected} />}
          previousLabel="Anterior"
          onPrevious={() => goToStep("vendas")}
          primaryLabel="Próximo"
          onPrimary={nextFromAtendimento}
          extra={<BotNote />}
        />
      );
    }

    if (renderStep === "whatsapp-config") {
      return (
        <StepFrame
          titleId={titleId}
          title="Conecte o WhatsApp para liberar o atendimento."
          text="Você pode conectar por QR Code para começar rápido ou falar com um técnico para avaliar a configuração oficial pela Meta."
          points={["QR Code inicia rápido.", "Meta oficial pede avaliação técnica.", "Você pode fazer depois sem travar o uso."]}
          visual={<WhatsAppChoiceMockup />}
          primaryLabel="QR Code"
          onPrimary={startQrFromChoice}
          secondaryLabel="Meta Oficial"
          onSecondary={requestMetaSupport}
          tertiaryLabel="Próximo"
          onTertiary={() => goToStep("qr")}
        />
      );
    }

    if (renderStep === "qr") {
      return (
        <StepFrame
          titleId={titleId}
          title="Escaneie o QR Code para conectar o WhatsApp."
          text="Abra o WhatsApp no celular, vá em aparelhos conectados e escaneie o código. Quando a conexão estiver pronta, o HBX libera o atendimento."
          points={["Gere o QR Code.", "Escaneie pelo celular.", "Aguarde a confirmação de conexão."]}
          visual={<QrMockup qrCode={qrCode} connected={whatsappConnected || whatsAppModal?.status === "connected"} />}
          previousLabel="Anterior"
          onPrevious={() => goToStep("whatsapp-config")}
          primaryLabel="Próximo"
          onPrimary={() => goToStep(hasBot ? "bot-type" : "final")}
        />
      );
    }

    if (renderStep === "bot-type") {
      return (
        <BotStepFrame
          titleId={titleId}
          title="Defina qual cadastro de bot será usado."
          text="A pessoa visualiza Atendimento, Prospecção e Recovery, mas só consegue ativar o que o plano liberar."
          points={[
            "Atendimento responde quem chamou primeiro.",
            "Prospecção e Recovery iniciam conversa com cadência anti-spam.",
            "Disponibilidade acompanha plano e módulos liberados.",
          ]}
          visual={
            <BotTypeSelector
              selected={botDraft.botType}
              recoveryEnabled={hasRecoveryCapability}
              prospectionEnabled={hasProspectionCapability}
              onSelect={chooseBotType}
            />
          }
          map={botMap}
          previousLabel="Anterior"
          onPrevious={() => goToStep("qr")}
          primaryLabel="Próximo"
          onPrimary={() => goToStep("bot-channel")}
        />
      );
    }

    if (renderStep === "bot-channel") {
      return (
        <BotStepFrame
          titleId={titleId}
          title="Ajuste o bot ao canal conectado."
          text={`${providerLabel}: ${
            providerCapabilities.canUseOfficialButtons
              ? "pode usar botões oficiais e templates aprovados pela Meta."
              : "usa mensagens de texto com opções numeradas, sem botões oficiais."
          }`}
          points={[
            channelMode === "OFFICIAL" ? "Meta libera templates e botões oficiais." : "QR Code não envia botões oficiais.",
            "As decisões do bot continuam salvas no HBX.",
            "O cliente sempre terá saída para atendente humano.",
          ]}
          visual={<BotChannelPreview provider={provider} channelMode={channelMode} />}
          map={botMap}
          previousLabel="Anterior"
          onPrevious={() => goToStep("bot-type")}
          primaryLabel="Próximo"
          onPrimary={() => goToStep("bot-voice")}
        />
      );
    }

    if (renderStep === "bot-voice") {
      return (
        <BotStepFrame
          titleId={titleId}
          title="Escolha como ele conversa."
          text="A primeira resposta precisa ser útil, curta e segura. O bot entende o horário, apresenta opções e não inventa promessa fora do fluxo."
          points={[
            "Cumprimento muda por horário.",
            "Mensagens curtas evitam ruído no WhatsApp.",
            "Se não entender, o bot encaminha para humano ou volta ao menu.",
          ]}
          visual={
            <BotVoiceOptions
              draft={botDraft}
              recoveryEnabled={hasRecoveryCapability}
              prospectionEnabled={hasProspectionCapability}
              onChange={updateBotDraft}
            />
          }
          map={botMap}
          previousLabel="Anterior"
          onPrevious={() => goToStep("bot-channel")}
          primaryLabel="Próximo"
          onPrimary={() => goToStep("bot-rules")}
        />
      );
    }

    if (renderStep === "bot-rules") {
      return (
        <BotStepFrame
          titleId={titleId}
          title="Defina quando ele deve parar."
          text="O bot não disputa com o operador. Ele atende o básico, agenda quando existir caminho e entrega conversa humana quando o cliente pedir ou sair do roteiro."
          points={[
            "Atendente humano tem prioridade.",
            "Agenda só aparece quando o tipo de bot permite.",
            "Conversa bloqueada ou fechada não recebe resposta indevida.",
          ]}
          visual={<BotRulesOptions draft={botDraft} onChange={updateBotDraft} />}
          map={botMap}
          previousLabel="Anterior"
          onPrevious={() => goToStep("bot-voice")}
          primaryLabel="Próximo"
          onPrimary={() => goToStep("bot-review")}
        />
      );
    }

    if (renderStep === "bot-review") {
      return (
        <BotStepFrame
          titleId={titleId}
          title="Revise antes de ativar."
          text="Ao salvar, o bot passa a poder responder novas entradas do Atendimento e conversas movidas para a fila do Bot."
          points={[
            `Modo ${getTutorialBotLabel(botDraft.botType)}.`,
            providerCapabilities.canUseOfficialButtons ? "Meta: botões oficiais disponíveis." : "QR Code: opções por número.",
            botDraft.unknownHandling === "human" ? "Fora do roteiro vai para humano." : "Fora do roteiro volta ao menu.",
          ]}
          visual={
            <BotReviewCard
              draft={botDraft}
              provider={provider}
              channelMode={channelMode}
              onMessageChange={updateBotMessage}
            />
          }
          map={botMap}
          previousLabel="Anterior"
          onPrevious={() => goToStep("bot-rules")}
          primaryLabel={botSaving ? "Salvando..." : "Salvar"}
          onPrimary={() => void completeBotSetup("bot-review")}
          secondaryLabel="Próximo"
          onSecondary={() => goToStep("bot-built")}
        />
      );
    }

    if (renderStep === "bot-built") {
      return (
        <BotBuiltStepFrame
          titleId={titleId}
          title="Organograma do bot construído."
          draft={botDraft}
          provider={provider}
          channelMode={channelMode}
          recoveryEnabled={hasRecoveryCapability}
          prospectionEnabled={hasProspectionCapability}
          onDraftChange={updateBotDraft}
          onMessageChange={updateBotMessage}
          saved={botSetupComplete}
          previousLabel="Anterior"
          onPrevious={() => goToStep("bot-review")}
          primaryLabel={botSaving ? "Salvando..." : "Salvar"}
          onPrimary={() => void completeBotSetup("bot-built")}
          secondaryLabel="Próximo"
          onSecondary={() => goToStep("final")}
        />
      );
    }

    return (
      <StepFrame
        titleId={titleId}
        title={botSetupComplete ? "Agora vamos buscar seus primeiros contatos." : "Tudo pronto para começar."}
        text={
          botSetupComplete
            ? "Configuração salva e aplicada. O bot fica ativo no Inbox, e o próximo passo é alimentar o HBX com bons contatos para trabalhar."
            : "Seu HBX já sabe por onde iniciar. Agora você pode prospectar, organizar contatos e avançar para atendimento conforme seu plano."
        }
        points={
          botSetupComplete
            ? ["Bot ativo no Inbox.", "Radar Digital busca os primeiros contatos.", "Vendas e Atendimento continuam com o fluxo salvo."]
            : ["Comece pelo Radar Digital.", "Envie bons contatos para Vendas.", "Avance para Atendimento conforme o plano."]
        }
        visual={<FinalMockup botReady={botSetupComplete} themeMode={selection.mode} />}
        primaryLabel={botSetupComplete ? "Ir para Radar Digital" : "Começar no Radar Digital"}
        onPrimary={goToWebscraping}
        secondaryLabel={blockedFeature ? "Ver planos" : undefined}
        onSecondary={blockedFeature ? goToPlans : undefined}
      />
    );
  }

  return (
    <main className={styles.page} data-theme-id={selection.themeId} data-theme-mode={selection.mode} data-tutorial-step={step}>
      {floatingCardsPage ? <FloatingTutorialPrints key={floatingCardsPage} page={floatingCardsPage} /> : null}

      <section className={styles.shell} aria-labelledby={`tutorial-title-${step}`}>
        <button type="button" className={styles.exitButton} onClick={exitTutorial}>
          Sair
        </button>
        <div className={styles.topLine}>
          <span className={styles.statusBadge}>Onboarding guiado</span>
          <span className={styles.progress}>{progressLabel}</span>
        </div>
        <div className={styles.brandNav} aria-label="Navegação do tutorial">
          {canGoBack ? (
            <button
              type="button"
              className={styles.navArrow}
              onClick={goToPreviousStep}
              disabled={Boolean(previousStep)}
              aria-label="Voltar tela"
              title="Voltar"
            >
              ←
            </button>
          ) : (
            <span className={styles.navArrowSpacer} aria-hidden="true" />
          )}
          <div className={styles.brandMark}>HBX</div>
          {canGoNext ? (
            <button
              type="button"
              className={styles.navArrow}
              onClick={goToNextStep}
              disabled={Boolean(previousStep)}
              aria-label="Próxima tela"
              title="Próxima"
            >
              →
            </button>
          ) : (
            <span className={styles.navArrowSpacer} aria-hidden="true" />
          )}
        </div>

        {error ? <div className={styles.alert}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <div className={styles.stepTransition} aria-live="polite">
          {previousStep ? (
            <div key={`leaving-${previousStep}`} className={`${styles.stepPanel} ${styles.stepLeaving}`} aria-hidden="true">
              {renderStepContent(previousStep)}
            </div>
          ) : null}
          <div key={`entering-${step}`} className={`${styles.stepPanel} ${previousStep ? styles.stepEntering : styles.stepCurrent}`}>
            {renderStepContent(step)}
          </div>
        </div>
      </section>

      {qrSuccess ? (
        <div className={styles.qrSuccessOverlay} aria-live="assertive" role="status">
          <div className={styles.qrSuccessCard}>
            <div className={styles.qrSuccessIconWrap}>
              <svg className={styles.qrSuccessCheck} viewBox="0 0 52 52" fill="none" aria-hidden="true">
                <circle cx="26" cy="26" r="25" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="rgba(255,255,255,0.12)" />
                <path className={styles.qrCheckPath} d="M14 27l9 9 15-18" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <strong className={styles.qrSuccessTitle}>WhatsApp conectado!</strong>
            <p className={styles.qrSuccessSubtitle}>Sessao ativa. A fila sera atualizada automaticamente.</p>
            <div className={styles.qrSuccessBar} />
          </div>
        </div>
      ) : null}

      <WhatsAppOperationalDialog
        isOpen={techDialogOpen}
        focus={techFocus}
        loading={false}
        modalLoading={false}
        busyAction={techBusy}
        payload={whatsAppCenter}
        modalPayload={whatsAppModal}
        error={error}
        modalError={null}
        message={notice}
        onClose={() => setTechDialogOpen(false)}
        onFocusChange={setTechFocus}
        onChooseMode={(mode) => void chooseWhatsAppMode(mode)}
        onRequestMigration={() => void requestMetaSupport()}
        onStartQrConnection={() => void generateQrCode()}
        onDisconnectQrConnection={() => undefined}
      />
    </main>
  );
}

function FloatingTutorialPrints({ page }: { page: number }) {
  const cards = [
    { className: styles.floatingPrintLeftHigh, photo: "history-light", title: "Histórico", text: "reaproveitar buscas" },
    { className: styles.floatingPrintLeftTop, photo: "route-light", title: "Roteiro", text: "primeiro contato" },
    { className: styles.floatingPrintLeftBottom, photo: "lead-light", title: "São Miguel Saúde", text: "card de vendas" },
    { className: styles.floatingPrintRightHigh, photo: "route-dark", title: "Roteiro", text: "modo escuro" },
    { className: styles.floatingPrintRightTop, photo: "history-dark", title: "Pesquisas", text: "modo escuro" },
    { className: styles.floatingPrintRightBottom, photo: "lead-dark", title: "Plano saúde SP", text: "WhatsApp · Ligar" },
  ];

  return (
    <div className={styles.floatingPrints} aria-hidden="true">
      {cards.map((card, index) => (
        <article key={`${page}-${index + 1}`} className={`${styles.floatingPrint} ${card.className}`}>
          <span className={styles.printPhoto} data-photo={card.photo}>
            <img src={`/api/tutorial-card-image/${page}/${index + 1}`} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
            <i />
            <b />
            <em />
          </span>
          <strong>{card.title}</strong>
          <small>{card.text}</small>
        </article>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div className={styles.pointGrid}>
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function StepFrame({
  titleId,
  title,
  text,
  points,
  visual,
  previousLabel,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  upgradeText,
  extra,
  onPrevious,
  onPrimary,
  onSecondary,
  onTertiary,
}: {
  titleId: string;
  title: string;
  text: string;
  points: string[];
  visual: ReactNode;
  previousLabel?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  upgradeText?: string;
  extra?: ReactNode;
  onPrevious?: () => void;
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}) {
  return (
    <>
      <h1 id={titleId} className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{text}</p>
      <div className={styles.stepGrid}>
        <div>
          <BulletList items={points} />
          {upgradeText ? <div className={styles.upgradeNote}>{upgradeText}</div> : null}
          {extra}
        </div>
        {visual}
      </div>
      <div className={styles.actions}>
        {previousLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onPrevious}>{previousLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
        <button type="button" className={styles.primaryAction} onClick={onPrimary}>{primaryLabel}</button>
        {secondaryLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onSecondary}>{secondaryLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
        {tertiaryLabel ? <button type="button" className={styles.ghostAction} onClick={onTertiary}>{tertiaryLabel}</button> : null}
      </div>
    </>
  );
}

function BotStepFrame({
  titleId,
  title,
  text,
  points,
  visual,
  map,
  previousLabel,
  primaryLabel,
  secondaryLabel,
  onPrevious,
  onPrimary,
  onSecondary,
}: {
  titleId: string;
  title: string;
  text: string;
  points: string[];
  visual: ReactNode;
  map?: ReactNode;
  previousLabel?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrevious?: () => void;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <>
      <h1 id={titleId} className={`${styles.title} ${styles.titleCompact} ${styles.botTitle}`}>{title}</h1>
      <p className={`${styles.subtitle} ${styles.botSubtitle}`}>{text}</p>
      <div className={`${styles.stepGrid} ${styles.botStepGrid}`}>
        <div className={styles.botStepSide}>
          <BulletList items={points} />
        </div>
        <div className={styles.botBuildStage}>
          {visual}
          {map}
        </div>
      </div>
      <div className={styles.actions}>
        {previousLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onPrevious}>{previousLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
        <button type="button" className={styles.primaryAction} onClick={onPrimary}>{primaryLabel}</button>
        {secondaryLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onSecondary}>{secondaryLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
      </div>
    </>
  );
}

function BotBuiltStepFrame({
  titleId,
  title,
  draft,
  provider,
  channelMode,
  recoveryEnabled,
  prospectionEnabled,
  previousLabel,
  primaryLabel,
  secondaryLabel,
  onPrevious,
  onDraftChange,
  onMessageChange,
  saved,
  onPrimary,
  onSecondary,
}: {
  titleId: string;
  title: string;
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  recoveryEnabled: boolean;
  prospectionEnabled: boolean;
  previousLabel?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrevious?: () => void;
  onDraftChange: (patch: Partial<BotSetupDraft>) => void;
  onMessageChange: (field: keyof BotMessageDraft, value: string) => void;
  saved?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <>
      <h1 id={titleId} className={styles.srOnly}>{title}</h1>
      <BotBuiltEditor
        draft={draft}
        provider={provider}
        channelMode={channelMode}
        recoveryEnabled={recoveryEnabled}
        prospectionEnabled={prospectionEnabled}
        onDraftChange={onDraftChange}
        onMessageChange={onMessageChange}
        saved={saved}
      />
      <div className={styles.actions}>
        {previousLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onPrevious}>{previousLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
        <button type="button" className={styles.primaryAction} onClick={onPrimary}>{primaryLabel}</button>
        {secondaryLabel
          ? <button type="button" className={styles.secondaryAction} onClick={onSecondary}>{secondaryLabel}</button>
          : <span className={styles.actionPlaceholder} aria-hidden="true" />}
      </div>
    </>
  );
}

function BotTypeSelector({
  selected,
  recoveryEnabled,
  prospectionEnabled,
  onSelect,
}: {
  selected: TutorialBotType;
  recoveryEnabled: boolean;
  prospectionEnabled: boolean;
  onSelect: (value: TutorialBotType) => void;
}) {
  const isEnabled = (id: TutorialBotType) => {
    if (id === "recovery") return recoveryEnabled;
    if (id === "prospeccao") return prospectionEnabled;
    return true;
  };
  return (
    <div className={`${styles.visualCard} ${styles.botConfigCard}`}>
      <span className={styles.visualLabel}>Tipo de Bot</span>
      <div className={styles.botTypeGrid}>
        {BOT_TYPE_OPTIONS.map((option) => {
          const enabled = isEnabled(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={styles.botOption}
              data-active={selected === option.id ? "true" : "false"}
              data-disabled={enabled ? "false" : "true"}
              disabled={!enabled}
              title={enabled ? option.title : option.lockReason || "Indisponível no plano atual"}
              onClick={() => onSelect(option.id)}
            >
              <strong>{option.title}</strong>
              <span>{enabled ? option.description : option.lockReason || "Indisponível no plano atual."}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BotChannelPreview({
  provider,
  channelMode,
}: {
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
}) {
  const isMeta = provider === "meta";
  return (
    <div className={`${styles.visualCard} ${styles.botConfigCard}`}>
      <span className={styles.visualLabel}>{channelMode === "OFFICIAL" ? "Meta oficial" : "QR Code"}</span>
      <div className={styles.channelCompare}>
        <article data-active={isMeta ? "true" : "false"}>
          <strong>Meta</strong>
          <span>Botões oficiais</span>
          <span>Templates aprovados</span>
          <span>Lista interativa</span>
        </article>
        <article data-active={!isMeta ? "true" : "false"}>
          <strong>QR Code</strong>
          <span>Texto numerado</span>
          <span>Sem templates Meta</span>
          <span>Resposta por número</span>
        </article>
      </div>
      <div className={styles.botPhonePreview} data-provider={provider}>
        <strong>{isMeta ? "Escolha uma opção:" : "Escolha uma opção respondendo o número:"}</strong>
        <span>{isMeta ? "Orçamento" : "1. Orçamento"}</span>
        <span>{isMeta ? "Agendar" : "2. Agendar"}</span>
        <span>{isMeta ? "Atendente" : "3. Atendente"}</span>
      </div>
    </div>
  );
}

function BotVoiceOptions({
  draft,
  recoveryEnabled,
  prospectionEnabled,
  onChange,
}: {
  draft: BotSetupDraft;
  recoveryEnabled: boolean;
  prospectionEnabled: boolean;
  onChange: (patch: Partial<BotSetupDraft>) => void;
}) {
  return (
    <div className={`${styles.visualCard} ${styles.botConfigCard}`}>
      <span className={styles.visualLabel}>Resposta</span>
      <div className={styles.segmentStack}>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.responseStyle === "support" ? "true" : "false"}
          onClick={() => onChange({ responseStyle: "support", botType: "atendimento", firstContactRules: getDefaultFirstContactRules("atendimento"), messages: getDefaultBotMessages("atendimento") })}
        >
          <strong>Atendimento humano e direto</strong>
          <span>Responde inbound, mantém contexto e entrega para humano quando necessário.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.responseStyle === "prospecting" ? "true" : "false"}
          data-disabled={prospectionEnabled ? "false" : "true"}
          disabled={!prospectionEnabled}
          onClick={() => onChange({ responseStyle: "prospecting", botType: "prospeccao", firstContactRules: getDefaultFirstContactRules("prospeccao"), messages: getDefaultBotMessages("prospeccao") })}
        >
          <strong>Prospecção cuidadosa</strong>
          <span>Abre contato com lead, demora entre clientes e para quando houver rejeição.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.responseStyle === "recovery" ? "true" : "false"}
          data-disabled={recoveryEnabled ? "false" : "true"}
          disabled={!recoveryEnabled}
          onClick={() => onChange({ responseStyle: "recovery", botType: "recovery", firstContactRules: getDefaultFirstContactRules("recovery"), messages: getDefaultBotMessages("recovery") })}
        >
          <strong>Recovery financeiro</strong>
          <span>Trata cobrança com opt-in, negociação e humano em contestação.</span>
        </button>
      </div>
    </div>
  );
}

function BotRulesOptions({
  draft,
  onChange,
}: {
  draft: BotSetupDraft;
  onChange: (patch: Partial<BotSetupDraft>) => void;
}) {
  return (
    <div className={`${styles.visualCard} ${styles.botConfigCard}`}>
      <span className={styles.visualLabel}>Regras</span>
      <div className={styles.segmentStack}>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.firstContactRules.canInitiateConversation ? "true" : "false"}
          onClick={() =>
            draft.botType === "atendimento"
              ? undefined
              : onChange({
                  firstContactRules: {
                    ...draft.firstContactRules,
                    canInitiateConversation: !draft.firstContactRules.canInitiateConversation,
                  },
                })
          }
        >
          <strong>{draft.firstContactRules.canInitiateConversation ? "Pode iniciar conversa" : "Só responde quem chamou"}</strong>
          <span>
            {draft.botType === "atendimento"
              ? "Atendimento fica inbound por padrão."
              : `${draft.firstContactRules.nextContactDelayMinutes}min antes de chamar outro cliente.`}
          </span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active="true"
          onClick={() =>
            onChange({
              firstContactRules: {
                ...draft.firstContactRules,
                typingSeconds: draft.firstContactRules.typingSeconds >= 10 ? 5 : draft.firstContactRules.typingSeconds + 2,
              },
            })
          }
        >
          <strong>Typing humano: {draft.firstContactRules.typingSeconds}s</strong>
          <span>Mostra digitando antes de responder e soma variação de {draft.firstContactRules.typingVarianceSeconds}s.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.firstContactRules.requireOptIn ? "true" : "false"}
          onClick={() =>
            onChange({
              firstContactRules: {
                ...draft.firstContactRules,
                requireOptIn: !draft.firstContactRules.requireOptIn,
              },
            })
          }
        >
          <strong>{draft.firstContactRules.requireOptIn ? "Opt-in obrigatório" : "Opt-in flexível"}</strong>
          <span>Recovery usa relação prévia; Prospecção respeita rejeição e baixa cadência.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.unknownHandling === "human" ? "true" : "false"}
          onClick={() => onChange({ unknownHandling: "human" })}
        >
          <strong>Fora do roteiro vai para humano</strong>
          <span>Mais seguro para vendas e reclamações.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.unknownHandling === "menu" ? "true" : "false"}
          onClick={() => onChange({ unknownHandling: "menu" })}
        >
          <strong>Fora do roteiro volta ao menu</strong>
          <span>Útil quando o time quer triagem mais insistente.</span>
        </button>
        <button
          type="button"
          className={styles.segmentOption}
          data-active={draft.businessHoursMode === "always" ? "true" : "false"}
          onClick={() => onChange({ businessHoursMode: draft.businessHoursMode === "always" ? "business" : "always" })}
        >
          <strong>{draft.businessHoursMode === "always" ? "Responder sempre" : "Priorizar horário comercial"}</strong>
          <span>Controla o tom da saudação e a expectativa de atendimento.</span>
        </button>
      </div>
    </div>
  );
}

function BotLiveOrganogram({
  draft,
  provider,
  channelMode,
  activeStep,
}: {
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  activeStep: TutorialStep;
}) {
  const isMeta = provider === "meta";
  const activeOrder: Partial<Record<TutorialStep, number>> = {
    "bot-type": 1,
    "bot-channel": 2,
    "bot-voice": 3,
    "bot-rules": 4,
    "bot-review": 5,
    "bot-built": 6,
  };
  const level = activeOrder[activeStep] || 0;
  const primaryRoute = draft.botType === "recovery" ? draft.messages.infoButtonLabel : draft.messages.primaryButtonLabel;
  const fallback = draft.unknownHandling === "human" ? draft.messages.humanButtonLabel : "Voltar ao menu";

  const nodes = [
    {
      key: "entrada",
      title: draft.firstContactRules.canInitiateConversation ? "Inicia 1º contato" : "Recebe WhatsApp",
      text: draft.firstContactRules.canInitiateConversation ? `${draft.firstContactRules.nextContactDelayMinutes}min entre clientes` : channelMode === "OFFICIAL" ? "Meta oficial" : "QR Code vinculado",
      level: 1,
    },
    {
      key: "horario",
      title: "Resolve horário",
      text: `${draft.messages.morning} / ${draft.messages.afternoon} / ${draft.messages.night}`,
      level: 3,
    },
    {
      key: "cliente",
      title: "Identifica contexto",
      text: draft.botType === "recovery" ? "Pendencia, pagamento ou contestacao" : "Novo, conhecido, agenda ou humano",
      level: 3,
    },
    {
      key: "menu",
      title: isMeta ? "Mostra botões" : "Mostra números",
      text: isMeta
        ? `${primaryRoute} · ${draft.messages.agendaButtonLabel} · ${draft.messages.humanButtonLabel}`
        : `1 ${primaryRoute} · 2 ${draft.messages.agendaButtonLabel} · 3 ${draft.messages.humanButtonLabel}`,
      level: 2,
    },
    {
      key: "ramo1",
      title: draft.botType === "recovery" ? "Tratativa financeira" : draft.botType === "prospeccao" ? "Qualifica interesse" : "Resolve solicitação",
      text: draft.botType === "recovery" ? draft.messages.recoveryDetectedMessage : draft.messages.primaryResponse,
      level: 4,
    },
    {
      key: "ramo2",
      title: draft.botType === "recovery" ? "Negociar" : draft.botType === "prospeccao" ? "Falar depois" : "Agenda",
      text: draft.botType === "atendimento" ? "Abre horários disponíveis e retorna contexto" : "Respeita cadência antes de novo contato",
      level: 4,
    },
    {
      key: "humano",
      title: "Handoff humano",
      text: fallback,
      level: 4,
    },
    {
      key: "final",
      title: "Parada segura",
      text: draft.messages.closeTopicMessage,
      level: 5,
    },
  ];

  return (
    <div className={styles.botMapCard}>
      <div className={styles.botMapHeader}>
        <span className={styles.visualLabel}>Organograma</span>
        <strong>{getTutorialBotLabel(draft.botType)}</strong>
      </div>
      <div className={styles.botMapRail}>
        {nodes.map((node, index) => (
          <article
            key={node.key}
            className={styles.botMapNode}
            data-active={level >= node.level ? "true" : "false"}
            data-current={level === node.level ? "true" : "false"}
          >
            <i>{String(index + 1).padStart(2, "0")}</i>
            <span>
              <strong>{node.title}</strong>
              <small>{node.text}</small>
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className={styles.editableField}>
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function BotMessageEditor({
  draft,
  onMessageChange,
  compact = false,
}: {
  draft: BotSetupDraft;
  onMessageChange: (field: keyof BotMessageDraft, value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? styles.botEditorCompact : styles.botEditorGrid}>
      <div className={styles.timeEditorRow}>
        <EditableField label="Manhã" value={draft.messages.morning} onChange={(value) => onMessageChange("morning", value)} />
        <EditableField label="Tarde" value={draft.messages.afternoon} onChange={(value) => onMessageChange("afternoon", value)} />
        <EditableField label="Noite" value={draft.messages.night} onChange={(value) => onMessageChange("night", value)} />
      </div>
      <EditableField label="Mensagem inicial" value={draft.messages.welcomeMessage} multiline onChange={(value) => onMessageChange("welcomeMessage", value)} />
      <EditableField label="Cliente conhecido" value={draft.messages.returningCustomerMessage} multiline onChange={(value) => onMessageChange("returningCustomerMessage", value)} />
      <EditableField label="Menu principal" value={draft.messages.mainMenuPrompt} multiline onChange={(value) => onMessageChange("mainMenuPrompt", value)} />
      <EditableField label="Mensagem Recovery" value={draft.messages.recoveryDetectedMessage} multiline onChange={(value) => onMessageChange("recoveryDetectedMessage", value)} />
      <div className={styles.timeEditorRow}>
        <EditableField label="Botão 1" value={draft.messages.primaryButtonLabel} onChange={(value) => onMessageChange("primaryButtonLabel", value)} />
        <EditableField label="Botão agenda" value={draft.messages.agendaButtonLabel} onChange={(value) => onMessageChange("agendaButtonLabel", value)} />
        <EditableField label="Botão infos" value={draft.messages.infoButtonLabel} onChange={(value) => onMessageChange("infoButtonLabel", value)} />
      </div>
      <EditableField label="Botão humano" value={draft.messages.humanButtonLabel} onChange={(value) => onMessageChange("humanButtonLabel", value)} />
      <EditableField label="Resposta do botão 1" value={draft.messages.primaryResponse} multiline onChange={(value) => onMessageChange("primaryResponse", value)} />
      <EditableField label="Resposta informações" value={draft.messages.infoResponse} multiline onChange={(value) => onMessageChange("infoResponse", value)} />
      <EditableField label="Pós-ação / fallback" value={draft.messages.postActionPrompt} multiline onChange={(value) => onMessageChange("postActionPrompt", value)} />
      <EditableField label="Mensagem para humano" value={draft.messages.humanAckMessage} multiline onChange={(value) => onMessageChange("humanAckMessage", value)} />
      <EditableField label="Encerramento" value={draft.messages.closeTopicMessage} multiline onChange={(value) => onMessageChange("closeTopicMessage", value)} />
    </div>
  );
}

function BotReviewCard({
  draft,
  provider,
  channelMode,
  onMessageChange,
}: {
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  onMessageChange: (field: keyof BotMessageDraft, value: string) => void;
}) {
  const botLabel = getTutorialBotLabel(draft.botType);
  return (
    <div className={`${styles.visualCard} ${styles.botConfigCard} ${styles.botReviewCard}`}>
      <span className={styles.visualLabel}>Revisão</span>
      <div className={styles.reviewRows}>
        <span>
          <strong>Tipo</strong>
          <small>{botLabel}</small>
        </span>
        <span>
          <strong>Canal</strong>
          <small>{channelMode === "OFFICIAL" ? "Meta oficial" : "QR Code"} · {getProviderLabel(provider)}</small>
        </span>
        <span>
          <strong>Interação</strong>
          <small>{provider === "meta" ? "botões/templates quando aprovados" : "texto numerado sem botões oficiais"}</small>
        </span>
        <span>
          <strong>Falha de entendimento</strong>
          <small>{draft.unknownHandling === "human" ? "encaminha humano" : "volta ao menu"}</small>
        </span>
        <span>
          <strong>1º contato</strong>
          <small>
            {draft.firstContactRules.canInitiateConversation
              ? `${draft.firstContactRules.nextContactDelayMinutes}min entre clientes`
              : "somente inbound"}
          </small>
        </span>
      </div>
      <BotMessageEditor draft={draft} onMessageChange={onMessageChange} compact />
    </div>
  );
}

function BotBuiltEditor({
  draft,
  provider,
  channelMode,
  recoveryEnabled,
  prospectionEnabled,
  onDraftChange,
  onMessageChange,
  saved,
}: {
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  recoveryEnabled: boolean;
  prospectionEnabled: boolean;
  onDraftChange: (patch: Partial<BotSetupDraft>) => void;
  onMessageChange: (field: keyof BotMessageDraft, value: string) => void;
  saved?: boolean;
}) {
  const [previewPeriod, setPreviewPeriod] = useState<"morning" | "afternoon" | "night">("morning");
  const [selectedMapNode, setSelectedMapNode] = useState<TutorialBotMapNodeId>("menu");
  const channelLabel = channelMode === "OFFICIAL" ? "Meta oficial" : "QR Code";
  const providerName = getProviderLabel(provider);
  const chooseBuiltBot = (botType: TutorialBotType) => {
    if (botType === "recovery" && !recoveryEnabled) return;
    if (botType === "prospeccao" && !prospectionEnabled) return;
    onDraftChange({
      botType,
      responseStyle: getTutorialResponseStyle(botType),
      firstContactRules: getDefaultFirstContactRules(botType),
      messages: getDefaultBotMessages(botType),
    });
    setSelectedMapNode(botType === "recovery" ? "recovery" : "menu");
  };

  return (
    <div className={styles.botBuiltWorkspace}>
      <section className={`${styles.botBuiltPanel} ${styles.botBuiltEditorPanel}`}>
        <div className={styles.botBuiltPanelHeader}>
          <div>
            <span className={styles.visualLabel}>Editor</span>
            <strong>Resultado preenchido</strong>
            <p className={styles.botBuiltMicrocopy}>Edite textos, horários e regras que serão salvos no bot.</p>
          </div>
          <small>{channelLabel} · {providerName}</small>
        </div>
        <div className={styles.botBuiltSaveState} data-saved={saved ? "true" : "false"}>
          <strong>{saved ? "Configuração salva e aplicada" : "Edição pendente"}</strong>
          <span>{saved ? "Bot ativo no Inbox" : "Clique em Salvar para aplicar no Inbox"}</span>
        </div>

        <div className={styles.botFinalModeGrid} aria-label="Configuração final do bot">
          <button
            type="button"
            data-active={draft.botType === "atendimento" ? "true" : "false"}
            data-disabled="false"
            onClick={() => chooseBuiltBot("atendimento")}
          >
            <strong>Atendimento</strong>
            <span>Responde inbound</span>
          </button>
          <button
            type="button"
            data-active={draft.botType === "prospeccao" ? "true" : "false"}
            data-disabled={prospectionEnabled ? "false" : "true"}
            disabled={!prospectionEnabled}
            title={prospectionEnabled ? "Prospecção" : "Exige Vendas + Bot IA no plano"}
            onClick={() => chooseBuiltBot("prospeccao")}
          >
            <strong>Prospecção</strong>
            <span>{prospectionEnabled ? "Inicia leads" : "Plano indisponível"}</span>
          </button>
          <button
            type="button"
            data-active={draft.botType === "recovery" ? "true" : "false"}
            data-disabled={recoveryEnabled ? "false" : "true"}
            disabled={!recoveryEnabled}
            title={recoveryEnabled ? "Recovery" : "Disponível no plano com Recovery"}
            onClick={() => chooseBuiltBot("recovery")}
          >
            <strong>Recovery</strong>
            <span>{recoveryEnabled ? "Inicia cobrança" : "Plano indisponível"}</span>
          </button>
        </div>

        <div className={styles.botFirstContactSummary}>
          <span>
            <strong>1º contato</strong>
            {draft.firstContactRules.canInitiateConversation ? "Bot inicia conversa" : "Somente quando o cliente chama"}
          </span>
          <span>
            <strong>Cadência</strong>
            {draft.firstContactRules.nextContactDelayMinutes}min entre clientes · {draft.firstContactRules.messageIntervalSeconds}s entre mensagens
          </span>
          <span>
            <strong>Humanização</strong>
            typing {draft.firstContactRules.typingSeconds}s + variação {draft.firstContactRules.typingVarianceSeconds}s
          </span>
        </div>

        <div className={styles.botFinalRuleGrid}>
          <button
            type="button"
            data-active={draft.unknownHandling === "human" ? "true" : "false"}
            onClick={() => onDraftChange({ unknownHandling: "human" })}
          >
            Fora do roteiro: humano
          </button>
          <button
            type="button"
            data-active={draft.unknownHandling === "menu" ? "true" : "false"}
            onClick={() => onDraftChange({ unknownHandling: "menu" })}
          >
            Fora do roteiro: menu
          </button>
          <button
            type="button"
            data-active={draft.businessHoursMode === "always" ? "true" : "false"}
            onClick={() => onDraftChange({ businessHoursMode: "always" })}
          >
            Responder sempre
          </button>
          <button
            type="button"
            data-active={draft.businessHoursMode === "business" ? "true" : "false"}
            onClick={() => onDraftChange({ businessHoursMode: "business" })}
          >
            Horário comercial
          </button>
        </div>

        <div className={styles.botFinalEditorScroll}>
          <BotMessageEditor draft={draft} onMessageChange={onMessageChange} />
        </div>
      </section>

      <section className={`${styles.botBuiltPanel} ${styles.botBuiltMapPanel}`}>
        <div className={styles.botBuiltPanelHeader}>
          <div>
            <span className={styles.visualLabel}>Mapa do bot</span>
            <strong>{getTutorialBotLabel(draft.botType)}</strong>
            <p className={styles.botBuiltMicrocopy}>Fluxo clicável gerado a partir do que foi preenchido.</p>
          </div>
          <small>ao vivo</small>
        </div>
        <BotPremiumOrganogram
          draft={draft}
          provider={provider}
          channelMode={channelMode}
          selectedNodeId={selectedMapNode}
          onSelectNode={setSelectedMapNode}
        />
      </section>

      <BotWhatsAppShowcase
        draft={draft}
        provider={provider}
        channelMode={channelMode}
        selectedNodeId={selectedMapNode}
        period={previewPeriod}
        onPeriodChange={setPreviewPeriod}
      />
    </div>
  );
}

function compactBotText(value: string, fallback: string, maxLength = 74) {
  const cleaned = String(value || "")
    .replace(/\{\{\s*cumprimentacao\s*\}\}/gi, "Cumprimentação")
    .replace(/\{\{\s*empresa\s*\}\}/gi, "Empresa")
    .replace(/\{\{\s*cliente\s*\}\}/gi, "Cliente")
    .replace(/\s+/g, " ")
    .trim();
  const text = cleaned || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function getBotMenuLabels(draft: BotSetupDraft) {
  if (draft.botType === "prospeccao") {
    return [draft.messages.primaryButtonLabel, draft.messages.infoButtonLabel, draft.messages.agendaButtonLabel, "Não tenho interesse"];
  }
  if (draft.botType === "recovery") {
    return [draft.messages.infoButtonLabel, draft.messages.primaryButtonLabel, draft.messages.agendaButtonLabel, draft.messages.humanButtonLabel];
  }
  return [draft.messages.primaryButtonLabel, draft.messages.agendaButtonLabel, draft.messages.infoButtonLabel, draft.messages.humanButtonLabel];
}

type TutorialBotMapNodeId =
  | "entry"
  | "new"
  | "located"
  | "register"
  | "menu"
  | "agenda"
  | "post"
  | "recovery"
  | "human"
  | "hours"
  | "closing"
  | "blocked";

function getTutorialBotPath(nodeId: TutorialBotMapNodeId): TutorialBotMapNodeId[] {
  const paths: Record<TutorialBotMapNodeId, TutorialBotMapNodeId[]> = {
    entry: ["entry"],
    new: ["entry", "new"],
    located: ["entry", "located"],
    register: ["entry", "new", "register"],
    menu: ["entry", "located", "menu"],
    agenda: ["entry", "located", "menu", "agenda"],
    post: ["entry", "located", "menu", "post"],
    recovery: ["entry", "located", "recovery"],
    human: ["entry", "located", "menu", "post", "human"],
    hours: ["entry", "hours"],
    closing: ["entry", "located", "menu", "post", "closing"],
    blocked: ["entry", "blocked"],
  };

  return paths[nodeId] || paths.menu;
}

function getTutorialBotNodeTitle(nodeId: TutorialBotMapNodeId) {
  const titles: Record<TutorialBotMapNodeId, string> = {
    entry: "Entrada",
    new: "Cliente novo",
    located: "Cliente localizado",
    register: "Cadastro rápido",
    menu: "Menu principal",
    agenda: "Agenda",
    post: "Pós-ação",
    recovery: "Recovery",
    human: "Humano",
    hours: "Fora de horário",
    closing: "Encerramento",
    blocked: "Bloqueado",
  };

  return titles[nodeId];
}

function BotPremiumOrganogram({
  draft,
  provider,
  channelMode,
  selectedNodeId,
  onSelectNode,
}: {
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  selectedNodeId: TutorialBotMapNodeId;
  onSelectNode: (nodeId: TutorialBotMapNodeId) => void;
}) {
  const isMeta = provider === "meta";
  const menuLabels = getBotMenuLabels(draft);
  const activeNodeIds = new Set(getTutorialBotPath(selectedNodeId));
  const primaryRoute = draft.botType === "recovery" ? draft.messages.recoveryDetectedMessage : draft.messages.primaryResponse;
  const postActionText =
    draft.unknownHandling === "human"
      ? draft.messages.postActionPrompt
      : "Volta ao menu principal quando sair do roteiro.";
  const initiationText = draft.firstContactRules.canInitiateConversation
    ? `${draft.firstContactRules.nextContactDelayMinutes}min entre clientes`
    : "Cliente chama primeiro";
  const nodes: Array<{
    id: TutorialBotMapNodeId;
    x: number;
    y: number;
    title: string;
    text: string;
    tone: string;
  }> = [
    { id: "entry", x: 8, y: 50, title: draft.firstContactRules.canInitiateConversation ? "1º contato" : "Entrada", text: initiationText, tone: "entry" },
    { id: "new", x: 25, y: 28, title: "Cliente novo", text: "Cadastro e primeira triagem", tone: "primary" },
    { id: "located", x: 25, y: 60, title: "Cliente localizado", text: compactBotText(draft.messages.returningCustomerMessage, "Retoma com contexto", 42), tone: "primary" },
    { id: "register", x: 44, y: 14, title: "Cadastro rápido", text: "Nome confirmado", tone: "info" },
    { id: "menu", x: 44, y: 46, title: "Menu principal", text: `${isMeta ? "Botões" : "Lista"}: ${menuLabels.join(" · ")}`, tone: "menu" },
    { id: "agenda", x: 63, y: 17, title: draft.botType === "prospeccao" ? "Retomar depois" : draft.botType === "recovery" ? "Negociação" : "Agenda", text: draft.botType === "recovery" ? "Parcelar ou negociar" : "Horários e retorno", tone: "agenda" },
    { id: "post", x: 63, y: 44, title: "Pós-ação", text: compactBotText(postActionText, "Continuidade", 46), tone: "post" },
    { id: "recovery", x: 63, y: 68, title: "Recovery", text: draft.botType === "recovery" ? compactBotText(draft.messages.recoveryDetectedMessage, "Tratativa financeira", 44) : "Plano / regra financeira", tone: draft.botType === "recovery" ? "post" : "muted" },
    { id: "human", x: 82, y: 30, title: "Humano", text: compactBotText(draft.messages.humanAckMessage, "Passa para atendente", 42), tone: "human" },
    { id: "hours", x: 82, y: 52, title: "Anti-spam", text: `typing ${draft.firstContactRules.typingSeconds}s · pausa ${draft.firstContactRules.messageIntervalSeconds}s`, tone: "smart" },
    { id: "closing", x: 82, y: 74, title: "Encerramento", text: compactBotText(draft.messages.closeTopicMessage, "Assunto finalizado", 42), tone: "end" },
    { id: "blocked", x: 44, y: 84, title: "Bloqueado", text: "BOT_OFF ou contato bloqueado", tone: "muted" },
  ];
  const edges = [
    { id: "entry-new", from: "entry", to: "new", path: "M80 300 C145 300 185 170 250 168", label: "Cliente novo", tone: "main", x: 160, y: 218 },
    { id: "entry-located", from: "entry", to: "located", path: "M80 300 C150 300 180 360 250 360", label: "Cliente localizado", tone: "main", x: 162, y: 338 },
    { id: "new-register", from: "new", to: "register", path: "M250 168 C320 130 360 84 440 84", label: "Nome", tone: "smart", x: 342, y: 112 },
    { id: "new-menu", from: "new", to: "menu", path: "M250 168 C330 180 356 276 440 276", label: "Menu", tone: "main", x: 340, y: 224 },
    { id: "located-menu", from: "located", to: "menu", path: "M250 360 C326 348 360 276 440 276", label: "Menu", tone: "main", x: 342, y: 318 },
    { id: "located-recovery", from: "located", to: "recovery", path: "M250 360 C380 386 500 408 630 408", label: "Débito", tone: "muted", x: 446, y: 392 },
    { id: "located-blocked", from: "located", to: "blocked", path: "M250 360 C328 432 352 504 440 504", label: "BOT_OFF", tone: "muted", x: 336, y: 452 },
    { id: "entry-hours", from: "entry", to: "hours", path: "M80 300 C330 252 590 290 820 312", label: "Horário", tone: "smart", x: 492, y: 286 },
    { id: "entry-blocked", from: "entry", to: "blocked", path: "M80 300 C224 428 310 500 440 504", label: "BOT_OFF", tone: "muted", x: 250, y: 444 },
    { id: "menu-agenda", from: "menu", to: "agenda", path: "M440 276 C510 206 550 102 630 102", label: draft.messages.agendaButtonLabel, tone: "choice", x: 536, y: 164 },
    { id: "menu-post", from: "menu", to: "post", path: "M440 276 C500 276 570 264 630 264", label: draft.messages.primaryButtonLabel, tone: "choice", x: 535, y: 262 },
    { id: "menu-human", from: "menu", to: "human", path: "M440 276 C570 238 682 180 820 180", label: draft.messages.humanButtonLabel, tone: "choice", x: 628, y: 210 },
    { id: "menu-hours", from: "menu", to: "hours", path: "M440 276 C585 302 676 312 820 312", label: "Horário", tone: "smart", x: 632, y: 302 },
    { id: "agenda-post", from: "agenda", to: "post", path: "M630 102 C676 156 674 226 630 264", label: "Retorno", tone: "main", x: 692, y: 178 },
    { id: "post-human", from: "post", to: "human", path: "M630 264 C700 236 746 184 820 180", label: "Atendente", tone: "choice", x: 720, y: 222 },
    { id: "post-closing", from: "post", to: "closing", path: "M630 264 C718 326 744 440 820 444", label: "Finalizar", tone: "main", x: 734, y: 358 },
  ];
  const isEdgeActive = (from: TutorialBotMapNodeId, to: TutorialBotMapNodeId) => {
    const path = getTutorialBotPath(selectedNodeId);
    return path.some((nodeId, index) => nodeId === from && path[index + 1] === to);
  };

  return (
    <div className={styles.premiumMapBoard} data-channel={channelMode.toLowerCase()}>
      <svg className={styles.premiumMapLines} viewBox="0 0 1000 600" aria-hidden="true">
        {edges.map((edge) => (
          <g key={edge.id} data-tone={edge.tone} data-active={isEdgeActive(edge.from as TutorialBotMapNodeId, edge.to as TutorialBotMapNodeId) ? "true" : "false"}>
            <path d={edge.path} />
            <text x={edge.x} y={edge.y}>{compactBotText(edge.label, "Fluxo", 18)}</text>
          </g>
        ))}
      </svg>
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={styles.premiumMapNode}
          data-tone={node.tone}
          data-active={activeNodeIds.has(node.id) ? "true" : "false"}
          data-selected={selectedNodeId === node.id ? "true" : "false"}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          onClick={() => onSelectNode(node.id)}
          aria-pressed={selectedNodeId === node.id}
        >
          <i aria-hidden="true" />
          <strong>{node.title}</strong>
          <small>{node.text}</small>
        </button>
      ))}
      <div className={styles.premiumMapLegend}>
        <span>{isMeta ? "Botões oficiais" : "Lista numerada"}</span>
        <span>{getTutorialBotLabel(draft.botType)}</span>
        <span>Selecionado: {getTutorialBotNodeTitle(selectedNodeId)}</span>
        <span>{compactBotText(primaryRoute, "Resposta principal", 32)}</span>
      </div>
    </div>
  );
}

function renderTutorialBotMessage(message: string, draft: BotSetupDraft, period: "morning" | "afternoon" | "night") {
  const greeting = period === "morning" ? draft.messages.morning : period === "afternoon" ? draft.messages.afternoon : draft.messages.night;
  const replacements: Record<string, string> = {
    cumprimentacao: greeting,
    cliente: "Rafaela",
    empresa: "HBX Prime",
    funcionario: "Time HBX",
    valor_formatado: "R$ 480,00",
    agenda_nome: "Atendimento",
    agenda_slots: "Hoje 15:00 | Amanhã 09:30",
  };

  return String(message || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => replacements[String(token).toLowerCase()] || `[${token}]`)
    .trim();
}

type TutorialWhatsAppTimelineItem = {
  id: string;
  author: "customer" | "bot";
  phase: string;
  text: string;
  options?: string[];
};

function buildTutorialWhatsAppTimeline(
  draft: BotSetupDraft,
  selectedNodeId: TutorialBotMapNodeId,
  period: "morning" | "afternoon" | "night",
): TutorialWhatsAppTimelineItem[] {
  const path = getTutorialBotPath(selectedNodeId);
  const menuLabels = getBotMenuLabels(draft);
  const mainActionLabel = draft.messages.primaryButtonLabel;
  const mainActionResponse = draft.botType === "recovery" ? draft.messages.recoveryDetectedMessage : draft.messages.primaryResponse;
  const timeline: TutorialWhatsAppTimelineItem[] = [
    {
      id: "customer-entry",
      author: "customer",
      phase: "Cliente",
      text: draft.firstContactRules.canInitiateConversation ? "Contato recebido na fila." : "Oi, preciso de atendimento.",
    },
    {
      id: "typing-entry",
      author: "bot",
      phase: "Digitando",
      text: `typing por ${draft.firstContactRules.typingSeconds}s, com variação humana de até ${draft.firstContactRules.typingVarianceSeconds}s.`,
    },
    {
      id: "entry",
      author: "bot",
      phase: draft.firstContactRules.canInitiateConversation ? "1º contato" : "Entrada",
      text: renderTutorialBotMessage(draft.messages.welcomeMessage, draft, period) || "Mensagem inicial do bot.",
    },
  ];

  if (path.includes("new")) {
    timeline.push(
      {
        id: "customer-new",
        author: "customer",
        phase: "Cliente novo",
        text: "Ainda não tenho cadastro.",
      },
      {
        id: "new",
        author: "bot",
        phase: "Cliente novo",
        text: "Sem problema. Vou fazer um cadastro rápido para manter seu atendimento organizado.",
      },
    );
  }

  if (path.includes("register")) {
    timeline.push(
      {
        id: "customer-register",
        author: "customer",
        phase: "Cadastro",
        text: "Meu nome é Rafaela.",
      },
      {
        id: "register",
        author: "bot",
        phase: "Cadastro rápido",
        text: "Perfeito, Rafaela. Cadastro confirmado. Agora vou te mostrar as opções certas.",
      },
    );
  }

  if (path.includes("located")) {
    timeline.push({
      id: "located",
      author: "bot",
      phase: "Cliente localizado",
      text: renderTutorialBotMessage(draft.messages.returningCustomerMessage, draft, period) || "Encontrei seu histórico e vou continuar com contexto.",
    });
  }

  if (path.includes("menu")) {
    timeline.push({
      id: "menu",
      author: "bot",
      phase: "Menu principal",
      text: renderTutorialBotMessage(draft.messages.mainMenuPrompt, draft, period) || "Escolha abaixo como deseja continuar.",
      options: menuLabels,
    });
  }

  if (path.includes("agenda")) {
    timeline.push(
      {
        id: "customer-agenda",
        author: "customer",
        phase: "Agenda",
        text: draft.messages.agendaButtonLabel,
      },
      {
        id: "agenda",
        author: "bot",
        phase: draft.botType === "recovery" ? "Negociação" : draft.botType === "prospeccao" ? "Retomar depois" : "Agenda",
        text:
          draft.botType === "recovery"
            ? "Vamos registrar uma negociação e seguir pelo melhor caminho para o seu caso."
            : draft.botType === "prospeccao"
              ? "Combinado. Vou deixar para retomar em outro momento e não vou ficar insistindo por aqui."
              : "Perfeito. Vou separar horários disponíveis e deixar o contexto pronto para o atendimento.",
      },
      {
        id: "agenda-slots",
        author: "bot",
        phase: draft.botType === "atendimento" ? "Agenda" : "Cadência",
        text:
          draft.botType === "atendimento"
            ? "Tenho Hoje 15:00 ou Amanhã 09:30. Qual horário prefere?"
            : `Próximo contato só depois de ${draft.firstContactRules.nextContactDelayMinutes}min e no máximo ${draft.firstContactRules.maxFirstContactsPerHour}/h.`,
      },
    );
  }

  if (path.includes("post")) {
    timeline.push(
      {
        id: "customer-post",
        author: "customer",
        phase: "Escolha",
        text: mainActionLabel,
      },
      {
        id: "post-response",
        author: "bot",
        phase: "Pós-ação",
        text: renderTutorialBotMessage(mainActionResponse, draft, period) || "Vou seguir com essa solicitação.",
      },
      {
        id: "post",
        author: "bot",
        phase: "Pós-ação",
        text: renderTutorialBotMessage(draft.messages.postActionPrompt, draft, period) || "Se a resposta não resolver, eu encaminho para um atendente com contexto.",
        options: draft.unknownHandling === "human" ? ["Menu", draft.messages.humanButtonLabel] : ["Voltar ao menu"],
      },
    );
  }

  if (path.includes("recovery")) {
    timeline.push({
      id: "recovery",
      author: "bot",
      phase: "Recovery",
      text:
        draft.botType === "recovery"
          ? renderTutorialBotMessage(draft.messages.recoveryDetectedMessage, draft, period)
          : "Identifiquei que este contato precisa de tratamento financeiro. Este ramo respeita plano e regras do Recovery.",
    });
  }

  if (path.includes("human")) {
    timeline.push(
      {
        id: "customer-human",
        author: "customer",
        phase: "Humano",
        text: draft.messages.humanButtonLabel,
      },
      {
        id: "human",
        author: "bot",
        phase: "Humano",
        text: renderTutorialBotMessage(draft.messages.humanAckMessage, draft, period) || "Vou encaminhar sua conversa para um atendente agora.",
      },
    );
  }

  if (path.includes("hours")) {
    timeline.push({
      id: "hours",
      author: "bot",
      phase: "Fora de horário",
      text:
        draft.businessHoursMode === "business"
          ? "Agora estamos fora do horário comercial. Vou registrar sua solicitação e o time continua assim que retornar."
          : "A regra atual permite resposta automática em qualquer horário.",
    });
  }

  if (path.includes("closing")) {
    timeline.push({
      id: "closing",
      author: "bot",
      phase: "Encerramento",
      text: "Atendimento finalizado. Se precisar, é só chamar novamente por aqui.",
    });
  }

  if (path.includes("blocked")) {
    timeline.push({
      id: "blocked",
      author: "bot",
      phase: "Bloqueado",
      text: "Este contato está com BOT_OFF ou bloqueado. Nenhuma resposta automática será enviada.",
    });
  }

  return timeline;
}

function BotWhatsAppShowcase({
  draft,
  provider,
  channelMode,
  selectedNodeId,
  period,
  onPeriodChange,
}: {
  draft: BotSetupDraft;
  provider: ChannelProvider;
  channelMode: "QR" | "OFFICIAL";
  selectedNodeId: TutorialBotMapNodeId;
  period: "morning" | "afternoon" | "night";
  onPeriodChange: (period: "morning" | "afternoon" | "night") => void;
}) {
  const isMeta = provider === "meta";
  const timeline = buildTutorialWhatsAppTimeline(draft, selectedNodeId, period);

  return (
    <aside className={`${styles.botBuiltPanel} ${styles.botWhatsappPanel}`}>
      <div className={styles.botBuiltPanelHeader}>
        <div>
          <span className={styles.visualLabel}>WhatsApp</span>
          <strong>{getTutorialBotNodeTitle(selectedNodeId)}</strong>
          <p className={styles.botBuiltMicrocopy}>Simulação da conversa conforme o nó selecionado.</p>
        </div>
        <small>{channelMode === "OFFICIAL" ? "oficial" : "QR ativo"}</small>
      </div>

      <div className={styles.whatsappPeriodTabs} role="tablist" aria-label="Período da saudação">
        <button type="button" data-active={period === "morning" ? "true" : "false"} onClick={() => onPeriodChange("morning")}>Manhã</button>
        <button type="button" data-active={period === "afternoon" ? "true" : "false"} onClick={() => onPeriodChange("afternoon")}>Tarde</button>
        <button type="button" data-active={period === "night" ? "true" : "false"} onClick={() => onPeriodChange("night")}>Noite</button>
      </div>

      <div className={styles.whatsappPhone}>
        <div className={styles.whatsappTopbar}>
          <span className={styles.whatsappAvatar}>HBX</span>
          <div>
            <strong>Atendimento</strong>
            <small>online agora</small>
          </div>
          <i aria-hidden="true" />
        </div>
        <div className={styles.whatsappBody}>
          <span className={styles.whatsappDate}>Hoje</span>
          {timeline.map((item, index) =>
            item.author === "customer" ? (
              <div key={`${item.id}-${index}`} className={styles.whatsappCustomerBubble}>
                {item.text}
              </div>
            ) : (
              <div key={`${item.id}-${index}`} className={styles.whatsappBotBubble} data-menu={item.options?.length ? "true" : "false"}>
                <small className={styles.whatsappPhase}>{item.phase}</small>
                <p>{item.text}</p>
                {item.options?.length ? (
                  isMeta ? (
                    <div className={styles.whatsappOfficialButtons}>
                      {item.options.map((label) => <button key={label} type="button">{label}</button>)}
                    </div>
                  ) : (
                    <ol className={styles.whatsappNumberedList}>
                      {item.options.map((label) => <li key={label}>{label}</li>)}
                    </ol>
                  )
                ) : null}
              </div>
            ),
          )}
        </div>
        <div className={styles.whatsappComposer}>
          <span>Mensagem</span>
          <strong>+</strong>
        </div>
      </div>
    </aside>
  );
}

function ThemeMockup({
  tone,
  title,
  themeLabel,
  selected,
  onSelect,
}: {
  tone: "light" | "dark";
  title: string;
  themeLabel: string;
  selected: boolean;
  onSelect: (target: EventTarget | null) => void;
}) {
  return (
    <button
      type="button"
      className={styles.themeMockup}
      data-tone={tone}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      <span className={styles.mockTop}>HBX</span>
      <span className={styles.themeMockupTitle}>
        <strong>{title}</strong>
        <small>{selected ? themeLabel : "Clique para aplicar"}</small>
      </span>
      <div className={styles.mockCard}>
        <span />
        <i />
        <b />
      </div>
      <div className={styles.mockButtons}>
        <span />
        <span />
      </div>
    </button>
  );
}

function WebscrapingMockup() {
  const [activePreview, setActivePreview] = useState<"search" | "cards">("search");

  return (
    <div className={`${styles.visualCard} ${styles.webscrapingShowcase}`}>
      <div className={styles.visualHeader}>
        <span className={styles.visualLabel}>Radar Digital</span>
        <span className={styles.visualHint}>prévia real da operação</span>
      </div>

      <div className={styles.previewTabs} role="tablist" aria-label="Prévia do Radar Digital">
        <button
          type="button"
          className={styles.previewButton}
          data-active={activePreview === "search" ? "true" : "false"}
          onClick={() => setActivePreview("search")}
        >
          <span className={styles.previewThumb} data-kind="search" aria-hidden="true">
            <i />
            <b />
            <em />
          </span>
          <span>
            <strong>Busca real</strong>
            <small>cidade, segmento e filtros</small>
          </span>
        </button>

        <button
          type="button"
          className={styles.previewButton}
          data-active={activePreview === "cards" ? "true" : "false"}
          onClick={() => setActivePreview("cards")}
        >
          <span className={styles.previewThumb} data-kind="cards" aria-hidden="true">
            <i />
            <b />
            <em />
          </span>
          <span>
            <strong>Cards gerados</strong>
            <small>leads prontos para Vendas</small>
          </span>
        </button>
      </div>

      <div className={styles.previewStage} data-active-preview={activePreview}>
        <div className={styles.searchScreenshot} aria-hidden={activePreview !== "search"}>
          <div className={styles.screenshotTopbar}>
            <span>Consulta principal</span>
            <strong>API oficial</strong>
          </div>
          <div className={styles.searchFields}>
            <span>Cidade: Campinas</span>
            <span>Segmento: Clínicas</span>
            <span>Quantidade: 20</span>
          </div>
          <div className={styles.searchResults}>
            <span>Clínica Prime</span>
            <span>Odonto Norte</span>
            <span>Saúde Viva</span>
          </div>
          <strong className={styles.previewCta}>Enviar para Vendas</strong>
        </div>

        <div className={styles.cardsScreenshot} aria-hidden={activePreview !== "cards"}>
          <div className={styles.cardsLane}>
            <span>Novo</span>
            <article>
              <strong>Clínica Prime</strong>
              <small>Radar Digital · ligar hoje</small>
            </article>
            <article>
              <strong>Odonto Norte</strong>
              <small>WhatsApp disponível</small>
            </article>
          </div>
          <div className={styles.cardsLane}>
            <span>Retorno</span>
            <article>
              <strong>Saúde Viva</strong>
              <small>retorno 15h</small>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

function VendasMockup() {
  return (
    <div className={styles.visualCard}>
      <span className={styles.visualLabel}>Vendas</span>
      <div className={styles.pipelinePreview}>
        <span>Novo</span>
        <span>Retorno</span>
        <span>Atrasado</span>
      </div>
      <div className={styles.leadCard}>Clínica Prime · ligar hoje</div>
      <div className={styles.leadCard}>Auto Center · retorno 15h</div>
    </div>
  );
}

function AtendimentoMockup({ connected }: { connected: boolean }) {
  return (
    <div className={styles.visualCard}>
      <span className={styles.visualLabel}>Atendimento</span>
      <div className={styles.chatPreview}>
        <strong>{connected ? "WhatsApp conectado" : "WhatsApp pendente"}</strong>
        <span>Fila aberta</span>
        <p>Cliente quer orçamento para esta semana.</p>
      </div>
    </div>
  );
}

function WhatsAppChoiceMockup() {
  return (
    <div className={styles.visualCard}>
      <span className={styles.visualLabel}>WhatsApp</span>
      <div className={styles.choicePreview}>
        <strong>QR Code</strong>
        <strong>Meta oficial</strong>
      </div>
    </div>
  );
}

function QrMockup({ qrCode, connected }: { qrCode: string | null; connected: boolean }) {
  return (
    <div className={styles.visualCard}>
      <span className={styles.visualLabel}>{connected ? "Conectado" : "QR Code"}</span>
      <div className={styles.qrBox}>
        {qrCode ? (
          <Image src={qrCode} alt="QR Code WhatsApp" width={190} height={190} unoptimized />
        ) : (
          <span>QR ainda não gerado</span>
        )}
      </div>
    </div>
  );
}

function FinalMockup({ botReady = false, themeMode }: { botReady?: boolean; themeMode: HbxThemeMode }) {
  const robotImage = themeMode === "dark" ? finalBotDark : finalBotLight;
  return (
    <div className={`${styles.visualCard} ${styles.finalBotCard}`} data-theme-mode={themeMode}>
      <span className={styles.visualLabel}>{botReady ? "Bot ativo no Inbox" : "Próximo passo"}</span>
      <div className={styles.finalPreview}>
        <div className={styles.finalPreviewCopy}>
          <strong>Radar Digital</strong>
          <span>{botReady ? "Buscar contatos · Vendas · Atendimento" : "Prospectar → Vendas → Atendimento"}</span>
        </div>
        <div className={styles.finalBotImageWrap} aria-hidden="true">
          <Image
            src={robotImage}
            alt=""
            fill
            sizes="(max-width: 900px) 82vw, 470px"
            priority
            placeholder="blur"
          />
        </div>
      </div>
    </div>
  );
}

function BotNote() {
  return (
    <div className={styles.botNote}>
      <strong>Automação quando fizer sentido</strong>
      <p>O bot pode responder, qualificar contatos e apoiar a prospecção. Para uma operação séria, recomendamos configurar com apoio técnico, principalmente se for usar canal oficial Meta ou regras automáticas.</p>
    </div>
  );
}
