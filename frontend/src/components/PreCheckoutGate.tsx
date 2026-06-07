"use client";

import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { apiFetch, getToken } from "@/app/_lib/api";
import { buildPreCheckoutPath, resolvePreCheckoutReason, type BillingAccessCompany } from "@/lib/billing-access";

type CurrentUser = {
  isSystemMaster?: boolean | null;
  company?: BillingAccessCompany | null;
};

const PUBLIC_OR_BILLING_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/reset-password",
  "/confirm-email",
  "/hbx-vendedor/onboarding",
  "/pre-checkout",
  "/precheckout",
  "/pagamento",
  "/checkout",
]);

function normalizePath(pathname: string | null) {
  return String(pathname || "/").replace(/\/+$/, "") || "/";
}

function isBypassedPath(pathname: string | null) {
  const path = normalizePath(pathname);
  if (PUBLIC_OR_BILLING_PATHS.has(path)) return true;
  if (path.startsWith("/master")) return true;
  if (path.startsWith("/dashboard/master")) return true;
  if (path.startsWith("/api")) return true;
  return false;
}

export default function PreCheckoutGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    async function checkBillingAccess() {
      if (isBypassedPath(pathname) || !getToken()) {
        if (active) {
          setBlocked(false);
        }
        return;
      }

      try {
        const profile = await apiFetch<CurrentUser>("/profile/current-user");
        if (!active) return;

        if (profile?.isSystemMaster) {
          setBlocked(false);
          return;
        }

        const reason = resolvePreCheckoutReason(profile?.company);
        if (!reason) {
          setBlocked(false);
          return;
        }

        setBlocked(true);
        const current = typeof window === "undefined"
          ? normalizePath(pathname)
          : `${window.location.pathname}${window.location.search}`;
        const destination = `${buildPreCheckoutPath(reason)}&from=${encodeURIComponent(current)}`;
        router.replace(destination);
      } catch {
        if (active) setBlocked(false);
      }
    }

    void checkBillingAccess();

    const interval = window.setInterval(() => {
      void checkBillingAccess();
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pathname, router]);

  if (blocked) return null;

  return <>{children}</>;
}
