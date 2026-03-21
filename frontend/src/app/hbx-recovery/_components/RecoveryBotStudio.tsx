"use client";

import { useMemo, useState } from "react";
import BotMessageStudio, { type BotStudioTemplateStart } from "@/components/bot-editor/BotMessageStudio";
import type {
  RecoveryBotButton,
  RecoveryBotConfig,
  RecoveryBotVariableDefinition,
  RecoveryBotVariableScope,
} from "../recovery-model";
import styles from "../page.module.css";

type BotButtonSectionKey =
  | "mainMenuButtons"
  | "declineMenuButtons"
  | "followupButtons"
  | "valueButtons"
  | "installmentButtons"
  | "installmentConfirmButtons"
  | "postLinkButtons";

type BotTextField =
  | "rootFooter"
  | "mainMenuPrompt"
  | "declineMenuPrompt"
  | "followupPrompt"
  | "valueMessageTemplate"
  | "installmentsPrompt"
  | "installmentConfirmTemplate"
  | "cashLinkMessageTemplate"
  | "installmentLinkMessageTemplate"
  | "postLinkPrompt"
  | "closeTopicMessage"
  | "paidClaimMessage"
  | "humanAckMessage";

type ActionOption = { value: string; label: string };

const BOT_SCOPE_LABELS: Record<RecoveryBotVariableScope, string> = {
  shared: "Compartilhado",
  recovery: "Recovery",
  atendimento: "Atendimento",
};

type ScenarioDef = {
  id: Exclude<BotTextField, "rootFooter">;
  label: string;
  description: string;
  badge: string;
  supportsButtons: boolean;
  scopes: RecoveryBotVariableScope[];
  buttonSection?: BotButtonSectionKey;
};

const BOT_SCENARIOS: ScenarioDef[] = [
  {
    id: "mainMenuPrompt",
    label: "Menu principal",
    description: "Mensagem enviada quando o cliente confirma que quer continuar.",
    badge: "Interativo",
    supportsButtons: true,
    buttonSection: "mainMenuButtons" as const,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "declineMenuPrompt",
    label: "Recusa inicial",
    description: "Fluxo de quem nao quer seguir agora.",
    badge: "Recusa",
    supportsButtons: true,
    buttonSection: "declineMenuButtons" as const,
    scopes: ["shared", "atendimento"] as RecoveryBotVariableScope[],
  },
  {
    id: "followupPrompt",
    label: "Follow-up",
    description: "Define o periodo de retorno quando o cliente quer falar depois.",
    badge: "Agenda",
    supportsButtons: true,
    buttonSection: "followupButtons" as const,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "valueMessageTemplate",
    label: "Valor pendente",
    description: "Mensagem que mostra valor, servico e data ao cliente.",
    badge: "Financeiro",
    supportsButtons: true,
    buttonSection: "valueButtons" as const,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "installmentsPrompt",
    label: "Parcelamento",
    description: "Abre o caminho de pagamento em credito.",
    badge: "Credito",
    supportsButtons: true,
    buttonSection: "installmentButtons" as const,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "installmentConfirmTemplate",
    label: "Confirmacao de parcela",
    description: "Confirma o que sera gerado antes do checkout.",
    badge: "Confirmacao",
    supportsButtons: true,
    buttonSection: "installmentConfirmButtons" as const,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "postLinkPrompt",
    label: "Pos-link",
    description: "Mensagem posterior ao envio do link de pagamento.",
    badge: "Pos-envio",
    supportsButtons: true,
    buttonSection: "postLinkButtons" as const,
    scopes: ["shared", "recovery", "atendimento"] as RecoveryBotVariableScope[],
  },
  {
    id: "cashLinkMessageTemplate",
    label: "Link avista",
    description: "Texto da entrega do link Pix ou pagamento imediato.",
    badge: "Pix",
    supportsButtons: false,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "installmentLinkMessageTemplate",
    label: "Link parcelado",
    description: "Texto da entrega do checkout em credito.",
    badge: "Checkout",
    supportsButtons: false,
    scopes: ["shared", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "closeTopicMessage",
    label: "Encerramento",
    description: "Fecha o assunto atual sem poluicao visual.",
    badge: "Saida",
    supportsButtons: false,
    scopes: ["shared", "atendimento"] as RecoveryBotVariableScope[],
  },
  {
    id: "paidClaimMessage",
    label: "Cliente diz que pagou",
    description: "Mensagem antes de encaminhar a validacao humana.",
    badge: "Pagamento",
    supportsButtons: false,
    scopes: ["shared", "atendimento", "recovery"] as RecoveryBotVariableScope[],
  },
  {
    id: "humanAckMessage",
    label: "Encaminhamento humano",
    description: "Confirma a saida do bot para a fila humana.",
    badge: "Humano",
    supportsButtons: false,
    scopes: ["shared", "atendimento"] as RecoveryBotVariableScope[],
  },
] as const;

function buildFallbackText(message: string, buttons: RecoveryBotButton[]) {
  const lines = buttons.map((button, index) => `${index + 1}. ${button.title}`).join("\n");
  return lines ? `${message}\n\n${lines}`.trim() : message;
}

function renderPreviewText(message: string, botConfig: RecoveryBotConfig) {
  const samples = Object.fromEntries(
    botConfig.variableCatalog.map((item) => [item.key, item.example || item.label || item.key]),
  );
  return String(message || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return String(samples[key] || `{{${key}}}`);
  });
}

