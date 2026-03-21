"use client";

import { useMemo, useState, type ReactNode } from "react";
import styles from "./BotMessageStudio.module.css";

export type BotStudioVariable = {
  key: string;
  label: string;
  example: string;
  scopeLabel: string;
  required?: boolean;
};

export type BotStudioButton = {
  buttonId: string;
  actionId: string;
  title: string;
};

export type BotStudioAction = {
  actionId: string;
  title: string;
  description: string;
  routeLabel?: string;
  typeLabel?: string;
  enabled?: boolean;
};

export type BotStudioFlowScenario = {
  id: string;
  label: string;
  description: string;
  badge?: string;
  supportsButtons?: boolean;
  messageText: string;
  buttons: BotStudioButton[];
};

export type BotStudioTemplateStart = {
  title: string;
  description: string;
  body: string;
  footer?: string | null;
  buttons?: string[];
  badges?: string[];
  tone?: "ready" | "warning";
};

export type BotStudioPublicationCheck = {
  id: string;
  label: string;
  description: string;
  ok: boolean;
};

type ActionOption = {
  value: string;
  label: string;
};

type BotMessageStudioProps = {
  eyebrow: string;
  title: string;
  description: string;
  flowScenarios: BotStudioFlowScenario[];
  selectedScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  messageText: string;
  onMessageTextChange: (value: string) => void;
  messageType: "simple" | "buttons";
  onMessageTypeChange: (nextType: "simple" | "buttons") => void;
  buttons: BotStudioButton[];
  actionOptions: ActionOption[];
  actionById: Record<string, BotStudioAction>;
  catalogActions: BotStudioAction[];
  onUpdateButton: (index: number, field: "buttonId" | "actionId" | "title", value: string) => void;
  onAddButton: () => void;
  onRemoveButton: (index: number) => void;
  variables: BotStudioVariable[];
  catalogVariables: BotStudioVariable[];
  onAppendVariable: (variableKey: string) => void;
  previewText: string;
  previewFooter?: string | null;
  previewFallbackText: string;
  previewNote?: string | null;
  templateStart?: BotStudioTemplateStart | null;
  publicationChecks?: BotStudioPublicationCheck[];
  publicationTitle?: string;
  publicationDescription?: string;
  publicationStatusLabel?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  variablesTabExtra?: ReactNode;
  actionsTabExtra?: ReactNode;
  publicationTabExtra?: ReactNode;
  loading?: boolean;
};

type StudioTab = "flow" | "preview" | "variables" | "actions" | "publication";

function extractVariableKeys(message: string) {
  return Array.from(
    new Set(
      String(message || "").match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)?.map((token) => {
        return token.replace(/\{\{|\}\}/g, "").trim();
      }) || [],
    ),
  );
}

