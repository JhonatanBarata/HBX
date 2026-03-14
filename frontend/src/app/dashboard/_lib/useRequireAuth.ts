"use client";

import { useRouter } from "next/navigation";
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
  const hasToken = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    if (hasToken === false) {
      router.push("/login");
    }
  }, [hasToken, router]);

  return hasToken;
}
