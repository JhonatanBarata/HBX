import type { Metadata } from "next";

import { BotRedirect } from "./redirect.client";

export const metadata: Metadata = { title: "HBX — Automação" };

// S17 (MOTOR-ÚNICO): /bot virou alias — a tela real é /automacao?secao=atendente
// (Atendente: Roteiro OU IA, fundidos). Rota mantida só como redirect;
// BotClient (page.client.tsx) fica intocado e órfão até a limpeza da S19
// (README "DESCARTAR").
export default function BotPage() {
  return <BotRedirect />;
}
