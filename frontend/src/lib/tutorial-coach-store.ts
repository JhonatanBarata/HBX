"use client";

// Store mínima (external store p/ useSyncExternalStore) que liga/desliga o tour
// guiado. O coach VIVE no app-shell (persistente entre rotas), então a /tutorial
// só dispara `startTutorialCoach()` depois do boot e o tour sobrevive à navegação
// (clicar em Leads/Vendas/Atendimento muda a rota, mas o coach continua).
//
// DOIS modos (14/06 → desmembrado por módulo): sem argumento = TOUR COMPLETO
// (primeiro acesso, passa por todas as telas). Com um `tourId` (ex.: "leads") =
// TOUR DAQUELE MÓDULO só — disparado pelo botão "Como usar" da própria tela.

let active = false;
let tourId: string | null = null;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

// id null = tour completo (primeiro acesso). id = "leads"/"vendas"/… = tour do
// módulo. Não tem mais guarda `if (active) return`: clicar "Como usar" troca o
// tour em andamento em vez de ser ignorado.
export function startTutorialCoach(id: string | null = null) {
  active = true;
  tourId = id;
  emit();
}

export function stopTutorialCoach() {
  if (!active) return;
  active = false;
  tourId = null;
  emit();
}

export function subscribeTutorialCoach(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getTutorialCoachActive() {
  return active;
}

export function getTutorialCoachTour() {
  return tourId;
}
