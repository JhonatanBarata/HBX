"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type CurrentUserPayload = {
  role?: string | null;
  isSystemMaster?: boolean | null;
};

type RadarDigitalDesktopGateProps = {
  adminHref: string;
  sellerHref: string;
};

export default function RadarDigitalDesktopGate({
  adminHref,
  sellerHref,
}: RadarDigitalDesktopGateProps) {
  const router = useRouter();
  const hasToken = useRequireAuth();

  useEffect(() => {
    if (hasToken !== true) return;
    let alive = true;

    apiFetch<CurrentUserPayload>("/profile/current-user", { requireAuth: true })
      .then((profile) => {
        if (!alive) return;
        const role = String(profile?.role || "").trim().toUpperCase();
        const sellerUser = role === "USER" && !profile?.isSystemMaster;
        router.replace(sellerUser ? sellerHref : adminHref);
      })
      .catch(() => {
        if (alive) router.replace(sellerHref);
      });

    return () => {
      alive = false;
    };
  }, [adminHref, hasToken, router, sellerHref]);

  return null;
}
