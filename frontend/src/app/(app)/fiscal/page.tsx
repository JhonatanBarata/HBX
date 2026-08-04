import type { Metadata } from "next";

import { FiscalClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Fiscal" };

export default function FiscalPage() {
  return <FiscalClient />;
}
