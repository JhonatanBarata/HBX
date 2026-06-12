import type { Metadata } from "next";

import { BotClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Construtor de Bot" };

export default function BotPage() {
  return <BotClient />;
}
