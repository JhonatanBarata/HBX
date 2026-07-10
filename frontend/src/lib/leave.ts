"use client";

// Saída de sessão com TRANSIÇÃO (W1/PR10072026, ordem do dono: logout/401
// voltam pra landing sem corte seco). O fade-out vive nos tokens de movimento
// (transitions.css: html.hbx-leaving); a navegação é de DOCUMENTO
// (location.replace) de propósito — assim o boot script da landing roda de
// novo e, onde o navegador suporta, a @view-transition { navigation: auto }
// declarada em transitions.css cruza os dois documentos (o startViewTransition
// same-document não cobre troca de documento — o caminho moderno é esse).
// Sem import de api.ts aqui (api.ts importa daqui — manter sem ciclo).
export function leaveWithFade(destination: string) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (root.classList.contains("hbx-leaving")) return; // já saindo — não empilha
  const go = () => window.location.replace(destination);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    go();
    return;
  }
  root.classList.add("hbx-leaving");
  window.setTimeout(go, 300); // casa com o transition de html.hbx-leaving
}
