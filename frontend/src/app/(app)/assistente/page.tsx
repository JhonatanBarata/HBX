import type { Metadata } from "next";

import { AssistenteRedirect } from "./redirect.client";

export const metadata: Metadata = { title: "HBX — Automação" };

// S17 (MOTOR-ÚNICO): /assistente virou alias — a tela real é
// /automacao?secao=atendente&cerebro=ia (Atendente, cérebro IA). Rota mantida
// só como redirect; AssistenteClient (page.client.tsx) fica intocado e órfão
// até a limpeza da S19 (README "DESCARTAR"). O Copiloto (leads/[id]) é feature
// separada, não mora nesta pasta — não afetado.
export default function AssistentePage() {
  return <AssistenteRedirect />;
}
