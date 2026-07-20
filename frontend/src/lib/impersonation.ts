"use client";

import { getToken, setToken } from "@/lib/api";

// MASTER "ENTRAR COMO": enquanto o master vê o app "como" um usuário, o token
// ATIVO é o do usuário-alvo. Guardamos o token do MASTER num slot separado do
// localStorage pra o banner "Sair" sempre achar o caminho de volta (sobrevive a
// reload e vale entre abas). Este valor NUNCA é enviado ao servidor — só decide
// qual token está ativo no cliente.
const MASTER_TOKEN_SLOT = "hbx_impersonator_token";

export function getStoredMasterToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(MASTER_TOKEN_SLOT);
  } catch {
    return null;
  }
}

export function isImpersonating(): boolean {
  return Boolean(getStoredMasterToken());
}

/** Guarda o token do master e ativa o token do usuário-alvo. */
export function enterImpersonation(userToken: string) {
  if (typeof window === "undefined") return;
  const master = getToken();
  if (master) {
    try {
      localStorage.setItem(MASTER_TOKEN_SLOT, master);
    } catch {
      /* sem storage — segue sem o atalho de volta (o botão cai no relogin) */
    }
  }
  setToken(userToken);
}

/**
 * Volta a ser o master: restaura o token guardado e limpa o slot. Retorna false
 * quando não há token do master pra restaurar (o chamador então faz o relogin).
 */
export function exitImpersonation(): boolean {
  if (typeof window === "undefined") return false;
  const master = getStoredMasterToken();
  try {
    localStorage.removeItem(MASTER_TOKEN_SLOT);
  } catch {
    /* sem storage */
  }
  if (!master) return false;
  setToken(master);
  return true;
}
