"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./HbxAdminUi.module.css";

type HbxDrawerProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: "left" | "right";
  closeLabel?: string;
  onClose: () => void;
};

export default function HbxDrawer({
  open,
  title,
  description,
  children,
  footer,
  side = "right",
  closeLabel = "Fechar painel",
  onClose,
}: HbxDrawerProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlayLayer} data-drawer-side={side}>
      <button type="button" className={styles.overlayBackdrop} aria-label={closeLabel} onClick={onClose} />
      <aside className={styles.drawer} data-side={side} role="dialog" aria-modal="true">
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
      </aside>
    </div>,
    document.body,
  );
}

