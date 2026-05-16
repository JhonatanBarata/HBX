export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";

type LegacyRedirectProps = {
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
};

export default async function Page({ searchParams }: LegacyRedirectProps) {
  const params = await searchParams;
  const tab = Array.isArray(params?.tab) ? params?.tab[0] : params?.tab;
  const mode = Array.isArray(params?.mode) ? params?.mode[0] : params?.mode;
  if (String(tab || "").trim() === "prospeccao" || String(mode || "").trim().toLowerCase() === "mobile") {
    redirect("/vendas");
  }
  redirect(withLegacySearchParams("/vendas/automacao", params));
}
