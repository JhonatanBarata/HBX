"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { I, ICONS } from "@/components/hbx/shell";

export function FiltroAvancadoModal({
  activeCount,
  children,
  onClear,
  onClose,
}: {
  activeCount: number;
  children: ReactNode;
  onClear: () => void;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
  }, []);

  return (
    <div className="hbx-veil to-right" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={drawerRef}
        className="hbx-drawer be-adv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="be-adv-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="be-adv-head">
          <span className="be-adv-head__icon" aria-hidden="true">
            <I d={ICONS.filter} size={18} />
          </span>
          <span className="be-adv-head__copy">
            <small>Qualidade do Radar</small>
            <strong id="be-adv-title">Filtros avançados</strong>
            <span>Só ajustes que mudam o resultado real da busca.</span>
          </span>
          <button type="button" className="be-adv-head__close" aria-label="Fechar filtros avançados" onClick={onClose}>
            <I d={ICONS.x} size={17} />
          </button>
        </header>

        <div className="be-adv-body">
          {children}
        </div>

        <footer className="be-adv-foot">
          <span className={"be-adv-foot__status" + (activeCount > 0 ? " is-active" : "")}>
            <i aria-hidden="true" />
            {activeCount > 0
              ? `${activeCount} filtro${activeCount === 1 ? "" : "s"} ativo${activeCount === 1 ? "" : "s"}`
              : "Sem filtros extras"}
          </span>
          <div className="be-adv-foot__actions">
            <button type="button" className="btn-ghost" onClick={onClear} disabled={activeCount === 0}>
              Limpar
            </button>
            <button type="button" className="btn-teal" onClick={onClose}>
              Pronto
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
