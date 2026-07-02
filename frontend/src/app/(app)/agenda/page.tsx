import type { Metadata } from "next";

import { AgendaClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Agenda" };

export default function AgendaPage() {
  return <AgendaClient />;
}
