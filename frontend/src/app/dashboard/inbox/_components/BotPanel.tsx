"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BotMessageStudio from "@/components/bot-editor/BotMessageStudio";
import recoveryStyles from "@/app/hbx-recovery/page.module.css";
import { getProviderLabel, type ProviderCapabilities } from "@/lib/provider-capabilities";
import {
  buildAgendaActionId,
  createCustomAction,
  type AtendimentoBotActionKind,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
} from "../inbox-model";

const VARIABLE_SCOPE_LABELS: Record<AtendimentoBotVariableScope, string> = {
  shared: "Compartilhado",
  atendimento: "Atendimento",
  recovery: "Financeiro",
};

const ACTION_KIND_LABELS: Record<AtendimentoBotActionKind, string> = {
  reply: "Resposta",
  human_handoff: "Humano",
  recovery_handoff: "Financeiro",
  close: "Encerrar",
  show_menu: "Mostrar menu",
  agenda: "Agenda",
};

type BotTextField =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "recoveryDetectedMessage"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";
type ButtonSection =
  | "welcomeButtons"
  | "returningCustomerButtons"
  | "mainMenuButtons"
  | "recoveryDetectedButtons"
  | "postActionButtons";

type ScenarioDef = {
  id: BotTextField;
  label: string;
  description: string;
  badge: string;
  supportsButtons: boolean;
  scopes: AtendimentoBotVariableScope[];
  buttonSection?: ButtonSection;
};

const BOT_SCENARIOS: ScenarioDef[] = [
  {
    id: "welcomeMessage",
    label: "Cliente novo identificado",
    description: "Confirma o cadastro inicial e conduz o cliente de volta para o fluxo principal.",
    badge: "Cadastro",
    supportsButtons: true,
    buttonSection: "welcomeButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "returningCustomerMessage",
    label: "Cliente encontrado",
    description: "Retoma a conversa quando o cliente ja existe e pode seguir pela triagem principal.",
    badge: "Cliente",
    supportsButtons: true,
    buttonSection: "returningCustomerButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "mainMenuPrompt",
    label: "Triagem de atendimento",
    description: "Decisao principal do Atendimento com suporte, agenda, financeiro ou fila humana.",
    badge: "Decisao",
    supportsButtons: true,
    buttonSection: "mainMenuButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "recoveryDetectedMessage",
    label: "Resumo financeiro",
    description: "Ramo financeiro dentro do Atendimento com leitura de valor pendente, status e proximos passos.",
    badge: "Financeiro",
    supportsButtons: true,
    buttonSection: "recoveryDetectedButtons" as const,
    scopes: ["shared", "recovery"] as AtendimentoBotVariableScope[],
  },
  {
    id: "postActionPrompt",
    label: "Continuidade",
    description: "Retoma o Atendimento depois de acoes operacionais, financeiras ou de agenda.",
    badge: "Retorno",
    supportsButtons: true,
    buttonSection: "postActionButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "humanAckMessage",
    label: "Transferencia para humano",
    description: "Confirma a passagem para atendimento humano, tanto no fluxo comum quanto no financeiro.",
    badge: "Humano",
    supportsButtons: false,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "closeTopicMessage",
    label: "Encerramento",
    description: "Fecha a conversa de forma clara e sem ruído visual.",
    badge: "Saida",
    supportsButtons: false,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "blockedMessage",
    label: "Mensagem de bloqueio",
    description: "Referencia visual do estado bloqueado dentro do Atendimento.",
    badge: "Bloqueio",
    supportsButtons: false,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
] as const;
type ActionOption = { value: string; label: string };

const SYNTHETIC_NODE_LABELS: Record<string, string> = {
  entry_gate: "Entrada WhatsApp",
  identify_customer: "Identificar cliente",
  customer_found_gate: "Cliente encontrado?",
  debt_open_gate: "Possui debito aberto?",
  registrationCapture: "Captura de cadastro",
  agendaDispatch: "Despachar para agenda",
  paymentHistory: "Historico de pagamentos",
  paymentAction: "Gerar link ou registrar acao",
  negotiationAction: "Negociar",
};

type BotPanelProps = {
  botConfig: AtendimentoBotConfig;
  loadingBot: boolean;
  savingBot: boolean;
  actionOptions: ActionOption[];
  agendaOptions: Array<{ id: string; title: string }>;
  providerCapabilities: ProviderCapabilities;
  recoveryEnabled: boolean;
  onSave: (config: AtendimentoBotConfig) => void;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onOpenSettings?: () => void;
};

function buildFallbackText(message: string, buttons: Array<{ title: string }>) {
  const lines = buttons.map((button, index) => `${index + 1}. ${button.title}`).join("\n");
  return lines ? `${message}\n\n${lines}`.trim() : message;
}

function isRecoveryActionId(actionId: string | null | undefined) {
  const normalized = String(actionId || "").trim();
  return [
    "enter_recovery",
    "view_payments",
    "pay_now",
    "negotiate_debt",
    "continue_attendance",
  ].includes(normalized);
}

function makeClientId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function renderPreviewText(message: string, botConfig: AtendimentoBotConfig) {
  const samples = Object.fromEntries(
    botConfig.variableCatalog.map((item) => [item.key, item.example || item.label || item.key]),
  );
  return String(message || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return String(samples[key] || `{{${key}}}`);
  });
}

