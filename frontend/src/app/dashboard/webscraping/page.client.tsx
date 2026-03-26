"use client";

import { useEffect } from "react";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

const WEBSCRAPING_BASE_URL = "https://hbx-webscraping.onrender.com/";

type CurrentUser = {
  username?: string | null;
  name?: string | null;
  company?: { name?: string | null } | null;
  masterContext?: {
    active?: boolean;
    companyName?: string | null;
  } | null;
};

export default function WebscrapingClientPage() {
  const hasToken = useRequireAuth();

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    (async () => {
      try {
        const currentUser = await apiFetch<CurrentUser>("/profile/current-user");
        if (cancelled) return;

        const params = new URLSearchParams();
        const userName = String(currentUser.username || currentUser.name || "").trim();
        const companyName = String(
          (currentUser.masterContext?.active
            ? currentUser.masterContext.companyName
            : currentUser.company?.name) || currentUser.company?.name || "",
        ).trim();

        if (userName) {
          params.set("user_name", userName);
        }

        if (companyName) {
          params.set("company_name", companyName);
        }

        const targetUrl = params.size
          ? `${WEBSCRAPING_BASE_URL}?${params.toString()}`
          : WEBSCRAPING_BASE_URL;

        window.location.replace(targetUrl);
      } catch {
        if (!cancelled) {
          window.location.replace(WEBSCRAPING_BASE_URL);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  return null;
}
