"use client";

// S17 (MOTOR-ÚNICO) — /automacoes virou alias: cadências/gatilhos/rotinas
// foram fundidos na seção "Buscar clientes" do hub /automacao (S15, Prospecção
// & Cadência). Mesmo padrão de redirect já usado no app
// (leads/redirect.client.tsx): client puro, sem UI, dispara no mount.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutomacoesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/automacao?secao=prospeccao");
  }, [router]);
  return null;
}
