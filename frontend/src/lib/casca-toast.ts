// ============================================================
// MOBILE-CASCA/W1 — Toast central da casca.
//
// Store mínima (padrão do app: subscribe + snapshot) para um toast único e
// central. Qualquer parte da casca dispara `showCascaToast("...")`; o host
// (<CascaToastHost/>, montado 1× dentro da MobileShell) renderiza e some
// sozinho. É a base do aviso de fullscreen (LEI nº3 do PLANO), mas serve pra
// qualquer aviso curto da casca.
// ============================================================

import { useSyncExternalStore } from "react";

type ToastState = { id: number; message: string } | null;

let current: ToastState = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Mostra um toast central por `ms` (default 3200ms). Substitui o anterior. */
export function showCascaToast(message: string, ms = 3200) {
  if (timer) clearTimeout(timer);
  current = { id: Date.now(), message };
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, ms);
}

/** Fecha o toast agora (ex.: usuário navegou). */
export function dismissCascaToast() {
  if (timer) { clearTimeout(timer); timer = null; }
  current = null;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): ToastState {
  return current;
}
function getServerSnapshot(): ToastState {
  return null;
}

export function useCascaToast(): ToastState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
