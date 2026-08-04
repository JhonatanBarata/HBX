"use client";

import { useSyncExternalStore } from "react";

import { useCurrentUser, currentUserDisplayName } from "@/components/hbx/shell";
import { exitImpersonation, isImpersonating } from "@/lib/impersonation";

import styles from "./impersonation-banner.module.css";

// Snapshot client-only da impersonação por storage. useSyncExternalStore é a via
// sancionada pro SSR: no 1º render do cliente usa o getServerSnapshot (false),
// batendo com o servidor (nada renderizado), e só DEPOIS troca pro valor real do
// cliente — mata o mismatch de hidratação (erro React 418) sem setState em efeito.
// enter/exitImpersonation fazem hard-nav (a página recarrega), então não há mudança
// viva a assinar: subscribe é no-op.
const subscribeNoop = () => () => {};
function useStorageImpersonation(): boolean {
  return useSyncExternalStore(subscribeNoop, () => isImpersonating(), () => false);
}

// MASTER "ENTRAR COMO": faixa global de aviso quando o master está vendo o app
// COMO outro usuário (token de impersonação). A verdade é o backend
// (`impersonatedBy` no /profile/current-user, que vem do claim do token); o slot
// de storage é só o caminho de volta. "Sair" restaura o token do master e volta
// pro /master; se o token guardado sumiu, cai no login pro master reentrar.
export function ImpersonationBanner() {
  const user = useCurrentUser();
  const storageHint = useStorageImpersonation();
  // `user?.impersonatedBy` (backend) é null no 1º render dos dois lados (useState
  // null), então não gera mismatch; o hint de storage passa pelo useSyncExternalStore.
  const active = Boolean(user?.impersonatedBy) || storageHint;
  if (!active) return null;

  const nome = currentUserDisplayName(user);

  function voltar() {
    const restored = exitImpersonation();
    // Navegação dura de propósito: recarrega tudo com o token do master e limpa o
    // cache do /profile/current-user (que é memoizado por carga da página).
    window.location.assign(restored ? "/master" : "/?entrar");
  }

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.label}>
        Você está vendo o app como <span className={styles.who}>{nome}</span>
      </span>
      <button type="button" className={`btn-teal ${styles.exit}`} onClick={voltar}>
        Sair e voltar ao /master
      </button>
    </div>
  );
}
