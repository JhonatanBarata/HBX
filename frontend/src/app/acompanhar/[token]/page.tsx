import type { Metadata } from "next";

import { AcompanharEntregaClient } from "./page.client";

export const metadata: Metadata = { title: "Acompanhe sua entrega — HBX" };

// F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — link público
// "/acompanhar/<token>" pro cliente final (SEM login). Next 16 devolve
// `params` como Promise em Server Component (mesmo padrão de
// (app)/leads/[id]/page.tsx) — await aqui, passa o token já resolvido pro
// client, que faz o fetch real via GET /public/tracking/:token.
export default async function AcompanharEntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcompanharEntregaClient token={token} />;
}
