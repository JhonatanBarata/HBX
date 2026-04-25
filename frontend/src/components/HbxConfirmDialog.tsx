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
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--overlay) 76%, transparent)" }}
        aria-label="Fechar confirmação"
        onClick={busy ? undefined : onCancel}
      />
      <section className="panel relative z-[1] w-full max-w-[520px] p-4" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        {children ? <div className="mt-4 space-y-3">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
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
