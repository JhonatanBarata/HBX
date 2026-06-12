import type { Metadata } from "next";

import { RegisterClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Criar conta" };

export default function RegisterPage() {
  return <RegisterClient />;
}
