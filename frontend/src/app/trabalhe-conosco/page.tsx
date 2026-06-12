import type { Metadata } from "next";

import { TrabalheConoscoClient } from "./page.client";

export const metadata: Metadata = {
  title: "HBX — Trabalhe Conosco",
  description: "Venda com a esteira na mão: leads prontos, WhatsApp integrado e comissão transparente. Candidate-se.",
};

export default function TrabalheConoscoPage() {
  return <TrabalheConoscoClient />;
}
