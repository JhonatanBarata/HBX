import type { Metadata } from "next";
import { headers } from "next/headers";

import { LeadPullProgressOverlay } from "@/components/hbx/lead-pull-progress-overlay";
import { VendasClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Vendas / Pipeline" };

export default async function VendasPage() {
  const requestHeaders = await headers();
  const hostHeader = (requestHeaders.get("host") || "").toLowerCase();
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.split(":")[0];
  const statusPreviewAvailable = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return (
    <>
      <VendasClient statusPreviewAvailable={statusPreviewAvailable} />
      <LeadPullProgressOverlay />
    </>
  );
}
