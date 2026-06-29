"use client";

// Barramento ÚNICO de erros. Qualquer lugar do app — inclusive fora do React,
// como o apiFetch — chama reportError(err) e a falha aparece no popup central,
// sempre com a MESMA cara. Toda mensagem passa pelo tradutor (toFriendlyError).

import { toFriendlyError, type FriendlyError } from "./errors";

type Listener = (e: FriendlyError) => void;
const listeners = new Set<Listener>();

export function onError(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reportError(err: unknown): FriendlyError {
  const friendly = toFriendlyError(err);
  // 401 já tem fluxo próprio (apiFetch redireciona pro /login) — não duplicar popup.
  if (friendly.code !== "AUTH_SESSION_EXPIRED") {
    for (const fn of listeners) {
      try {
        fn(friendly);
      } catch {
        /* listener não pode derrubar o reporte */
      }
    }
  }
  return friendly;
}
