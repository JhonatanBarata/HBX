import type { Metadata } from "next";

import { ConfiguracoesClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Configurações" };

export default function ConfiguracoesPage() {
  return <ConfiguracoesClient />;
}
