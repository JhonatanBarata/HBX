import { redirect } from "next/navigation";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";

export const dynamic = "force-dynamic";

export default async function MasterEmailPage({
  searchParams,
}: {
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
}) {
  redirect(withLegacySearchParams("/master?panel=email", await searchParams));
}
