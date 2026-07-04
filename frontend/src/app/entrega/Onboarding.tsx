"use client";

// ================================================================
// LOGÍSTICA-MOBILE M9 — onboarding do primeiro acesso (3 telas VISUAIS).
// Lei da seção 2: ZERO parágrafo — cada tela é ÍCONE + 1 verbo/frase curtíssima.
// Swipe ←/→ entre as 3 (rota · navegar · confirmar) + dots; botão "Começar" na
// última (aparece direto como CTA). Guardado em localStorage: some após ver 1×.
//
// Reusa o Design System Entrega (.ent-*) — nada de hex/inline aqui (5 Leis);
// as classes .ent-onb-* vivem em hbx-theme/entrega.css. Feedback físico (buzz)
// na virada e no "Começar", igual ao resto do app.
// ================================================================

import { useRef, useState } from "react";

import { I, ICON_PATHS } from "./icons";
import { buzz } from "./entrega-hooks";

export const ONBOARDING_KEY = "hbx:entrega:onboarded:v1";

/** Já viu o onboarding? (SSR-safe: no servidor devolve true = não mostra.) */
export function jaViuOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return true;
  }
}

const SWIPE_PX = 56;

// As 3 telas: ícone (path SVG) + 1 palavra. Sem parágrafo, sem dica.
const TELAS: Array<{ icon: keyof typeof ICON_PATHS; verbo: string }> = [
  { icon: "route", verbo: "Sua rota do dia" },
  { icon: "nav", verbo: "Navegue até o cliente" },
  { icon: "check", verbo: "Confirme num toque" },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const ultima = i === TELAS.length - 1;

  const ir = (n: number) => {
    const c = Math.max(0, Math.min(TELAS.length - 1, n));
    if (c !== i) buzz(8);
    setI(c);
  };

  const concluir = () => {
    buzz([16, 20, 16]);
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      /* sem storage: segue mesmo assim (aparece de novo, sem quebrar) */
    }
    onDone();
  };

  const down = (e: React.PointerEvent) => {
    start.current = e.clientX;
  };
  const move = (e: React.PointerEvent) => {
    if (start.current == null) return;
    setDx(e.clientX - start.current);
  };
  const up = () => {
    if (start.current == null) return;
    const d = dx;
    start.current = null;
    setDx(0);
    if (d <= -SWIPE_PX) ir(i + 1);
    else if (d >= SWIPE_PX) ir(i - 1);
  };

  return (
    <div className="ent-onb" role="dialog" aria-modal="true" aria-label="Bem-vindo">
      <button type="button" className="ent-onb-skip" onClick={concluir} aria-label="Pular">
        Pular
      </button>

      <div
        className="ent-onb-stage"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div className="ent-onb-track" style={{ transform: `translateX(calc(${-i * 100}% + ${dx}px))` }}>
          {TELAS.map((t) => (
            <div className="ent-onb-slide" key={t.icon}>
              <div className="ent-onb-icon" aria-hidden="true">
                <I d={ICON_PATHS[t.icon]} size={72} />
              </div>
              <div className="ent-onb-verbo">{t.verbo}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ent-dots" aria-hidden="true">
        {TELAS.map((t, n) => (
          <span key={t.icon} className={`ent-dot${n === i ? " is-on" : ""}`} onClick={() => ir(n)} />
        ))}
      </div>

      <div className="ent-onb-actions">
        {ultima ? (
          <button type="button" className="ent-btn ent-btn--primary" onClick={concluir}>
            Começar
          </button>
        ) : (
          <button type="button" className="ent-btn ent-btn--secondary" onClick={() => ir(i + 1)}>
            Próximo
          </button>
        )}
      </div>
    </div>
  );
}
