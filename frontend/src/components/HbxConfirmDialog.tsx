"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type HbxConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  presentation?: "standard" | "billboard";
  eyebrow?: string;
  metrics?: Array<{ label: string; value: string }>;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

const BILLBOARD_BARS = [46, 62, 54, 78, 67, 88, 73, 58, 82, 69, 92, 76];

export default function HbxConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  presentation = "standard",
  eyebrow = "Aviso HBX",
  metrics,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  children,
  onCancel,
  onConfirm,
}: HbxConfirmDialogProps) {
  if (!open || typeof document === "undefined") return null;

  if (presentation === "billboard") {
    const dialogMetrics = metrics?.length
      ? metrics
      : [
          { label: "Escopo", value: "HBX" },
          { label: "WhatsApp", value: "0 comandos" },
          { label: "Status", value: destructive ? "Atenção" : "Pronto" },
        ];

    return createPortal(
      <div className="hbx-confirmBillboardOverlay">
        <button
          type="button"
          className="hbx-confirmBillboardBackdrop"
          aria-label="Fechar confirmação"
          onClick={busy ? undefined : onCancel}
        />
        <section
          className="hbx-confirmBillboard"
          data-destructive={destructive ? "true" : "false"}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hbx-confirm-billboard-title"
        >
          <span className="hbx-confirmBillboard__scan" aria-hidden="true" />
          <div className="hbx-confirmBillboard__equalizer" aria-hidden="true">
            {BILLBOARD_BARS.slice(0, 8).map((height, index) => (
              <i key={index} style={{ ["--bar-height" as string]: `${height}%`, ["--eq-index" as string]: index }} />
            ))}
          </div>
          <div className="hbx-confirmBillboard__main">
            <div className="hbx-confirmBillboard__orb" aria-hidden="true">
              <span />
            </div>
            <div className="hbx-confirmBillboard__copy">
              <span>{eyebrow}</span>
              <h2 id="hbx-confirm-billboard-title">{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          <div className="hbx-confirmBillboard__chart" aria-hidden="true">
            <svg viewBox="0 0 260 74" focusable="false">
              <defs>
                <linearGradient id="hbxConfirmBillboardArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 54 C28 42 35 58 58 40 C82 22 105 50 130 32 C154 14 176 46 202 24 C222 8 240 18 260 10 L260 74 L0 74 Z" />
              <path d="M0 54 C28 42 35 58 58 40 C82 22 105 50 130 32 C154 14 176 46 202 24 C222 8 240 18 260 10" />
            </svg>
            <div>
              {BILLBOARD_BARS.map((height, index) => (
                <span key={index} style={{ ["--bar-height" as string]: `${height}%` }} />
              ))}
            </div>
          </div>
          {children ? <div className="hbx-confirmBillboard__children">{children}</div> : null}
          <div className="hbx-confirmBillboard__metrics">
            {dialogMetrics.slice(0, 3).map((metric) => (
              <span key={`${metric.label}:${metric.value}`}>
                {metric.label}
                <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
          <div className="hbx-confirmBillboard__actions">
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
