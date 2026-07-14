"use client";

// ================================================================
// WEB-BRIDGE — ponte fina com a casca nativa Android (HBXShell).
// O shell injeta `window.HBXShell` via addJavascriptInterface; no navegador
// comum o objeto não existe e todo helper aqui vira no-op (feature-detected,
// zero mudança de comportamento fora da casca). Contrato (não desviar — o
// lado nativo implementa exatamente isto):
//  - HBXShell.setRota(json)   — substitui o estado inteiro da rota no GPS
//    de fundo. JSON retrocompatível: {"routeId","mode","trackingSessionId",
//    "raioM":60,"paradas":[{"id","nome","lat","lng"}]}.
//  - HBXShell.clearRota()     — desliga o serviço de GPS nativo.
//  - HBXShell.abrirMaps(url)  — abre o Google Maps via Intent nativo.
//  - HBXShell.versao()        — presença/versão da casca (feature-detect).
// Shell → web: document.dispatchEvent(new CustomEvent("hbxshell:chegada",
// { detail: { paradaId } })) — tratado em page.client.tsx.
// ================================================================

interface HBXShellParada {
  id: string;
  nome: string;
  lat: number;
  lng: number;
}

export type HBXShellRouteMode = "ESSENTIAL" | "TRACKED";

interface HBXShellRouteMetadata {
  routeId?: string | null;
  mode?: HBXShellRouteMode | null;
  trackingSessionId?: string | null;
}

interface HBXShellInterface {
  setRota(json: string): void;
  clearRota(): void;
  abrirMaps(url: string): void;
  versao(): string;
}

function getShell(): HBXShellInterface | null {
  if (typeof window === "undefined") return null;
  const shell = (window as unknown as { HBXShell?: HBXShellInterface }).HBXShell;
  return shell ?? null;
}

/** Presença/versão da casca — feature-detect (try/catch → false: interface nativa pode lançar). */
export function shellDisponivel(): boolean {
  try {
    const shell = getShell();
    return typeof shell?.versao === "function";
  } catch {
    return false;
  }
}

/** Substitui o estado inteiro da rota no serviço nativo de GPS. Idempotente. */
export function shellSetRota(
  raioM: number,
  paradas: HBXShellParada[],
  metadata: HBXShellRouteMetadata = {},
): void {
  try {
    const shell = getShell();
    if (!shell) return;
    shell.setRota(JSON.stringify({
      routeId: metadata.routeId ?? undefined,
      mode: metadata.mode ?? undefined,
      trackingSessionId: metadata.trackingSessionId ?? undefined,
      raioM,
      paradas,
    }));
  } catch {
    /* no-op — interface nativa pode lançar */
  }
}

/** Desliga o serviço de GPS nativo. */
export function shellClearRota(): void {
  try {
    getShell()?.clearRota();
  } catch {
    /* no-op */
  }
}

/**
 * Abre o Google Maps via Intent nativo (sem pop-up, sem bloqueador).
 * Retorna true se o shell existe e a chamada não lançou — caller cai no
 * window.open normal quando false.
 */
export function shellAbrirMaps(url: string): boolean {
  try {
    const shell = getShell();
    if (!shell) return false;
    shell.abrirMaps(url);
    return true;
  } catch {
    return false;
  }
}
