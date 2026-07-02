import type { Metadata } from "next";

import { AssistenteClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Assistente IA" };

export default function AssistentePage() {
  return <AssistenteClient />;
}
