import type { Metadata } from "next";

import { AtendimentoClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Atendimento" };

export default function AtendimentoPage() {
  return <AtendimentoClient />;
}
