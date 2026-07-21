"use client";

// S17 (MOTOR-ÚNICO) — /assistente virou alias: o Assistente IA foi fundido na
// seção "Atender sozinho" do hub /automacao, cérebro IA (S13, funde
// bot-atendimento + IA num Atendente único, `?cerebro=ia` sinaliza a intenção
// de abrir já no cérebro de IA). Mesmo padrão de redirect já usado no app
// (leads/redirect.client.tsx): client puro, sem UI, dispara no mount.
//
// ⚠️ Este arquivo é SÓ da rota raiz /assistente (app/(app)/assistente/page.tsx,
// sem subpastas — Next.js só casa aqui pelo pathname exato). O Copiloto
// (leads/[id]/copiloto-panel.tsx, endpoints /assistente/copiloto/*) é feature
// SEPARADA e VIVA, mora em /leads/[id] — nunca passou por aqui e não é afetado.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AssistenteRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/automacao?secao=atendente&cerebro=ia");
  }, [router]);
  return null;
}
