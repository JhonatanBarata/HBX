"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "./api";
import { useRequireAuth } from "./useRequireAuth";
import type { CommercialPlansPayload } from "@/lib/commercial-plans";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";

type GuardedModuleKey = "vendas" | "atendimento" | "webscraping" | "website";

const ENTITLEMENT_BY_MODULE: Partial<Record<GuardedModuleKey, keyof CommercialPlansPayload["current"]["entitlements"]>> = {
  vendas: "vendas",
  atendimento: "atendimento_chat",
  webscraping: "webscraping",
};

function resolveBlockedRedirect(moduleKey: GuardedModuleKey, moduleItem?: UserModule | null) {
  const blockedCode = String(moduleItem?.blockedCode || "").trim().toLowerCase();
  if (blockedCode === "pending_checkout") return "/pagamento?focus=payment&reason=pending_checkout";
  if (moduleKey === "atendimento") return "/planos?intent=atendimento&reason=module_locked";
  if (moduleKey === "webscraping") return "/planos?intent=webscraping&reason=module_locked";
  if (moduleKey === "website") return "/planos?intent=website&reason=module_locked";
  return "/planos?intent=vendas&reason=module_locked";
}

export function useRequireModule(moduleKey: GuardedModuleKey) {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasToken !== true) {
      setAllowed(null);
      return;
    }

    let cancelled = false;
    setAllowed(null);

    Promise.all([
      apiFetch<UserModule[]>("/modules/me"),
      apiFetch<CommercialPlansPayload>("/commercial-plans/me").catch(() => null),
    ])
      .then(([modules, plans]) => {
        if (cancelled) return;
        const normalizedKey = normalizeUserModuleKey(moduleKey);
        const moduleItem = Array.isArray(modules)
          ? modules.find((item) => normalizeUserModuleKey(item.key) === normalizedKey)
          : null;
        const entitlementKey = ENTITLEMENT_BY_MODULE[moduleKey];
        const entitlementActive = entitlementKey
          ? Boolean(plans?.current?.entitlements?.[entitlementKey])
          : false;
        const canAccess = Boolean(moduleItem?.accessible || entitlementActive);
        setAllowed(canAccess);
        if (!canAccess) {
          router.replace(resolveBlockedRedirect(moduleKey, moduleItem));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAllowed(false);
        router.replace("/planos?reason=module_locked");
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken, moduleKey, router]);

  return hasToken === true && allowed === true;
}
