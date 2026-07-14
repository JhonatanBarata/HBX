import type { Metadata } from "next";

import { LogisticaTrackingLiveClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Logística · Rastreamento ao vivo" };

export default function LogisticaTrackingLivePage() {
  return <LogisticaTrackingLiveClient />;
}
