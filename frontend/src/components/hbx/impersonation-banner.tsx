"use client";

import { useCurrentUser, currentUserDisplayName } from "@/components/hbx/shell";
import { exitImpersonation, isImpersonating } from "@/lib/impersonation";

import styles from "./impersonation-banner.module.css";

// MASTER "ENTRAR COMO": faixa global de aviso quando o master está vendo o app
// COMO outro usuário (token de impersonação). A verdade é o backend
// (`impersonatedBy` no /profile/current-user, que vem do claim do token); o slot
// de storage é só o caminho de volta. "Sair" restaura o token do master e volta
// pro /master; se o token guardado sumiu, cai no login pro master reentrar.
export function ImpersonationBanner() {
  const user = useCurrentUser();
  const active = Boolean(user?.impersonatedBy) || isImpersonating();
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
