import type { Metadata } from "next";

import { LoginClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Entrar" };

export default function LoginPage() {
  return <LoginClient />;
}
