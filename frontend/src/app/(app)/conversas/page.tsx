import type { Metadata } from "next";

import { AtendimentoClient } from "../atendimento/page.client";

export const metadata: Metadata = { title: "HBX — Conversas" };

// URL canônica da caixa de conversas. A implementação permanece única no
// AtendimentoClient para não duplicar estado, regras ou integrações.
export default function ConversasPage() {
  return <AtendimentoClient />;
}
