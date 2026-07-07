"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BloqueioGate } from "@/components/hbx/bloqueio-gate";
import { OobeGate } from "@/components/hbx/oobe-gate";
import { useCurrentUser } from "@/components/hbx/shell";
import { clearToken, getToken } from "@/lib/api";

// Guarda das rotas autenticadas: sem token → /login. Além disso monta o portão
// de boas-vindas (primeiro acesso: troca de senha + tutorial), que se sobrepõe
// ao app até resolver. Regra comercial continua 100% no backend (FRONTEND.md).
export function AuthGate() {
  const router = useRouter();
  // Reusa o fetch cacheado do shell (sem request extra) — só dispara com token.
  const user = useCurrentUser();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    // Empresa removida: usuário NÃO-master sem empresa vinculada = órfão de uma
    // empresa excluída (a relação User→Company zera o companyId no SetNull). Em
    // vez de deixar as telas em 503/zeros, faz saída limpa com aviso no /login.
    // Conservador de propósito: o backend só devolve company:null quando nem o
    // banco nem o JWT têm empresa, então não derruba sessão válida por engano.
    if (user && !user.isSystemMaster && !user.company) {
      try { sessionStorage.setItem("hbx:session-notice", "company-removed"); } catch { /* sem storage */ }
      clearToken();
      router.replace("/login");
    }
  }, [user, router]);

  // O bloqueio (paywall) vem antes; o portão OOBE (primeiro acesso: senha →
  // ramo → modo → tutorial) é renderizado por último para pintar POR CIMA
  // quando os dois coincidirem.
  return (
    <>
      <BloqueioGate />
      <OobeGate />
    </>
  );
}
