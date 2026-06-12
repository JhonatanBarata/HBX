import type { Metadata } from "next";

import { PlanosClient } from "./page.client";

export const metadata: Metadata = {
  title: "HBX — Planos",
  description: "Comece grátis por 14 dias. Leads qualificados na sua esteira, WhatsApp integrado e recovery para empresas.",
};

export default function PlanosPage() {
  return <PlanosClient />;
}
