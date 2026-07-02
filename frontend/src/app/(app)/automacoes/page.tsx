import type { Metadata } from "next";

import { AutomacoesClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Automações" };

export default function AutomacoesPage() {
  return <AutomacoesClient />;
}
