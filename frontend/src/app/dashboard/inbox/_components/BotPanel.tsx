"use client";

import { useMemo, useState } from "react";
import BotMessageStudio from "@/components/bot-editor/BotMessageStudio";
import {
  buildAgendaActionId,
  type AtendimentoBotActionKind,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
} from "../inbox-model";
import styles from "../page.module.css";

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
    supportsButtons: false,
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
    field: "buttonId" | "actionId" | "title",
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
      const positions: Record<string, { x: number; y: number }> = {
        entry_gate: { x: 40, y: 140 },
        welcomeMessage: { x: 360, y: 20 },
        returningCustomerMessage: { x: 360, y: 240 },
        mainMenuPrompt: { x: 700, y: 20 },
        recoveryDetectedMessage: { x: 700, y: 240 },
        postActionPrompt: { x: 1040, y: 20 },
        registrationCapture: { x: 1040, y: 240 },
        agendaDispatch: { x: 1380, y: 20 },
        humanAckMessage: { x: 1380, y: 240 },
        closeTopicMessage: { x: 1380, y: 440 },
        blockedMessage: { x: 700, y: 460 },
      };

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
        position: positions.entry_gate,
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
                nextNodeId: resolveAtendimentoNextNode(String(button.actionId)),
                nextLabel:
                  BOT_SCENARIOS.find((item) => item.id === resolveAtendimentoNextNode(String(button.actionId)))
                    ?.label ||
                  (String(button.actionId).startsWith("agenda:") ? "Despacho para agenda operacional" : "Destino do fluxo"),
              }))
            : [],
        position: positions[scenario.id] || { x: 0, y: 0 },
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
          position: positions.registrationCapture,
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
          position: positions.agendaDispatch,
          effectLabel: "Abre agenda real e registra o grupo selecionado para o atendimento.",
        },
      ];

      return [gateNode, ...scenarioNodes, ...syntheticNodes];
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
    <section className={styles.stackSection}>
      <article className={styles.workspaceCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionEyebrow}>Editor premium do bot</p>
            <h3>Fluxo visual do Atendimento com nos, arestas e preview real</h3>
            <small>O builder agora separa fluxo, preview, variaveis e acoes sem parecer um painel administrativo hibrido.</small>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={savingBot || loadingBot}>
            {savingBot ? "Salvando..." : "Salvar editor"}
          </button>
        </div>

        <BotMessageStudio
          eyebrow="Atendimento"
          title={selectedScenario?.label || "Entrada do WhatsApp"}
          description={selectedScenario?.description || "Primeiro no do fluxo do Atendimento."}
          flowScenarios={flowScenarios}
          flowEdges={flowEdges}
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
          previewFooter="Atendimento"
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
          actionsTabExtra={
            <>
              <div className={styles.ruleGrid}>
                <label className={styles.switchCard}>
                  <input type="checkbox" checked={botConfig.routingRules.checkRecoveryBeforeReply} onChange={(event) => onUpdateRoutingRule("checkRecoveryBeforeReply", event.target.checked)} />
                  <div><strong>Checar Recovery antes</strong><span>Primeiro passo do Atendimento ao receber qualquer mensagem.</span></div>
                </label>
                <label className={styles.switchCard}>
                  <input type="checkbox" checked={botConfig.routingRules.autoRouteDebtorsToRecovery} onChange={(event) => onUpdateRoutingRule("autoRouteDebtorsToRecovery", event.target.checked)} />
                  <div><strong>Subir devedor para Recovery</strong><span>Clientes inadimplentes nao ficam misturados no Atendimento.</span></div>
                </label>
                <label className={styles.switchCard}>
                  <input type="checkbox" checked={botConfig.routingRules.autoReopenClosedConversation} onChange={(event) => onUpdateRoutingRule("autoReopenClosedConversation", event.target.checked)} />
                  <div><strong>Reabrir conversa encerrada</strong><span>Se o cliente voltar a falar, a conversa volta automaticamente.</span></div>
                </label>
                <label className={styles.switchCard}>
                  <input type="checkbox" checked={botConfig.routingRules.notifyOnNewInbound} onChange={(event) => onUpdateRoutingRule("notifyOnNewInbound", event.target.checked)} />
                  <div><strong>Notificar novas mensagens</strong><span>Alimenta o aviso visual do modulo e do topo do sistema.</span></div>
                </label>
              </div>

              <article className={styles.editorCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>Catalogo de acoes</strong>
                    <small>Base real para os botoes do editor, com rota, tipo e resposta automatica.</small>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onAddCustomAction}>
                    Nova acao custom
                  </button>
                </div>

                <div className={styles.actionCatalogList}>
                  {botConfig.actionCatalog.map((action) => (
                    <div key={action.actionId} className={styles.actionCard}>
                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Titulo</span>
                          <input className="field" value={action.title} onChange={(event) => onUpdateActionGuide(action.actionId, "title", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Tipo</span>
                          <select className="field" value={action.kind} onChange={(event) => onUpdateActionGuide(action.actionId, "kind", event.target.value)}>
                            {Object.entries(ACTION_KIND_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Destino</span>
                          <select className="field" value={action.route} onChange={(event) => onUpdateActionGuide(action.actionId, "route", event.target.value)}>
                            {Object.entries(VARIABLE_SCOPE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.switchRow}>
                          <input type="checkbox" checked={action.enabled} onChange={(event) => onUpdateActionGuide(action.actionId, "enabled", event.target.checked)} />
                          <span>Ativa</span>
                        </label>
                      </div>

                      <label className={styles.fieldBlock}>
                        <span>Descricao operacional</span>
                        <input className="field" value={action.description} onChange={(event) => onUpdateActionGuide(action.actionId, "description", event.target.value)} />
                      </label>

                      {action.kind === "agenda" ? (
                        <label className={styles.fieldBlock}>
                          <span>Agenda vinculada</span>
                          <select className="field" value={String(action.agendaGroupId || "")} onChange={(event) => onUpdateActionGuide(action.actionId, "agendaGroupId", event.target.value)}>
                            <option value="">Selecione</option>
                            {agendaOptions.map((group) => (
                              <option key={group.id} value={group.id}>{group.title}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {action.kind === "reply" ? (
                        <label className={styles.fieldBlock}>
                          <span>Mensagem da acao</span>
                          <textarea className="field" rows={3} value={action.responseMessage || ""} onChange={(event) => onUpdateActionGuide(action.actionId, "responseMessage", event.target.value)} />
                        </label>
                      ) : null}

                      {action.custom ? (
                        <div className={styles.footerActions}>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveCustomAction(action.actionId)}>
                            Excluir acao custom
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            </>
          }
          loading={loadingBot}
        />
      </article>
    </section>
  );
}
