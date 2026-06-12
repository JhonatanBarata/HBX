import type { Metadata } from "next";

import { DashboardClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Dashboard" };

export default function DashboardPage() {
  return <DashboardClient />;
}
