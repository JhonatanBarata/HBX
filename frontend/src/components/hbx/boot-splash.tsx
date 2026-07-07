"use client";

// Splash de boot do tutorial — abertura cinematográfica estilo Windows (07/07):
// tela cheia com bloom de luz, "Bem-vindo ao HBX" grande, pontinhos de loading
// girando (loader clássico do Windows) e as linhas de status que "carregam" e
// viram "done" em sequência; some num fade revelando o tutorial por cima do app.
// Visual 100% em classe central (.boot-* no screens.css), Lei 4/5.

import { useEffect, useState } from "react";

const STEPS = [
  "Preparando sua área de trabalho",
  "Carregando módulos da HBX",
  "Sincronizando primeiros passos",
  "Aquecendo o Radar",
  "Abrindo sua operação",
];
const STEP_MS = 780;   // tempo de cada "loading"
const HOLD_MS = 650;   // respiro com tudo "done" antes de sair
const FADE_MS = 700;   // duração do fade de saída (casa com o CSS)

export function BootSplash({ onDone, name }: { onDone?: () => void; name?: string | null }) {
  const [done, setDone] = useState(0); // quantas linhas já concluíram
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let i = 0;
    const tick = () => {
      if (i >= STEPS.length) {
        timers.push(window.setTimeout(() => {
          setGone(true);
          timers.push(window.setTimeout(() => onDone?.(), FADE_MS));
        }, HOLD_MS));
        return;
      }
      i += 1;
      timers.push(window.setTimeout(() => { setDone(i); tick(); }, STEP_MS));
    };
    tick();
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [onDone]);

  const primeiro = String(name || "").trim().split(/\s+/)[0];

  return (
    <div className={"boot-splash" + (gone ? " is-gone" : "")} role="status" aria-live="polite">
      <span className="boot-glow" aria-hidden />
      <div className="boot-stage">
        <div className="boot-brand">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
          <strong>HBX</strong>
        </div>
        <h1 className="boot-title">{primeiro ? `Bem-vindo ao HBX, ${primeiro}` : "Bem-vindo ao HBX"}</h1>
        <p className="boot-subtitle">Deixando tudo pronto para a sua operação. Isso leva só alguns segundos.</p>
        <span className="boot-dots" aria-hidden><i /><i /><i /><i /><i /></span>
        <ul className="boot-steps">
          {STEPS.map((s, idx) => {
            const state = idx < done ? "done" : idx === done ? "loading" : "wait";
            return (
              <li key={s} className={"boot-step is-" + state}>
                <span className="boot-ic">
                  {state === "done"
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    : <span className="boot-spin" aria-hidden />}
                </span>
                <span className="boot-label">{s}</span>
                <span className="boot-state">{state === "done" ? "done" : state === "loading" ? "loading…" : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
