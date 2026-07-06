import type { Metadata } from "next";

import { LeadDetailClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Lead" };

// Rota NET-NEW (LEADS-FINAL/02, 06/07): página cheia do lead em 3 colunas
// (Detalhes | Anotações/WhatsApp | Dados da empresa). Next 16 devolve `params`
// como Promise em Server Component — await aqui e passa o id já resolvido
// pro client (que faz o fetch real via GET /webscraping/radar/leads/:id).
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetailClient leadId={id} />;
}
