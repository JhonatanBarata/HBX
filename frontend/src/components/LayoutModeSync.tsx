"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MOBILE_THEME_STORAGE_KEY = "hbx-mobile-theme";

function normalizeMobileTheme(value: unknown) {
  return value === "light" ? "light" : "dark";
}

function applyLayoutMode(pathname: string | null) {
  if (typeof document === "undefined") return;

  const isMobileLayout = String(pathname || "").startsWith("/mobile");
  const root = document.documentElement;

  root.dataset.hbxLayout = isMobileLayout ? "mobile" : "desktop";

  if (!isMobileLayout) {
    delete root.dataset.hbxMobileTheme;
    return;
  }

  try {
    root.dataset.hbxMobileTheme = normalizeMobileTheme(
      window.localStorage.getItem(MOBILE_THEME_STORAGE_KEY),
    );
  } catch {
    root.dataset.hbxMobileTheme = "dark";
  }
}

export default function LayoutModeSync() {
  const pathname = usePathname();

  useEffect(() => {
    applyLayoutMode(pathname);
  }, [pathname]);

  return null;
}
