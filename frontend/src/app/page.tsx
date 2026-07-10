import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicEntry } from "@/components/hbx/public-entry";

export const metadata: Metadata = {
  title: "HBX System — Prospecção conectada",
  description: "Radar, vendas, WhatsApp, entrega e cobrança em uma única esteira.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.ver === "string" ? params.ver : null;
  if (view === "planos") redirect("/register");
  if (view === "entrar") redirect("/login");
  return <PublicEntry />;
}
