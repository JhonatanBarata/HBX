import { useEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from "react";
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
  channelLabel: string;
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

const ENTRY_OUTPUTS = [
  ["Cliente novo", "Cliente novo"],
  ["Cliente localizado", "Cliente localizado"],
  ["Fora de horario", "Fora de horario"],
  ["Bloqueado", "Bloqueado"],
];

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTokenizedMessage(message: string) {
  const parts: string[] = [];
  let lastIndex = 0;
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message))) {
    parts.push(escapeHtml(message.slice(lastIndex, match.index)));
    const token = match[1];
    parts.push(
      `<span class="${styles.messageToken}" data-token="${escapeHtml(token)}" contenteditable="false">` +
        `${escapeHtml(getVariableLabel(token))}</span>`,
    );
    lastIndex = match.index + match[0].length;
  }

  parts.push(escapeHtml(message.slice(lastIndex)));
  return parts.join("").replace(/\n/g, "<br>");
}

function serializeEditorNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";
  const token = node.dataset.token;
  if (token) return `{{${token}}}`;
  if (node.tagName === "BR") return "\n";
  return Array.from(node.childNodes).map(serializeEditorNode).join("");
}

function MessageTokenEditor({
  value,
  disabled,
  onChange,
  onGreetingClick,
}: {
  value: string;
  disabled: boolean;
  onChange: (message: string) => void;
  onGreetingClick: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = renderTokenizedMessage(value);
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(Array.from(editor.childNodes).map(serializeEditorNode).join(""));
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.token === "cumprimentacao") {
      onGreetingClick();
    }
  };

  return (
    <div
      ref={editorRef}
      className={styles.messageEditor}
      contentEditable={!disabled}
      data-empty={!value.trim() ? "true" : "false"}
      role="textbox"
      aria-label="Mensagem"
      aria-multiline="true"
      suppressContentEditableWarning={true}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onInput={emitChange}
      onBlur={emitChange}
      onPaste={handlePaste}
    />
  );
}

export default function SceneInspector({
  scene,
  config,
  destinationOptions,
  channelLabel,
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
  const sectionTitle = scene.id === "entry" ? "Saidas" : "Respostas";

  return (
    <aside className={styles.inspectorPanel}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Editor</span>
          <strong>{scene.displayTitle}</strong>
        </div>
      </header>

      <div className={styles.inspectorBody}>
        {scene.lockedReason ? <div className={styles.lockedNotice}>{scene.lockedReason}</div> : null}

        <label className={styles.fieldBlock}>
          <span>Nome da cena</span>
          <input value={scene.displayTitle} disabled={locked} onChange={(event) => onTitleChange(event.target.value)} />
        </label>

        <section className={styles.fieldBlock}>
          <span>Mensagem</span>
          <MessageTokenEditor
            key={scene.id}
            value={scene.message}
            disabled={locked}
            onChange={onMessageChange}
            onGreetingClick={() => setGreetingOpen(true)}
          />
        </section>

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
            <span>{sectionTitle}</span>
            {scene.buttonsField ? (
              <button type="button" className={styles.smallButton} disabled={locked} onClick={onAddButton}>
                Adicionar
              </button>
            ) : null}
          </div>

          {scene.id === "entry" ? (
            <div className={styles.outputRows}>
              {ENTRY_OUTPUTS.map(([label, destination]) => (
                <div key={label} className={styles.outputRow}>
                  <strong>{label}</strong>
                  <span>{destination}</span>
                </div>
              ))}
            </div>
          ) : scene.buttonsField ? (
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
            <div className={styles.emptyState}>Este bloco segue pela condicao do fluxo.</div>
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
              channelLabel={channelLabel}
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
