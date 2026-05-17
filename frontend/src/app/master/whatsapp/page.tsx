export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
}) {
  redirect(withLegacySearchParams("/master?tab=whatsapp", await searchParams));
}
