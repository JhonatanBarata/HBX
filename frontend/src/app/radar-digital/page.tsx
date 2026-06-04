export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { withLegacySearchParams, type LegacySearchParams } from "@/app/_lib/legacyRedirect";
import RadarDigitalDesktopGate from "./DesktopGate";

type RadarRedirectProps = {
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
};

export default async function Page({ searchParams }: RadarRedirectProps) {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") || "";
  const clientHintsMobile = requestHeaders.get("sec-ch-ua-mobile") || "";
  const mobileRequest = clientHintsMobile.includes("?1") || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const resolvedSearchParams = await searchParams;
  if (mobileRequest) {
    redirect(withLegacySearchParams("/mobile/radar-digital", resolvedSearchParams));
  }
  return (
    <RadarDigitalDesktopGate
      adminHref={withLegacySearchParams("/boasvindas?radar=1", resolvedSearchParams)}
      sellerHref={withLegacySearchParams("/vendas?radar=blocked", resolvedSearchParams)}
    />
  );
}
