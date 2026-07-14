import type { Metadata } from "next";

import { LeadRunClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Busca em andamento" };

export default async function LeadRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <LeadRunClient runId={runId} />;
}
