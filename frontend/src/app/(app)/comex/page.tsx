import type { Metadata } from "next";

import { ComexClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Comex" };

export default function ComexPage() {
  return <ComexClient />;
}
