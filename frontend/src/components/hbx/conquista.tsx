"use client";

// Momento de conquista (28/06, Camada 1) — componente CENTRAL e único de toda
// "1ª vez" da jornada. Marcante, premium, SEMPRE igual (decisão travada do dono).
// Nunca cara de joguinho: medalhão com selo, raios de luz e vidro — não confete
// infantil. Vive no app-shell (conquista-host), portala pro <body> por cima de
// tudo. Visual 100% em classe central (.cq-*), bloco pele-allow na conquista.css.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

import {
  dismissConquista,
  getCurrentConquista,
  subscribeConquista,
  type ConquistaKind,
} from "@/lib/conquista-store";

const AUTO_MS = 4200;

// Ícone do selo por tipo de marco. Stroke currentColor — a cor vem do .cq-medal.
function MedalIcon({ kind }: { kind: ConquistaKind }) {
  const paths: Record<ConquistaKind, string[]> = {
    // troféu (vitória #1)
    vitoria: ["M7 4h10v3a5 5 0 0 1-10 0z", "M7 5H4.5a2.5 2.5 0 0 0 2.5 4M17 5h2.5a2.5 2.5 0 0 1-2.5 4", "M12 12v4M9 20h6M10 16h4"],
    // raio (ativado)
    ativado: ["M13 3 4 14h7l-1 7 9-11h-7z"],
    // coroa (venda fechada)
    venda: ["M6 18l-1.5-9 4.5 3 3-5 3 5 4.5-3L21 18z", "M5 20h14"],
    // estrela (marco genérico)
    marco: ["M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z"],
  };
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind].map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export function Conquista() {
  const current = useSyncExternalStore(subscribeConquista, getCurrentConquista, () => null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss: o setTimeout vive em callback (não no corpo do effect) — respeita
  // a regra react-hooks/set-state-in-effect. Reinicia a cada nova conquista (id).
  useEffect(() => {
    if (!current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => dismissConquista(), AUTO_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-veil" role="alertdialog" aria-modal="true" aria-label={current.title}
      onClick={() => dismissConquista()}>
      <div className={"cq-card cq-card--" + current.kind} onClick={e => e.stopPropagation()}>
        <div className="cq-rays" aria-hidden="true" />
        <div className="cq-medal-wrap">
          <span className="cq-ring" aria-hidden="true" />
          <span className="cq-medal"><MedalIcon kind={current.kind} /></span>
        </div>
        {current.badge && <span className="cq-badge">{current.badge}</span>}
        <h3 className="cq-title">{current.title}</h3>
        {current.subtitle && <p className="cq-sub">{current.subtitle}</p>}
        <button className="cq-go" onClick={() => dismissConquista()}>Continuar</button>
        <span className="cq-progress" aria-hidden="true"><i /></span>
      </div>
    </div>,
    document.body,
  );
}
