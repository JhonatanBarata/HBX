"use client";

// Popup ÚNICO de erro. TODA falha do sistema (rede, backend, navegador, crash de
// render) aparece aqui com a MESMA cara — casca central .hbx-veil/.hbx-modal
// (igual aos outros modais) + classe .hbx-error (errors.css, só tokens).

import { useEffect, useState } from "react";
import { onError, reportError } from "@/lib/error-bus";
import { actionLabel, type FriendlyError } from "@/lib/errors";

export function ErrorPopup({ error, onClose }: { error: FriendlyError; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal hbx-error" data-severity={error.severity} style={{ width: "min(420px, 100%)" }}>
        <button type="button" className="hbx-x" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="hbx-error__icon" aria-hidden>!</div>
        <h3 className="hbx-error__title">{error.title}</h3>
        <p className="hbx-error__msg">{error.message}</p>
        {error.traceId ? (
          <p className="hbx-error__ref">Código de referência: <b>{error.traceId}</b></p>
        ) : null}
        <div className="hbx-error__actions">
          <button type="button" className="hbx-error__btn" onClick={onClose}>{actionLabel(error.action)}</button>
        </div>
      </div>
    </div>
  );
}

// Host ÚNICO: montado uma vez no layout raiz. Assina o barramento e também pega
// erros que escapam sem catch (unhandledrejection) — nada fica sem aparecer.
export function GlobalErrorHost() {
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    const off = onError(setError);
    return off;
  }, []);

  useEffect(() => {
    // Erros não tratados em Promises (catch esquecido) caem no popup também.
    const onRejection = (ev: PromiseRejectionEvent) => {
      reportError(ev.reason);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  if (!error) return null;
  return <ErrorPopup error={error} onClose={() => setError(null)} />;
}
