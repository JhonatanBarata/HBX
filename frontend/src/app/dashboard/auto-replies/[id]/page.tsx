export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";

type LegacyRedirectProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
};

export default async function Page({ params, searchParams }: LegacyRedirectProps) {
  const resolvedParams = await params;
  const id = encodeURIComponent(String(resolvedParams.id || ""));
  redirect(withLegacySearchParams(`/auto-replies/${id}`, await searchParams));
}