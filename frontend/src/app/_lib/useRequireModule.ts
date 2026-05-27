"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { normalizeUserModuleKey, type UserModule } from "@/lib/hbx-modules";
import { useRequireAuth } from "./useRequireAuth";

type GuardedModuleKey = "vendas" | "atendimento" | "webscraping" | "website";

export function useRequireModule(moduleKey: GuardedModuleKey) {
  const hasToken = useRequireAuth();
  const [moduleAccess, setModuleAccess] = useState<{
    moduleKey: GuardedModuleKey;
    allowed: boolean;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    if (hasToken !== true) {
      return () => {
        mounted = false;
      };
    }

    apiFetch<UserModule[]>("/modules/me")
      .then((modules) => {
        if (!mounted) return;
        const normalizedKey = normalizeUserModuleKey(moduleKey);
        const moduleItem = (Array.isArray(modules) ? modules : []).find(
          (item) => normalizeUserModuleKey(item.key) === normalizedKey,
        );
        setModuleAccess({ moduleKey, allowed: Boolean(moduleItem?.accessible) });
      })
      .catch(() => {
        if (!mounted) return;
        setModuleAccess({ moduleKey, allowed: false });
      });

    return () => {
      mounted = false;
    };
  }, [hasToken, moduleKey]);

  if (hasToken === null) return null;
  if (hasToken === false) return false;
  if (moduleAccess?.moduleKey !== moduleKey) return null;
  return moduleAccess.allowed === true;
}
