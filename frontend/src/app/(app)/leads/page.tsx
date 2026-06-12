import type { Metadata } from "next";

import { LeadsClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Leads" };

export default function LeadsPage() {
  return <LeadsClient />;
}
