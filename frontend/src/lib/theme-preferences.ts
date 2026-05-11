import {
  buildThemeAppearanceDefaults,
  DEFAULT_THEME_SELECTION,
  DEFAULT_THEME_MOTION_STYLE,
  mergeThemeConfigChain,
  resolveThemeConfig,
  sanitizeThemeConfig,
  type HbxThemeConfig,
  type HbxThemeSelection,
} from "./design-tokens";
import { HBX_THEME_IDS, isHbxThemeId, isHbxThemeMode, type HbxThemeId, type HbxThemeMode } from "./theme-palettes";

export const ACTIVE_THEME_USER_STORAGE_KEY = "hbx:active-user-id";
export const HBX_THEME_ID_STORAGE_KEY = "hbx:theme-id";
export const HBX_THEME_MODE_STORAGE_KEY = "hbx:theme-mode";
export const HBX_THEME_CONFIG_STORAGE_KEY = "hbx:theme-config";
export const HBX_THEME_RESOLVED_CONFIG_STORAGE_KEY = "hbx:theme-resolved-config";
export const HBX_THEME_COOKIE_ID = "hbx-theme-id";
export const HBX_THEME_COOKIE_MODE = "hbx-theme-mode";

const THEME_APPEARANCE_KEYS = [
  "brand",
  "buttonPrimary",
  "buttonSecondary",
  "buttonSuccess",
  "buttonAccent",
  "selectionAccent",
  "menuActive",
  "menuInactive",
  "menuDisabled",
] as const satisfies ReadonlyArray<keyof NonNullable<HbxThemeConfig["appearance"]>>;

function normalizeUserId(userId?: string | number | null) {
  return String(userId || "").trim();
}

function buildScopedKey(baseKey: string, userId?: string | number | null) {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
}

