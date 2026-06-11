"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./HbxAdminUi.module.css";

type HbxModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
  onClose: () => void;
};

export default function HbxModal({
  open,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Fechar modal",
  onClose,
}: HbxModalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlayLayer}>
      <button type="button" className={styles.overlayBackdrop} aria-label={closeLabel} onClick={onClose} />
      <section className={styles.modal} data-size={size} role="dialog" aria-modal="true">
        <header className={styles.overlayHeader}>
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className={styles.overlayClose} onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </header>
        {children ? <div className={styles.overlayBody}>{children}</div> : null}
        {footer ? <footer className={styles.overlayFooter}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

