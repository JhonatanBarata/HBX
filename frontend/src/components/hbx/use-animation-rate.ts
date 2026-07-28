"use client";

// ── Inércia de animação (28/07) ───────────────────────────────────────────────
// Play/pause/stop de qualquer "instrumento" do HBX (disco do Radar, mini-radar do
// card de Vendas) não pode ser corte seco: trocar `animation-duration` ou zerar
// com `animation: none` faz o ponteiro SALTAR de posição — foi exatamente o
// "pisca" que o dono pegou. Aqui a velocidade é rampada no `playbackRate` das
// animações que JÁ estão rodando (Web Animations API): o tempo atual é
// preservado, então o ponteiro desacelera até congelar ONDE ESTÁ e volta a
// acelerar do mesmo ponto. A cor troca em paralelo pelo transition dos tokens.
//
// Frear leva mais tempo que voltar a girar — é o que dá a sensação de inércia.

import { useEffect, type RefObject } from "react";

export const ANIMATION_RAMP_MS = { down: 1500, up: 1100 };

export function useAnimationRate(ref: RefObject<HTMLElement | null>, rate: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== "function") return;
    // SÓ @keyframes: getAnimations devolve também as CSSTransition (a troca de cor
    // dos tokens) — frear uma transition congelaria a cor no meio do caminho.
    const anims = el
      .getAnimations({ subtree: true })
      .filter(anim => typeof (anim as CSSAnimation).animationName === "string");
    if (anims.length === 0) return; // prefers-reduced-motion: nada a rampar
    const from = anims[0]?.playbackRate ?? 1;
    if (Math.abs(from - rate) < 0.01) return;
    const duration = rate < from ? ANIMATION_RAMP_MS.down : ANIMATION_RAMP_MS.up;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out: freia forte no fim
      const current = from + (rate - from) * eased;
      for (const anim of anims) {
        try { anim.playbackRate = current; } catch { /* animação já morta */ }
      }
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ref, rate]);
}
