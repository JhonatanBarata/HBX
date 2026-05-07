"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderCapabilities } from "@/lib/provider-capabilities";
import BotPanel from "../../../atendimento/_components/BotPanel";
import {
  buildAgendaActionId,
  type AtendimentoAgendaConfig,
  type AtendimentoBotActionGuide,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from "../../../atendimento/inbox-model";
import { buildActionOptions } from "../model";
import ConversationCanvas from "./ConversationCanvas";
import PublishMapReview from "./PublishMapReview";
import SceneInspector from "./SceneInspector";
import WhatsAppFlowPreview from "./WhatsAppFlowPreview";
import styles from "./ConversationBuilder.module.css";

export type ConversationSceneId =
  | "entry"
  | "new_customer"
  | "located_customer"
  | "quick_registration"
  | "main_menu"
  | "agenda"
  | "post_action"
  | "recovery"
  | "human"
  | "out_of_hours"
  | "closing"
  | "blocked";

export type ConversationMessageField =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "recoveryDetectedMessage"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";

export type ConversationButtonField =
  | "welcomeButtons"
  | "returningCustomerButtons"
  | "mainMenuButtons"
  | "recoveryDetectedButtons"
  | "postActionButtons";

export type ConversationDestinationId =
  | "quick_registration"
  | "vendas"
  | "menu"
  | "agenda"
  | "recovery"
  | "human"
  | "closing";

export type ConversationPreviewPeriod = "morning" | "afternoon" | "night";

type SceneSource =
  | { type: "message"; field: ConversationMessageField }
  | { type: "action"; actionId: string; fallback: string };

type SceneBlueprint = {
  id: ConversationSceneId;
  title: string;
  condition: string;
  conditionType: string;
  source: SceneSource;
  buttonsField: ConversationButtonField | null;
  helper: string;
  canvas: { x: number; y: number };
  recoveryLocked?: boolean;
};

export type ConversationScene = SceneBlueprint & {
  title: string;
  displayTitle: string;
  message: string;
  buttons: AtendimentoBotButton[];
  enabled: boolean;
  lockedReason?: string;
};

export type ConversationDestinationOption = {
  id: ConversationDestinationId;
  label: string;
  description: string;
  actionId: string;
  nextNodeId: string;
  targetSceneId: ConversationSceneId;
  disabled?: boolean;
};

export type ConversationEdge = {
  id: string;
  from: ConversationSceneId;
  to: ConversationSceneId;
  label: string;
  blocked?: boolean;
  kind: "main" | "choice" | "smart" | "blocked" | "error";
};

type Props = {
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  providerCapabilities: ProviderCapabilities;
  activeGuide: BotGuideId;
  publishing: boolean;
  recoveryEnabled: boolean;
  hasUnsavedChanges: boolean;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onSaveDraft: () => void;
  onSave: (config: AtendimentoBotConfig) => void;
};

type BotGuideId = "atendimento" | "prospeccao" | "recovery";

type FirstContactRules = {
  guideId: BotGuideId;
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

const BOT_GUIDES: Array<{
  id: BotGuideId;
  label: string;
  queueLabel: string;
  instruction: string;
}> = [
  {
    id: "atendimento",
    label: "Atendimento",
    queueLabel: "Fila Atendimento",
    instruction:
      "Responde clientes que chamaram ou retomaram conversa, mantendo contexto antes de cumprimentar novamente.",
  },
  {
    id: "prospeccao",
    label: "Respostas de Vendas",
    queueLabel: "Pós-contato",
    instruction:
      "Só responde leads que já responderam à campanha. Não inicia conversas sozinho.",
  },
  {
    id: "recovery",
    label: "Recovery",
    queueLabel: "Fila Recovery",
    instruction:
      "Conduz conversas financeiras com leitura de pendencia, proposta de pagamento e handoff humano quando necessario.",
  },
];

const BOT_GUIDE_RULE_SCENE_ID = "bot_guide_context";
const BOT_GUIDE_RULE_CONDITION = "active_bot_profile";
const FIRST_CONTACT_RULE_CONDITION = "first_contact_rules";

const FIRST_CONTACT_RULE_DEFAULTS: Record<BotGuideId, FirstContactRules> = {
  atendimento: {
    guideId: "atendimento",
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
    handoffPolicy: "Se houver reclamacao, audio confuso ou pedido de humano, pausa o bot e coloca na fila Atendimento.",
  },
  prospeccao: {
    guideId: "prospeccao",
    canInitiateConversation: false,
    messageIntervalSeconds: 35,
    nextContactDelayMinutes: 12,
    replyDelaySeconds: 75,
    typingSeconds: 8,
    typingVarianceSeconds: 6,
    maxFirstContactsPerHour: 0,
    quietHoursStart: "18:30",
    quietHoursEnd: "09:00",
    maxFollowUps: 2,
    followUpDelayHours: 24,
    requireOptIn: false,
    stopIntentKeywords: ["nao tenho interesse", "nao quero", "pare", "remover", "spam", "nao me chame", "não me chame"],
    positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
    optOutMessage: "Tudo bem, obrigado por responder. Nao vou insistir e encerro este contato por aqui.",
    handoffPolicy: "Se a pessoa demonstrar irritacao, pedir remocao ou responder negativamente duas vezes, encerra sem nova tentativa.",
  },
  recovery: {
    guideId: "recovery",
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
    handoffPolicy: "Contestacao, pagamento informado, tom irritado ou duvida sobre valor vai direto para humano antes de novo disparo.",
  },
};

const QUICK_REGISTRATION_FALLBACK =
  "Antes de continuar, me confirme seu nome para eu manter o atendimento organizado.";

export const SCENE_BLUEPRINTS: SceneBlueprint[] = [
  {
    id: "entry",
    title: "Entrada",
    condition: "Mensagem recebida",
    conditionType: "inbound_message",
    source: { type: "message", field: "welcomeMessage" },
    buttonsField: null,
    helper: "Primeiro ponto do bot.",
    canvas: { x: 80, y: 260 },
  },
  {
    id: "new_customer",
    title: "Cliente novo",
    condition: "Telefone nao localizado",
    conditionType: "phone_not_found",
    source: { type: "message", field: "welcomeMessage" },
    buttonsField: "welcomeButtons",
    helper: "Cadastro e primeira triagem.",
    canvas: { x: 260, y: 160 },
  },
  {
    id: "located_customer",
    title: "Cliente localizado",
    condition: "Telefone localizado",
    conditionType: "phone_found",
    source: { type: "message", field: "returningCustomerMessage" },
    buttonsField: "returningCustomerButtons",
    helper: "Retomada com contexto.",
    canvas: { x: 260, y: 360 },
  },
  {
    id: "quick_registration",
    title: "Cadastro rapido",
    condition: "Nome nao confirmado",
    conditionType: "name_not_confirmed",
    source: { type: "action", actionId: "start_quick_registration", fallback: QUICK_REGISTRATION_FALLBACK },
    buttonsField: null,
    helper: "Coleta curta de nome.",
    canvas: { x: 470, y: 72 },
  },
  {
    id: "main_menu",
    title: "Menu principal",
    condition: "Cliente pronto para escolher",
    conditionType: "main_menu_ready",
    source: { type: "message", field: "mainMenuPrompt" },
    buttonsField: "mainMenuButtons",
    helper: "Bloco central da conversa.",
    canvas: { x: 470, y: 292 },
  },
  {
    id: "agenda",
    title: "Agenda",
    condition: "Cliente quer agendar",
    conditionType: "agenda_requested",
    source: { type: "message", field: "postActionPrompt" },
    buttonsField: null,
    helper: "Despacho para agenda.",
    canvas: { x: 690, y: 92 },
  },
  {
    id: "post_action",
    title: "Pos acao",
    condition: "Continuidade de vendas",
    conditionType: "post_action",
    source: { type: "message", field: "postActionPrompt" },
    buttonsField: "postActionButtons",
    helper: "Continua depois de uma acao.",
    canvas: { x: 690, y: 250 },
  },
  {
    id: "recovery",
    title: "Recovery",
    condition: "Cliente tem debito",
    conditionType: "debt_customer",
    source: { type: "message", field: "recoveryDetectedMessage" },
    buttonsField: "recoveryDetectedButtons",
    helper: "Ramo financeiro.",
    canvas: { x: 690, y: 410 },
    recoveryLocked: true,
  },
  {
    id: "human",
    title: "Humano",
    condition: "Passar para atendente",
    conditionType: "human_handoff",
    source: { type: "message", field: "humanAckMessage" },
    buttonsField: null,
    helper: "Entrega para fila humana.",
    canvas: { x: 895, y: 174 },
  },
  {
    id: "out_of_hours",
    title: "Fora de horario",
    condition: "Fora do horario comercial",
    conditionType: "outside_business_hours",
    source: { type: "message", field: "humanAckMessage" },
    buttonsField: null,
    helper: "Regra avancada de horario.",
    canvas: { x: 895, y: 315 },
  },
  {
    id: "closing",
    title: "Encerramento",
    condition: "Assunto finalizado",
    conditionType: "close_requested",
    source: { type: "message", field: "closeTopicMessage" },
    buttonsField: null,
    helper: "Fecha a conversa.",
    canvas: { x: 895, y: 455 },
  },
  {
    id: "blocked",
    title: "Bloqueado",
    condition: "BOT_OFF ou contato bloqueado",
    conditionType: "bot_off",
    source: { type: "message", field: "blockedMessage" },
    buttonsField: null,
    helper: "Sem resposta automatica.",
    canvas: { x: 470, y: 510 },
  },
];

export function getDestinationOptions(recoveryEnabled: boolean): ConversationDestinationOption[] {
  return [
    {
      id: "quick_registration",
      label: "Cadastro rapido",
      description: "Pergunta nome e segue a triagem",
      actionId: "start_quick_registration",
      nextNodeId: "registrationCapture",
      targetSceneId: "quick_registration",
    },
    {
      id: "vendas",
      label: "Vendas",
      description: "Continua a jornada principal",
      actionId: "continue_journey",
      nextNodeId: "postActionPrompt",
      targetSceneId: "post_action",
    },
    {
      id: "menu",
      label: "Menu principal",
      description: "Mostra o menu de escolhas",
      actionId: "show_main_menu",
      nextNodeId: "mainMenuPrompt",
      targetSceneId: "main_menu",
    },
    {
      id: "agenda",
      label: "Agenda",
      description: "Abre o agendamento",
      actionId: "schedule_service",
      nextNodeId: "agendaDispatch",
      targetSceneId: "agenda",
    },
    {
      id: "recovery",
      label: "Recovery",
      description: "Leva ao financeiro",
      actionId: "enter_recovery",
      nextNodeId: "recoveryDetectedMessage",
      targetSceneId: "recovery",
      disabled: !recoveryEnabled,
    },
    {
      id: "human",
      label: "Humano",
      description: "Passa para atendente",
      actionId: "talk_human",
      nextNodeId: "humanAckMessage",
      targetSceneId: "human",
    },
    {
      id: "closing",
      label: "Encerramento",
      description: "Fecha a conversa",
      actionId: "close_topic",
      nextNodeId: "closeTopicMessage",
      targetSceneId: "closing",
    },
  ];
}

export function getDestinationFromAction(actionId: string): ConversationDestinationId {
  const normalized = String(actionId || "").trim().toLowerCase();
  if (normalized === "start_quick_registration") return "quick_registration";
  if (normalized === "talk_human") return "human";
  if (normalized === "close_topic") return "closing";
  if (normalized === "show_main_menu") return "menu";
  if (
    normalized === "enter_recovery" ||
    normalized === "view_payments" ||
    normalized === "pay_now" ||
    normalized === "negotiate_debt" ||
    normalized.includes("recovery") ||
    normalized.includes("payment") ||
    normalized.includes("debt") ||
    normalized.includes("financeiro")
  ) {
    return "recovery";
  }
  if (normalized === "continue_attendance") return "menu";
  if (normalized === "schedule_service" || normalized.startsWith("agenda:") || normalized.startsWith("agenda_group_")) {
    return "agenda";
  }
  return "vendas";
}

export function getTargetSceneFromAction(actionId: string): ConversationSceneId {
  const destination = getDestinationFromAction(actionId);
  if (destination === "quick_registration") return "quick_registration";
  if (destination === "human") return "human";
  if (destination === "closing") return "closing";
  if (destination === "menu") return "main_menu";
  if (destination === "recovery") return "recovery";
  if (destination === "agenda") return "agenda";
  return "post_action";
}

export function getDestinationLabel(actionId: string, recoveryEnabled: boolean) {
  const destination = getDestinationFromAction(actionId);
  return getDestinationOptions(recoveryEnabled).find((item) => item.id === destination)?.label || "Vendas";
}

function normalizeButtonId(sectionKey: string, actionId: string, index: number) {
  return `${sectionKey}_${actionId}_${index + 1}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
}

function getSceneRule(config: AtendimentoBotConfig, sceneId: string, conditionType: string) {
  return (config.sceneRules || []).find((rule) => rule.sceneId === sceneId && rule.conditionType === conditionType) || null;
}

function getSceneTitle(config: AtendimentoBotConfig, blueprint: SceneBlueprint) {
  const title = getSceneRule(config, blueprint.id, blueprint.conditionType)?.metadata?.title;
  return String(title || blueprint.title).trim() || blueprint.title;
}

function getSceneMessage(config: AtendimentoBotConfig, source: SceneSource) {
  if (source.type === "message") return String(config[source.field] || "");
  const action = (config.actionCatalog || []).find((item) => item.actionId === source.actionId);
  return String(action?.responseMessage || source.fallback);
}

function getSceneButtons(config: AtendimentoBotConfig, field: ConversationButtonField | null) {
  return field ? config[field] || [] : [];
}

function updateActionResponse(config: AtendimentoBotConfig, actionId: string, responseMessage: string) {
  const hasAction = (config.actionCatalog || []).some((action) => action.actionId === actionId);
  const actionCatalog = hasAction
    ? config.actionCatalog.map((action) => (action.actionId === actionId ? { ...action, responseMessage } : action))
    : [
        ...config.actionCatalog,
        {
          actionId,
          title: "Confirmar nome",
          description: "Pergunta usada quando o cliente ainda nao tem nome confirmado.",
          route: "atendimento",
          kind: "reply",
          enabled: true,
          responseMessage,
        } satisfies AtendimentoBotActionGuide,
      ];
  return { ...config, actionCatalog };
}

function updateSceneRule(
  config: AtendimentoBotConfig,
  sceneId: string,
  conditionType: string,
  enabled: boolean,
  metadata?: Record<string, unknown>,
) {
  const sceneRules = [...(config.sceneRules || [])];
  const index = sceneRules.findIndex((rule) => rule.sceneId === sceneId && rule.conditionType === conditionType);
  const nextRule = {
    sceneId,
    conditionType,
    enabled,
    ...(metadata ? { metadata } : {}),
  };
  if (index >= 0) sceneRules[index] = nextRule;
  else sceneRules.push(nextRule);
  return { ...config, sceneRules };
}

function normalizeBotGuide(config: AtendimentoBotConfig): BotGuideId {
  const botType = String(config.setup?.botType || "").trim().toLowerCase();
  if (botType === "prospeccao" || botType === "prospecção") return "prospeccao";
  if (botType === "recovery") return "recovery";
  return "atendimento";
}

function getFirstContactRuleSceneId(guideId: BotGuideId) {
  return `first_contact_rules_${guideId}`;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(min, Math.min(max, normalized));
}

function normalizeTextList(value: unknown, fallback: string[]) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\n|,/g);
  const normalized = raw
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [...fallback];
}

function getFirstContactRules(config: AtendimentoBotConfig, guideId: BotGuideId): FirstContactRules {
  const fallback = FIRST_CONTACT_RULE_DEFAULTS[guideId];
  const metadata = getSceneRule(config, getFirstContactRuleSceneId(guideId), FIRST_CONTACT_RULE_CONDITION)?.metadata || {};
  return {
    guideId,
    canInitiateConversation:
      guideId === "atendimento" || guideId === "prospeccao"
        ? false
        : Boolean(metadata.canInitiateConversation ?? fallback.canInitiateConversation),
    messageIntervalSeconds: normalizeNumber(metadata.messageIntervalSeconds, fallback.messageIntervalSeconds, 8, 300),
    nextContactDelayMinutes: normalizeNumber(metadata.nextContactDelayMinutes, fallback.nextContactDelayMinutes, 0, 180),
    replyDelaySeconds: normalizeNumber(metadata.replyDelaySeconds, fallback.replyDelaySeconds, 5, 600),
    typingSeconds: normalizeNumber(metadata.typingSeconds, fallback.typingSeconds, 0, 45),
    typingVarianceSeconds: normalizeNumber(metadata.typingVarianceSeconds, fallback.typingVarianceSeconds, 0, 30),
    maxFirstContactsPerHour: normalizeNumber(metadata.maxFirstContactsPerHour, fallback.maxFirstContactsPerHour, 0, 60),
    quietHoursStart: String(metadata.quietHoursStart || fallback.quietHoursStart).trim(),
    quietHoursEnd: String(metadata.quietHoursEnd || fallback.quietHoursEnd).trim(),
    maxFollowUps: normalizeNumber(metadata.maxFollowUps, fallback.maxFollowUps, 0, 5),
    followUpDelayHours: normalizeNumber(metadata.followUpDelayHours, fallback.followUpDelayHours, 1, 168),
    requireOptIn: Boolean(metadata.requireOptIn ?? fallback.requireOptIn),
    stopIntentKeywords: normalizeTextList(metadata.stopIntentKeywords, fallback.stopIntentKeywords),
    positiveIntentKeywords: normalizeTextList(metadata.positiveIntentKeywords, fallback.positiveIntentKeywords),
    optOutMessage: String(metadata.optOutMessage || fallback.optOutMessage).trim(),
    handoffPolicy: String(metadata.handoffPolicy || fallback.handoffPolicy).trim(),
  };
}

function updateFirstContactRules(
  config: AtendimentoBotConfig,
  guideId: BotGuideId,
  rules: FirstContactRules,
) {
  return updateSceneRule(config, getFirstContactRuleSceneId(guideId), FIRST_CONTACT_RULE_CONDITION, true, {
    ...rules,
    guideId,
    canInitiateConversation: guideId === "atendimento" || guideId === "prospeccao" ? false : rules.canInitiateConversation,
  });
}

function makePresetButton(sectionKey: string, actionId: string, title: string, index: number): AtendimentoBotButton {
  return {
    buttonId: normalizeButtonId(sectionKey, actionId, index),
    actionId,
    title,
    nextNodeId:
      actionId === "talk_human"
        ? "humanAckMessage"
        : actionId === "close_topic"
          ? "closeTopicMessage"
          : actionId === "show_main_menu"
            ? "mainMenuPrompt"
            : actionId === "enter_recovery"
              ? "recoveryDetectedMessage"
              : actionId === "schedule_service"
                ? "agendaDispatch"
                : "postActionPrompt",
  };
}

function mergeActionCatalog(
  current: AtendimentoBotActionGuide[],
  additions: AtendimentoBotActionGuide[],
) {
  const byId = new Map(current.map((action) => [action.actionId, action]));
  for (const addition of additions) {
    byId.set(addition.actionId, {
      ...(byId.get(addition.actionId) || {}),
      ...addition,
    });
  }
  return Array.from(byId.values());
}

function applyGuideFlowPreset(config: AtendimentoBotConfig, guideId: BotGuideId): AtendimentoBotConfig {
  if (guideId === "prospeccao") {
    return {
      ...config,
      actionCatalog: mergeActionCatalog(config.actionCatalog, [
        {
          actionId: "prospect_details",
          title: "Ver detalhes",
          description: "Envia uma explicacao curta e humana antes de pedir qualquer decisao.",
          route: "atendimento",
          kind: "reply",
          enabled: true,
          responseMessage:
            "Claro. Vou te mandar um resumo objetivo, sem compromisso. Se fizer sentido, seguimos; se nao fizer, eu encerro por aqui.",
          custom: true,
        },
        {
          actionId: "prospect_later",
          title: "Falar depois",
          description: "Agenda uma retomada leve sem insistir no mesmo momento.",
          route: "atendimento",
          kind: "reply",
          enabled: true,
          responseMessage:
            "Combinado. Vou deixar para retomar em outro momento e nao vou ficar insistindo por aqui.",
          custom: true,
        },
      ]),
      welcomeMessage:
        "{{cumprimentacao}}, {{cliente}}. Aqui e da {{empresa}}. Posso te mandar uma ideia rapida para melhorar seu atendimento pelo WhatsApp?",
      returningCustomerMessage:
        "{{cliente}}, voltando rapidinho: se ainda fizer sentido, eu te mostro em poucas linhas. Se nao fizer, encerro por aqui.",
      mainMenuPrompt:
        "{{cliente}}, prometo ser breve. Faz sentido eu te mostrar uma ideia rapida ou prefere que eu nao te chame mais?",
      mainMenuButtons: [
        makePresetButton("main_menu", "continue_journey", "Tenho interesse", 0),
        makePresetButton("main_menu", "prospect_details", "Ver detalhes", 1),
        makePresetButton("main_menu", "prospect_later", "Falar depois", 2),
        makePresetButton("main_menu", "close_topic", "Nao tenho interesse", 3),
      ],
      postActionPrompt:
        "Perfeito. Vou seguir com calma: posso te passar o caminho mais simples, chamar uma pessoa do time ou encerrar sem insistencia.",
      postActionButtons: [
        makePresetButton("post_action", "continue_journey", "Quero proposta", 0),
        makePresetButton("post_action", "talk_human", "Falar com humano", 1),
        makePresetButton("post_action", "close_topic", "Encerrar", 2),
      ],
      humanAckMessage:
        "Vou chamar uma pessoa do time para continuar de forma mais direta e sem automatizar demais essa conversa.",
      closeTopicMessage:
        "Tudo bem, obrigado por responder. Nao vou insistir e encerro este contato por aqui.",
    };
  }

  if (guideId === "recovery") {
    return {
      ...config,
      welcomeMessage:
        "{{cumprimentacao}}, {{cliente}}. Aqui e da {{empresa}}. Estou te chamando com cuidado sobre um assunto financeiro.",
      returningCustomerMessage:
        "{{cliente}}, estou retomando sua conversa financeira por aqui. Vou ser objetivo e te dar opcoes simples.",
      mainMenuPrompt:
        "{{cliente}}, encontrei uma pendencia e posso te ajudar com pagamento, negociacao ou atendimento humano.",
      mainMenuButtons: [
        makePresetButton("main_menu", "enter_recovery", "Ver financeiro", 0),
        makePresetButton("main_menu", "pay_now", "Pagar agora", 1),
        makePresetButton("main_menu", "negotiate_debt", "Negociar", 2),
        makePresetButton("main_menu", "talk_human", "Falar com atendente", 3),
      ],
      recoveryDetectedMessage:
        "{{cliente}}, consta um valor em aberto de {{valor_formatado}}. Posso te mostrar o historico, gerar pagamento, negociar ou pausar para um atendente verificar.",
      recoveryDetectedButtons: [
        makePresetButton("recovery_detected", "view_payments", "Ver pagamentos", 0),
        makePresetButton("recovery_detected", "pay_now", "Pagar agora", 1),
        makePresetButton("recovery_detected", "negotiate_debt", "Negociar", 2),
        makePresetButton("recovery_detected", "talk_human", "Ja paguei / ajuda", 3),
        makePresetButton("recovery_detected", "continue_attendance", "Continuar atendimento", 4),
      ],
      postActionPrompt:
        "Obrigado por responder. Posso continuar pelo financeiro, chamar uma pessoa ou deixar registrado para retorno.",
      postActionButtons: [
        makePresetButton("post_action", "enter_recovery", "Voltar ao financeiro", 0),
        makePresetButton("post_action", "talk_human", "Falar com humano", 1),
        makePresetButton("post_action", "close_topic", "Encerrar", 2),
      ],
      humanAckMessage:
        "Vou pausar a automacao e encaminhar para uma pessoa verificar com cuidado antes de qualquer nova mensagem.",
      closeTopicMessage:
        "Entendido. Vou encerrar esta automacao por agora. Se precisar, a equipe pode retomar manualmente.",
    };
  }

  return {
    ...config,
    welcomeMessage:
      "{{cumprimentacao}}, tudo bem?\nSou o atendimento da {{empresa}} e vou te ajudar com calma por aqui.",
    returningCustomerMessage:
      "Que bom te ver de novo, {{cliente}}. Vou continuar daqui sem perder o contexto da conversa.",
    mainMenuPrompt: "Escolha abaixo como deseja continuar no Atendimento:",
    mainMenuButtons: [
      makePresetButton("main_menu", "show_main_menu", "Suporte", 0),
      makePresetButton("main_menu", "schedule_service", "Agendar visita", 1),
      makePresetButton("main_menu", "enter_recovery", "Financeiro", 2),
      makePresetButton("main_menu", "talk_human", "Falar com atendente", 3),
    ],
    postActionPrompt:
      "Se precisar, posso continuar pelo Atendimento, voltar ao financeiro ou encaminhar para agenda e humano.",
    postActionButtons: [
      makePresetButton("post_action", "show_main_menu", "Voltar ao menu", 0),
      makePresetButton("post_action", "talk_human", "Atendimento humano", 1),
    ],
    humanAckMessage: "Perfeito. Vou encaminhar sua conversa para um atendente agora.",
    closeTopicMessage: "Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.",
  };
}

function applyBotGuide(config: AtendimentoBotConfig, guideId: BotGuideId) {
  const guide = BOT_GUIDES.find((item) => item.id === guideId) || BOT_GUIDES[0];
  const presetConfig = applyGuideFlowPreset(config, guide.id);
  const sceneRules = (config.sceneRules || []).filter(
    (rule) => !(rule.sceneId === BOT_GUIDE_RULE_SCENE_ID && rule.conditionType === BOT_GUIDE_RULE_CONDITION),
  );

  const nextConfig = {
    ...presetConfig,
    setup: {
      ...presetConfig.setup,
      botType: guide.id,
      configuredFrom: "vendas_automacao",
    },
    sceneRules: [
      ...sceneRules,
      {
        sceneId: BOT_GUIDE_RULE_SCENE_ID,
        conditionType: BOT_GUIDE_RULE_CONDITION,
        enabled: true,
        metadata: {
          botGuide: guide.id,
          label: guide.label,
          queueLabel: guide.queueLabel,
          instruction: guide.instruction,
        },
      },
    ],
  } satisfies AtendimentoBotConfig;
  return updateFirstContactRules(nextConfig, guide.id, getFirstContactRules(config, guide.id));
}

function getGuideSceneId(guideId: BotGuideId): ConversationSceneId {
  if (guideId === "recovery") return "recovery";
  if (guideId === "prospeccao") return "post_action";
  return "main_menu";
}

function buildEdges(scenes: ConversationScene[], recoveryEnabled: boolean): ConversationEdge[] {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const edges: ConversationEdge[] = [
    { id: "entry-new", from: "entry", to: "new_customer", label: "Cliente novo", kind: "main" },
    { id: "entry-found", from: "entry", to: "located_customer", label: "Cliente localizado", kind: "main" },
    { id: "entry-hours", from: "entry", to: "out_of_hours", label: "Fora de horario", kind: "smart" },
    { id: "entry-off", from: "entry", to: "blocked", label: "BOT_OFF", kind: "smart" },
    { id: "located-menu", from: "located_customer", to: "main_menu", label: "Menu", kind: "main" },
    { id: "located-recovery", from: "located_customer", to: "recovery", label: "Debito", kind: "smart", blocked: !recoveryEnabled },
    { id: "agenda-post", from: "agenda", to: "post_action", label: "Retorno", kind: "main" },
  ];

  for (const scene of scenes) {
    if (!scene.buttonsField) continue;
    scene.buttons.forEach((button, index) => {
      const to = getTargetSceneFromAction(button.actionId);
      const target = sceneById.get(to);
      const blocked = to === "recovery" && !recoveryEnabled;
      if (!target) return;
      edges.push({
        id: `${scene.id}-${button.buttonId || index}-${to}`,
        from: scene.id,
        to,
        label: String(button.title || getDestinationLabel(button.actionId, recoveryEnabled)).trim(),
        kind: blocked ? "blocked" : button.actionId ? "choice" : "error",
        blocked,
      });
    });
  }

  return edges;
}

export default function ConversationBuilder({
  botConfig,
  agendaConfig,
  providerCapabilities,
  activeGuide: activeGuideProp,
  publishing,
  recoveryEnabled,
  hasUnsavedChanges,
  onConfigChange,
  onSaveDraft,
  onSave,
}: Props) {
  const [selectedSceneId, setSelectedSceneId] = useState<ConversationSceneId>("entry");
  const [previewPeriod, setPreviewPeriod] = useState<ConversationPreviewPeriod>("morning");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewRun, setPreviewRun] = useState(0);
  const activeGuideId = normalizeBotGuide(botConfig);
  const activeGuide = BOT_GUIDES.find((guide) => guide.id === activeGuideId) || BOT_GUIDES[0];

  const scenes = useMemo<ConversationScene[]>(
    () =>
      SCENE_BLUEPRINTS.map((blueprint) => {
        const lockedByRecovery = Boolean(blueprint.recoveryLocked && !recoveryEnabled);
        const rule = getSceneRule(botConfig, blueprint.id, blueprint.conditionType);
        const disabledByBotOff = blueprint.id === "blocked" ? !botConfig.routingRules.globalBotEnabled : false;
        return {
          ...blueprint,
          displayTitle: getSceneTitle(botConfig, blueprint),
          message: getSceneMessage(botConfig, blueprint.source),
          buttons: getSceneButtons(botConfig, blueprint.buttonsField),
          enabled: blueprint.id === "blocked" ? disabledByBotOff : !lockedByRecovery && (rule?.enabled ?? true),
          lockedReason: lockedByRecovery ? "Recovery indisponivel" : undefined,
        };
      }),
    [botConfig, recoveryEnabled],
  );

  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) || scenes[0];
  const destinationOptions = useMemo(() => getDestinationOptions(recoveryEnabled), [recoveryEnabled]);
  const edges = useMemo(() => buildEdges(scenes, recoveryEnabled), [scenes, recoveryEnabled]);
  const actionOptions = useMemo(() => buildActionOptions(botConfig, agendaConfig), [agendaConfig, botConfig]);
  const agendaOptions = useMemo(
    () => (agendaConfig.groups || []).filter((group) => group.isActive).map((group) => ({ id: group.id, title: group.title, actionId: buildAgendaActionId(group.id) })),
    [agendaConfig.groups],
  );

  useEffect(() => {
    if (activeGuideProp === activeGuideId) return;
    if (activeGuideProp === "recovery" && !recoveryEnabled) return;
    let frame: number | null = null;
    onConfigChange(applyBotGuide(botConfig, activeGuideProp));
    frame = window.requestAnimationFrame(() => {
      setSelectedSceneId(getGuideSceneId(activeGuideProp));
    });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [activeGuideId, activeGuideProp, botConfig, onConfigChange, recoveryEnabled]);

  const updateSelectedMessage = (message: string) => {
    if (selectedScene.source.type === "message") {
      onConfigChange({ ...botConfig, [selectedScene.source.field]: message });
      return;
    }
    onConfigChange(updateActionResponse(botConfig, selectedScene.source.actionId, message));
  };

  const updateSelectedTitle = (title: string) => {
    const rule = getSceneRule(botConfig, selectedScene.id, selectedScene.conditionType);
    const metadata = { ...(rule?.metadata || {}), title };
    onConfigChange(updateSceneRule(botConfig, selectedScene.id, selectedScene.conditionType, rule?.enabled ?? selectedScene.enabled, metadata));
  };

  const updateSelectedButtons = (buttons: AtendimentoBotButton[]) => {
    if (!selectedScene.buttonsField) return;
    onConfigChange({ ...botConfig, [selectedScene.buttonsField]: buttons });
  };

  const addButton = () => {
    if (!selectedScene.buttonsField) return;
    const destination = destinationOptions.find((option) => !option.disabled && option.id !== "quick_registration") || destinationOptions[0];
    updateSelectedButtons([
      ...selectedScene.buttons,
      {
        buttonId: normalizeButtonId(selectedScene.buttonsField, destination.actionId, selectedScene.buttons.length),
        title: "Nova opcao",
        actionId: destination.actionId,
        nextNodeId: destination.nextNodeId,
      },
    ]);
  };

  const updateButton = (index: number, patch: Partial<AtendimentoBotButton>) => {
    updateSelectedButtons(
      selectedScene.buttons.map((button, currentIndex) => (currentIndex === index ? { ...button, ...patch } : button)),
    );
  };

  const removeButton = (index: number) => {
    updateSelectedButtons(selectedScene.buttons.filter((_button, currentIndex) => currentIndex !== index));
  };

  const updateButtonDestination = (index: number, destinationId: ConversationDestinationId) => {
    const destination = destinationOptions.find((option) => option.id === destinationId);
    if (!destination || destination.disabled) return;
    updateButton(index, {
      actionId: destination.actionId,
      nextNodeId: destination.nextNodeId,
    });
  };

  const updateSceneRuleValue = (conditionType: string, enabled: boolean, metadata?: Record<string, unknown>) => {
    onConfigChange(updateSceneRule(botConfig, selectedScene.id, conditionType, enabled, metadata));
  };

  const handleTestBot = () => {
    setSelectedSceneId("entry");
    setPreviewPeriod("morning");
    setPreviewRun((value) => value + 1);
  };

  return (
    <section className={styles.builderShell}>
      <header className={styles.builderTopbar}>
        <div>
          <span className={styles.eyebrow}>Bot {activeGuide.label}</span>
          <h2>Construtor de bot</h2>
          {activeGuideId === "prospeccao" ? (
            <p className={styles.guideWarning}>Este bot não inicia conversas sozinho. Ele só responde leads que já responderam a campanha.</p>
          ) : null}
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.saveState} data-dirty={hasUnsavedChanges ? "true" : "false"}>
            {hasUnsavedChanges ? "Rascunho alterado" : "Fluxo salvo"}
          </span>
          <button type="button" className={styles.secondaryButton} onClick={onSaveDraft}>
            Salvar rascunho
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleTestBot}>
            Testar bot
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setAdvancedOpen((value) => !value)}>
            Editor avancado
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => setReviewOpen(true)}>
            Revisar mapa
          </button>
          <button type="button" className={styles.primaryButton} disabled={publishing} onClick={() => setReviewOpen(true)}>
            {publishing ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </header>

      <div className={styles.liveBuilderGrid}>
        <SceneInspector
          scene={selectedScene}
          config={botConfig}
          destinationOptions={destinationOptions}
          channelLabel={providerCapabilities.canUseOfficialButtons ? "Meta" : "QR/Evolution"}
          recoveryEnabled={recoveryEnabled}
          onTitleChange={updateSelectedTitle}
          onMessageChange={updateSelectedMessage}
          onConfigChange={onConfigChange}
          onInsertVariable={(token) => updateSelectedMessage(`${selectedScene.message}${selectedScene.message ? " " : ""}{{${token}}}`)}
          onAddButton={addButton}
          onButtonTitleChange={(index, title) => updateButton(index, { title })}
          onButtonDestinationChange={updateButtonDestination}
          onRemoveButton={removeButton}
          onSceneRuleChange={updateSceneRuleValue}
        />

        <ConversationCanvas
          scenes={scenes}
          edges={edges}
          selectedSceneId={selectedScene.id}
          recoveryEnabled={recoveryEnabled}
          onSelectScene={setSelectedSceneId}
        />

        <WhatsAppFlowPreview
          scene={selectedScene}
          config={botConfig}
          providerCapabilities={providerCapabilities}
          recoveryEnabled={recoveryEnabled}
          period={previewPeriod}
          previewRun={previewRun}
          onPeriodChange={setPreviewPeriod}
        />
      </div>

      {advancedOpen ? (
        <section className={styles.advancedPanel}>
          <div className={styles.advancedHeader}>
            <div>
              <span className={styles.eyebrow}>Editor avancado</span>
              <h3>BotPanel</h3>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => setAdvancedOpen(false)}>
              Fechar
            </button>
          </div>
          <BotPanel
            botConfig={botConfig}
            loadingBot={false}
            savingBot={publishing}
            actionOptions={actionOptions}
            agendaOptions={agendaOptions}
            providerCapabilities={providerCapabilities}
            recoveryEnabled={recoveryEnabled}
            onSave={onSave}
            onConfigChange={onConfigChange}
          />
        </section>
      ) : null}

      <PublishMapReview
        open={reviewOpen}
        scenes={scenes}
        edges={edges}
        publishing={publishing}
        recoveryEnabled={recoveryEnabled}
        onClose={() => setReviewOpen(false)}
        onSaveDraft={onSaveDraft}
        onPublish={() => onSave(botConfig)}
      />
    </section>
  );
}
