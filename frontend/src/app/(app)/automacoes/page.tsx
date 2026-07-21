import type { Metadata } from "next";

import { AutomacoesRedirect } from "./redirect.client";

export const metadata: Metadata = { title: "HBX — Automação" };

// S17 (MOTOR-ÚNICO): /automacoes virou alias — a tela real é
// /automacao?secao=prospeccao (Prospecção & Cadência fundidas). Rota mantida
// só como redirect; AutomacoesClient (page.client.tsx) fica intocado e órfão
// até a limpeza da S19 (README "DESCARTAR").
export default function AutomacoesPage() {
  return <AutomacoesRedirect />;
}