type RecoveryBotStudioProps = {
  botConfig: RecoveryBotConfig;
  loadingBotConfig: boolean;
  savingBotConfig: boolean;
  botActionOptions: ActionOption[];
  templateStart?: BotStudioTemplateStart | null;
  startTemplateReady?: boolean;
  onSave: () => void;
  onBotTextChange: (field: BotTextField, value: string) => void;
  onAppendVariable: (field: BotTextField, variableKey: string) => void;
  onUpdateButton: (
    section: BotButtonSectionKey,
    index: number,
    field: "buttonId" | "actionId" | "title",
    value: string,
  ) => void;
  onAddButton: (section: BotButtonSectionKey) => void;
  onRemoveButton: (section: BotButtonSectionKey, index: number) => void;
  onUpdateVariableGuide: (
    key: string,
    field: "label" | "example" | "description",
    value: string,
  ) => void;
  onUpdateActionGuide: (
    actionId: string,
    field: "actionId" | "title" | "description" | "route" | "responseMessage" | "enabled",
    value: string | boolean,
  ) => void;
  onAddCustomActionGuide: () => void;
  onRemoveCustomActionGuide: (actionId: string) => void;
  onUpdateRoutingRule: (field: keyof RecoveryBotConfig["routingRules"], checked: boolean) => void;
};

