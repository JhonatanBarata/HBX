// Hook SSR-safe para detectar viewport mobile.
// Fonte única de "é celular?" — usar só onde o DOM PRECISA mudar.
// CSS puro continua usando @media (max-width: MOBILE_BP).
// Padrão de matchMedia copiado de components/hbx/tutorial-coach.tsx.

import { useEffect, useState } from "react";

/** Breakpoint mobile em pixels — casa exatamente com @media (max-width: 860px). */
export const MOBILE_BP = 860;

const QUERY = `(max-width: ${MOBILE_BP}px)`;

/**
 * Retorna true quando a viewport é ≤ 860px.
 * SSR-safe: inicia false no servidor, atualiza no mount com listener + cleanup.
 */
export function useIsMobile(): boolean {
  // Inicia false → hydration sempre em desktop; atualiza no efeito.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    // Sincroniza com o valor atual via callback (evita setIsMobile síncrono no corpo do efeito).
    handler({ matches: mq.matches } as MediaQueryListEvent);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
