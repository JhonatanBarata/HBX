import type { Metadata } from "next";

import { RelatoriosClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Relatórios" };

export default function RelatoriosPage() {
  return <RelatoriosClient />;
}
