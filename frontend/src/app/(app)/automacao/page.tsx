import type { Metadata } from "next";
import { Suspense } from "react";

import { AutomacaoHubClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Automação" };

// S12 (MOTOR-ÚNICO) — casca única /automacao: hub por objetivo + painel de
// status. Suspense por causa do useSearchParams (?secao=atendente|cobranca|
// prospeccao|regras — navegação por seção NA MESMA rota, sem sub-rota Next).
export default function AutomacaoPage() {
  return (
    <Suspense fallback={null}>
      <AutomacaoHubClient />
    </Suspense>
  );
}
