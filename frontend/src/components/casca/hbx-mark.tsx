"use client";

// ================================================================
// MARCA »HBX VIVA — o topo da casca mobile INTEIRA (dono 07/07 noite:
// central + logística, "não preciso que repita onde eu estou").
// Substitui o título do TOPO-RAIZ (a tab bar já localiza); sub-telas
// (CascaView, transitions.tsx) continuam com título + voltar.
//
// Vida: o gradiente d'água anda sozinho no CSS (.hbx-mark-viva strong,
// casca-modern.css); QUALQUER clique na página dá a "pulsada" com anel
// duplo de gota (classe is-splash — pointerdown no document, reinicia
// via reflow pra cliques seguidos; a classe sai no animationend da
// GOTA EXTERNA, a animação mais longa do conjunto).
// ================================================================

import { useEffect, useRef } from "react";

// » duplo-chevron da marca (mesmo desenho do ICONS.railExpand/hbx)
const CHEVRON = ["M4 6l6 6-6 6", "M11 6l6 6-6 6"];

export function HbxMarkViva() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = () => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove("is-splash");
      void el.offsetWidth; // reinicia a animação mesmo clicando em sequência
      el.classList.add("is-splash");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return (
    <div
      className="hbx-mark-viva"
      ref={ref}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        // gota2 (o anel externo) é a animação mais longa do splash
        if (e.animationName === "hbx-mark-gota2") e.currentTarget.classList.remove("is-splash");
      }}
    >
      {/* wrapper interno: flutuação 3D contínua vive aqui (o container fica
          com o transform de centralização + pulsada — sem brigar) */}
      <span className="hbx-mark-viva__i">
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {CHEVRON.map((d, i) => <path key={i} d={d} />)}
        </svg>
        <strong>HBX</strong>
      </span>
    </div>
  );
}
