"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import { useRequireAuth } from "./useRequireAuth";

type GuardedModuleKey = "vendas" | "atendimento" | "webscraping" | "website";

export function useRequireModule(moduleKey: GuardedModuleKey) {
  const hasToken = useRequireAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    if (hasToken !== true) {
      setAllowed(hasToken === false ? false : null);
      return () => {
        mounted = false;
      };
    }

    setAllowed(null);
    apiFetch<UserModule[]>("/modules/me")
      .then((modules) => {
        if (!mounted) return;
        const normalizedKey = normalizeUserModuleKey(moduleKey);
        const moduleItem = (Array.isArray(modules) ? modules : []).find(
          (item) => normalizeUserModuleKey(item.key) === normalizedKey,
        );
        setAllowed(Boolean(moduleItem?.accessible));
      })
      .catch(() => {
        if (!mounted) return;
        setAllowed(false);
      });

    return () => {
      mounted = false;
    };
  }, [hasToken, moduleKey]);

  if (hasToken === null || (hasToken === true && allowed === null)) return null;
  return hasToken === true && allowed === true;
}
