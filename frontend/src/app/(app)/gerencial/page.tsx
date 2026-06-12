import type { Metadata } from "next";

import { GerencialClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Gerencial" };

export default function GerencialPage() {
  return <GerencialClient />;
}
