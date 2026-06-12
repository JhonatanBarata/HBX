import type { Metadata } from "next";

import { WebscrapingClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Radar" };

export default function WebscrapingPage() {
  return <WebscrapingClient />;
}
