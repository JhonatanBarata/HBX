import type { ConversationEdge, ConversationScene } from "./ConversationBuilder";
import styles from "./ConversationBuilder.module.css";

type Props = {
  open: boolean;
  scenes: ConversationScene[];
  edges: ConversationEdge[];
  publishing: boolean;
  recoveryEnabled: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
};

function sceneTitle(scenes: ConversationScene[], id: string) {
  return scenes.find((scene) => scene.id === id)?.displayTitle || id;
}

export default function PublishMapReview({
  open,
  scenes,
  edges,
  publishing,
  recoveryEnabled,
  onClose,
  onSaveDraft,
  onPublish,
}: Props) {
  if (!open) return null;

  const dynamicEdges = edges.filter((edge) => edge.kind === "button").slice(0, 18);

  return (
    <div className={styles.reviewBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.reviewModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-map-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.reviewHeader}>
          <div>
            <span className={styles.eyebrow}>Revisar mapa</span>
            <h3 id="review-map-title">Organograma completo</h3>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
            x
          </button>
        </header>

        <div className={styles.reviewGrid}>
          <div className={styles.mapTree}>
            <strong>Entrada</strong>
            <ul>
              <li>
                Cliente novo
                <ul>
                  <li>Cadastro rapido</li>
                  <li>Humano</li>
                </ul>
              </li>
              <li>
                Cliente localizado
                <ul>
                  <li>Menu principal</li>
                  <li>Recovery {recoveryEnabled ? "se debito" : "bloqueado"}</li>
                </ul>
              </li>
              <li>Agenda</li>
              <li>Humano</li>
              <li>Encerramento</li>
            </ul>
          </div>

          <div className={styles.reviewRoutes}>
            <strong>Saidas configuradas</strong>
            {dynamicEdges.length ? (
              dynamicEdges.map((edge) => (
                <span key={edge.id} data-blocked={edge.blocked ? "true" : "false"}>
                  {sceneTitle(scenes, edge.from)} -&gt; {sceneTitle(scenes, edge.to)}
                </span>
              ))
            ) : (
              <p>Sem botoes configurados.</p>
            )}
          </div>
        </div>

        <footer className={styles.reviewActions}>
          <button type="button" className={styles.secondaryButton} onClick={onSaveDraft}>
            Salvar rascunho
          </button>
          <button type="button" className={styles.primaryButton} disabled={publishing} onClick={onPublish}>
            {publishing ? "Publicando..." : "Publicar bot"}
          </button>
        </footer>
      </section>
    </div>
  );
}
