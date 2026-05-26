"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type HbxPopupTone = "info" | "success" | "warning" | "danger";

type HbxPopup1Props = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  tone?: HbxPopupTone;
  children?: ReactNode;
  footer?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  closeLabel?: string;
  onClose: () => void;
};

type HbxPopup2Props = {
  open?: boolean;
  title?: string;
  children: ReactNode;
  tone?: HbxPopupTone;
  action?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
};

type HbxPopup3Props = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  tone?: "warning" | "danger";
  items: ReactNode[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel?: () => void;
  onConfirm: () => void;
};

function toneTitle(tone: HbxPopupTone) {
  if (tone === "danger") return "Atenção do sistema";
  if (tone === "success") return "Tudo certo";
  if (tone === "warning") return "Aviso importante";
  return "Aviso do sistema";
}

function toneIcon(tone: HbxPopupTone) {
  if (tone === "danger" || tone === "warning") return "!";
  if (tone === "success") return "✓";
  return "i";
}

export function HbxPopup1({
  open,
  title,
  eyebrow = "HBX Popup 1",
  description,
  tone = "success",
  children,
  footer,
  primaryAction,
  secondaryAction,
  closeLabel = "Fechar",
  onClose,
}: HbxPopup1Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <HbxPopupLayer>
      <section className="hbx-popup1" data-tone={tone} role="dialog" aria-modal="true">
        <div className="hbx-popup1__shine" aria-hidden="true" />
        <header className="hbx-popup1__header">
          <span className="hbx-popup1__badge">
            <span aria-hidden="true">⚡</span>
            {eyebrow}
          </span>
          <button type="button" className="hbx-popup1__close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </header>
        <section className="hbx-popup1__body">
          <div className="hbx-popup1__icon" aria-hidden="true">{toneIcon(tone)}</div>
          <div>
            <h2>{title}</h2>
            {description ? <div className="hbx-popup1__description">{description}</div> : null}
            {children ? <div className="hbx-popup1__content">{children}</div> : null}
          </div>
        </section>
        {footer || primaryAction || secondaryAction ? (
          <footer className="hbx-popup1__footer">
            {footer || (
              <>
                {secondaryAction}
                {primaryAction}
              </>
            )}
          </footer>
        ) : null}
      </section>
    </HbxPopupLayer>,
    document.body,
  );
}

export function HbxPopup2({
  open = true,
  title,
  children,
  tone = "info",
  action,
  closeLabel = "Fechar aviso",
  onClose,
}: HbxPopup2Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <HbxPopupLayer polite variant="notice">
      <section className="hbx-popup2" data-tone={tone} role="status" aria-live="polite">
        <div className="hbx-popup2__icon" aria-hidden="true">{toneIcon(tone)}</div>
        <div className="hbx-popup2__content">
          <strong>{title || toneTitle(tone)}</strong>
          <span>{children}</span>
        </div>
        {action ? <div className="hbx-popup2__action">{action}</div> : null}
        {onClose ? (
          <button type="button" className="hbx-popup2__close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        ) : null}
      </section>
    </HbxPopupLayer>,
    document.body,
  );
}

export function HbxPopup3(props: HbxPopup3Props) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<HbxPopup3Dialog {...props} />, document.body);
}

function HbxPopupLayer({
  children,
  polite = false,
  variant = "modal",
}: {
  children: ReactNode;
  polite?: boolean;
  variant?: "modal" | "notice";
}) {
  return (
    <div className="hbx-popup-layer" data-variant={variant} aria-live={polite ? "polite" : undefined}>
      {children}
    </div>
  );
}

function HbxPopup3Dialog({
  title,
  eyebrow = "HBX Popup 3",
  description,
  tone = "warning",
  items,
  confirmLabel = "OK, li e entendi",
  cancelLabel = "Cancelar",
  busy = false,
  onCancel,
  onConfirm,
}: HbxPopup3Props) {
  const titleId = useId();
  const descriptionId = useId();
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = useState(items.length <= 2);
  const [acknowledged, setAcknowledged] = useState(false);
  const canConfirm = reachedEnd && acknowledged && !busy;

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    setReachedEnd(reader.scrollHeight <= reader.clientHeight + 6);
  }, [items.length]);

  return (
    <HbxPopupLayer>
      <section
        className="hbx-popup3"
        data-tone={tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="hbx-popup3__shine" aria-hidden="true" />
        <header className="hbx-popup3__header">
          <span className="hbx-popup3__badge">
            <span aria-hidden="true">!</span>
            {eyebrow}
          </span>
          <h2 id={titleId}>{title}</h2>
          {description ? <div id={descriptionId}>{description}</div> : null}
        </header>
        <div
          ref={readerRef}
          className="hbx-popup3__reader"
          tabIndex={0}
          onScroll={(event) => {
            const target = event.currentTarget;
            const atEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 6;
            if (atEnd) setReachedEnd(true);
          }}
        >
          <ol>
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ol>
        </div>
        <label className="hbx-popup3__ack" data-enabled={reachedEnd ? "true" : "false"}>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={!reachedEnd || busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>Confirmo que li todo o aviso.</span>
        </label>
        <footer className="hbx-popup3__footer">
          {onCancel ? (
            <button type="button" className="hbx-popup1__ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="hbx-popup1__primary"
            data-danger={tone === "danger" ? "true" : "false"}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {busy ? "Processando..." : confirmLabel}
          </button>
        </footer>
      </section>
    </HbxPopupLayer>
  );
}
