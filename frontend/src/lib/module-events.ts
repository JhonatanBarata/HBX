"use client";

import { clearApiCache } from "@/app/_lib/api";

export const MODULES_CHANGED_EVENT = "hbx:modules-changed";

export type ModulesChangedDetail = {
  reason?: string;
};

export function dispatchModulesChanged(detail: ModulesChangedDetail = {}) {
  if (typeof window === "undefined") return;
  clearApiCache("/modules/me");
  window.dispatchEvent(new CustomEvent<ModulesChangedDetail>(MODULES_CHANGED_EVENT, { detail }));
}
