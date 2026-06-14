"use client";

// Store mínima (external store p/ useSyncExternalStore) que liga/desliga o tour
// guiado. O coach VIVE no app-shell (persistente entre rotas), então a /tutorial
// só dispara `startTutorialCoach()` depois do boot e o tour sobrevive à navegação
// (clicar em Leads/Vendas/Atendimento muda a rota, mas o coach continua).

let active = false;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export function startTutorialCoach() {
  if (active) return;
  active = true;
  emit();
}

export function stopTutorialCoach() {
  if (!active) return;
  active = false;
  emit();
}

export function subscribeTutorialCoach(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getTutorialCoachActive() {
  return active;
}