export default function RecoveryBotStudio({
  botConfig,
  loadingBotConfig,
  savingBotConfig,
  botActionOptions,
  templateStart,
  startTemplateReady = false,
  onSave,
  onBotTextChange,
  onAppendVariable,
  onUpdateButton,
  onAddButton,
  onRemoveButton,
  onUpdateVariableGuide,
  onUpdateActionGuide,
  onAddCustomActionGuide,
  onRemoveCustomActionGuide,
  onUpdateRoutingRule,
}: RecoveryBotStudioProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<(typeof BOT_SCENARIOS)[number]["id"]>("mainMenuPrompt");

  const selectedScenario =
    BOT_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) || BOT_SCENARIOS[0];
  const selectedButtons =
    selectedScenario.supportsButtons && selectedScenario.buttonSection
      ? botConfig[selectedScenario.buttonSection]
      : [];
  const messageType =
    selectedScenario.supportsButtons && selectedButtons.length > 0 ? "buttons" : "simple";

  const actionById = useMemo(() => {
    const next: Record<string, { actionId: string; title: string; description: string; routeLabel: string; typeLabel: string; enabled: boolean }> = {};
    for (const action of botConfig.actionCatalog) {
      next[String(action.actionId)] = {
        actionId: String(action.actionId),
        title: action.title,
        description: action.description,
        routeLabel: BOT_SCOPE_LABELS[action.route],
        typeLabel: "Acao do bot",
        enabled: action.enabled,
      };
    }
    return next;
  }, [botConfig.actionCatalog]);

  const studioVariables = useMemo(
    () =>
      botConfig.variableCatalog
        .filter((item) => selectedScenario.scopes.includes(item.scope) || item.scope === "shared")
        .map((item: RecoveryBotVariableDefinition) => ({
          key: item.key,
          label: item.label,
          example: item.example,
          scopeLabel: BOT_SCOPE_LABELS[item.scope],
          required: item.required,
        })),
    [botConfig.variableCatalog, selectedScenario.scopes],
  );

  const flowScenarios = useMemo(
    () =>
      BOT_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        label: scenario.label,
        description: scenario.description,
        badge: scenario.badge,
        supportsButtons: scenario.supportsButtons,
        messageText: String(botConfig[scenario.id] || ""),
        buttons:
          scenario.supportsButtons && scenario.buttonSection ? botConfig[scenario.buttonSection] : [],
      })),
    [botConfig],
  );

  const catalogVariables = useMemo(
    () =>
      botConfig.variableCatalog.map((item: RecoveryBotVariableDefinition) => ({
        key: item.key,
        label: item.label,
        example: item.example,
        scopeLabel: BOT_SCOPE_LABELS[item.scope],
        required: item.required,
      })),
    [botConfig.variableCatalog],
  );

  const catalogActions = useMemo(
    () =>
      botConfig.actionCatalog.map((action) => ({
        actionId: String(action.actionId),
        title: action.title,
        description: action.description,
        routeLabel: BOT_SCOPE_LABELS[action.route],
        typeLabel: "Acao do bot",
        enabled: action.enabled,
      })),
    [botConfig.actionCatalog],
  );

  const publicationChecks = useMemo(
    () => [
      {
        id: "template",
        label: "Template inicial",
        description: "O bloco de entrada precisa permanecer pronto e compativel com a Meta.",
        ok: Boolean(templateStart) && startTemplateReady,
      },
      {
        id: "entry_message",
        label: "Mensagem principal",
        description: "O menu principal do Recovery precisa ter texto claro para abrir o fluxo.",
        ok: String(botConfig.mainMenuPrompt || "").trim().length > 0,
      },
      {
        id: "interactive_paths",
        label: "Ramificacoes por botoes",
        description: "Pelo menos um bloco interativo precisa ter botoes validos para o cliente seguir.",
        ok: flowScenarios.some((scenario) => scenario.buttons.length > 0),
      },
      {
        id: "actions",
        label: "Acoes ativas",
        description: "O builder precisa ter pelo menos uma acao operacional ativa no catalogo.",
        ok: botConfig.actionCatalog.some((action) => action.enabled),
      },
    ],
    [botConfig.actionCatalog, botConfig.mainMenuPrompt, flowScenarios, startTemplateReady, templateStart],
  );

  const handleMessageTypeChange = (nextType: "simple" | "buttons") => {
    if (!selectedScenario.supportsButtons || !selectedScenario.buttonSection) return;
    if (nextType === "simple") {
      for (let index = selectedButtons.length - 1; index >= 0; index -= 1) {
        onRemoveButton(selectedScenario.buttonSection, index);
      }
      return;
    }
    if (selectedButtons.length === 0) {
      onAddButton(selectedScenario.buttonSection);
    }
  };

  return (
    <div className={styles.botStudioStack}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Mensagens do fluxo</p>
          <h3 className={styles.sectionTitle}>Editor visual do Recovery</h3>
          <p className={styles.sectionDescription}>
            Edite uma etapa por vez, com botao estavel, preview fiel e separacao clara entre texto, variaveis e acoes.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={savingBotConfig || loadingBotConfig}>
          {savingBotConfig ? "Salvando..." : "Salvar editor"}
        </button>
      </div>

      <BotMessageStudio
        eyebrow="Recovery"
        title={selectedScenario.label}
        description={selectedScenario.description}
        flowScenarios={flowScenarios}
        selectedScenarioId={selectedScenario.id}
        onSelectScenario={(scenarioId) => setSelectedScenarioId(scenarioId as (typeof BOT_SCENARIOS)[number]["id"])}
        messageText={String(botConfig[selectedScenario.id] || "")}
        onMessageTextChange={(value) => onBotTextChange(selectedScenario.id, value)}
        messageType={messageType}
        onMessageTypeChange={handleMessageTypeChange}
        buttons={selectedButtons}
        actionOptions={botActionOptions}
        actionById={actionById}
        catalogActions={catalogActions}
        onUpdateButton={(index, field, value) => {
          if (!selectedScenario.buttonSection) return;
          onUpdateButton(selectedScenario.buttonSection, index, field, value);
        }}
        onAddButton={() => {
          if (!selectedScenario.buttonSection) return;
          onAddButton(selectedScenario.buttonSection);
        }}
        onRemoveButton={(index) => {
          if (!selectedScenario.buttonSection) return;
          onRemoveButton(selectedScenario.buttonSection, index);
        }}
        variables={studioVariables}
        catalogVariables={catalogVariables}
        onAppendVariable={(variableKey) => onAppendVariable(selectedScenario.id, variableKey)}
        previewText={renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig)}
        previewFooter={botConfig.rootFooter || "HBX Recovery"}
        previewFallbackText={buildFallbackText(renderPreviewText(String(botConfig[selectedScenario.id] || ""), botConfig), selectedButtons)}
        previewNote="O fallback textual tambem fica preparado para canais ou cenarios sem botoes."
        templateStart={templateStart}
        publicationChecks={publicationChecks}
        publicationTitle="Publicacao do fluxo Recovery"
        publicationDescription="Valide entrada, menu principal e rotas de cobranca antes de salvar este rascunho."
        primaryActionLabel={savingBotConfig ? "Salvando..." : "Salvar editor"}
        onPrimaryAction={onSave}
        primaryActionDisabled={savingBotConfig || loadingBotConfig}
        variablesTabExtra={
          <article className={styles.botStepCard}>
            <div className={styles.botStepHeader}>
              <div>
                <h4>Variaveis e rodape</h4>
                <p>Catalogo operacional do que pode entrar nas mensagens do fluxo.</p>
              </div>
            </div>
            <div className={styles.botVariableGrid}>
              {botConfig.variableCatalog.map((item) => (
                <div key={item.key} className={styles.botVariableCard}>
                  <div className={styles.botVariableHeader}>
                    <strong>{`{{${item.key}}}`}</strong>
                    <div className={styles.interactionBadgeRow}>
                      <span className={`${styles.stateBadge} ${styles.stateBot}`}>{BOT_SCOPE_LABELS[item.scope]}</span>
                      {item.required ? <span className={`${styles.stateBadge} ${styles.statePaid}`}>Obrigatoria</span> : null}
                    </div>
                  </div>
                  <label className={styles.fieldBlock}>
                    <span>Rotulo</span>
                    <input className="field" value={item.label} onChange={(event) => onUpdateVariableGuide(item.key, "label", event.target.value)} />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Exemplo</span>
                    <input className="field" value={item.example} onChange={(event) => onUpdateVariableGuide(item.key, "example", event.target.value)} />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Descricao</span>
                    <textarea className="field" value={item.description} onChange={(event) => onUpdateVariableGuide(item.key, "description", event.target.value)} />
                  </label>
                </div>
              ))}
            </div>
            <label className={styles.fieldBlock}>
              <span>Rodape dos interativos</span>
              <input className="field" value={botConfig.rootFooter} onChange={(event) => onBotTextChange("rootFooter", event.target.value)} />
            </label>
          </article>
        }
        actionsTabExtra={
          <article className={styles.botStepCard}>
            <div className={styles.botStepHeader}>
              <div>
                <h4>Acoes e roteamento</h4>
                <p>Base operacional do que cada botao do Recovery realmente dispara.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onAddCustomActionGuide}>
                Nova acao custom
              </button>
            </div>
            <div className={styles.botRoutingGrid}>
              <label className={styles.botRoutingToggle}>
                <input type="checkbox" checked={botConfig.routingRules.preferRecoveryForDebtors} onChange={(event) => onUpdateRoutingRule("preferRecoveryForDebtors", event.target.checked)} />
                <div>
                  <strong>Priorizar Recovery para devedores ativos</strong>
                  <span>Conversa com debito aberto tende a permanecer no modulo de cobranca.</span>
                </div>
              </label>
              <label className={styles.botRoutingToggle}>
                <input type="checkbox" checked={botConfig.routingRules.preferRecoveryForNegotiations} onChange={(event) => onUpdateRoutingRule("preferRecoveryForNegotiations", event.target.checked)} />
                <div>
                  <strong>Preservar negociacoes do Recovery</strong>
                  <span>Mensagens de cobranca continuam com prioridade no modulo financeiro.</span>
                </div>
              </label>
              <label className={styles.botRoutingToggle}>
                <input type="checkbox" checked={botConfig.routingRules.preferInboxForManualQueue} onChange={(event) => onUpdateRoutingRule("preferInboxForManualQueue", event.target.checked)} />
                <div>
                  <strong>Fila humana vai para Atendimento</strong>
                  <span>Quando um humano assume, o destino sugerido passa a ser o Atendimento.</span>
                </div>
              </label>
            </div>

            <div className={styles.botActionGuideList}>
              {botConfig.actionCatalog.map((action) => (
                <div key={action.actionId} className={styles.botActionGuideItem}>
                  <div className={styles.botActionGuideEditor}>
                    {action.custom ? (
                      <label className={styles.fieldBlock}>
                        <span>Id tecnico</span>
                        <input className="field" value={String(action.actionId)} onChange={(event) => onUpdateActionGuide(String(action.actionId), "actionId", event.target.value)} />
                      </label>
                    ) : null}
                    <label className={styles.fieldBlock}>
                      <span>Titulo</span>
                      <input className="field" value={action.title} onChange={(event) => onUpdateActionGuide(String(action.actionId), "title", event.target.value)} />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span>Descricao</span>
                      <textarea className="field" value={action.description} onChange={(event) => onUpdateActionGuide(String(action.actionId), "description", event.target.value)} />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span>Resposta automatica</span>
                      <textarea className="field" value={action.responseMessage || ""} onChange={(event) => onUpdateActionGuide(String(action.actionId), "responseMessage", event.target.value)} />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span>Destino</span>
                      <select className="field" value={action.route} onChange={(event) => onUpdateActionGuide(String(action.actionId), "route", event.target.value)}>
                        <option value="shared">Compartilhado</option>
                        <option value="recovery">Recovery</option>
                        <option value="atendimento">Atendimento</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.interactionBadgeRow}>
                    <span className={`${styles.stateBadge} ${styles.stateBot}`}>{BOT_SCOPE_LABELS[action.route]}</span>
                    {action.custom ? <span className={`${styles.stateBadge} ${styles.stateGenerated}`}>Custom</span> : null}
                    <button
                      type="button"
                      className={`${styles.stateBadge} ${action.enabled ? styles.statePaid : styles.stateWaiting}`}
                      onClick={() => onUpdateActionGuide(String(action.actionId), "enabled", !action.enabled)}
                    >
                      {action.enabled ? "Ativa" : "Legada"}
                    </button>
                    {action.custom ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveCustomActionGuide(String(action.actionId))}>
                        Remover
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        }
        loading={loadingBotConfig}
      />
    </div>
  );
}
