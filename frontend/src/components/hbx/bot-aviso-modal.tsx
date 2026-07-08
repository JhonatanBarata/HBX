"use client";

// <BotAvisoModal> — pop-up EXCLUSIVO do Motor de disparo frio (Prospecção).
// Hoje o único aviso quando o bot "sem crédito"/"não configurado"/"fila vazia"/
// "erro" é um badge inline discreto — o dono quer um pop-up visível de verdade.
// Molde estrutural = <BotTermsModal> (mesmo backdrop/superfície/fechamento/tema);
// CSS em hbx-theme/bot-aviso.css. Detecção de QUANDO aparece: lib/bot-alert.ts.

import { useEffect, useRef } from "react";
import { I, ICONS } from "@/components/hbx/shell";
import type { BotAlert } from "@/lib/bot-alert";

const ICON_BY_KIND: Record<BotAlert["kind"], keyof typeof ICONS> = {
  not_configured: "bot",
  no_credit: "money",
  no_leads: "filter",
  error: "bolt",
};

const TONE_BY_KIND: Record<BotAlert["kind"], "danger" | "warning" | "info"> = {
  not_configured: "warning",
  no_credit: "danger",
  no_leads: "info",
  error: "danger",
};

export function BotAvisoModal(props: {
  alert: BotAlert;
  onDismiss: () => void;
  onConfigure: () => void;
  onViewCredits: () => void;
  onAdjustFilter: () => void;
}): React.JSX.Element {
  const { alert, onDismiss, onConfigure, onViewCredits, onAdjustFilter } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onDismiss(); }
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  function handleCta() {
    if (alert.cta === "configure") onConfigure();
    else if (alert.cta === "credits") onViewCredits();
    else if (alert.cta === "adjust_filter") onAdjustFilter();
    onDismiss();
  }

  return (
    <div
      className="bot-aviso"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div
        className="bot-aviso__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={alert.title}
        tabIndex={-1}
        ref={dialogRef}
      >
        {/* fundo decorativo — ver comentário em bot-aviso.css sobre como remover */}
        <div className={"bot-aviso__bg bot-aviso__bg--" + alert.kind} aria-hidden="true" />
        <div className="bot-aviso__scrim" aria-hidden="true" />

        <div className="bot-aviso__head">
          <span className={"bot-aviso__icon bot-aviso__icon--" + TONE_BY_KIND[alert.kind]}>
            <I d={ICONS[ICON_BY_KIND[alert.kind]]} size={18} />
          </span>
          <div className="bot-aviso__titles">
            <strong className="bot-aviso__title">{alert.title}</strong>
          </div>
          <button
            type="button"
            className="bot-aviso__close"
            aria-label="Fechar"
            onClick={onDismiss}
          >
            <I d={ICONS.x} size={15} />
          </button>
        </div>

        <div className="bot-aviso__body">
          <p className="bot-aviso__message">{alert.message}</p>
        </div>

        <div className="bot-aviso__actions">
          {alert.cta ? (
            <>
              <button type="button" className="btn-teal bot-aviso__actions-cta" onClick={handleCta}>
                {alert.ctaLabel}
              </button>
              <button type="button" className="btn-ghost bot-aviso__actions-dismiss" onClick={onDismiss}>
                Agora não
              </button>
            </>
          ) : (
            <button type="button" className="btn-teal bot-aviso__actions-cta" onClick={onDismiss}>
              Entendi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BotAvisoModal;
