// ============================================================
// useCelular — "estou num telefone?" (hook, client-only).
//
// SSR-safe pelo padrão do resto do app (useSyncExternalStore com
// getServerSnapshot fixo → zero hydration mismatch): o servidor sempre
// responde "não é telefone" e o cliente reavalia no mount. O flash que sobra
// (1 pintura antes do React trocar de ideia) é fechado por CSS puro, antes da
// hidratação — ver o carimbo CELULAR_ATTR em app/layout.tsx.
//
// A régua mora em celular-const.ts (sem React) — ver a nota de fronteira lá.
// ============================================================

import { useSyncExternalStore } from "react";

import { CELULAR_QUERY } from "./celular-const";

export { CELULAR_BP, CELULAR_ATTR, CELULAR_QUERY } from "./celular-const";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(CELULAR_QUERY);
  // addEventListener é o caminho moderno; Safari antigo cai no addListener.
  if (mql.addEventListener) {
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }
  mql.addListener(cb);
  return () => mql.removeListener(cb);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(CELULAR_QUERY).matches;
}

// Servidor: NUNCA telefone. Evita mismatch e garante que o SSR entrega o
// caminho desktop; o cliente decide de verdade no 1º paint.
function getServerSnapshot(): boolean {
  return false;
}

/** true quando a tela é de telefone de verdade (estreita E por dedo). */
export function useCelular(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
