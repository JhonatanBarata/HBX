import type { Metadata } from "next";

import { WebsiteClient } from "./page.client";

export const metadata: Metadata = { title: "Website — HBX" };

export default function WebsitePage() {
  return <WebsiteClient />;
}
