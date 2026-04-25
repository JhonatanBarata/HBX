"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type HbxConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function HbxConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  busy = false,
  confirmDisabled = false,
  children,
  onCancel,
  onConfirm,
}: HbxConfirmDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <button
        type="button"
        style={{
          position: "absolute",
          inset: 0,
          border: 0,
          background: "color-mix(in srgb, var(--overlay) 76%, transparent)",
          cursor: busy ? "default" : "pointer",
        }}
        aria-label="Fechar confirmação"
        onClick={busy ? undefined : onCancel}
      />
      <section
        className="panel"
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(520px, 100%)",
          padding: 18,
          boxShadow: "0 28px 70px color-mix(in srgb, var(--foreground) 18%, transparent)",
        }}
        role="dialog"
        aria-modal="true"
      >
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>{title}</h2>
        {description ? <p className="text-muted" style={{ margin: "8px 0 0", fontSize: ".9rem" }}>{description}</p> : null}
        {children ? <div style={{ marginTop: 14, display: "grid", gap: 12 }}>{children}</div> : null}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${destructive ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? "Processando..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
