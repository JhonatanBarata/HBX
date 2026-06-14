"use client";

// Splash de boot do tutorial (ordem do dono 14/06): apresentaçãozinha estilo
// Windows — cada linha "carrega" e vira "done", em sequência, e some revelando
// o tutorial. Visual 100% em classe central (.boot-* no screens.css), Lei 4/5.
// Spec do dono: Detectando acesso → Localizando empresas → Aquecendo os motores.

import { useEffect, useState } from "react";

const STEPS = ["Detectando seu acesso", "Localizando empresas", "Aquecendo os motores"];
const STEP_MS = 950;   // tempo de cada "loading"
const HOLD_MS = 500;   // respiro com tudo "done" antes de sair
const FADE_MS = 600;   // duração do fade de saída

export function BootSplash({ onDone }: { onDone?: () => void }) {
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

  return (
    <div className={"boot-splash" + (gone ? " is-gone" : "")} role="status" aria-live="polite">
      <div className="boot-brand">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
        <strong>HBX</strong>
      </div>
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
  );
}
