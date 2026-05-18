"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";

const MOBILE_VIEWPORT_QUERY = "(max-width: 820px)";
const MOBILE_REDIRECT_PATHS = new Set([
  "/login",
  "/boasvindas",
  "/boas-vindas",
  "/tutorial",
  "/radar-digital",
  "/vendas",
  "/planos",
]);

export default function MobileRouteRedirector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/mobile") || !MOBILE_REDIRECT_PATHS.has(pathname)) return;
    if (!window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return;

    const query = searchParams.toString();
    router.replace(toMobileRoute(`${pathname}${query ? `?${query}` : ""}`));
  }, [pathname, router, searchParams]);

  return null;
}
