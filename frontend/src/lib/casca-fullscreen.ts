// ============================================================
// MOBILE-CASCA/W1 — Fullscreen central da casca (Fullscreen API).
//
// LEI nº3 do PLANO: fullscreen existe como OPÇÃO e o AVISO é emitido AO ENTRAR
// (toast central "Tela cheia — deslize a borda de cima pra sair"),
// especialmente no Rota. Exportado pra W5 (Mais/Config) e W6 (Rota) usarem.
//
// Entrar/sair via Fullscreen API com fallbacks de vendor (Safari/iOS antigo
// usa webkit*). Nem todo aparelho suporta (iOS Safari mobile ainda capa o
// requestFullscreen em elementos que não são <video>); por isso tudo é
// try/catch e `isFullscreenSupported()` deixa o chamador esconder a opção.
// ============================================================

import { showCascaToast } from "./casca-toast";

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msFullscreenElement?: Element | null;
  msExitFullscreen?: () => Promise<void> | void;
};

const FULLSCREEN_HINT = "Tela cheia — deslize a borda de cima pra sair";

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
}

export function isFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDocument;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement);
}

/**
 * Entra em tela cheia e SEMPRE emite o aviso central (LEI nº3), mesmo que o
 * aparelho não suporte a API — o usuário precisa saber como voltar. `target`
 * default = documentElement (a casca inteira).
 */
export async function enterCascaFullscreen(target?: HTMLElement): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const el = (target || document.documentElement) as FsElement;
  let ok = false;
  try {
    if (el.requestFullscreen) { await el.requestFullscreen(); ok = true; }
    else if (el.webkitRequestFullscreen) { await el.webkitRequestFullscreen(); ok = true; }
    else if (el.msRequestFullscreen) { await el.msRequestFullscreen(); ok = true; }
  } catch {
    ok = false; // usuário negou ou API indisponível — segue com o aviso
  }
  // Aviso SEMPRE ao entrar (a lei é sobre avisar como sair).
  showCascaToast(FULLSCREEN_HINT);
  return ok;
}

/** Sai de tela cheia (sem toast). */
export async function exitCascaFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const d = document as FsDocument;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    else if (d.msExitFullscreen) await d.msExitFullscreen();
  } catch {
    /* já fora / não suportado */
  }
}

/** Alterna: entra (com aviso) se fora, sai se dentro. Devolve o estado final. */
export async function toggleCascaFullscreen(target?: HTMLElement): Promise<boolean> {
  if (isFullscreenActive()) {
    await exitCascaFullscreen();
    return false;
  }
  await enterCascaFullscreen(target);
  return isFullscreenActive();
}
