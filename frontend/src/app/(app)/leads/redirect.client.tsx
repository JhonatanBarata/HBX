"use client";

// /leads não é mais tela separada (27/06): o Radar virou o modo "Buscar empresas"
// DENTRO do Vendas. Esta rota só redireciona pra lá, já abrindo no modo buscar
// (flag em sessionStorage que o VendasClient consome no mount). "Sem legado":
// a tela velha vira alias. O componente <LeadsClient> segue vivo, embutido no Vendas.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LeadsRedirect() {
  const router = useRouter();
  useEffect(() => {
    try { sessionStorage.setItem("hbx:vendas-modo", "buscar"); } catch { /* sem storage */ }
    router.replace("/vendas");
  }, [router]);
  return null;
}
