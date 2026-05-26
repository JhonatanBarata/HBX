import type {
  BotQrActionOption,
  BotQrEditorBlock,
  BotQrPreviewMessage,
  BotQrPreviewScenarioId,
  BotQrScenarioOption,
} from "../model";
import styles from "../page.module.css";

type BotQrSimpleEditorProps = {
  blocks: BotQrEditorBlock[];
  selectedBlockId: string;
  onSelectBlock: (blockId: string) => void;
  actionOptions: BotQrActionOption[];
  previewScenarioId: BotQrPreviewScenarioId;
  previewScenarios: BotQrScenarioOption[];
  previewMessages: BotQrPreviewMessage[];
  onPreviewScenarioChange: (scenarioId: BotQrPreviewScenarioId) => void;
  onMessageChange: (blockId: string, value: string) => void;
  onButtonTitleChange: (blockId: string, index: number, value: string) => void;
  onButtonActionChange: (blockId: string, index: number, actionId: string) => void;
  onAddButton: (blockId: string) => void;
  onRemoveButton: (blockId: string, index: number) => void;
  onToggleFinance: (enabled: boolean) => void;
  onToggleBotOff: (enabled: boolean) => void;
};

export default function BotQrSimpleEditor({
  blocks,
  selectedBlockId,
  onSelectBlock,
  actionOptions,
  previewScenarioId,
  previewScenarios,
  previewMessages,
  onPreviewScenarioChange,
  onMessageChange,
  onButtonTitleChange,
  onButtonActionChange,
  onAddButton,
  onRemoveButton,
  onToggleFinance,
  onToggleBotOff,
}: BotQrSimpleEditorProps) {
  const currentBlock = blocks.find((block) => block.id === selectedBlockId) || blocks[0] || null;

  return (
    <div className={styles.editorShell}>
      <aside className={styles.editorRail}>
        <div className={styles.editorRailHeader}>
          <span className={styles.sectionEyebrow}>Fluxo</span>
          <strong>Blocos operacionais</strong>
        </div>
        <div className={styles.editorRailList}>
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={styles.editorRailItem}
              data-active={currentBlock?.id === block.id ? "true" : "false"}
              data-tone={block.tone}
              onClick={() => onSelectBlock(block.id)}
            >
              <div>
                <strong>{block.title}</strong>
                <span>{block.subtitle}</span>
              </div>
              <small>{block.statusNote}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.editorStage}>
        {currentBlock ? (
          <>
            <article className={styles.editorPanel} data-tone={currentBlock.tone}>
              <div className={styles.editorPanelHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Bloco selecionado</span>
                  <h3 className={styles.cardTitle}>{currentBlock.title}</h3>
                </div>
                <span className={styles.statusPill} data-active={currentBlock.enabled ? "true" : "false"}>
                  {currentBlock.enabled ? "Ativo" : "Representado / desligado"}
                </span>
              </div>

              <p className={styles.editorDescription}>{currentBlock.description}</p>
              <div className={styles.helperCard}>{currentBlock.helper}</div>

              {currentBlock.toggle ? (
                <label className={styles.toggleCard}>
                  <div>
                    <strong>{currentBlock.toggle.label}</strong>
                    <span>{currentBlock.toggle.description}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={currentBlock.toggle.active}
                    onChange={(event) => {
                      if (currentBlock.toggle?.key === "finance") {
                        onToggleFinance(event.target.checked);
                        return;
                      }
                      onToggleBotOff(event.target.checked);
                    }}
                  />
                </label>
              ) : null}

              <div className={styles.editorGrid}>
                <div className={styles.editorFormColumn}>
                  <section className={styles.editorSectionCard}>
                    <div className={styles.editorSectionHeader}>
                      <strong>Mensagem</strong>
                      <span>{currentBlock.editableMessage ? "Editavel" : "Reaproveitada do motor atual"}</span>
                    </div>

                    {currentBlock.editableMessage ? (
                      <textarea
                        className={styles.editorTextarea}
                        value={currentBlock.messageText}
                        onChange={(event) => onMessageChange(currentBlock.id, event.target.value)}
                        rows={6}
                        placeholder="Escreva a mensagem do bloco em linguagem operacional."
                      />
                    ) : (
                      <div className={styles.lockedBlock}>
                        <strong>{currentBlock.previewText}</strong>
                        <p>{currentBlock.lockedNote || "Este passo ja existe no backend atual e aparece aqui como referencia operacional."}</p>
                      </div>
                    )}
                  </section>

                  <section className={styles.editorSectionCard}>
                    <div className={styles.editorSectionHeader}>
                      <strong>Botoes e destinos</strong>
                      <span>{currentBlock.editableButtons ? "Sem actionId exposto" : "Sem botoes neste bloco"}</span>
                    </div>

                    {currentBlock.editableButtons ? (
                      <div className={styles.buttonEditorList}>
                        {currentBlock.buttons.map((button, index) => {
                          const selectedOption = actionOptions.find((option) => option.value === button.actionId) || null;
                          return (
                            <div key={`${currentBlock.id}-${button.buttonId}`} className={styles.buttonEditorRow}>
                              <input
                                className={styles.inputField}
                                value={button.title}
                                onChange={(event) => onButtonTitleChange(currentBlock.id, index, event.target.value)}
                                placeholder="Texto do botao"
                              />
                              <select
                                className={styles.selectField}
                                value={button.actionId}
                                onChange={(event) => onButtonActionChange(currentBlock.id, index, event.target.value)}
                              >
                                {actionOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                    {option.enabled ? "" : " (desativado)"}
                                  </option>
                                ))}
                              </select>
                              <div className={styles.buttonTargetText}>
                                {selectedOption ? `Destino: ${selectedOption.targetLabel}` : "Destino operacional"}
                              </div>
                              <button
                                type="button"
                                className={styles.inlineGhostButton}
                                onClick={() => onRemoveButton(currentBlock.id, index)}
                              >
                                Remover
                              </button>
                            </div>
                          );
                        })}

                        <button type="button" className={styles.secondaryButton} onClick={() => onAddButton(currentBlock.id)}>
                          Adicionar botao
                        </button>
                      </div>
                    ) : (
                      <div className={styles.lockedBlock}>
                        <strong>Sem botoes neste passo.</strong>
                        <p>Este bloco funciona como mensagem unica ou passo sistemico dentro do fluxo atual.</p>
                      </div>
                    )}
                  </section>
                </div>

                <div className={styles.previewColumn}>
                  <section className={styles.editorSectionCard}>
                    <div className={styles.editorSectionHeader}>
                      <strong>Preview instantaneo do bloco</strong>
                      <span>Sem JSON bruto</span>
                    </div>
                    <div className={styles.previewBubbleCard}>
                      <div className={styles.previewBubble} data-role="bot">
                        {currentBlock.previewText}
                      </div>
                      {currentBlock.buttons.length ? (
                        <div className={styles.previewButtonStack}>
                          {currentBlock.buttons.map((button) => (
                            <span key={`${currentBlock.id}-${button.buttonId}-preview`} className={styles.previewButtonChip}>
                              {button.title}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className={styles.previewFallbackCard}>
                        <span>Fallback textual</span>
                        <p>{currentBlock.fallbackText}</p>
                      </div>
                    </div>
                  </section>

                  <section className={styles.editorSectionCard}>
                    <div className={styles.editorSectionHeader}>
                      <strong>Preview de conversa</strong>
                      <span>WhatsApp-like</span>
                    </div>

                    <div className={styles.previewScenarioRow}>
                      {previewScenarios.map((scenario) => (
                        <button
                          key={scenario.id}
                          type="button"
                          className={styles.previewScenarioChip}
                          data-active={previewScenarioId === scenario.id ? "true" : "false"}
                          onClick={() => onPreviewScenarioChange(scenario.id)}
                        >
                          {scenario.label}
                        </button>
                      ))}
                    </div>

                    <div className={styles.phoneMock}> 
                      <div className={styles.phoneMockHeader}>HBX WhatsApp Preview</div>
                      <div className={styles.phoneMockBody}>
                        {previewMessages.map((message) => (
                          <div
                            key={message.id}
                            className={styles.previewMessageRow}
                            data-role={message.role}
                            data-subtle={message.subtle ? "true" : "false"}
                          >
                            <span className={styles.previewMessageLabel}>{message.label}</span>
                            <div className={styles.previewMessageBubble}>{message.text}</div>
                            {message.buttons?.length ? (
                              <div className={styles.previewButtonStack}>
                                {message.buttons.map((buttonTitle, index) => (
                                  <span key={`${message.id}-${index}-${buttonTitle}`} className={styles.previewButtonChip}>
                                    {buttonTitle}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </article>
          </>
        ) : null}
      </div>
    </div>
  );
}