export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import VendasAutomationClientPage from "./page.client";

type VendasAutomationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function Page({ searchParams }: VendasAutomationPageProps) {
  const params = await searchParams;
  const tab = Array.isArray(params?.tab) ? params?.tab[0] : params?.tab;
  const mode = Array.isArray(params?.mode) ? params?.mode[0] : params?.mode;
  if (String(tab || "").trim() === "prospeccao" || String(mode || "").trim().toLowerCase() === "mobile") {
    redirect("/vendas");
  }

  return <VendasAutomationClientPage />;
}
