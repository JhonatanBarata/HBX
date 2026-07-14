import type { Metadata } from "next";

import { VendasClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Vendas / Pipeline" };

export default function VendasPage() {
  return <VendasClient />;
}