export default function BotMessageStudio(props: BotMessageStudioProps) {
  const {
    eyebrow,
    title,
    description,
    flowScenarios,
    selectedScenarioId,
    onSelectScenario,
    messageText,
    onMessageTextChange,
    messageType,
    onMessageTypeChange,
    buttons,
    actionOptions,
    actionById,
    catalogActions,
    onUpdateButton,
    onAddButton,
    onRemoveButton,
    variables,
    catalogVariables,
    onAppendVariable,
    previewText,
    previewFooter,
    previewFallbackText,
    previewNote,
    templateStart,
    publicationChecks = [],
    publicationTitle = "Publicacao",
    publicationDescription = "Valide se o builder esta legivel, previsivel e pronto para seguir como rascunho confiavel.",
    publicationStatusLabel,
    primaryActionLabel = "Salvar editor",
    onPrimaryAction,
    primaryActionDisabled = false,
    variablesTabExtra,
    actionsTabExtra,
    publicationTabExtra,
    loading = false,
  } = props;

  const [activeTab, setActiveTab] = useState<StudioTab>("flow");

  const selectedScenario =
    flowScenarios.find((scenario) => scenario.id === selectedScenarioId) || flowScenarios[0] || null;
  const supportsButtons = selectedScenario?.supportsButtons !== false;

  const variableUsage = useMemo(() => {
    const entries = catalogVariables.map((variable) => {
      const usedIn = flowScenarios
        .filter((scenario) => extractVariableKeys(scenario.messageText).includes(variable.key))
        .map((scenario) => scenario.label);
      return [variable.key, usedIn] as const;
    });
    return Object.fromEntries(entries);
  }, [catalogVariables, flowScenarios]);

  const actionUsage = useMemo(() => {
    const next = new Map<string, Array<{ scenarioLabel: string; buttonLabel: string }>>();
    for (const scenario of flowScenarios) {
      for (const button of scenario.buttons) {
        const current = next.get(button.actionId) || [];
        current.push({
          scenarioLabel: scenario.label,
          buttonLabel: button.title || button.buttonId,
        });
        next.set(button.actionId, current);
      }
    }
    return next;
  }, [flowScenarios]);

  const activeQuickInsertKeys = useMemo(() => new Set(variables.map((item) => item.key)), [variables]);
  const publicationReady = publicationChecks.length > 0 && publicationChecks.every((item) => item.ok);
  const computedPublicationStatus =
    publicationStatusLabel || (publicationReady ? "Fluxo pronto para salvar" : "Rascunho com pontos para revisar");
  const firstPreviewReply =
    buttons.find((button) => String(button.title || "").trim())?.title ||
    templateStart?.buttons?.[0] ||
    "Continuar";

  const tabItems: Array<{ id: StudioTab; label: string; helper: string }> = [
    { id: "flow", label: "Fluxo", helper: `${flowScenarios.length} blocos` },
    { id: "preview", label: "Preview", helper: "Conversa real" },
    { id: "variables", label: "Variaveis", helper: `${catalogVariables.length} itens` },
    { id: "actions", label: "Acoes", helper: `${catalogActions.length} rotas` },
    { id: "publication", label: "Publicacao", helper: publicationReady ? "Pronto" : "Rascunho" },
  ];

  function renderFlowTab() {
    return (
      <div className={styles.flowLayout}>
        <aside className={`${styles.panel} ${styles.libraryPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Biblioteca do fluxo</strong>
              <p>O canvas agora separa entrada, blocos conversacionais e saídas do bot.</p>
            </div>
          </div>

          <div className={styles.paletteGrid}>
            <span className={`${styles.libraryChip} ${styles.libraryChipAccent}`}>Template inicial</span>
            <span className={styles.libraryChip}>Mensagem</span>
            <span className={styles.libraryChip}>Botoes</span>
            <span className={styles.libraryChip}>Acao</span>
            <span className={styles.libraryChip}>Encerrar</span>
            <span className={styles.libraryChip}>Humano</span>
          </div>

          <div className={styles.scenarioList}>
            {flowScenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`${styles.scenarioItem} ${
                  scenario.id === selectedScenarioId ? styles.scenarioItemActive : ""
                }`}
                onClick={() => onSelectScenario(scenario.id)}
              >
                <div className={styles.scenarioTitleRow}>
                  <strong>{scenario.label}</strong>
                  {scenario.badge ? <span className={styles.badge}>{scenario.badge}</span> : null}
                </div>
                <p>{scenario.description}</p>
                <div className={styles.scenarioMeta}>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {scenario.buttons.length > 0 ? `${scenario.buttons.length} botoes` : "Sem botoes"}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {extractVariableKeys(scenario.messageText).length} variaveis
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className={`${styles.panel} ${styles.canvasPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Organograma do bloco selecionado</strong>
              <p>O fluxo central mostra entrada, resposta do cliente e o que cada clique dispara.</p>
            </div>
            <div className={styles.canvasStatus}>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>Canvas visual</span>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{selectedScenario?.label || "Bloco"}</span>
            </div>
          </div>

          <div className={styles.canvasSurface}>
            {templateStart ? (
              <>
                <article className={`${styles.flowNode} ${styles.flowNodeTemplate}`}>
                  <span className={styles.flowNodeEyebrow}>Inicio</span>
                  <strong>{templateStart.title}</strong>
                  <p>{templateStart.description}</p>
                  <div className={styles.nodeBadgeRow}>
                    {(templateStart.badges || []).map((badge) => (
                      <span key={`template-badge-${badge}`} className={`${styles.badge} ${styles.badgeMuted}`}>
                        {badge}
                      </span>
                    ))}
                    <span
                      className={`${styles.badge} ${
                        templateStart.tone === "warning" ? styles.badgeWarning : styles.badgeAccent
                      }`}
                    >
                      {templateStart.tone === "warning" ? "Revisar" : "Pronto"}
                    </span>
                  </div>
                </article>
                <div className={styles.connectorLine} />
              </>
            ) : null}

            <article className={`${styles.flowNode} ${styles.flowNodePrimary}`}>
              <span className={styles.flowNodeEyebrow}>Bloco selecionado</span>
              <strong>{selectedScenario?.label || title}</strong>
              <p>{selectedScenario?.description || description}</p>
              <div className={styles.nodeBadgeRow}>
                <span className={`${styles.badge} ${styles.badgeAccent}`}>
                  {messageType === "buttons" && supportsButtons ? "Mensagem com botoes" : "Mensagem simples"}
                </span>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>
                  {extractVariableKeys(messageText).length} variaveis no texto
                </span>
              </div>
            </article>

            <div className={styles.connectorLine} />

            {supportsButtons && messageType === "buttons" && buttons.length > 0 ? (
              <div className={styles.branchGrid}>
                {buttons.map((button) => {
                  const action = actionById[button.actionId];
                  return (
                    <div key={`flow-branch-${button.buttonId}`} className={styles.branchLane}>
                      <article className={`${styles.flowNode} ${styles.flowNodeSecondary}`}>
                        <span className={styles.flowNodeEyebrow}>Botao</span>
                        <strong>{button.title || "Botao sem titulo"}</strong>
                        <p>{button.buttonId || "Sem id interno"}</p>
                      </article>
                      <div className={styles.branchConnector} />
                      <article className={`${styles.flowNode} ${styles.flowNodeAction}`}>
                        <span className={styles.flowNodeEyebrow}>Destino</span>
                        <strong>{action?.title || button.actionId}</strong>
                        <p>{action?.description || "Selecione uma acao valida para esse clique."}</p>
                        <div className={styles.nodeBadgeRow}>
                          {action?.typeLabel ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{action.typeLabel}</span> : null}
                          {action?.routeLabel ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{action.routeLabel}</span> : null}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            ) : (
              <article className={`${styles.flowNode} ${styles.flowNodeTerminal}`}>
                <span className={styles.flowNodeEyebrow}>Saida</span>
                <strong>Mensagem sem bifurcacao visual</strong>
                <p>Esse bloco segue como resposta textual simples, sem botao clicavel.</p>
              </article>
            )}

            <div className={styles.flowIndex}>
              <div className={styles.panelHeader}>
                <div>
                  <strong>Mapa rapido do modulo</strong>
                  <p>Os outros blocos continuam acessiveis sem ocupar o centro do canvas.</p>
                </div>
              </div>
              <div className={styles.flowIndexGrid}>
                {flowScenarios.map((scenario) => (
                  <button
                    key={`flow-index-${scenario.id}`}
                    type="button"
                    className={`${styles.flowIndexItem} ${
                      scenario.id === selectedScenarioId ? styles.flowIndexItemActive : ""
                    }`}
                    onClick={() => onSelectScenario(scenario.id)}
                  >
                    <strong>{scenario.label}</strong>
                    <span>{scenario.buttons.length > 0 ? `${scenario.buttons.length} botoes` : "Mensagem simples"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className={`${styles.panel} ${styles.inspectorPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Configuracao do bloco</strong>
              <p>Edicao contextual em vez de um formulario gigante para o fluxo inteiro.</p>
            </div>
          </div>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Tipo de mensagem</strong>
                <p>Escolha se esta etapa usa apenas texto ou ramificacoes por botoes.</p>
              </div>
            </div>
            <div className={styles.toggleGrid}>
              <button
                type="button"
                className={`${styles.toggleCard} ${messageType === "simple" ? styles.toggleCardActive : ""}`}
                onClick={() => onMessageTypeChange("simple")}
              >
                <strong>Simples</strong>
                <p>Resposta direta sem clique visual.</p>
              </button>
              <button
                type="button"
                disabled={!supportsButtons}
                className={`${styles.toggleCard} ${messageType === "buttons" ? styles.toggleCardActive : ""}`}
                onClick={() => onMessageTypeChange("buttons")}
              >
                <strong>Com botoes</strong>
                <p>Mostra escolhas e aciona rotas estaveis.</p>
              </button>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Mensagem</strong>
                <p>Texto principal do bloco atual.</p>
              </div>
            </div>
            <textarea
              className="field"
              rows={7}
              value={messageText}
              onChange={(event) => onMessageTextChange(event.target.value)}
            />
            <div className={styles.chipList}>
              {variables.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  className={styles.chip}
                  onClick={() => onAppendVariable(variable.key)}
                >
                  <strong>{`{{${variable.key}}}`}</strong>
                  <small>{variable.scopeLabel}</small>
                </button>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Botoes e destinos</strong>
                <p>Nome visivel, id estavel e acao por clique.</p>
              </div>
              {supportsButtons && messageType === "buttons" ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onAddButton}>
                  Adicionar botao
                </button>
              ) : null}
            </div>

            {!supportsButtons || messageType === "simple" ? (
              <div className={styles.emptyState}>Esse bloco esta em modo simples.</div>
            ) : buttons.length ? (
              <div className={styles.buttonList}>
                {buttons.map((button, index) => {
                  const action = actionById[button.actionId];
                  return (
                    <div key={`${button.buttonId}-${index}`} className={styles.buttonRow}>
                      <div className={styles.buttonGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Rotulo</span>
                          <input
                            className="field"
                            value={button.title}
                            onChange={(event) => onUpdateButton(index, "title", event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>ID do botao</span>
                          <input
                            className="field"
                            value={button.buttonId}
                            onChange={(event) => onUpdateButton(index, "buttonId", event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Destino</span>
                          <select
                            className="field"
                            value={button.actionId}
                            onChange={(event) => onUpdateButton(index, "actionId", event.target.value)}
                          >
                            {actionOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.buttonMeta}>
                        <strong>{action?.title || "Acao sem cadastro"}</strong>
                        <p>{action?.description || "Escolha uma acao valida para este botao."}</p>
                      </div>
                      <div className={styles.buttonActions}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onRemoveButton(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>Nenhum botao configurado neste bloco ainda.</div>
            )}
          </article>
        </aside>
      </div>
    );
  }

  function renderPreviewTab() {
    return (
      <div className={styles.previewLayout}>
        <section className={`${styles.panel} ${styles.previewStage}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Preview da conversa</strong>
              <p>Visual do cliente, sem misturar configuracao tecnica na mesma tela.</p>
            </div>
            <span className={`${styles.badge} ${styles.badgeAccent}`}>
              {messageType === "buttons" && supportsButtons ? "Interativo" : "Texto puro"}
            </span>
          </div>

          <div className={styles.phoneShell}>
            <div className={styles.phoneHeader}>
              <strong>{previewFooter || eyebrow}</strong>
              <span>online agora</span>
            </div>

            <div className={styles.phoneBody}>
              {templateStart ? (
                <div className={`${styles.messageBubble} ${styles.outboundBubble}`}>
                  <p>{templateStart.body}</p>
                  {(templateStart.buttons || []).length > 0 ? (
                    <div className={styles.previewButtonList}>
                      {(templateStart.buttons || []).map((button) => (
                        <span key={`template-preview-${button}`} className={styles.previewButton}>
                          {button}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={`${styles.messageBubble} ${styles.inboundBubble}`}>
                <p>{firstPreviewReply}</p>
              </div>

              <div className={`${styles.messageBubble} ${styles.outboundBubble}`}>
                <p>{previewText || "Mensagem vazia."}</p>
                {messageType === "buttons" && supportsButtons && buttons.length > 0 ? (
                  <div className={styles.previewButtonList}>
                    {buttons.map((button) => (
                      <span key={`preview-${button.buttonId}`} className={styles.previewButton}>
                        {button.title}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className={styles.previewSidebar}>
          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Fallback textual</strong>
                <p>Versao pronta para cenarios sem botoes.</p>
              </div>
              <span className={`${styles.badge} ${styles.badgeWarning}`}>Fallback</span>
            </div>
            <pre className={styles.previewFallback}>{previewFallbackText || previewText || "Mensagem vazia."}</pre>
            {previewNote ? <p className={styles.previewNote}>{previewNote}</p> : null}
          </article>

          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Variaveis ativas neste bloco</strong>
                <p>So o que o cliente realmente precisa ver.</p>
              </div>
            </div>
            <div className={styles.chipList}>
              {extractVariableKeys(messageText).length > 0 ? (
                extractVariableKeys(messageText).map((key) => (
                  <span key={`preview-var-${key}`} className={styles.chipStatic}>
                    {`{{${key}}}`}
                  </span>
                ))
              ) : (
                <div className={styles.emptyState}>Sem variaveis detectadas neste bloco.</div>
              )}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Leitura do fluxo</strong>
                <p>O que acontece quando o cliente toca em cada botao.</p>
              </div>
            </div>
            {buttons.length > 0 ? (
              <div className={styles.actionList}>
                {buttons.map((button) => {
                  const action = actionById[button.actionId];
                  return (
                    <div key={`preview-action-${button.buttonId}`} className={styles.actionItem}>
                      <div className={styles.actionItemHeader}>
                        <div>
                          <strong>{button.title || "Botao sem titulo"}</strong>
                          <p>{action?.description || "Selecione uma acao para esse clique."}</p>
                        </div>
                      </div>
                      <div className={styles.scenarioMeta}>
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>{button.buttonId}</span>
                        <span className={`${styles.badge} ${styles.badgeAccent}`}>{action?.title || button.actionId}</span>
                        {action?.routeLabel ? <span className={styles.badge}>{action.routeLabel}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>Este bloco nao possui ramificacoes visuais.</div>
            )}
          </article>
        </aside>
      </div>
    );
  }

  function renderVariablesTab() {
    return (
      <div className={styles.catalogLayout}>
        <section className={styles.catalogSummary}>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogVariables.length}</strong>
            <span>variaveis no catalogo</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogVariables.filter((item) => item.required).length}</strong>
            <span>obrigatorias</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{variables.length}</strong>
            <span>disponiveis neste bloco</span>
          </article>
        </section>

        <section className={styles.catalogGrid}>
          {catalogVariables.map((variable) => {
            const usedIn = (variableUsage[variable.key] as string[] | undefined) || [];
            return (
              <article key={variable.key} className={`${styles.panel} ${styles.catalogCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{variable.label}</strong>
                    <p>{`{{${variable.key}}}`}</p>
                  </div>
                  <div className={styles.scenarioMeta}>
                    <span className={`${styles.badge} ${styles.badgeMuted}`}>{variable.scopeLabel}</span>
                    {variable.required ? <span className={`${styles.badge} ${styles.badgeAccent}`}>Obrigatoria</span> : null}
                    {activeQuickInsertKeys.has(variable.key) ? <span className={styles.badge}>Disponivel agora</span> : null}
                  </div>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>Exemplo</span>
                  <p>{variable.example || "Sem exemplo cadastrado."}</p>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>Usada em</span>
                  <div className={styles.scenarioMeta}>
                    {usedIn.length > 0 ? (
                      usedIn.map((usage) => (
                        <span key={`${variable.key}-${usage}`} className={`${styles.badge} ${styles.badgeMuted}`}>
                          {usage}
                        </span>
                      ))
                    ) : (
                      <span className={styles.badge}>Ainda nao usada</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {variablesTabExtra ? <div className={styles.extraPanel}>{variablesTabExtra}</div> : null}
      </div>
    );
  }

  function renderActionsTab() {
    return (
      <div className={styles.catalogLayout}>
        <section className={styles.catalogSummary}>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogActions.length}</strong>
            <span>acoes registradas</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogActions.filter((item) => item.enabled !== false).length}</strong>
            <span>acoes ativas</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{buttons.length}</strong>
            <span>cliques no bloco atual</span>
          </article>
        </section>

        <section className={styles.catalogGrid}>
          {catalogActions.map((action) => {
            const usedIn = actionUsage.get(action.actionId) || [];
            return (
              <article key={action.actionId} className={`${styles.panel} ${styles.catalogCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                  </div>
                  <div className={styles.scenarioMeta}>
                    {action.typeLabel ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{action.typeLabel}</span> : null}
                    {action.routeLabel ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{action.routeLabel}</span> : null}
                    <span className={`${styles.badge} ${action.enabled === false ? styles.badgeWarning : styles.badgeAccent}`}>
                      {action.enabled === false ? "Legada" : "Ativa"}
                    </span>
                  </div>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>ID tecnico</span>
                  <p>{action.actionId}</p>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>Usada por</span>
                  <div className={styles.scenarioMeta}>
                    {usedIn.length > 0 ? (
                      usedIn.map((usage) => (
                        <span
                          key={`${action.actionId}-${usage.scenarioLabel}-${usage.buttonLabel}`}
                          className={`${styles.badge} ${styles.badgeMuted}`}
                        >
                          {`${usage.scenarioLabel}: ${usage.buttonLabel}`}
                        </span>
                      ))
                    ) : (
                      <span className={styles.badge}>Sem botoes vinculados</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {actionsTabExtra ? <div className={styles.extraPanel}>{actionsTabExtra}</div> : null}
      </div>
    );
  }

  function renderPublicationTab() {
    return (
      <div className={styles.publicationLayout}>
        <section className={`${styles.panel} ${styles.publicationHero}`}>
          <div className={styles.cardHeader}>
            <div>
              <strong>{publicationTitle}</strong>
              <p>{publicationDescription}</p>
            </div>
            <span className={`${styles.statusBadge} ${publicationReady ? styles.statusReady : styles.statusDraft}`}>
              {computedPublicationStatus}
            </span>
          </div>

          <div className={styles.publicationActions}>
            <div className={styles.scenarioMeta}>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{flowScenarios.length} blocos mapeados</span>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogActions.length} acoes catalogadas</span>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogVariables.length} variaveis prontas</span>
            </div>
            {onPrimaryAction ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onPrimaryAction}
                disabled={primaryActionDisabled}
              >
                {primaryActionLabel}
              </button>
            ) : null}
          </div>
        </section>

        {publicationChecks.length > 0 ? (
          <section className={styles.checkGrid}>
            {publicationChecks.map((check) => (
              <article key={check.id} className={`${styles.panel} ${styles.checkCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.description}</p>
                  </div>
                  <span className={`${styles.statusDot} ${check.ok ? styles.statusDotReady : styles.statusDotDraft}`} />
                </div>
                <span className={`${styles.badge} ${check.ok ? styles.badgeAccent : styles.badgeWarning}`}>
                  {check.ok ? "Validado" : "Revisar"}
                </span>
              </article>
            ))}
          </section>
        ) : null}

        {publicationTabExtra ? <div className={styles.extraPanel}>{publicationTabExtra}</div> : null}
      </div>
    );
  }

  return (
    <section className={styles.studio}>
      <header className={`${styles.panel} ${styles.hero}`}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={`${styles.badge} ${styles.badgeAccent}`}>{flowScenarios.length} blocos visuais</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogVariables.length} variaveis</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogActions.length} acoes</span>
        </div>
      </header>

      <div className={styles.tabRow} role="tablist" aria-label={`${eyebrow} builder`}>
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`${styles.tabButton} ${tab.id === activeTab ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.helper}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.emptyState}>Carregando editor...</div>
      ) : activeTab === "flow" ? (
        renderFlowTab()
      ) : activeTab === "preview" ? (
        renderPreviewTab()
      ) : activeTab === "variables" ? (
        renderVariablesTab()
      ) : activeTab === "actions" ? (
        renderActionsTab()
      ) : (
        renderPublicationTab()
      )}
    </section>
  );
}
