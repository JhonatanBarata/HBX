import { DEFAULT_THEME_SELECTION, type HbxThemeSelection } from "./design-tokens";
import { isHbxThemeId, isHbxThemeMode, type HbxThemeId, type HbxThemeMode } from "./theme-palettes";

export const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
export const HBX_THEME_ID_STORAGE_KEY = "hbx:theme-id";
export const HBX_THEME_MODE_STORAGE_KEY = "hbx:theme-mode";

function normalizeUserId(userId?: string | number | null) {
  return String(userId || "").trim();
}

function buildScopedKey(baseKey: string, userId?: string | number | null) {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
}

function mapLegacyThemeId(value: string | null): HbxThemeId {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "primary" || normalized === "blue" || normalized === "shadcn") {
    return "shadcn";
  }
  if (normalized === "secondary" || normalized === "green" || normalized === "tailadmin") {
    return DEFAULT_THEME_SELECTION.themeId;
  }
  if (normalized === "neutral" || normalized === "slate" || normalized === "grey") {
    return "tabler";
  }
  if (normalized === "pink" || normalized === "mosaic") return "mosaic";
  if (normalized === "flowbite") return DEFAULT_THEME_SELECTION.themeId;
  if (normalized === "tabler") return "tabler";
  return DEFAULT_THEME_SELECTION.themeId;
}

function resolveStoredThemeId(value: string | null): HbxThemeId {
  const normalized = String(value || "").trim().toLowerCase();
  return isHbxThemeId(normalized) ? normalized : mapLegacyThemeId(value);
}

function resolveStoredThemeMode(value: string | null): HbxThemeMode {
  const normalized = String(value || "").trim().toLowerCase();
  return isHbxThemeMode(normalized) ? normalized : DEFAULT_THEME_SELECTION.mode;
}

function getActiveThemeStorageUser(userId?: string | number | null) {
  if (typeof window === "undefined") return normalizeUserId(userId);
  const explicit = normalizeUserId(userId);
  if (explicit) return explicit;

  try {
    return normalizeUserId(localStorage.getItem(ACTIVE_THEME_USER_STORAGE_KEY));
  } catch {
    return "";
  }
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

export function readStoredThemeSelection(userId?: string | number | null): HbxThemeSelection {
  if (typeof window === "undefined") return DEFAULT_THEME_SELECTION;

  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    const themeId = resolveStoredThemeId(
      localStorage.getItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId)) ||
        localStorage.getItem(HBX_THEME_ID_STORAGE_KEY) ||
        localStorage.getItem("theme"),
    );
    const mode = resolveStoredThemeMode(
      localStorage.getItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId)) ||
        localStorage.getItem(HBX_THEME_MODE_STORAGE_KEY) ||
        localStorage.getItem("theme-mode"),
    );
    return { themeId, mode };
  } catch {
    return DEFAULT_THEME_SELECTION;
  }
}

export function persistThemeSelection(
  selection: HbxThemeSelection,
  userId?: string | number | null,
) {
  if (typeof window === "undefined") return;
  const scopedUserId = getActiveThemeStorageUser(userId);
  try {
    localStorage.setItem(HBX_THEME_ID_STORAGE_KEY, selection.themeId);
    localStorage.setItem(HBX_THEME_MODE_STORAGE_KEY, selection.mode);
    localStorage.setItem("theme", selection.themeId);
    localStorage.setItem("theme-mode", selection.mode);
    if (scopedUserId) {
      localStorage.setItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId), selection.themeId);
      localStorage.setItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId), selection.mode);
      localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, scopedUserId);
    }
  } catch {
    // ignore storage errors
  }
}
