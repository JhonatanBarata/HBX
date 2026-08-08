import type { Metadata } from "next";

import { RotaSiteClient } from "./page.client";

// PÁGINA DE LOGÍSTICA NO SITE (28/07, PR27072026-ROTA-3-NIVEIS) — rota pública
// canônica do produto Gerenciador de Rota. `/logistica` é o app do tenant
// (grupo `(app)`), por isso a vitrine mora em `/rota` — mesmo nome comercial
// dos planos (Rota Basic / Advanced / Full).
export const metadata: Metadata = {
  title: "HBX Logística — Rota e Prospector",
  description: "Organize as entregas, navegue e encontre empresas na sua rota.",
};

export default function RotaPage() {
  return <RotaSiteClient />;
}
