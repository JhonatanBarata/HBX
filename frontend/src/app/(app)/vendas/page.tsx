import type { Metadata } from "next";

import { LeadPullProgressOverlay } from "@/components/hbx/lead-pull-progress-overlay";
import { VendasClient } from "./page.client";
import { VendasDetails2Transitions } from "./vendas-details2-transitions";
import { VendasFullscreenBridge } from "./vendas-fullscreen-bridge";

export const metadata: Metadata = { title: "HBX — Vendas / Pipeline" };

export default function VendasPage() {
  return (
    <>
      <VendasClient />
      <VendasFullscreenBridge />
      <VendasDetails2Transitions />
      <LeadPullProgressOverlay />
    </>
  );
}
