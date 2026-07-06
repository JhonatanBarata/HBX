// ============================================================
// MOBILE-CASCA/W1 — useCascaMobile: o breakpoint da casca de celular.
//
// Hook NOVO (o velho use-is-mobile.ts foi REMOVIDO na limpeza W0 — nada dele
// volta). Breakpoint ~768px. SSR-safe pelo padrão do resto do app
// (useSyncExternalStore com getServerSnapshot fixo → sem hydration mismatch):
// o servidor sempre "não-mobile" e o cliente reavalia no mount. Assim o
// desktop nunca pisca a casca e o SSR nunca tenta montar a moldura mobile.
// ============================================================

import { useSyncExternalStore } from "react";

export const CASCA_BP = 768; // px — abaixo disto = celular (casca)

const QUERY = `(max-width: ${CASCA_BP - 1}px)`;

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
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
  return window.matchMedia(QUERY).matches;
}

// Servidor: SEMPRE desktop (false). Evita mismatch e garante que o SSR entrega
// o caminho desktop; o cliente decide de verdade no 1º paint.
function getServerSnapshot(): boolean {
  return false;
}

/** true quando a viewport é de celular (< 768px). SSR-safe. */
export function useCascaMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
