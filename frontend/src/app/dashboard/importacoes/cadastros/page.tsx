export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";

type LegacyRedirectProps = {
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
};

export default async function Page({ searchParams }: LegacyRedirectProps) {
  redirect(withLegacySearchParams("/importacoes/cadastros", await searchParams));
}