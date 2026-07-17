import type { Metadata } from "next";

import { LeadPullProgressOverlay } from "@/components/hbx/lead-pull-progress-overlay";
import { VendasClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Vendas / Pipeline" };

export default function VendasPage() {
  return (
    <>
      <VendasClient />
      <LeadPullProgressOverlay />
    </>
  );
}
