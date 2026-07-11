"use client";

// ================================================================
// MODO-SHELL — detector da casca Android (WebView do EntregaShell).
// Por que existe: o app da Google Play NÃO pode expor compra de créditos
// (bem digital ⇒ Play Billing obrigatório; anti-steering pega até CTA/preço
// apontando compra externa). Dentro da casca escondemos toda superfície de
// venda; fora dela NADA muda.
// Como detecta (feature-detect, zero config):
//  1. `window.HBXShell` — bridge injetada pela casca via addJavascriptInterface
//     em TODA página do WebView (contrato em app/entrega/shell-bridge.ts);
//  2. fallback: User-Agent contendo "HBXShell" (sufixo custom do shell v2,
//     recomendação §5.4 da AUDITORIA-PLAY — cobre o intervalo antes do JS
//     nativo e builds futuros).
// SSR-safe: no server retorna false (o gate só esconde no cliente, que é
// onde o revisor da Play enxerga o app).
// ================================================================

import { useSyncExternalStore } from "react";

/** true quando a página roda dentro da casca Android (WebView HBXShell). */
export function isHbxShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as unknown as { HBXShell?: unknown };
    if (w.HBXShell != null) return true;
    return typeof navigator !== "undefined" && navigator.userAgent.includes("HBXShell");
  } catch {
    // Interface nativa pode lançar em WebView exótico — na dúvida, navegador comum.
    return false;
  }
}

// A presença da casca não muda durante a vida da página (bridge é injetada
// antes do load; UA é estático) — subscribe é no-op estável.
const subscribe = () => () => {};
const getServerSnapshot = () => false;

/**
 * Hook client-safe do detector: false no SSR/primeira pintura de hidratação,
 * valor real em seguida — sem mismatch de hidratação.
 */
export function useHbxShell(): boolean {
  return useSyncExternalStore(subscribe, isHbxShell, getServerSnapshot);
}
