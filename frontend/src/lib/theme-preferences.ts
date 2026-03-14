import { HBX_INTENSITY_DEFAULT, buildHbxIntensityStorageKey } from "./hbx-window-system";

export const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
export const DEFAULT_THEME_STRENGTH = HBX_INTENSITY_DEFAULT;

export function clampThemeStrength(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_THEME_STRENGTH;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export function setActiveThemeUser(userId?: string | number | null) {
  if (typeof window === "undefined") return;
  try {
    const normalized = String(userId || "").trim();
    if (normalized) {
      localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, normalized);
      return;
    }
    localStorage.removeItem(ACTIVE_THEME_USER_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function readStoredThemeStrength() {
  if (typeof window === "undefined") return DEFAULT_THEME_STRENGTH;
  try {
    const activeUserId = localStorage.getItem(ACTIVE_THEME_USER_STORAGE_KEY);
    if (activeUserId) {
      const userSpecificValue = localStorage.getItem(buildHbxIntensityStorageKey(activeUserId));
      if (userSpecificValue !== null) return clampThemeStrength(userSpecificValue);
    }
    const globalValue = localStorage.getItem("theme-strength");
    if (globalValue !== null) return clampThemeStrength(globalValue);
  } catch {
    // ignore storage errors
  }
  return DEFAULT_THEME_STRENGTH;
}

export function persistThemeStrength(value: number, userId?: string | number | null) {
  if (typeof window === "undefined") return;
  const safeStrength = clampThemeStrength(value);
  try {
    localStorage.setItem("theme-strength", String(safeStrength));
    const normalized = String(userId || "").trim();
    if (normalized) {
      localStorage.setItem(buildHbxIntensityStorageKey(normalized), String(safeStrength));
      localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, normalized);
    }
  } catch {
    // ignore storage errors
  }
}
