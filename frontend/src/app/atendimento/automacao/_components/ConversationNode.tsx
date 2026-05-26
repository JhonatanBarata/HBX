import type { ConversationScene, ConversationSceneId } from "./ConversationBuilder";
import styles from "./ConversationBuilder.module.css";

type Props = {
  scene: ConversationScene;
  selected: boolean;
  dimmed: boolean;
  recoveryEnabled: boolean;
  onSelect: (sceneId: ConversationSceneId) => void;
};

export default function ConversationNode({ scene, selected, dimmed, recoveryEnabled, onSelect }: Props) {
  const blocked = scene.id === "recovery" && !recoveryEnabled;

  return (
    <button
      type="button"
      className={styles.canvasNode}
      data-selected={selected ? "true" : "false"}
      data-blocked={blocked ? "true" : "false"}
      data-dimmed={dimmed ? "true" : "false"}
      style={{ left: `${scene.canvas.x}px`, top: `${scene.canvas.y}px` }}
      onClick={() => onSelect(scene.id)}
    >
      <span className={styles.nodeStatus} />
      <strong>
        {blocked ? <span className={styles.nodeLock} aria-hidden="true" /> : null}
        {scene.displayTitle}
      </strong>
      <small>{blocked ? "Bloqueado" : scene.buttons.length ? `${scene.buttons.length} saida(s)` : scene.condition}</small>
    </button>
  );
}
