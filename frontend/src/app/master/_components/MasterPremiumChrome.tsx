import type { ReactNode } from "react";
import styles from "../page.module.css";

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ModalShell({
  title,
  subtitle,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className={styles.modalRoot}>
      <button type="button" className={styles.modalBackdrop} onClick={onClose} aria-label="Fechar modal" />
      <article className={wide ? `${styles.modalCard} ${styles.modalCardWide}` : styles.modalCard}>
        <header className={styles.modalHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Operação MASTER</p>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose}>
            Fechar
          </button>
        </header>
        {children}
      </article>
    </div>
  );
}
