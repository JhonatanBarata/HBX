import type { Metadata } from "next";

import { RotaSiteClient } from "./page.client";

// PÁGINA DE LOGÍSTICA NO SITE (28/07, PR27072026-ROTA-3-NIVEIS) — rota pública
// canônica do produto Gerenciador de Rota. `/logistica` é o app do tenant
// (grupo `(app)`), por isso a vitrine mora em `/rota` — mesmo nome comercial
// dos planos (Rota Basic / Advanced / Full).
export const metadata: Metadata = {
  title: "HBX Logística — Rota, Prospector e Torre de Controle",
  description: "Organize as entregas, acompanhe cada motorista ao vivo e encontre empresas na sua rota.",
};

export default function RotaPage() {
  return <RotaSiteClient />;
}
