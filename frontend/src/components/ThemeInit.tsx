"use client";

import { useEffect } from "react";
import { applyThemeSelectionToDocument } from "@/lib/design-tokens";
import {
  HBX_THEME_ID_STORAGE_KEY,
  HBX_THEME_MODE_STORAGE_KEY,
  readStoredThemeSelection,
} from "@/lib/theme-preferences";

export default function ThemeInit() {
  useEffect(() => {
    applyThemeSelectionToDocument(readStoredThemeSelection());

    const syncTheme = (event: StorageEvent) => {
      if (
        event.key &&
        !event.key.startsWith(HBX_THEME_ID_STORAGE_KEY) &&
        !event.key.startsWith(HBX_THEME_MODE_STORAGE_KEY) &&
        event.key !== "theme" &&
        event.key !== "theme-mode"
      ) {
        return;
      }
      applyThemeSelectionToDocument(readStoredThemeSelection());
    };

    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  return null;
}