function mapLegacyThemeId(value: string | null): HbxThemeId {
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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.*+?^${}()|[\\]\\])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string | null, days = 365) {
  if (typeof document === "undefined") return;
  try {
    if (value === null) {
      document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
      return;
    }
    const maxAge = days ? `; max-age=${Math.max(0, Math.trunc(days * 24 * 60 * 60))}` : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${maxAge}; SameSite=Lax`;
  } catch {
    // ignore cookie errors
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

function readLegacyThemeSelection(userId?: string | number | null): HbxThemeSelection | null {
  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    const rawThemeId =
      localStorage.getItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId)) ||
      localStorage.getItem(HBX_THEME_ID_STORAGE_KEY) ||
      localStorage.getItem("theme") || readCookie(HBX_THEME_COOKIE_ID);
    const rawMode =
      localStorage.getItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId)) ||
      localStorage.getItem(HBX_THEME_MODE_STORAGE_KEY) ||
      localStorage.getItem("theme-mode") || readCookie(HBX_THEME_COOKIE_MODE);

    if (!rawThemeId && !rawMode) {
      return null;
    }

    const themeId = resolveStoredThemeId(rawThemeId);
    const mode = resolveStoredThemeMode(rawMode);
    return { themeId, mode };
  } catch {
    return null;
  }
}

function tryParseThemeConfig(value: string | null): HbxThemeConfig | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as HbxThemeConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStoredThemeConfig(config?: HbxThemeConfig | null): HbxThemeConfig | null {
  const sanitized = sanitizeThemeConfig(config);
  if (!sanitized) return null;

  const selection = resolveThemeConfig({ selection: sanitized.selection }).selection;
  const defaultAppearance = buildThemeAppearanceDefaults(selection);
  const hasResolvedAppearanceArtifact = Boolean(
    sanitized.appearance &&
      THEME_APPEARANCE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(sanitized.appearance || {}, key)),
  );

  const appearance = sanitized.appearance
    ? THEME_APPEARANCE_KEYS.reduce<NonNullable<HbxThemeConfig["appearance"]>>((acc, key) => {
        const value = sanitized.appearance?.[key];
        if (!value) return acc;
        if (hasResolvedAppearanceArtifact && value === defaultAppearance[key]) {
          return acc;
        }
        acc[key] = value;
        return acc;
      }, {})
    : undefined;

  const appearanceByTheme = sanitized.appearanceByTheme
    ? HBX_THEME_IDS.reduce<NonNullable<HbxThemeConfig["appearanceByTheme"]>>((acc, themeId) => {
        const themeAppearance = sanitized.appearanceByTheme?.[themeId];
        if (!themeAppearance) return acc;

        const themeDefaults = buildThemeAppearanceDefaults({
          themeId,
          mode: selection.mode,
        });
        const normalizedThemeAppearance = THEME_APPEARANCE_KEYS.reduce<NonNullable<HbxThemeConfig["appearance"]>>(
          (themeAcc, key) => {
            const value = themeAppearance[key];
            if (!value || value === themeDefaults[key]) return themeAcc;
            themeAcc[key] = value;
            return themeAcc;
          },
          {},
        );

        if (Object.keys(normalizedThemeAppearance).length) {
          acc[themeId] = normalizedThemeAppearance;
        }
        return acc;
      }, {})
    : undefined;

  const motion = sanitized.motion?.transitionStyle
    ? hasResolvedAppearanceArtifact && sanitized.motion.transitionStyle === DEFAULT_THEME_MOTION_STYLE
      ? undefined
      : sanitized.motion
    : undefined;

  return (
    sanitizeThemeConfig({
      ...(sanitized.selection ? { selection: sanitized.selection } : {}),
      ...(appearance && Object.keys(appearance).length ? { appearance } : {}),
      ...(appearanceByTheme && Object.keys(appearanceByTheme).length ? { appearanceByTheme } : {}),
      ...(motion ? { motion } : {}),
    }) || null
  );
}

export function readStoredThemeConfig(userId?: string | number | null): HbxThemeConfig {
  if (typeof window === "undefined") {
    return {};
  }

  const scopedUserId = getActiveThemeStorageUser(userId);
  const legacySelection = readLegacyThemeSelection(scopedUserId);

  try {
    const storedConfig = tryParseThemeConfig(
      localStorage.getItem(buildScopedKey(HBX_THEME_CONFIG_STORAGE_KEY, scopedUserId)) ||
        localStorage.getItem(HBX_THEME_CONFIG_STORAGE_KEY),
    );
    return (
      normalizeStoredThemeConfig(
        mergeThemeConfigChain(legacySelection ? { selection: legacySelection } : null, storedConfig),
      ) || {}
    );
  } catch {
    return legacySelection ? { selection: legacySelection } : {};
  }
}

export function readStoredThemeSelection(userId?: string | number | null): HbxThemeSelection {
  return resolveThemeConfig(readStoredThemeConfig(userId)).selection;
}

export function readCachedResolvedThemeConfig(userId?: string | number | null): HbxThemeConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    return normalizeStoredThemeConfig(
      tryParseThemeConfig(
        localStorage.getItem(buildScopedKey(HBX_THEME_RESOLVED_CONFIG_STORAGE_KEY, scopedUserId)) ||
          localStorage.getItem(HBX_THEME_RESOLVED_CONFIG_STORAGE_KEY),
      ),
    );
  } catch {
    return null;
  }
}

export function persistResolvedThemeConfig(
  config: HbxThemeConfig,
  userId?: string | number | null,
) {
  if (typeof window === "undefined") return;
  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    const nextConfig = normalizeStoredThemeConfig(config);
    if (!nextConfig) return;

    const serialized = JSON.stringify(nextConfig);
    localStorage.setItem(HBX_THEME_RESOLVED_CONFIG_STORAGE_KEY, serialized);

    if (scopedUserId) {
      localStorage.setItem(buildScopedKey(HBX_THEME_RESOLVED_CONFIG_STORAGE_KEY, scopedUserId), serialized);
      localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, scopedUserId);
    }
  } catch {
    // ignore storage errors
  }
}

export function persistThemeConfig(
  config: HbxThemeConfig,
  userId?: string | number | null,
) {
  if (typeof window === "undefined") return;
  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    const nextConfig =
      normalizeStoredThemeConfig(mergeThemeConfigChain(readStoredThemeConfig(scopedUserId), config)) || {
        selection: DEFAULT_THEME_SELECTION,
      };
    const serialized = JSON.stringify(nextConfig);

    localStorage.setItem(HBX_THEME_CONFIG_STORAGE_KEY, serialized);
    localStorage.setItem(HBX_THEME_ID_STORAGE_KEY, nextConfig.selection?.themeId || DEFAULT_THEME_SELECTION.themeId);
    localStorage.setItem(HBX_THEME_MODE_STORAGE_KEY, nextConfig.selection?.mode || DEFAULT_THEME_SELECTION.mode);
    localStorage.setItem("theme", nextConfig.selection?.themeId || DEFAULT_THEME_SELECTION.themeId);
    localStorage.setItem("theme-mode", nextConfig.selection?.mode || DEFAULT_THEME_SELECTION.mode);

    // also persist lightweight cookies so the login / SSR-aware parts can
    // read the preferred theme before client hydration
    try {
      setCookie(HBX_THEME_COOKIE_ID, nextConfig.selection?.themeId || DEFAULT_THEME_SELECTION.themeId);
      setCookie(HBX_THEME_COOKIE_MODE, nextConfig.selection?.mode || DEFAULT_THEME_SELECTION.mode);
    } catch {
      // ignore cookie errors
    }

    if (scopedUserId) {
      localStorage.setItem(buildScopedKey(HBX_THEME_CONFIG_STORAGE_KEY, scopedUserId), serialized);
      localStorage.setItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId), nextConfig.selection?.themeId || DEFAULT_THEME_SELECTION.themeId);
      localStorage.setItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId), nextConfig.selection?.mode || DEFAULT_THEME_SELECTION.mode);
      localStorage.setItem(ACTIVE_THEME_USER_STORAGE_KEY, scopedUserId);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearStoredThemeConfig(userId?: string | number | null) {
  if (typeof window === "undefined") return;
  const scopedUserId = getActiveThemeStorageUser(userId);

  try {
    localStorage.removeItem(HBX_THEME_CONFIG_STORAGE_KEY);
    localStorage.setItem(HBX_THEME_ID_STORAGE_KEY, DEFAULT_THEME_SELECTION.themeId);
    localStorage.setItem(HBX_THEME_MODE_STORAGE_KEY, DEFAULT_THEME_SELECTION.mode);
    if (scopedUserId) {
      localStorage.removeItem(buildScopedKey(HBX_THEME_CONFIG_STORAGE_KEY, scopedUserId));
      localStorage.removeItem(buildScopedKey(HBX_THEME_ID_STORAGE_KEY, scopedUserId));
      localStorage.removeItem(buildScopedKey(HBX_THEME_MODE_STORAGE_KEY, scopedUserId));
    }
    try {
      // clear cookies too
      setCookie(HBX_THEME_COOKIE_ID, null);
      setCookie(HBX_THEME_COOKIE_MODE, null);
    } catch {
      // ignore
    }
  } catch {
    // ignore storage errors
  }
}

export function persistThemeSelection(
  selection: HbxThemeSelection,
  userId?: string | number | null,
) {
  persistThemeConfig({ selection }, userId);
}
