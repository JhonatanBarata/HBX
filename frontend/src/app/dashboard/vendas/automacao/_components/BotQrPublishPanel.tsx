import type { BotQrChecklistItem } from "../model";
import styles from "../page.module.css";

type BotQrPublishPanelProps = {
  checklist: BotQrChecklistItem[];
  quickTests: BotQrChecklistItem[];
  draftSavedAtLabel: string;
  publishedAtLabel: string;
  lastQuickTestLabel: string;
  publishing: boolean;
  hasUnsavedChanges: boolean;
  botStatusLabel: string;
  connectionStatusLabel: string;
  locked?: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onOpenPlans?: () => void;
  onRestorePublished: () => void;
  onRunQuickTest: () => void;
};

export default function BotQrPublishPanel({
  checklist,
  quickTests,
  draftSavedAtLabel,
  publishedAtLabel,
  lastQuickTestLabel,
  publishing,
  hasUnsavedChanges,
  botStatusLabel,
  connectionStatusLabel,
  locked = false,
  onSaveDraft,
  onPublish,
  onOpenPlans,
  onRestorePublished,
  onRunQuickTest,
}: BotQrPublishPanelProps) {
  const readyCount = checklist.filter((item) => item.ok).length;
  const quickPassCount = quickTests.filter((item) => item.ok).length;

  return (
    <div className={styles.publishGrid}>
      <article className={styles.publishMainCard}>
        <div className={styles.connectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>Publicacao</span>
            <h3 className={styles.cardTitle}>Checklist final da automacao WhatsApp</h3>
          </div>
          <span className={styles.statusPill} data-active={hasUnsavedChanges ? "false" : "true"}>
            {hasUnsavedChanges ? "Rascunho com alteracoes" : "Publicado e alinhado"}
          </span>
        </div>

        <div className={styles.publishMetricGrid}>
          <div className={styles.publishMetricCard}>
            <span>Status do bot</span>
            <strong>{botStatusLabel}</strong>
          </div>
          <div className={styles.publishMetricCard}>
            <span>Status da conexao</span>
            <strong>{connectionStatusLabel}</strong>
          </div>
          <div className={styles.publishMetricCard}>
            <span>Ultimo rascunho</span>
            <strong>{draftSavedAtLabel}</strong>
          </div>
          <div className={styles.publishMetricCard}>
            <span>Ultima publicacao</span>
            <strong>{publishedAtLabel}</strong>
          </div>
        </div>

        <div className={styles.publishActionRow}>
          <button type="button" className={styles.secondaryButton} onClick={locked ? onOpenPlans : onSaveDraft}>
            Salvar rascunho
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={locked ? onOpenPlans : onPublish}
            disabled={publishing}
          >
            {locked ? "Ver planos" : publishing ? "Publicando..." : "Publicar / ativar automacao"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={locked ? onOpenPlans : onRestorePublished}>
            Voltar ao ultimo publicado
          </button>
          <button type="button" className={styles.ghostButton} onClick={locked ? onOpenPlans : onRunQuickTest}>
            Teste rapido
          </button>
        </div>

        <div className={styles.publishDisclaimer}>Publicar salva a configuracao ativa do bot. O teste rapido valida a experiencia visual antes de operar.</div>
      </article>

      <article className={styles.publishChecklistCard}>
        <div className={styles.editorSectionHeader}>
          <strong>Checklist de publicacao</strong>
          <span>{readyCount}/{checklist.length} pronto(s)</span>
        </div>
        <div className={styles.checklistGrid}>
          {checklist.map((item) => (
            <div key={item.id} className={styles.checklistItem} data-ok={item.ok ? "true" : "false"}>
              <strong>{item.label}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </article>

      <article className={styles.publishChecklistCard}>
        <div className={styles.editorSectionHeader}>
          <strong>Teste rapido visual</strong>
          <span>{quickPassCount}/{quickTests.length} validado(s)</span>
        </div>
        <div className={styles.checklistGrid}>
          {quickTests.map((item) => (
            <div key={item.id} className={styles.checklistItem} data-ok={item.ok ? "true" : "false"}>
              <strong>{item.label}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
        <div className={styles.publishTestFooter}>Ultima execucao visual: {lastQuickTestLabel}</div>
      </article>
    </div>
  );
}
