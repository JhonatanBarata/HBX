import type { Metadata } from "next";

import { MasterClient } from "./page.client";

export const metadata: Metadata = { title: "Master — HBX" };

export default function MasterPage() {
  return <MasterClient />;
}
