import { useState } from "react";
import type { AtendimentoBotConfig } from "../../../inbox/inbox-model";
import type {
  ConversationDestinationId,
  ConversationDestinationOption,
  ConversationScene,
} from "./ConversationBuilder";
import DestinationPicker from "./DestinationPicker";
import GreetingVariablePopover from "./GreetingVariablePopover";
import SceneIntelligencePanel from "./SceneIntelligencePanel";
import VariableChipPicker, { getVariableLabel } from "./VariableChipPicker";
import styles from "./ConversationBuilder.module.css";

type Props = {
  scene: ConversationScene;
  config: AtendimentoBotConfig;
  destinationOptions: ConversationDestinationOption[];
  recoveryEnabled: boolean;
  onTitleChange: (title: string) => void;
  onMessageChange: (message: string) => void;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onInsertVariable: (token: string) => void;
  onAddButton: () => void;
  onButtonTitleChange: (index: number, title: string) => void;
  onButtonDestinationChange: (index: number, destination: ConversationDestinationId) => void;
  onRemoveButton: (index: number) => void;
  onSceneRuleChange: (conditionType: string, enabled: boolean, metadata?: Record<string, unknown>) => void;
};

function destinationFromAction(actionId: string): ConversationDestinationId {
  const normalized = String(actionId || "").trim().toLowerCase();
  if (normalized === "start_quick_registration") return "quick_registration";
  if (normalized === "talk_human") return "human";
  if (normalized === "close_topic") return "closing";
  if (normalized === "show_main_menu") return "menu";
  if (normalized === "enter_recovery" || normalized.includes("recovery") || normalized.includes("payment") || normalized.includes("debt")) {
    return "recovery";
  }
  if (normalized === "schedule_service" || normalized.startsWith("agenda:") || normalized.startsWith("agenda_group_")) {
    return "agenda";
  }
  return "vendas";
}

function usedVariables(message: string) {
  return Array.from(
    new Set(
      Array.from(String(message || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
        .map((match) => match[1])
        .filter(Boolean),
    ),
  );
}

export default function SceneInspector({
  scene,
  config,
  destinationOptions,
  recoveryEnabled,
  onTitleChange,
  onMessageChange,
  onConfigChange,
  onInsertVariable,
  onAddButton,
  onButtonTitleChange,
  onButtonDestinationChange,
  onRemoveButton,
  onSceneRuleChange,
}: Props) {
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const locked = Boolean(scene.lockedReason);
  const variables = usedVariables(scene.message);

  return (
    <aside className={styles.inspectorPanel}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>SceneInspector</span>
          <strong>{scene.displayTitle}</strong>
        </div>
      </header>

      <div className={styles.inspectorBody}>
        {scene.lockedReason ? <div className={styles.lockedNotice}>{scene.lockedReason}</div> : null}

        <label className={styles.fieldBlock}>
          <span>Nome da cena</span>
          <input value={scene.displayTitle} disabled={locked} onChange={(event) => onTitleChange(event.target.value)} />
        </label>

        <label className={styles.fieldBlock}>
          <span>Mensagem</span>
          <textarea
            value={scene.message}
            disabled={locked}
            rows={8}
            onChange={(event) => onMessageChange(event.target.value)}
          />
        </label>

        <section className={styles.variableSection}>
          <div className={styles.inlineHeader}>
            <span>Variaveis</span>
          </div>
          <VariableChipPicker
            disabled={locked}
            onInsert={onInsertVariable}
            onConfigureGreeting={() => setGreetingOpen(true)}
          />
          {variables.length ? (
            <div className={styles.usedVariables}>
              {variables.map((token) => (
                <button
                  key={token}
                  type="button"
                  className={styles.usedVariable}
                  onClick={token === "cumprimentacao" ? () => setGreetingOpen(true) : undefined}
                >
                  {getVariableLabel(token)}
                </button>
              ))}
            </div>
          ) : null}
          <GreetingVariablePopover
            open={greetingOpen}
            config={config}
            onChange={onConfigChange}
            onClose={() => setGreetingOpen(false)}
          />
        </section>

        <section className={styles.buttonEditor}>
          <div className={styles.inlineHeader}>
            <span>Respostas</span>
            {scene.buttonsField ? (
              <button type="button" className={styles.smallButton} disabled={locked} onClick={onAddButton}>
                Adicionar
              </button>
            ) : null}
          </div>

          {scene.buttonsField ? (
            <div className={styles.buttonRows}>
              {scene.buttons.length ? (
                scene.buttons.map((button, index) => (
                  <article key={`${button.buttonId}-${index}`} className={styles.buttonRow}>
                    <input
                      value={button.title}
                      disabled={locked}
                      aria-label={`Resposta ${index + 1}`}
                      onChange={(event) => onButtonTitleChange(index, event.target.value)}
                    />
                    <DestinationPicker
                      value={destinationFromAction(button.actionId)}
                      options={destinationOptions}
                      disabled={locked}
                      onChange={(destination) => onButtonDestinationChange(index, destination)}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={locked}
                      onClick={() => onRemoveButton(index)}
                      aria-label={`Remover resposta ${index + 1}`}
                    >
                      x
                    </button>
                  </article>
                ))
              ) : (
                <div className={styles.emptyState}>Sem respostas neste bloco.</div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>Este bloco nao usa botoes.</div>
          )}
        </section>

        <section className={styles.intelligenceShell}>
          <button
            type="button"
            className={styles.intelligenceToggle}
            onClick={() => setIntelligenceOpen((value) => !value)}
            aria-expanded={intelligenceOpen}
          >
            Inteligencia
          </button>
          {intelligenceOpen ? (
            <SceneIntelligencePanel
              scene={scene}
              config={config}
              recoveryEnabled={recoveryEnabled}
              onConfigChange={onConfigChange}
              onSceneRuleChange={onSceneRuleChange}
            />
          ) : null}
        </section>
      </div>
    </aside>
  );
}
