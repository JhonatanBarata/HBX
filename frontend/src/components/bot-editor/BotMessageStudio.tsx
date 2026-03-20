"use client";

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

export type BotStudioScenario = {
  id: string;
  label: string;
  description: string;
  badge?: string;
  supportsButtons?: boolean;
};

type ActionOption = {
  value: string;
  label: string;
};

type BotMessageStudioProps = {
  eyebrow: string;
  title: string;
  description: string;
  scenarios: BotStudioScenario[];
  selectedScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  messageText: string;
  onMessageTextChange: (value: string) => void;
  messageType: "simple" | "buttons";
  onMessageTypeChange: (nextType: "simple" | "buttons") => void;
  buttons: BotStudioButton[];
  actionOptions: ActionOption[];
  actionById: Record<string, BotStudioAction>;
  onUpdateButton: (index: number, field: "buttonId" | "actionId" | "title", value: string) => void;
  onAddButton: () => void;
  onRemoveButton: (index: number) => void;
  variables: BotStudioVariable[];
  onAppendVariable: (variableKey: string) => void;
  previewText: string;
  previewFooter?: string | null;
  previewFallbackText: string;
  previewNote?: string | null;
  loading?: boolean;
};

export default function BotMessageStudio({
  eyebrow,
  title,
  description,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  messageText,
  onMessageTextChange,
  messageType,
  onMessageTypeChange,
  buttons,
  actionOptions,
  actionById,
  onUpdateButton,
  onAddButton,
  onRemoveButton,
  variables,
  onAppendVariable,
  previewText,
  previewFooter,
  previewFallbackText,
  previewNote,
  loading = false,
}: BotMessageStudioProps) {
  const selectedScenario =
    scenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios[0] || null;
  const supportsButtons = selectedScenario?.supportsButtons !== false;

  return (
    <section className={styles.studio}>
      <div className={styles.shell}>
        <aside className={`${styles.panel} ${styles.sidebar}`}>
          <div className={styles.sidebarHeader}>
            <div>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <h3 className={styles.title}>{title}</h3>
              <p className={styles.description}>{description}</p>
            </div>
          </div>

          <div className={styles.scenarioList}>
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`${styles.scenarioItem} ${
                  scenario.id === selectedScenarioId ? styles.scenarioItemActive : ""
                }`}
                onClick={() => onSelectScenario(scenario.id)}
              >
                <strong>{scenario.label}</strong>
                <p>{scenario.description}</p>
                <div className={styles.scenarioMeta}>
                  {scenario.badge ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{scenario.badge}</span> : null}
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {scenario.supportsButtons === false ? "Mensagem simples" : "Aceita botoes"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className={`${styles.panel} ${styles.editor}`}>
          {loading ? (
            <div className={styles.emptyState}>Carregando editor...</div>
          ) : (
            <div className={styles.editorGrid}>
              <div className={styles.cards}>
                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>1. Tipo de mensagem</strong>
                      <p>{supportsButtons ? "Escolha se esta etapa sera uma mensagem simples ou com botoes." : "Esta etapa opera como mensagem simples."}</p>
                    </div>
                  </div>
                  <div className={styles.toggleGrid}>
                    <button
                      type="button"
                      className={`${styles.toggleCard} ${messageType === "simple" ? styles.toggleCardActive : ""}`}
                      onClick={() => onMessageTypeChange("simple")}
                    >
                      <strong>Mensagem simples</strong>
                      <p>Envia apenas o texto, sem acoes visuais.</p>
                    </button>
                    <button
                      type="button"
                      disabled={!supportsButtons}
                      className={`${styles.toggleCard} ${messageType === "buttons" ? styles.toggleCardActive : ""}`}
                      onClick={() => onMessageTypeChange("buttons")}
                    >
                      <strong>Mensagem com botoes</strong>
                      <p>Mostra escolhas prontas e aciona o fluxo pelo id interno.</p>
                    </button>
                  </div>
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>Mensagem</strong>
                      <p>Edite o texto principal da etapa selecionada.</p>
                    </div>
                  </div>
                  <textarea className="field" rows={6} value={messageText} onChange={(event) => onMessageTextChange(event.target.value)} />
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>2. Botoes disponiveis</strong>
                      <p>Nome visivel, id interno estavel e acao de cada botao.</p>
                    </div>
                    {supportsButtons && messageType === "buttons" ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={onAddButton}>
                        Adicionar botao
                      </button>
                    ) : null}
                  </div>

                  {!supportsButtons || messageType === "simple" ? (
                    <div className={styles.emptyState}>Esta etapa esta configurada como mensagem simples.</div>
                  ) : buttons.length ? (
                    <div className={styles.buttonList}>
                      {buttons.map((button, index) => {
                        const action = actionById[button.actionId];
                        return (
                          <div key={`${button.buttonId}-${index}`} className={styles.buttonRow}>
                            <div className={styles.buttonGrid}>
                              <label className={styles.fieldBlock}>
                                <span>Nome visivel</span>
                                <input className="field" value={button.title} onChange={(event) => onUpdateButton(index, "title", event.target.value)} />
                              </label>
                              <label className={styles.fieldBlock}>
                                <span>ID interno</span>
                                <input className="field" value={button.buttonId} onChange={(event) => onUpdateButton(index, "buttonId", event.target.value)} />
                              </label>
                              <label className={styles.fieldBlock}>
                                <span>Acao</span>
                                <select className="field" value={button.actionId} onChange={(event) => onUpdateButton(index, "actionId", event.target.value)}>
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
                              <p>{action?.description || "Escolha uma acao valida para esse botao."}</p>
                              <div className={styles.buttonMetaBadges}>
                                <span className={`${styles.badge} ${styles.badgeMuted}`}>{button.actionId}</span>
                                {action?.typeLabel ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{action.typeLabel}</span> : null}
                                {action?.routeLabel ? <span className={styles.badge}>{action.routeLabel}</span> : null}
                              </div>
                            </div>
                            <div className={styles.buttonActions}>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveButton(index)}>
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>Nenhum botao cadastrado nesta etapa ainda.</div>
                  )}
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>3. Variaveis disponiveis</strong>
                      <p>Clique para inserir rapidamente no texto.</p>
                    </div>
                  </div>
                  <div className={styles.chipList}>
                    {variables.map((variable) => (
                      <button key={variable.key} type="button" className={styles.chip} onClick={() => onAppendVariable(variable.key)}>
                        <strong>{`{{${variable.key}}}`}</strong>
                        <small>{variable.scopeLabel}</small>
                      </button>
                    ))}
                  </div>
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>4. Acoes dos botoes</strong>
                      <p>Resumo operacional do que cada clique realmente dispara.</p>
                    </div>
                  </div>
                  {!supportsButtons || messageType === "simple" || buttons.length === 0 ? (
                    <div className={styles.emptyState}>Sem acoes visuais nesta etapa.</div>
                  ) : (
                    <div className={styles.actionList}>
                      {buttons.map((button, index) => {
                        const action = actionById[button.actionId];
                        return (
                          <div key={`${button.buttonId}-action-${index}`} className={styles.actionItem}>
                            <div className={styles.actionItemHeader}>
                              <div>
                                <strong>{button.title || "Botao sem titulo"}</strong>
                                <p>{action?.description || "Selecione uma acao para este botao."}</p>
                              </div>
                              <div className={styles.actionMeta}>
                                <span className={`${styles.badge} ${styles.badgeMuted}`}>{button.buttonId}</span>
                                <span className={styles.badge}>{action?.title || button.actionId}</span>
                              </div>
                            </div>
                            <div className={styles.actionMeta}>
                              {action?.typeLabel ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{action.typeLabel}</span> : null}
                              {action?.routeLabel ? <span className={styles.badge}>{action.routeLabel}</span> : null}
                              <span className={`${styles.badge} ${action?.enabled === false ? styles.badgeDanger : styles.badgeAccent}`}>
                                {action?.enabled === false ? "Desativada" : "Ativa"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              </div>

              <aside className={styles.previewPane}>
                <article className={styles.previewCard}>
                  <div className={styles.previewHeader}>
                    <div>
                      <strong>Preview</strong>
                      <p className={styles.previewNote}>Como o cliente enxerga essa mensagem.</p>
                    </div>
                    <span className={styles.previewType}>
                      {messageType === "buttons" && supportsButtons ? "Interativa" : "Simples"}
                    </span>
                  </div>

                  <div className={styles.previewPhone}>
                    <strong>{selectedScenario?.label || "Mensagem"}</strong>
                    <span>WhatsApp do cliente</span>
                  </div>

                  <div className={styles.previewBubble}>
                    <p className={styles.previewBody}>{previewText || "Mensagem vazia."}</p>
                    {messageType === "buttons" && supportsButtons && buttons.length ? (
                      <div className={styles.previewButtonList}>
                        {buttons.map((button) => (
                          <span key={`preview-${button.buttonId}`} className={styles.previewButton}>
                            {button.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.previewFooter}>
                    <div className={styles.previewMeta}>
                      {previewFooter ? <span className={styles.badge}>{previewFooter}</span> : null}
                      <span className={`${styles.badge} ${styles.badgeMuted}`}>
                        {buttons.length} botao{buttons.length === 1 ? "" : "es"}
                      </span>
                    </div>
                    <span className={styles.previewFallbackBadge}>Fallback sem botoes</span>
                  </div>

                  <pre className={styles.previewFallback}>{previewFallbackText || previewText || "Mensagem vazia."}</pre>

                  {previewNote ? <p className={styles.previewNote}>{previewNote}</p> : null}
                </article>
              </aside>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
