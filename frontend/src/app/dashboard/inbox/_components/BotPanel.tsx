"use client";

import { useMemo, useState } from "react";
import { ChatIconButton } from "@/components/chat/PremiumChat";
import BotMessageStudio from "@/components/bot-editor/BotMessageStudio";
import recoveryStyles from "@/app/hbx-recovery/page.module.css";
import {
  buildAgendaActionId,
  type AtendimentoBotActionKind,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
} from "../inbox-model";

const VARIABLE_SCOPE_LABELS: Record<AtendimentoBotVariableScope, string> = {
  shared: "Compartilhado",
  atendimento: "Atendimento",
  recovery: "Recovery",
};

const ACTION_KIND_LABELS: Record<AtendimentoBotActionKind, string> = {
  reply: "Resposta",
  human_handoff: "Fila humana",
  recovery_handoff: "Ir para Recovery",
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
    label: "Mensagem para cliente novo",
    description: "Primeira resposta para quem ainda nao tem historico de conversa.",
    badge: "Entrada",
    supportsButtons: true,
    buttonSection: "welcomeButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "returningCustomerMessage",
    label: "Mensagem para cliente recorrente",
    description: "Resposta curta para retomar o atendimento de quem voltou a falar.",
    badge: "Retorno",
    supportsButtons: true,
    buttonSection: "returningCustomerButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "mainMenuPrompt",
    label: "Menu principal",
    description: "Mensagem central com as opcoes principais do Atendimento.",
    badge: "Interativo",
    supportsButtons: true,
    buttonSection: "mainMenuButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "recoveryDetectedMessage",
    label: "Parede com Recovery",
    description: "Mensagem quando o cliente tem debito e precisa ser encaminhado com clareza.",
    badge: "Recovery",
    supportsButtons: true,
    buttonSection: "recoveryDetectedButtons" as const,
    scopes: ["shared", "recovery"] as AtendimentoBotVariableScope[],
  },
  {
    id: "postActionPrompt",
    label: "Mensagem apos acoes",
    description: "Continua o fluxo depois de agenda ou resposta custom.",
    badge: "Continuidade",
    supportsButtons: true,
    buttonSection: "postActionButtons" as const,
    scopes: ["shared", "atendimento"] as AtendimentoBotVariableScope[],
  },
  {
    id: "humanAckMessage",
    label: "Confirmacao de humano",
    description: "Mensagem enviada quando a conversa sai do bot e entra na fila humana.",
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

type BotPanelProps = {
  botConfig: AtendimentoBotConfig;
  loadingBot: boolean;
  savingBot: boolean;
  actionOptions: ActionOption[];
  agendaOptions: Array<{ id: string; title: string }>;
  onSave: () => void;
  onUpdateRoutingRule: (field: keyof AtendimentoBotConfig["routingRules"], value: boolean) => void;
  onAppendVariable: (field: keyof AtendimentoBotConfig, variableKey: string) => void;
  onUpdateBotText: (
    field:
      | "welcomeMessage"
      | "returningCustomerMessage"
      | "mainMenuPrompt"
      | "recoveryDetectedMessage"
      | "postActionPrompt"
      | "humanAckMessage"
      | "closeTopicMessage"
      | "blockedMessage",
    value: string,
  ) => void;
  onUpdateButtonSection: (
    section: ButtonSection,
    index: number,
    field: "buttonId" | "actionId" | "title" | "nextNodeId",
    value: string,
  ) => void;
  onAddButtonSection: (section: ButtonSection) => void;
  onRemoveButtonSection: (section: ButtonSection, index: number) => void;
  onUpdateActionGuide: (
    actionId: string,
    field: "title" | "description" | "route" | "kind" | "enabled" | "responseMessage" | "agendaGroupId",
    value: string | boolean,
  ) => void;
  onAddCustomAction: () => void;
  onRemoveCustomAction: (actionId: string) => void;
};

function buildFallbackText(message: string, buttons: Array<{ title: string }>) {
  const lines = buttons.map((button, index) => `${index + 1}. ${button.title}`).join("\n");
  return lines ? `${message}\n\n${lines}`.trim() : message;
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
    default:
      if (actionId.startsWith("agenda:")) return "agendaDispatch";
      return "postActionPrompt";
  }
}

