import type { Metadata } from "next";

import { RotaSiteClient } from "./page.client";

// PÁGINA DE LOGÍSTICA NO SITE (28/07, PR27072026-ROTA-3-NIVEIS) — rota pública
// canônica do produto Gerenciador de Rota. `/logistica` é o app do tenant
// (grupo `(app)`), por isso a vitrine mora em `/rota` — mesmo nome comercial
// dos planos (Rota Basic / Advanced / Full).
export const metadata: Metadata = {
  title: "Gerenciador de Rota — HBX Logística para distribuidoras",
  description:
    "Agenda por cliente, rota do dia em um clique, recebimento na porta, cobrança automática no WhatsApp e rastreamento ao vivo. Para distribuidora de água e gás.",
};

export default function RotaPage() {
  return <RotaSiteClient />;
}
