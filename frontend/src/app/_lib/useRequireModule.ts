"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "./useRequireAuth";

type GuardedModuleKey = "vendas" | "atendimento" | "webscraping" | "website";

export function useRequireModule(moduleKey: GuardedModuleKey) {
  void moduleKey;
  const hasToken = useRequireAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    setAllowed(hasToken === true);
  }, [hasToken]);

  return hasToken === true && allowed === true;
}
