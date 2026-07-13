"use client";

import { useSyncExternalStore } from "react";

export type MobileCallMode = "mobile" | "local";

const KEY = "hbx:mobile-call-mode";
const EVENT = "hbx:mobile-call-mode-changed";
const DEFAULT: MobileCallMode = "local";

export function getMobileCallMode(): MobileCallMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return localStorage.getItem(KEY) === "mobile" ? "mobile" : "local";
  } catch {
    return DEFAULT;
  }
}

export function setMobileCallMode(mode: MobileCallMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* sem storage */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode } })); } catch { /* */ }
}

function subscribe(cb: () => void) {
  const custom = () => cb();
  const storage = (event: StorageEvent) => { if (event.key === KEY) cb(); };
  window.addEventListener(EVENT, custom);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, custom);
    window.removeEventListener("storage", storage);
  };
}

export function useMobileCallMode(): MobileCallMode {
  return useSyncExternalStore(subscribe, getMobileCallMode, () => DEFAULT);
}
