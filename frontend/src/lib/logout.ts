"use client";

// Logout ÚNICO do app (W1/PR10072026) — todos os pontos de "Sair" passam por
// aqui: POST /auth/logout best-effort → limpa o cliente → transição de saída →
// landing ("/" por padrão; passe "/?entrar" quando a intenção é logar de novo).
// Antes eram 5 cópias com corte seco pro /login (que morreu como tela).

import { apiFetch, clearToken } from "@/lib/api";
import { leaveWithFade } from "@/lib/leave";

let signingOut = false;

export async function logout(destination: string = "/") {
  if (signingOut) return;
  signingOut = true;
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // sessão já inválida — segue limpando o cliente
  }
  clearToken();
  try { localStorage.removeItem("hbx:brain:session-start"); } catch { /* sem storage */ }
  leaveWithFade(destination);
  // signingOut fica true de propósito: a navegação de documento recomeça o módulo.
}
