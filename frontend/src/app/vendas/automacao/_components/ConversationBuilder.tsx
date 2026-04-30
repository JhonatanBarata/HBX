"use client";

import { useMemo, useState } from "react";
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
  publishing: boolean;
  recoveryEnabled: boolean;
  hasUnsavedChanges: boolean;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onSaveDraft: () => void;
  onSave: (config: AtendimentoBotConfig) => void;
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
    normalized.includes("recovery") ||
    normalized.includes("payment") ||
    normalized.includes("debt") ||
    normalized.includes("financeiro")
  ) {
    return "recovery";
  }
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

function getSceneRule(config: AtendimentoBotConfig, sceneId: ConversationSceneId, conditionType: string) {
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
  sceneId: ConversationSceneId,
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
          <span className={styles.eyebrow}>Bot</span>
          <h2>Construtor de bot</h2>
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
