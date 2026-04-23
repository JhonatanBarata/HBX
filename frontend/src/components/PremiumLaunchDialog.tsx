"use client";

import { createPortal } from "react-dom";
import type { InlineLaunchNoticeState } from "./InlineLaunchNotice";
import styles from "./PremiumLaunchDialog.module.css";

type PremiumLaunchDialogProps = {
  notice: InlineLaunchNoticeState | null;
  onOpen: () => void;
};

export default function PremiumLaunchDialog({ notice, onOpen }: PremiumLaunchDialogProps) {
  if (!notice || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation">
      <section className={styles.dialog} data-phase={notice.phase} role="dialog" aria-modal="true" aria-live="polite">
        <div className={styles.hero}>
          <span className={styles.badge}>HBX Fluxo Guiado</span>
          <div className={styles.orb} aria-hidden="true">
            <span className={styles.orbCore} />
          </div>
          <div className={styles.copy}>
            <strong className={styles.title}>{notice.title}</strong>
            <p className={styles.description}>{notice.description}</p>
          </div>
        </div>

        <div className={styles.progressPanel}>
          <div className={styles.progressMeta}>
            <span>{notice.phase === "loading" ? "Preparando rota" : "Rota pronta"}</span>
            <strong>{notice.phase === "loading" ? `${notice.progress}%` : "100%"}</strong>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <span className={styles.progressBar} style={{ width: `${notice.progress}%` }} />
          </div>
        </div>

        <div className={styles.footer}>
          {notice.phase === "success" ? (
            <button type="button" className="btn btn-primary" onClick={onOpen}>
              {notice.ctaLabel}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" disabled>
              Carregando ambiente...
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}