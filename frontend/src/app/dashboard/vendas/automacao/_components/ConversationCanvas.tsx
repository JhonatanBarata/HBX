import type { ConversationEdge, ConversationScene, ConversationSceneId } from "./ConversationBuilder";
import ConversationNode from "./ConversationNode";
import styles from "./ConversationBuilder.module.css";

type Props = {
  scenes: ConversationScene[];
  edges: ConversationEdge[];
  selectedSceneId: ConversationSceneId;
  recoveryEnabled: boolean;
  onSelectScene: (sceneId: ConversationSceneId) => void;
};

const NODE_WIDTH = 150;
const NODE_HEIGHT = 76;

function center(scene: ConversationScene) {
  return {
    x: scene.canvas.x + NODE_WIDTH / 2,
    y: scene.canvas.y + NODE_HEIGHT / 2,
  };
}

function pathBetween(from: ConversationScene, to: ConversationScene) {
  const start = center(from);
  const end = center(to);
  const bend = Math.max(48, Math.abs(end.x - start.x) * 0.42);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export default function ConversationCanvas({
  scenes,
  edges,
  selectedSceneId,
  recoveryEnabled,
  onSelectScene,
}: Props) {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  return (
    <main className={styles.canvasPanel}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Canvas vivo</span>
          <strong>Organograma</strong>
        </div>
      </header>

      <div className={styles.canvasBoard}>
        <svg className={styles.canvasLines} viewBox="0 0 1080 640" aria-hidden="true">
          {edges.map((edge) => {
            const from = sceneById.get(edge.from);
            const to = sceneById.get(edge.to);
            if (!from || !to) return null;
            const selected = edge.from === selectedSceneId || edge.to === selectedSceneId;
            return (
              <g key={edge.id} className={styles.edgeGroup} data-selected={selected ? "true" : "false"} data-blocked={edge.blocked ? "true" : "false"}>
                <path d={pathBetween(from, to)} />
                <circle cx={center(to).x} cy={center(to).y} r="4" />
              </g>
            );
          })}
        </svg>

        {scenes.map((scene) => (
          <ConversationNode
            key={scene.id}
            scene={scene}
            selected={scene.id === selectedSceneId}
            recoveryEnabled={recoveryEnabled}
            onSelect={onSelectScene}
          />
        ))}
      </div>
    </main>
  );
}