function getAtendimentoNodeLabel(nodeId: string) {
  return BOT_SCENARIOS.find((item) => item.id === nodeId)?.label || nodeId;
}

function sortNodeIds(nodeIds: string[]) {
  const nodeOrder = [
    "entry_gate",
    "welcomeMessage",
    "returningCustomerMessage",
    "mainMenuPrompt",
    "recoveryDetectedMessage",
    "postActionPrompt",
    "registrationCapture",
    "agendaDispatch",
    "humanAckMessage",
    "closeTopicMessage",
    "blockedMessage",
  ];

  return [...nodeIds].sort((left, right) => {
    const leftIndex = nodeOrder.indexOf(left);
    const rightIndex = nodeOrder.indexOf(right);
    const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return safeLeft - safeRight || left.localeCompare(right);
  });
}

function applyAutoLayout<T extends { id: string; buttons: Array<{ nextNodeId?: string }>; position?: { x: number; y: number } }>(
  nodes: T[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const levelById = new Map<string, number>();
  const queue = [{ id: "entry_gate", level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !nodeIds.has(current.id)) continue;

    const existingLevel = levelById.get(current.id);
    if (existingLevel !== undefined && existingLevel <= current.level) continue;
    levelById.set(current.id, current.level);

    const node = nodes.find((item) => item.id === current.id);
    if (!node) continue;

    for (const button of node.buttons) {
      if (!button.nextNodeId || !nodeIds.has(button.nextNodeId)) continue;
      queue.push({ id: button.nextNodeId, level: current.level + 1 });
    }
  }

  const columns = new Map<number, string[]>();
  for (const [nodeId, level] of levelById.entries()) {
    const current = columns.get(level) || [];
    current.push(nodeId);
    columns.set(level, sortNodeIds(current));
  }

  const maxLevel = Math.max(...Array.from(levelById.values()), 0);
  const unlinkedNodeIds = sortNodeIds(nodes.map((node) => node.id).filter((nodeId) => !levelById.has(nodeId)));
  if (unlinkedNodeIds.length > 0) {
    columns.set(maxLevel + 1, unlinkedNodeIds);
  }

  const positioned = new Map<string, { x: number; y: number }>();
  for (const [level, nodeIdsAtLevel] of Array.from(columns.entries()).sort((left, right) => left[0] - right[0])) {
    nodeIdsAtLevel.forEach((nodeId, index) => {
      positioned.set(nodeId, {
        x: 40 + level * 340,
        y: 20 + index * 220,
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || node.position || { x: 40, y: 20 },
  }));
}

export default function BotPanel({
  botConfig,
  loadingBot,
  savingBot,
  actionOptions,
  agendaOptions,
  onSave,
  onUpdateRoutingRule,
  onAppendVariable,
  onUpdateBotText,
  onUpdateButtonSection,
  onAddButtonSection,
  onRemoveButtonSection,
  onUpdateActionGuide,
  onAddCustomAction,
  onRemoveCustomAction,
}: BotPanelProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("entry_gate");

  const selectedScenario =
    BOT_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) || null;
  const selectedButtons =
    selectedScenario?.supportsButtons && selectedScenario.buttonSection
      ? botConfig[selectedScenario.buttonSection]
      : [];
  const messageType =
    selectedScenario?.supportsButtons && selectedButtons.length > 0 ? "buttons" : "simple";

  const actionById = useMemo(() => {
    const next: Record<string, { actionId: string; title: string; description: string; routeLabel: string; typeLabel: string; enabled: boolean }> = {};
    for (const action of botConfig.actionCatalog) {
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
  }, [agendaOptions, botConfig.actionCatalog]);

  const buttonTargetOptions = useMemo(
    () => [
      ...BOT_SCENARIOS.map((scenario) => ({
        value: scenario.id,
        label: scenario.label,
        description: scenario.description,
      })),
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
    ],
    [],
  );

  const studioVariables = useMemo(
    () =>
      botConfig.variableCatalog
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
                  ? "Recovery"
                  : item.scope === "atendimento"
                    ? "Atendimento"
                    : "Sistema",
          originLabel:
            item.scope === "shared"
              ? "Contexto automatico da empresa logada"
              : item.scope === "recovery"
                ? "Parede com Recovery e debitos"
                : "Dados operacionais do Atendimento",
          required: item.required,
        })),
    [botConfig.variableCatalog, selectedScenario],
  );

  const flowScenarios = useMemo(
    () => {
      const gateNode = {
        id: "entry_gate",
        label: "Entrada do WhatsApp",
        description: "Primeiro no do Atendimento apos a mensagem inbound do cliente.",
        badge: "Entrada",
        nodeKind: "template" as const,
        supportsButtons: true,
        editable: false,
        messageText: "Primeira triagem automatica do Atendimento.",
        buttons: [
          {
            buttonId: "new_customer",
            actionId: "entry_new_customer",
            title: "Cliente novo",
            nextNodeId: "welcomeMessage",
            nextLabel: "Abrir mensagem para cliente novo",
          },
          {
            buttonId: "returning_customer",
            actionId: "entry_returning_customer",
            title: "Cliente recorrente",
            nextNodeId: "returningCustomerMessage",
            nextLabel: "Retomar atendimento do cliente recorrente",
          },
        ],
        toneLabel: "Entrada automatica do canal",
      };

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
              : ("message" as const),
        supportsButtons: scenario.supportsButtons,
        editable: true,
        messageText: String(botConfig[scenario.id] || ""),
        buttons:
          scenario.supportsButtons && scenario.buttonSection
            ? botConfig[scenario.buttonSection].map((button) => ({
                ...button,
                nextNodeId: String(button.nextNodeId || resolveAtendimentoNextNode(String(button.actionId))),
                nextLabel: getAtendimentoNodeLabel(String(button.nextNodeId || resolveAtendimentoNextNode(String(button.actionId)))),
              }))
            : [],
      }));

      const syntheticNodes = [
        {
          id: "registrationCapture",
          label: "Captura de cadastro",
          description: "Coleta rapida de dados do novo cliente antes de continuar o atendimento.",
          badge: "Acao",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Acao de cadastro rapido em andamento.",
          buttons: [],
          effectLabel: "Salva cadastro inicial e depois devolve o cliente ao fluxo principal.",
        },
        {
          id: "agendaDispatch",
          label: "Despacho para agenda",
          description: "Envia o cliente para a agenda operacional selecionada.",
          badge: "Agenda",
          nodeKind: "action" as const,
          supportsButtons: false,
          editable: false,
          messageText: "Agenda operacional selecionada.",
          buttons: [],
          effectLabel: "Abre agenda real e registra o grupo selecionado para o atendimento.",
        },
      ];

      return applyAutoLayout([gateNode, ...scenarioNodes, ...syntheticNodes]);
    },
    [botConfig],
  );

  const catalogVariables = useMemo(
    () =>
      botConfig.variableCatalog.map((item) => ({
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
                ? "Recovery"
                : item.scope === "atendimento"
                  ? "Atendimento"
                  : "Sistema",
        originLabel:
          item.scope === "shared"
            ? "Contexto automatico da empresa logada"
            : item.scope === "recovery"
              ? "Parede com Recovery e debitos"
              : "Dados operacionais do Atendimento",
        required: item.required,
      })),
    [botConfig.variableCatalog],
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
    const base = botConfig.actionCatalog.map((action) => ({
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
  }, [agendaOptions, botConfig.actionCatalog]);

  const publicationChecks = useMemo(
    () => [
      {
        id: "welcome",
        label: "Boas-vindas",
        description: "O primeiro contato precisa ter uma mensagem clara para cliente novo.",
        ok: String(botConfig.welcomeMessage || "").trim().length > 0,
      },
      {
        id: "main_menu",
        label: "Menu principal",
        description: "O fluxo principal do Atendimento precisa ter pelo menos uma rota clicavel.",
        ok: botConfig.mainMenuButtons.length > 0,
      },
      {
        id: "active_actions",
        label: "Acoes operacionais",
        description: "Pelo menos uma acao do catalogo precisa estar ativa e pronta para uso.",
        ok: botConfig.actionCatalog.some((action) => action.enabled),
      },
      {
        id: "routing",
        label: "Parede com Recovery",
        description: "As regras de triagem precisam continuar ativas para nao misturar cobranca com atendimento.",
        ok: botConfig.routingRules.checkRecoveryBeforeReply || botConfig.routingRules.autoRouteDebtorsToRecovery,
      },
    ],
    [botConfig.actionCatalog, botConfig.mainMenuButtons.length, botConfig.routingRules, botConfig.welcomeMessage],
  );

  const handleMessageTypeChange = (nextType: "simple" | "buttons") => {
    if (!selectedScenario?.supportsButtons || !selectedScenario.buttonSection) return;
    if (nextType === "simple") {
      for (let index = selectedButtons.length - 1; index >= 0; index -= 1) {
        onRemoveButtonSection(selectedScenario.buttonSection, index);
      }
      return;
    }
    if (selectedButtons.length === 0) {
      onAddButtonSection(selectedScenario.buttonSection);
    }
  };

  return (
    <div className={recoveryStyles.botStudioStack}>
      <div className={recoveryStyles.sectionHeader}>
        <div>
          <p className={recoveryStyles.sectionEyebrow}>Mensagens do fluxo</p>
          <h3 className={recoveryStyles.sectionTitle}>Builder conversacional do Atendimento</h3>
          <div>
            <p className={recoveryStyles.sectionDescription}>
              Mesmo padrão do Recovery, com canvas vertical, preview navegável e catálogo operacional limpo.
            </p>
          </div>
        </div>
        <div className={recoveryStyles.headerActions}>
          <ChatIconButton
            icon="gear"
            label="Editor"
            title="Configurar editor do bot"
            aria-label="Configurar editor do bot"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={savingBot || loadingBot}>
            {savingBot ? "Salvando..." : "Salvar editor"}
          </button>
        </div>
      </div>

      <BotMessageStudio
        eyebrow="Atendimento"
        title={selectedScenario?.label || "Entrada do WhatsApp"}
        description={selectedScenario?.description || "Primeiro no do fluxo do Atendimento."}
        flowScenarios={flowScenarios}
        flowEdges={flowEdges}
        flowOrientation="vertical"
        flowLayoutMode="canvas-focus"
        canvasViewportMaxHeight={1040}
        startNodeId="entry_gate"
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={(scenarioId) => setSelectedScenarioId(scenarioId)}
        messageText={selectedScenario ? String(botConfig[selectedScenario.id] || "") : ""}
        onMessageTextChange={(value) => {
          if (!selectedScenario) return;
          onUpdateBotText(selectedScenario.id, value);
        }}
        messageType={messageType}
        onMessageTypeChange={handleMessageTypeChange}
        buttons={selectedButtons}
        actionOptions={actionOptions}
        actionById={actionById}
        catalogActions={catalogActions}
        onUpdateButton={(index, field, value) => {
          if (!selectedScenario?.buttonSection) return;
          onUpdateButtonSection(selectedScenario.buttonSection, index, field, value);
        }}
        buttonTargetOptions={buttonTargetOptions}
        onUpdateButtonTarget={(index, nextNodeId) => {
          if (!selectedScenario?.buttonSection) return;
          onUpdateButtonSection(selectedScenario.buttonSection, index, "nextNodeId", nextNodeId);
        }}
        onAddButton={() => {
          if (!selectedScenario?.buttonSection) return;
          onAddButtonSection(selectedScenario.buttonSection);
        }}
        onRemoveButton={(index) => {
          if (!selectedScenario?.buttonSection) return;
          onRemoveButtonSection(selectedScenario.buttonSection, index);
        }}
        variables={studioVariables}
        catalogVariables={catalogVariables}
        onAppendVariable={(variableKey) => {
          if (!selectedScenario) return;
          onAppendVariable(selectedScenario.id, variableKey);
        }}
        previewText={selectedScenario ? renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig) : "Entrada inicial do canal."}
        previewFooter="HBX Atendimento"
        previewFallbackText={
          selectedScenario
            ? buildFallbackText(renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig), selectedButtons)
            : "Entrada inicial do canal."
        }
        previewNote="O fallback textual continua disponivel para canais ou cenarios sem suporte a botoes."
        publicationChecks={publicationChecks}
        publicationTitle="Publicacao do fluxo Atendimento"
        publicationDescription="Revise entrada, menu principal e parede com Recovery antes de salvar o builder."
        primaryActionLabel={savingBot ? "Salvando..." : "Salvar editor"}
        onPrimaryAction={onSave}
        primaryActionDisabled={savingBot || loadingBot}
        variablesTabExtra={
          <article className={recoveryStyles.botStepCard}>
            <div className={recoveryStyles.botStepHeader}>
              <div>
                <h4>Variaveis do Atendimento</h4>
                <p>Catalogo operacional de campos que podem entrar nas mensagens do fluxo.</p>
              </div>
            </div>
            <div className={recoveryStyles.botVariableGrid}>
              {botConfig.variableCatalog.map((item) => (
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
                  <h4>Roteamento do Atendimento</h4>
                  <p>Regras de triagem para nao misturar atendimento, agenda e cobranca.</p>
                </div>
              </div>
              <div className={recoveryStyles.botRoutingGrid}>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={botConfig.routingRules.checkRecoveryBeforeReply}
                    onChange={(event) => onUpdateRoutingRule("checkRecoveryBeforeReply", event.target.checked)}
                  />
                  <div>
                    <strong>Checar Recovery antes</strong>
                    <span>Primeiro passo do Atendimento ao receber qualquer mensagem.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={botConfig.routingRules.autoRouteDebtorsToRecovery}
                    onChange={(event) => onUpdateRoutingRule("autoRouteDebtorsToRecovery", event.target.checked)}
                  />
                  <div>
                    <strong>Subir devedor para Recovery</strong>
                    <span>Clientes inadimplentes nao ficam misturados no Atendimento.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={botConfig.routingRules.autoReopenClosedConversation}
                    onChange={(event) => onUpdateRoutingRule("autoReopenClosedConversation", event.target.checked)}
                  />
                  <div>
                    <strong>Reabrir conversa encerrada</strong>
                    <span>Se o cliente voltar a falar, a conversa volta automaticamente.</span>
                  </div>
                </label>
                <label className={recoveryStyles.botRoutingToggle}>
                  <input
                    type="checkbox"
                    checked={botConfig.routingRules.notifyOnNewInbound}
                    onChange={(event) => onUpdateRoutingRule("notifyOnNewInbound", event.target.checked)}
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
                  <p>Mesma leitura visual do Recovery, com os campos operacionais do Atendimento.</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onAddCustomAction}>
                  Nova acao custom
                </button>
              </div>

              <div className={recoveryStyles.botActionGuideList}>
                {botConfig.actionCatalog.map((action) => (
                  <div key={action.actionId} className={recoveryStyles.botActionGuideItem}>
                    <div className={recoveryStyles.botActionGuideEditor}>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Titulo</span>
                        <input
                          className="field"
                          value={action.title}
                          onChange={(event) => onUpdateActionGuide(action.actionId, "title", event.target.value)}
                        />
                      </label>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Descricao</span>
                        <textarea
                          className="field"
                          value={action.description}
                          onChange={(event) => onUpdateActionGuide(action.actionId, "description", event.target.value)}
                        />
                      </label>
                      <label className={recoveryStyles.fieldBlock}>
                        <span>Tipo</span>
                        <select
                          className="field"
                          value={action.kind}
                          onChange={(event) => onUpdateActionGuide(action.actionId, "kind", event.target.value)}
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
                          onChange={(event) => onUpdateActionGuide(action.actionId, "route", event.target.value)}
                        >
                          {Object.entries(VARIABLE_SCOPE_LABELS).map(([value, label]) => (
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
                            onChange={(event) => onUpdateActionGuide(action.actionId, "agendaGroupId", event.target.value)}
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
                            onChange={(event) => onUpdateActionGuide(action.actionId, "responseMessage", event.target.value)}
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
                        onClick={() => onUpdateActionGuide(action.actionId, "enabled", !action.enabled)}
                      >
                        {action.enabled ? "Ativa" : "Legada"}
                      </button>
                      {action.custom ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onRemoveCustomAction(action.actionId)}
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
