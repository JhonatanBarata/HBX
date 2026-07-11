import type { Metadata } from "next";

import { FinanceiroClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Financeiro" };

export default function FinanceiroPage() {
  return <FinanceiroClient />;
}
