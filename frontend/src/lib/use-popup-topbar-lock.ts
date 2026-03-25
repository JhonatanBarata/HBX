"use client";

import { useEffect } from "react";
import { acquirePopupTopbarLock } from "./popup-visibility";

export function usePopupTopbarLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquirePopupTopbarLock();
  }, [active]);
}
