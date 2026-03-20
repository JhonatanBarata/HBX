"use client";

import React from "react";
import {
  DEFAULT_THEME_SELECTION,
  applyThemeSelectionToDocument,
  type HbxThemeSelection,
} from "@/lib/design-tokens";
import { HBX_THEME_PALETTES, type HbxThemeId, type HbxThemeMode } from "@/lib/theme-palettes";
import {
  HBX_THEME_ID_STORAGE_KEY,
  HBX_THEME_MODE_STORAGE_KEY,
  persistThemeSelection,
  readStoredThemeSelection,
  setActiveThemeUser,
} from "@/lib/theme-preferences";

type ThemeContextValue = {
  selection: HbxThemeSelection;
  activeTheme: (typeof HBX_THEME_PALETTES)[HbxThemeId];
  storageUserId: string | number | null;
  ready: boolean;
  setThemeId: (themeId: HbxThemeId) => void;
  setMode: (mode: HbxThemeMode) => void;
  setSelection: (selection: HbxThemeSelection) => void;
  setStorageUserId: (userId: string | number | null) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [storageUserId, setStorageUserIdState] = React.useState<string | number | null>(null);
  const [selection, setSelectionState] =
    React.useState<HbxThemeSelection>(DEFAULT_THEME_SELECTION);
  const [ready, setReady] = React.useState(false);

  const applySelection = React.useCallback(
    (nextSelection: HbxThemeSelection, nextUserId: string | number | null = storageUserId) => {
      setSelectionState(nextSelection);
      applyThemeSelectionToDocument(nextSelection);
      persistThemeSelection(nextSelection, nextUserId);
    },
    [storageUserId],
  );

  const syncFromStorage = React.useEffectEvent((nextUserId?: string | number | null) => {
    const nextSelection = readStoredThemeSelection(nextUserId ?? storageUserId);
    setSelectionState(nextSelection);
    applyThemeSelectionToDocument(nextSelection);
    setReady(true);
  });

  React.useEffect(() => {
    syncFromStorage(storageUserId);
  }, [storageUserId]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key &&
        !event.key.startsWith(HBX_THEME_ID_STORAGE_KEY) &&
        !event.key.startsWith(HBX_THEME_MODE_STORAGE_KEY) &&
        event.key !== "theme" &&
        event.key !== "theme-mode"
      ) {
        return;
      }
      syncFromStorage(storageUserId);
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [storageUserId]);

  const setThemeId = React.useCallback(
    (themeId: HbxThemeId) => {
      applySelection({ themeId, mode: selection.mode });
    },
    [applySelection, selection.mode],
  );

  const setMode = React.useCallback(
    (mode: HbxThemeMode) => {
      applySelection({ themeId: selection.themeId, mode });
    },
    [applySelection, selection.themeId],
  );

  const setSelection = React.useCallback(
    (nextSelection: HbxThemeSelection) => {
      applySelection(nextSelection);
    },
    [applySelection],
  );

  const setStorageUserId = React.useCallback((userId: string | number | null) => {
    setStorageUserIdState(userId);
    setActiveThemeUser(userId);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      selection,
      activeTheme: HBX_THEME_PALETTES[selection.themeId],
      storageUserId,
      ready,
      setThemeId,
      setMode,
      setSelection,
      setStorageUserId,
    }),
    [ready, selection, setMode, setSelection, setStorageUserId, setThemeId, storageUserId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useHbxTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useHbxTheme must be used inside ThemeProvider.");
  }
  return context;
}