function resolveAtendimentoNextNode(actionId: string) {
  switch (actionId) {
    case "talk_human":
      return "humanAckMessage";
    case "close_topic":
      return "closeTopicMessage";
    case "show_main_menu":
      return "mainMenuPrompt";
    case "enter_recovery":
      return "recoveryDetectedMessage";
    case "start_quick_registration":
      return "registrationCapture";
    case "view_payments":
      return "paymentHistory";
    case "pay_now":
      return "paymentAction";
    case "negotiate_debt":
      return "negotiationAction";
    case "continue_attendance":
      return "mainMenuPrompt";
    case "continue_journey":
      return "debt_open_gate";
    case "schedule_service":
      return "agendaDispatch";
    default:
      if (actionId.startsWith("agenda:")) return "agendaDispatch";
      return "postActionPrompt";
  }
}

function normalizeButtonId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
}

function normalizeAtendimentoNextNodeId(value: string | null | undefined, actionId: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || resolveAtendimentoNextNode(actionId);
}

function getAtendimentoNodeLabel(nodeId: string) {
  return (
    BOT_SCENARIOS.find((item) => item.id === nodeId)?.label ||
    SYNTHETIC_NODE_LABELS[nodeId] ||
    nodeId
  );
}

function replaceButtonInConfig(
  config: AtendimentoBotConfig,
  section: ButtonSection,
  index: number,
  updater: (button: AtendimentoBotButton) => AtendimentoBotButton,
) {
  return {
    ...config,
    [section]: config[section].map((button, buttonIndex) =>
      buttonIndex === index ? updater(button) : button,
    ),
  };
}

function removeButtonFromSections(config: AtendimentoBotConfig, actionId: string): AtendimentoBotConfig {
  return {
    ...config,
    welcomeButtons: config.welcomeButtons.filter((button) => button.actionId !== actionId),
    returningCustomerButtons: config.returningCustomerButtons.filter((button) => button.actionId !== actionId),
    mainMenuButtons: config.mainMenuButtons.filter((button) => button.actionId !== actionId),
    recoveryDetectedButtons: config.recoveryDetectedButtons.filter((button) => button.actionId !== actionId),
    postActionButtons: config.postActionButtons.filter((button) => button.actionId !== actionId),
  };
}

