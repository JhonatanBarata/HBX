"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getToken } from "./api";

function subscribeAuth(callback: () => void) {
  window.addEventListener("auth-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("auth-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getAuthSnapshot() {
  return Boolean(getToken());
}

function getServerSnapshot(): boolean | null {
  return null;
}

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasToken = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    if (hasToken === false) {
      const query = searchParams.toString();
      const currentPath = `${pathname || ""}${query ? `?${query}` : ""}`;
      const shouldUseMobileLogin =
        String(pathname || "").startsWith("/mobile") ||
        (window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
      const loginPath = shouldUseMobileLogin ? "/mobile/login" : "/login";
      router.push(`${loginPath}?from=${encodeURIComponent(currentPath || "/")}`);
    }
  }, [hasToken, pathname, router, searchParams]);

  return hasToken;
}
