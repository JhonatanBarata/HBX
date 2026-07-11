import type { Metadata } from "next";

import { ConciergeClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Concierge IA" };

export default function ConciergePage() {
  return <ConciergeClient />;
}
