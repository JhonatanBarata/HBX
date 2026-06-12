import type { Metadata } from "next";

import { MarketingClient } from "./page.client";

export const metadata: Metadata = { title: "HBX System — Sales site" };

export default function Home() {
  return <MarketingClient />;
}
