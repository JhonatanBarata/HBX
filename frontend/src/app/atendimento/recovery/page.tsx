export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

export default async function AtendimentoRecoveryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const params = new URLSearchParams();
  params.set("atendimentoTab", "recovery");
  const recoveryTab = resolvedSearchParams.tab;
  const normalizedRecoveryTab = Array.isArray(recoveryTab) ? recoveryTab[0] : recoveryTab;
  if (normalizedRecoveryTab) {
    params.set("recoveryTab", normalizedRecoveryTab);
  }
  redirect(`/atendimento?${params.toString()}`);
}