export default function BotPanel({
  botConfig,
  loadingBot,
  savingBot,
  actionOptions,
  agendaOptions,
  providerCapabilities,
  recoveryEnabled,
  onSave,
  onConfigChange,
  onOpenSettings,
}: BotPanelProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("entry_gate");
  const propConfigSignature = useMemo(() => JSON.stringify(botConfig), [botConfig]);
  const [draftState, setDraftState] = useState(() => ({
    sourceSignature: propConfigSignature,
    config: botConfig,
  }));
  const effectiveDraftState =
    draftState.sourceSignature === propConfigSignature
      ? draftState
      : {
          sourceSignature: propConfigSignature,
          config: botConfig,
        };
  const draftConfig = effectiveDraftState.config;
  const draftConfigSignature = useMemo(() => JSON.stringify(draftConfig), [draftConfig]);

  const updateDraftConfig = useCallback(
    (updater: AtendimentoBotConfig | ((current: AtendimentoBotConfig) => AtendimentoBotConfig)) => {
      setDraftState((current) => {
        const baseConfig =
          current.sourceSignature === propConfigSignature ? current.config : botConfig;
        const nextConfig =
          typeof updater === "function"
            ? (updater as (current: AtendimentoBotConfig) => AtendimentoBotConfig)(baseConfig)
            : updater;

        return {
          sourceSignature: propConfigSignature,
          config: nextConfig,
        };
      });
    },
    [botConfig, propConfigSignature],
  );

  useEffect(() => {
    if (draftConfigSignature === propConfigSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      onConfigChange(draftConfig);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [draftConfig, draftConfigSignature, onConfigChange, propConfigSignature]);

  const flushDraftConfig = useCallback(() => {
    if (draftConfigSignature !== propConfigSignature) {
      onConfigChange(draftConfig);
    }
    return draftConfig;
  }, [draftConfig, draftConfigSignature, onConfigChange, propConfigSignature]);

  const canUseOfficialButtons = providerCapabilities.canUseOfficialButtons;
  const providerLabel = getProviderLabel(providerCapabilities.provider);
  const channelStartMessage =
    "Qual canal você usa?\n\n1. Evolution WhatsApp\n2. Meta WhatsApp Oficial";
  const channelFallbackNote = canUseOfficialButtons
    ? "Canal Meta ativo: botoes e listas oficiais ficam liberados quando usados no envio."
    : "Evolution: cliente responde digitando o número.";
  const getCompatibleButtons = useCallback(
    (buttons: AtendimentoBotButton[]) =>
      buttons.filter((button) => {
        if (!recoveryEnabled && isRecoveryActionId(button.actionId)) return false;
        return true;
      }),
    [recoveryEnabled],
  );

  const selectedScenario =
    BOT_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) || null;
  const selectedButtons =
    selectedScenario?.supportsButtons && selectedScenario.buttonSection
      ? getCompatibleButtons(draftConfig[selectedScenario.buttonSection])
      : [];
  const messageType =
    canUseOfficialButtons && selectedScenario?.supportsButtons && selectedButtons.length > 0 ? "buttons" : "simple";

  const actionById = useMemo(() => {
    const next: Record<string, { actionId: string; title: string; description: string; routeLabel: string; typeLabel: string; enabled: boolean }> = {};
    for (const action of draftConfig.actionCatalog) {
      if (!recoveryEnabled && action.route === "recovery") continue;
      next[action.actionId] = {
        actionId: action.actionId,
        title: action.title,
        description: action.description,
        routeLabel: VARIABLE_SCOPE_LABELS[action.route],
        typeLabel: ACTION_KIND_LABELS[action.kind],
        enabled: action.enabled,
      };
    }
    for (const agenda of agendaOptions) {
      const actionId = buildAgendaActionId(agenda.id);
      next[actionId] = {
        actionId,
        title: agenda.title,
        description: "Abre uma agenda operacional real vinculada ao Atendimento.",
        routeLabel: "Atendimento",
        typeLabel: "Agenda",
        enabled: true,
      };
    }
    return next;
  }, [agendaOptions, draftConfig.actionCatalog, recoveryEnabled]);

  const buttonTargetOptions = useMemo(
    () => [
      ...BOT_SCENARIOS.filter((scenario) => recoveryEnabled || !scenario.scopes.includes("recovery")).map((scenario) => ({
        value: scenario.id,
        label: scenario.label,
        description: scenario.description,
      })),
      {
        value: "customer_found_gate",
        label: "Cliente encontrado?",
        description: "Decisao entre capturar cadastro rapido ou continuar com o cliente identificado.",
      },
      {
        value: "debt_open_gate",
        label: "Possui debito aberto?",
        description: "Le o contexto financeiro antes de decidir entre financeiro e atendimento.",
      },
      {
        value: "registrationCapture",
        label: "Captura de cadastro",
        description: "Coleta rapida de dados do novo cliente antes de seguir o atendimento.",
      },
      {
        value: "agendaDispatch",
        label: "Despacho para agenda",
        description: "Encaminha o cliente para a agenda operacional selecionada.",
      },
      ...(recoveryEnabled
        ? [
            {
              value: "paymentHistory",
              label: "Historico de pagamentos",
              description: "Consulta pagamentos aprovados, pendentes e comprovacoes recentes.",
            },
            {
              value: "paymentAction",
              label: "Gerar link ou registrar acao",
              description: "Executa pagar agora, registrar promessa ou outra acao financeira.",
            },
            {
              value: "negotiationAction",
              label: "Negociar",
              description: "Registra negociacao financeira e devolve o cliente ao mesmo fluxo.",
            },
          ]
        : []),
    ],
    [recoveryEnabled],
  );

  const studioVariables = useMemo(
    () =>
      draftConfig.variableCatalog
        .filter((item) => recoveryEnabled || item.scope !== "recovery")
        .filter((item) => !selectedScenario || selectedScenario.scopes.includes(item.scope) || item.scope === "shared")
        .map((item) => ({
          key: item.key,
          label: item.label,
          example: item.example,
          scopeLabel: VARIABLE_SCOPE_LABELS[item.scope],
          categoryLabel:
            item.key === "empresa"
              ? "Empresa"
              : item.key === "cliente"
                ? "Cliente"
                : item.scope === "recovery"
                  ? "Financeiro"
                  : item.scope === "atendimento"
                    ? "Atendimento"
                    : "Sistema",
          originLabel:
            item.scope === "shared"
              ? "Contexto automatico da empresa logada"
              : item.scope === "recovery"
                ? "Contexto financeiro com valor em aberto e historico de cobranca"
                : "Dados operacionais do Atendimento",
          required: item.required,
        })),
    [draftConfig.variableCatalog, recoveryEnabled, selectedScenario],
  );

  const flowScenarios = useMemo(
    () => {
      const nodePositions: Record<string, { x: number; y: number }> = {
        entry_gate: { x: 420, y: 28 },
        identify_customer: { x: 420, y: 190 },
        customer_found_gate: { x: 420, y: 352 },
        registrationCapture: { x: 78, y: 540 },
        welcomeMessage: { x: 78, y: 724 },
        returningCustomerMessage: { x: 420, y: 540 },
        debt_open_gate: { x: 420, y: 724 },
        mainMenuPrompt: { x: 420, y: 912 },
        recoveryDetectedMessage: { x: 762, y: 912 },
        agendaDispatch: { x: 78, y: 1112 },
        postActionPrompt: { x: 420, y: 1112 },
        paymentHistory: { x: 762, y: 1112 },
        paymentAction: { x: 1104, y: 1112 },
        closeTopicMessage: { x: 420, y: 1302 },
        negotiationAction: { x: 762, y: 1302 },
        humanAckMessage: { x: 1104, y: 1302 },
        blockedMessage: { x: 1104, y: 1490 },
      };

      const gateNode = {
        id: "entry_gate",
        label: "Qual canal você usa?",
        description: "A experiencia do bot comeca pela escolha do canal e libera apenas recursos compativeis.",
        badge: "Entrada",
        nodeKind: "decision" as const,
        supportsButtons: false,
        editable: false,
        messageText: `${channelStartMessage}\n\nCanal ativo: ${providerLabel}.`,
        buttons: [
          {
            buttonId: "channel_selected",
            actionId: "channel_selected",
            title: providerLabel,
            nextNodeId: "identify_customer",
            nextLabel: "Identificar cliente",
          },
        ],
        toneLabel: channelFallbackNote,
        position: nodePositions.entry_gate,
      };

      const decisionNodes = [
        {
          id: "identify_customer",
          label: "Identificar cliente",
          description: "Consulta cadastro, historico e sinais financeiros antes de seguir para o Atendimento.",
          badge: "Leitura",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Consulta automatica de cliente em andamento.",
          buttons: [
            {
              buttonId: "customer_lookup_done",
              actionId: "customer_lookup_done",
              title: "Leitura concluida",
              nextNodeId: "customer_found_gate",
              nextLabel: "Cliente encontrado?",
            },
          ],
          effectLabel: "Consolida cliente, cadastro, historico e contexto financeiro antes da triagem.",
          position: nodePositions.identify_customer,
        },
        {
          id: "customer_found_gate",
          label: "Cliente encontrado?",
          description: "Decide se o fluxo segue com cadastro rapido ou com o cliente ja identificado.",
          badge: "Decisao",
          nodeKind: "decision" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Verificacao automatica de cadastro.",
          buttons: [
            {
              buttonId: "customer_not_found",
              actionId: "customer_not_found",
              title: "Nao encontrado",
              nextNodeId: "registrationCapture",
              nextLabel: "Captura de cadastro",
            },
            {
              buttonId: "customer_found",
              actionId: "customer_found",
              title: "Encontrado",
              nextNodeId: "returningCustomerMessage",
              nextLabel: "Cliente encontrado",
            },
          ],
          toneLabel: "Escolhe se precisa captar cadastro",
          position: nodePositions.customer_found_gate,
        },
        {
          id: "debt_open_gate",
          label: "Possui debito aberto?",
          description: "Abre o ramo financeiro sem sequestrar o restante do Atendimento.",
          badge: "Decisao",
          nodeKind: "decision" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Leitura de divida e contexto financeiro.",
          buttons: [
            {
              buttonId: "debt_detected",
              actionId: "debt_detected",
              title: "Com debito",
              nextNodeId: recoveryEnabled ? "recoveryDetectedMessage" : "mainMenuPrompt",
              nextLabel: recoveryEnabled ? "Resumo financeiro" : "Triagem de atendimento",
            },
            {
              buttonId: "no_debt",
              actionId: "no_debt",
              title: "Sem debito",
              nextNodeId: "mainMenuPrompt",
              nextLabel: "Triagem de atendimento",
            },
          ],
          toneLabel: "Financial branch como contexto condicional",
          position: nodePositions.debt_open_gate,
        },
      ];

      const syntheticActionNodes = [
        {
          id: "registrationCapture",
          label: "Captura de cadastro",
          description: "Coleta nome e dados basicos antes de devolver o cliente para o fluxo principal.",
          badge: "Acao",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Cadastro rapido em andamento.",
          buttons: [
            {
              buttonId: "registration_done",
              actionId: "registration_done",
              title: "Cadastro concluido",
              nextNodeId: "welcomeMessage",
              nextLabel: "Cliente novo identificado",
            },
          ],
          effectLabel: "Captura cadastro e devolve o cliente para a leitura principal do Atendimento.",
          position: nodePositions.registrationCapture,
        },
        {
          id: "agendaDispatch",
          label: "Despachar para agenda",
          description: "Encaminha para a agenda operacional mantendo o fluxo do Atendimento integrado.",
          badge: "Agenda",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Agenda operacional selecionada.",
          buttons: [
            {
              buttonId: "agenda_done",
              actionId: "agenda_done",
              title: "Retomar fluxo",
              nextNodeId: "postActionPrompt",
              nextLabel: "Continuidade",
            },
          ],
          effectLabel: "Dispara a agenda operacional e depois devolve o cliente para a continuidade do Atendimento.",
          position: nodePositions.agendaDispatch,
        },
        {
          id: "paymentHistory",
          label: "Historico de pagamentos",
          description: "Mostra pagamentos recentes, liberacoes e comprovacoes ligadas ao cliente.",
          badge: "Financeiro",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Consulta de pagamentos em andamento.",
          buttons: [
            {
              buttonId: "history_done",
              actionId: "history_done",
              title: "Continuar atendimento",
              nextNodeId: "mainMenuPrompt",
              nextLabel: "Triagem de atendimento",
            },
          ],
          effectLabel: "Consulta pagamentos e permite continuar o Atendimento sem sair da mesma jornada.",
          position: nodePositions.paymentHistory,
        },
        {
          id: "paymentAction",
          label: "Gerar link ou registrar acao",
          description: "Centraliza pagar agora, registrar promessa e outras acoes financeiras compartilhadas.",
          badge: "Acao",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Acao financeira em andamento.",
          buttons: [
            {
              buttonId: "payment_action_done",
              actionId: "payment_action_done",
              title: "Confirmar ou encerrar",
              nextNodeId: "postActionPrompt",
              nextLabel: "Continuidade",
            },
          ],
          effectLabel: "Gera link, registra acao ou confirma um proximo passo financeiro dentro do Atendimento.",
          position: nodePositions.paymentAction,
        },
        {
          id: "negotiationAction",
          label: "Negociar",
          description: "Registra negociacao e devolve o cliente ao contexto financeiro ou humano quando necessario.",
          badge: "Negociacao",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Negociacao financeira em andamento.",
          buttons: [
            {
              buttonId: "negotiation_done",
              actionId: "negotiation_done",
              title: "Voltar ao financeiro",
              nextNodeId: "recoveryDetectedMessage",
              nextLabel: "Resumo financeiro",
            },
          ],
          effectLabel: "Registra negociacao financeira sem quebrar a continuidade do atendimento principal.",
          position: nodePositions.negotiationAction,
        },
      ];

      const scenarioNodes = BOT_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        label: scenario.label,
        description: scenario.description,
        badge: scenario.badge,
        nodeKind:
          scenario.id === "humanAckMessage"
            ? ("human_handoff" as const)
            : scenario.id === "closeTopicMessage"
              ? ("end" as const)
              : scenario.id === "mainMenuPrompt" || scenario.id === "recoveryDetectedMessage"
                ? ("decision" as const)
                : ("message" as const),
        supportsButtons: canUseOfficialButtons && scenario.supportsButtons,
        editable: true,
        messageText: String(draftConfig[scenario.id] || ""),
        buttons:
          scenario.supportsButtons && scenario.buttonSection
            ? getCompatibleButtons(draftConfig[scenario.buttonSection]).map((button) => ({
                ...button,
                nextNodeId: String(button.nextNodeId || resolveAtendimentoNextNode(String(button.actionId))),
                nextLabel: getAtendimentoNodeLabel(String(button.nextNodeId || resolveAtendimentoNextNode(String(button.actionId)))),
              }))
            : [],
        toneLabel:
          scenario.id === "mainMenuPrompt"
            ? "Escolhe o proximo ramo do Atendimento"
            : scenario.id === "recoveryDetectedMessage"
              ? "Resumo financeiro dentro do Atendimento"
              : undefined,
        position: nodePositions[scenario.id],
      }));

      const recoveryNodeIds = new Set(["recoveryDetectedMessage", "paymentHistory", "paymentAction", "negotiationAction"]);
      return [gateNode, ...decisionNodes, ...scenarioNodes, ...syntheticActionNodes].filter(
        (node) => recoveryEnabled || !recoveryNodeIds.has(node.id),
      );
    },
    [
      canUseOfficialButtons,
      channelFallbackNote,
      channelStartMessage,
      draftConfig,
      getCompatibleButtons,
      providerLabel,
      recoveryEnabled,
    ],
  );

  const catalogVariables = useMemo(
    () =>
      draftConfig.variableCatalog
        .filter((item) => recoveryEnabled || item.scope !== "recovery")
        .map((item) => ({
          key: item.key,
          label: item.label,
          example: item.example,
          scopeLabel: VARIABLE_SCOPE_LABELS[item.scope],
          categoryLabel:
            item.key === "empresa"
              ? "Empresa"
              : item.key === "cliente"
                ? "Cliente"
                : item.scope === "recovery"
                  ? "Financeiro"
                  : item.scope === "atendimento"
                    ? "Atendimento"
                    : "Sistema",
          originLabel:
            item.scope === "shared"
              ? "Contexto automatico da empresa logada"
              : item.scope === "recovery"
                ? "Contexto financeiro com debito, status e historico"
                : "Dados operacionais do Atendimento",
          required: item.required,
        })),
    [draftConfig.variableCatalog, recoveryEnabled],
  );

  const flowEdges = useMemo(
    () =>
      flowScenarios.flatMap((scenario) =>
        scenario.buttons
          .filter((button) => button.nextNodeId)
          .map((button) => ({
            id: `${scenario.id}-${button.buttonId}-${button.nextNodeId}`,
            from: scenario.id,
            to: String(button.nextNodeId),
            label: button.title,
          })),
      ),
    [flowScenarios],
  );

  const catalogActions = useMemo(() => {
    const base = draftConfig.actionCatalog
      .filter((action) => recoveryEnabled || action.route !== "recovery")
      .map((action) => ({
        actionId: action.actionId,
        title: action.title,
        description: action.description,
        routeLabel: VARIABLE_SCOPE_LABELS[action.route],
        typeLabel: ACTION_KIND_LABELS[action.kind],
        enabled: action.enabled,
      }));
    const agendas = agendaOptions.map((agenda) => ({
      actionId: buildAgendaActionId(agenda.id),
      title: agenda.title,
      description: "Abre uma agenda operacional real vinculada ao Atendimento.",
      routeLabel: "Atendimento",
      typeLabel: "Agenda",
      enabled: true,
    }));
    return [...base, ...agendas];
  }, [agendaOptions, draftConfig.actionCatalog, recoveryEnabled]);

  const publicationChecks = useMemo(
    () => [
      {
        id: "entry",
        label: "Entrada principal",
        description: "Cliente novo e cliente encontrado precisam conseguir seguir pela mesma arvore principal.",
        ok: String(draftConfig.welcomeMessage || "").trim().length > 0,
      },
      {
        id: "service_branch",
        label: "Triagem de atendimento",
        description: "O ramo principal precisa manter saidas claras para suporte, agenda, financeiro ou humano.",
        ok: draftConfig.mainMenuButtons.length > 0,
      },
      {
        id: "financial_branch",
        label: "Ramo financeiro",
        description: recoveryEnabled
          ? "O contexto financeiro precisa continuar disponivel sem virar um builder paralelo."
          : "Recovery nao esta liberado neste plano e fica fora do menu clicavel.",
        ok: recoveryEnabled ? draftConfig.recoveryDetectedButtons.length > 0 : true,
      },
      {
        id: "provider_capabilities",
        label: "Capacidade do canal",
        description: canUseOfficialButtons
          ? "Meta ativo: botoes oficiais e templates Meta podem ser usados."
          : "Evolution: cliente responde digitando o número.",
        ok: true,
      },
      {
        id: "shared_actions",
        label: "Acoes compartilhadas",
        description: "Humano, agenda e encerramento precisam continuar acessiveis nos dois caminhos.",
        ok: draftConfig.actionCatalog.some((action) => action.enabled),
      },
    ],
    [
      draftConfig.actionCatalog,
      draftConfig.mainMenuButtons.length,
      draftConfig.recoveryDetectedButtons.length,
      draftConfig.welcomeMessage,
      canUseOfficialButtons,
      recoveryEnabled,
    ],
  );

  const updateRoutingRule = useCallback(
    (field: keyof AtendimentoBotConfig["routingRules"], value: boolean) => {
      updateDraftConfig((current) => ({
        ...current,
        routingRules: {
          ...current.routingRules,
          [field]: value,
        },
      }));
    },
    [updateDraftConfig],
  );

  const appendVariable = useCallback((field: BotTextField, variableKey: string) => {
    updateDraftConfig((current) => {
      const currentValue = String(current[field] || "");
      const suffix = currentValue && !currentValue.endsWith(" ") && !currentValue.endsWith("\n") ? " " : "";
      return {
        ...current,
        [field]: `${currentValue}${suffix}{{${variableKey}}}`,
      };
    });
  }, [updateDraftConfig]);

  const updateBotText = useCallback((field: BotTextField, value: string) => {
    updateDraftConfig((current) => ({
      ...current,
      [field]: value,
    }));
  }, [updateDraftConfig]);

  const updateButtonSection = useCallback(
    (section: ButtonSection, index: number, field: keyof AtendimentoBotButton, value: string) => {
      updateDraftConfig((current) =>
        replaceButtonInConfig(current, section, index, (button) => {
          const currentActionId = field === "actionId" ? String(value || "") : String(button.actionId || "");
          const nextNodeId =
            field === "actionId"
              ? resolveAtendimentoNextNode(value)
              : field === "nextNodeId"
                ? normalizeAtendimentoNextNodeId(value, currentActionId)
                : normalizeAtendimentoNextNodeId(String(button.nextNodeId || ""), currentActionId);

          return {
            ...button,
            [field]:
              field === "buttonId"
                ? normalizeButtonId(value)
                : field === "nextNodeId"
                  ? normalizeAtendimentoNextNodeId(value, currentActionId)
                  : value,
            nextNodeId,
          };
        }),
      );
    },
    [updateDraftConfig],
  );

  const addButtonSection = useCallback(
    (section: ButtonSection) => {
      const fallback = actionOptions[0] || { value: "talk_human", label: "Falar com atendente" };
      updateDraftConfig((current) => ({
        ...current,
        [section]: [
          ...current[section],
          {
            buttonId: makeClientId(`${section}_button`),
            actionId: fallback.value,
            title: fallback.label.split(" • ")[0],
            nextNodeId: resolveAtendimentoNextNode(fallback.value),
          },
        ],
      }));
    },
    [actionOptions, updateDraftConfig],
  );

  const removeButtonSection = useCallback((section: ButtonSection, index: number) => {
    updateDraftConfig((current) => ({
      ...current,
      [section]: current[section].filter((_, buttonIndex) => buttonIndex !== index),
    }));
  }, [updateDraftConfig]);

  const updateActionGuide = useCallback(
    (
      actionId: string,
      field: "title" | "description" | "route" | "kind" | "enabled" | "responseMessage" | "agendaGroupId",
      value: string | boolean,
    ) => {
      updateDraftConfig((current) => ({
        ...current,
        actionCatalog: current.actionCatalog.map((action) => {
          if (action.actionId !== actionId) return action;
          if (field === "enabled") return { ...action, enabled: Boolean(value) };
          if (field === "route") return { ...action, route: value as AtendimentoBotVariableScope };
          if (field === "kind") {
            const nextKind = value as AtendimentoBotActionKind;
            return {
              ...action,
              kind: nextKind,
              agendaGroupId: nextKind === "agenda" ? action.agendaGroupId || null : null,
              responseMessage: nextKind === "reply" ? action.responseMessage || "" : "",
            };
          }
          if (field === "agendaGroupId") {
            return { ...action, agendaGroupId: String(value || "").trim() || null };
          }
          if (field === "responseMessage") {
            return { ...action, responseMessage: String(value || "") };
          }
          return { ...action, [field]: String(value || "") };
        }),
      }));
    },
    [updateDraftConfig],
  );

  const addCustomAction = useCallback(() => {
    updateDraftConfig((current) => ({
      ...current,
      actionCatalog: [...current.actionCatalog, createCustomAction(current)],
    }));
  }, [updateDraftConfig]);

  const removeCustomAction = useCallback((actionId: string) => {
    updateDraftConfig((current) => {
      const next = removeButtonFromSections(current, actionId);
      return {
        ...next,
        actionCatalog: next.actionCatalog.filter((action) => action.actionId !== actionId),
      };
    });
  }, [updateDraftConfig]);

  const handleMessageTypeChange = (nextType: "simple" | "buttons") => {
    if (nextType === "buttons" && !canUseOfficialButtons) return;
    if (!selectedScenario?.supportsButtons || !selectedScenario.buttonSection) return;
    if (nextType === "simple") {
      for (let index = selectedButtons.length - 1; index >= 0; index -= 1) {
        removeButtonSection(selectedScenario.buttonSection, index);
      }
      return;
    }
    if (selectedButtons.length === 0) {
      addButtonSection(selectedScenario.buttonSection);
    }
  };

  return (
    <div className={recoveryStyles.botStudioStack}>
      <BotMessageStudio
        eyebrow="Atendimento"
        title="Fluxo principal"
        description={`Canal ativo: ${providerLabel}. ${channelFallbackNote}`}
        flowScenarios={flowScenarios}
        flowEdges={flowEdges}
        flowOrientation="vertical"
        flowLayoutMode="canvas-focus"
        canvasViewportMaxHeight={1040}
        startNodeId="entry_gate"
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={(scenarioId) => setSelectedScenarioId(scenarioId)}
        messageText={selectedScenario ? String(draftConfig[selectedScenario.id] || "") : ""}
        onMessageTextChange={(value) => {
          if (!selectedScenario) return;
          updateBotText(selectedScenario.id, value);
        }}
        messageType={messageType}
        onMessageTypeChange={handleMessageTypeChange}
        buttons={selectedButtons}
        actionOptions={actionOptions}
        actionById={actionById}
        catalogActions={catalogActions}
        onUpdateButton={(index, field, value) => {
          if (!selectedScenario?.buttonSection) return;
          updateButtonSection(selectedScenario.buttonSection, index, field, value);
        }}
        buttonTargetOptions={buttonTargetOptions}
        onUpdateButtonTarget={(index, nextNodeId) => {
          if (!selectedScenario?.buttonSection) return;
          updateButtonSection(selectedScenario.buttonSection, index, "nextNodeId", nextNodeId);
        }}
        onAddButton={() => {
          if (!selectedScenario?.buttonSection) return;
          addButtonSection(selectedScenario.buttonSection);
        }}
        onRemoveButton={(index) => {
          if (!selectedScenario?.buttonSection) return;
          removeButtonSection(selectedScenario.buttonSection, index);
        }}
        variables={studioVariables}
        catalogVariables={catalogVariables}
        onAppendVariable={(variableKey) => {
          if (!selectedScenario) return;
          appendVariable(selectedScenario.id, variableKey);
        }}
        previewText={selectedScenario ? renderPreviewText(String(draftConfig[selectedScenario.id] || ""), draftConfig) : "Entrada inicial do canal."}
        previewFooter="HBX Atendimento"
        textMenuMode={!canUseOfficialButtons}
        previewFallbackText={
          selectedScenario
            ? buildFallbackText(renderPreviewText(String(draftConfig[selectedScenario.id] || ""), draftConfig), selectedButtons)
            : "Entrada inicial do canal."
        }
        previewNote={channelFallbackNote}
        publicationChecks={publicationChecks}
        publicationTitle="Publicacao do fluxo principal"
        publicationDescription="Valide o tronco principal, o ramo financeiro e as saidas compartilhadas antes de salvar."
        primaryActionLabel={savingBot ? "Salvando..." : "Salvar editor"}
        onPrimaryAction={() => onSave(flushDraftConfig())}
        primaryActionDisabled={savingBot || loadingBot}
        secondaryActionLabel={onOpenSettings && providerCapabilities.canUseTemplates ? "Templates Meta" : undefined}
        onSecondaryAction={providerCapabilities.canUseTemplates ? onOpenSettings : undefined}
        variablesTabExtra={
          <article className={recoveryStyles.botStepCard}>
            <div className={recoveryStyles.botStepHeader}>
              <div>
                <h4>Variaveis do Atendimento</h4>
                <p>Catalogo operacional de campos que podem entrar nas mensagens do fluxo.</p>
              </div>
            </div>
            <div className={recoveryStyles.botVariableGrid}>
              {draftConfig.variableCatalog.map((item) => (
                <div key={item.key} className={recoveryStyles.botVariableCard}>
                  <div className={recoveryStyles.botVariableHeader}>
                    <strong>{`{{${item.key}}}`}</strong>
                    <div className={recoveryStyles.interactionBadgeRow}>
                      <span className={`${recoveryStyles.stateBadge} ${recoveryStyles.stateBot}`}>
                        {VARIABLE_SCOPE_LABELS[item.scope]}
                      </span>
                      {item.required ? (
                        <span className={`${recoveryStyles.stateBadge} ${recoveryStyles.statePaid}`}>Obrigatoria</span>
                      ) : null}
                    </div>
                  </div>
                  <label className={recoveryStyles.fieldBlock}>
                    <span>Rotulo</span>
                    <input className="field" value={item.label} readOnly />
                  </label>
                  <label className={recoveryStyles.fieldBlock}>
                    <span>Exemplo</span>
                    <input className="field" value={item.example} readOnly />
                  </label>
                  <label className={recoveryStyles.fieldBlock}>
                    <span>Descricao</span>
                    <textarea className="field" value={item.description} readOnly />
                  </label>
                </div>
              ))}
            </div>
          </article>
        }
        actionsTabExtra={
          <>
            <article className={recoveryStyles.botStepCard}>
              <div className={recoveryStyles.botStepHeader}>
                <div>
                  <h4>Regras do fluxo</h4>
                  <p>Controles de triagem para manter atendimento, agenda e financeiro no mesmo produto.</p>
                </div>
              </div>
              <div className={recoveryStyles.botRoutingGrid}>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={draftConfig.routingRules.checkRecoveryBeforeReply}
                    onChange={(event) => updateRoutingRule("checkRecoveryBeforeReply", event.target.checked)}
                  />
                  <div>
                    <strong>Ler contexto financeiro antes</strong>
                    <span>Consulta debito e status antes da triagem principal do Atendimento.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={draftConfig.routingRules.autoRouteDebtorsToRecovery}
                    onChange={(event) => updateRoutingRule("autoRouteDebtorsToRecovery", event.target.checked)}
                  />
                  <div>
                    <strong>Priorizar ramo financeiro</strong>
                    <span>Quando houver debito, o fluxo pode abrir o resumo financeiro sem sequestrar a conversa.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={draftConfig.routingRules.autoReopenClosedConversation}
                    onChange={(event) => updateRoutingRule("autoReopenClosedConversation", event.target.checked)}
                  />
                  <div>
                    <strong>Reabrir conversa encerrada</strong>
                    <span>Se o cliente voltar a falar, a conversa volta automaticamente.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={draftConfig.routingRules.notifyOnNewInbound}
                    onChange={(event) => updateRoutingRule("notifyOnNewInbound", event.target.checked)}
                  />
                  <div>
                    <strong>Notificar novas mensagens</strong>
                    <span>Alimenta o aviso visual do modulo e do topo do sistema.</span>
                  </div>
                </label>
              </div>
            </article>

            <article className={recoveryStyles.botStepCard}>
              <div className={recoveryStyles.botStepHeader}>
                <div>
                  <h4>Acoes do bot</h4>
                  <p>Catalogo unico de acoes compartilhadas entre atendimento, financeiro, agenda e humano.</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addCustomAction}>
                  Nova acao custom
                </button>
              </div>

              <div className={recoveryStyles.botActionGuideList}>
                {draftConfig.actionCatalog.map((action) => (
                  <div key={action.actionId} className={recoveryStyles.botActionGuideItem}>
                    <div className={recoveryStyles.botActionGuideEditor}>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Titulo</span>
                        <input
                          className="field"
                          value={action.title}
                          onChange={(event) => updateActionGuide(action.actionId, "title", event.target.value)}
                        />
                      </label>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Descricao</span>
                        <textarea
                          className="field"
                          value={action.description}
                          onChange={(event) => updateActionGuide(action.actionId, "description", event.target.value)}
                        />
                      </label>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Tipo</span>
                        <select
                          className="field"
                          value={action.kind}
                          onChange={(event) => updateActionGuide(action.actionId, "kind", event.target.value)}
                        >
                          {Object.entries(ACTION_KIND_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Destino</span>
                        <select
                          className="field"
                          value={action.route}
                          onChange={(event) => updateActionGuide(action.actionId, "route", event.target.value)}
                        >
                          {Object.entries(VARIABLE_SCOPE_LABELS)
                            .filter(([value]) => recoveryEnabled || value !== "recovery")
                            .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {action.kind === "agenda" ? (
                        <label className={recoveryStyles.fieldBlock}>
                          <span>Agenda vinculada</span>
                          <select
                            className="field"
                            value={String(action.agendaGroupId || "")}
                            onChange={(event) => updateActionGuide(action.actionId, "agendaGroupId", event.target.value)}
                          >
                            <option value="">Selecione</option>
                            {agendaOptions.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {action.kind === "reply" ? (
                        <label className={recoveryStyles.fieldBlock}>
                          <span>Resposta automatica</span>
                          <textarea
                            className="field"
                            rows={3}
                            value={action.responseMessage || ""}
                            onChange={(event) => updateActionGuide(action.actionId, "responseMessage", event.target.value)}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className={recoveryStyles.interactionBadgeRow}>
                      <span className={`${recoveryStyles.stateBadge} ${recoveryStyles.stateBot}`}>
                        {VARIABLE_SCOPE_LABELS[action.route]}
                      </span>
                      <span className={`${recoveryStyles.stateBadge} ${recoveryStyles.stateGenerated}`}>
                        {ACTION_KIND_LABELS[action.kind]}
                      </span>
                      <button
                        type="button"
                        className={`${recoveryStyles.stateBadge} ${action.enabled ? recoveryStyles.statePaid : recoveryStyles.stateWaiting}`}
                        onClick={() => updateActionGuide(action.actionId, "enabled", !action.enabled)}
                      >
                        {action.enabled ? "Ativa" : "Legada"}
                      </button>
                      {action.custom ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeCustomAction(action.actionId)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </>
        }
        loading={loadingBot}
      />
    </div>
  );
}
