// ============================================================
// MOBILE-CASCA/W1 — useCascaMobile: o breakpoint da casca de celular.
//
// Hook NOVO (o velho use-is-mobile.ts foi REMOVIDO na limpeza W0 — nada dele
// volta). Breakpoint ~768px. SSR-safe pelo padrão do resto do app
// (useSyncExternalStore com getServerSnapshot fixo → sem hydration mismatch):
// o servidor sempre "não-mobile" e o cliente reavalia no mount. Assim o
// desktop nunca pisca a casca e o SSR nunca tenta montar a moldura mobile.
//
// BOOT (07/07, queixa do dono: reload no celular piscava a sidebar desktop
// antes da casca aparecer): a correção acima é CORRETA mas roda num efeito
// PASSIVO — o browser chega a pintar "desktop" (o valor que casa com o
// server) pelo menos 1x antes do React trocar pra "mobile" (o próprio React
// documenta esse flash pra useSyncExternalStore quando client≠server). Isso
// não dá pra fechar só por dentro do React; o gate de verdade é por CSS puro,
// ANTES do 1º paint — um script síncrono em layout.tsx (mesmo padrão do
// THEME_BOOT que já mora lá) lê matchMedia direto e escreve
// <html data-casca-boot="mobile|desktop">, e um <style> (também em
// layout.tsx) esconde a sidebar desktop / mostra o loader HBX só com esse
// atributo — sem esperar hidratação nenhuma. MobileShell mantém o atributo em
// sincronia depois do boot (resize/rotate).
//
// FRONTEIRA SERVER/CLIENT (07/07): QUERY/CASCA_BP/CASCA_BOOT_ATTR vivem em
// casca-mobile-const.ts (SEM React) porque layout.tsx é Server Component e não
// pode puxar o hook useSyncExternalStore (client-only) pro bundle do servidor
// — importar QUALQUER símbolo DESTE arquivo lá dá 500 em toda rota. Aqui só
// re-exporto as constantes (o client já importa daqui — segue funcionando); o
// server importa direto do -const.
// ============================================================

import { useSyncExternalStore } from "react";

import { QUERY } from "./casca-mobile-const";

// Re-export das constantes neutras (fonte real: casca-mobile-const.ts, que NÃO
// importa React). Quem já importava daqui (mobile-shell.tsx, casca/index.ts —
// ambos client) continua funcionando; o server (layout.tsx) importa do -const.
export { CASCA_BP, CASCA_BOOT_ATTR, QUERY } from "./casca-mobile-const";

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
