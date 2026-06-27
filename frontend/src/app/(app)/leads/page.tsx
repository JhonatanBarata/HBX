import type { Metadata } from "next";

import { LeadsRedirect } from "./redirect.client";

export const metadata: Metadata = { title: "HBX — Vendas" };

// Rota legada: o Radar agora é o modo "Buscar empresas" dentro de /vendas.
// Mantida só como alias que redireciona (LeadsClient vive embutido no Vendas).
export default function LeadsPage() {
  return <LeadsRedirect />;
}
