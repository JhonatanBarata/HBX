"use client";

import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { apiFetch, getToken } from "@/app/_lib/api";
import { buildPreCheckoutPath, resolvePreCheckoutReason, type BillingAccessCompany } from "@/lib/billing-access";
import CompanyAccessPausedScreen from "@/components/CompanyAccessPausedScreen";

type CurrentUser = {
  isSystemMaster?: boolean | null;
  userKind?: string | null;
  company?: BillingAccessCompany | null;
};

// Cobrança é assunto exclusivo do contratante: só ADMIN pode ser
// redirecionado para pre-checkout/pagamento. Funcionário/vendedor com
// empresa irregular vê bloqueio neutro, sem informação financeira.
type GateState = "open" | "billing_redirect" | "access_paused";

function isBillingAudience(profile?: CurrentUser | null) {
  return String(profile?.userKind || "").trim().toLowerCase() === "admin";
}

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
  const [gateState, setGateState] = React.useState<GateState>("open");

  React.useEffect(() => {
    let active = true;

    async function checkBillingAccess() {
      if (isBypassedPath(pathname) || !getToken()) {
        if (active) {
          setGateState("open");
        }
        return;
      }

      try {
        const profile = await apiFetch<CurrentUser>("/profile/current-user");
        if (!active) return;

        if (profile?.isSystemMaster) {
          setGateState("open");
          return;
        }

        const reason = resolvePreCheckoutReason(profile?.company);
        if (!reason) {
          setGateState("open");
          return;
        }

        if (!isBillingAudience(profile)) {
          setGateState("access_paused");
          return;
        }

        setGateState("billing_redirect");
        const current = typeof window === "undefined"
          ? normalizePath(pathname)
          : `${window.location.pathname}${window.location.search}`;
        const destination = `${buildPreCheckoutPath(reason)}&from=${encodeURIComponent(current)}`;
        router.replace(destination);
      } catch {
        if (active) setGateState("open");
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

  if (gateState === "access_paused") return <CompanyAccessPausedScreen />;
  if (gateState === "billing_redirect") return null;

  return <>{children}</>;
}
