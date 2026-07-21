"use client";

// S17 (MOTOR-ÚNICO) — /bot virou alias: o "Construtor de Bot" foi fundido na
// seção "Atender sozinho" do hub /automacao (S13, funde bot-atendimento + IA
// num Atendente único). Mesmo padrão de redirect já usado no app
// (leads/redirect.client.tsx): client puro, sem UI, dispara no mount.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BotRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/automacao?secao=atendente");
  }, [router]);
  return null;
}
