/**
 * NEW THEME PALETTES (2026 Redesign)
 * - Blue: Principal, corporativo, claro moderno e dark elegante
 * - Green: Profissional, tecnológico, confiável
 * - Grey: Neutro premium, sofisticado e mais sério
 * - Pink: Identidade alternativa, refinada e adulta
 */

export type ThemePaletteKey = "blue" | "green" | "grey" | "pink";
export type ThemeModeKey = "light" | "dark";

export interface ThemeColorSet {
  brand: string;
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceSoft: string;
  foreground: string;
  muted: string;
  line: string;
  success: string;
  danger: string;
}

export interface ThemePalette {
  light: ThemeColorSet;
  dark: ThemeColorSet;
}

export const THEME_PALETTES: Record<ThemePaletteKey, ThemePalette> = {
  // BLUE: Primary corporate SaaS aesthetic
  blue: {
    light: {
      brand: "#2563eb",
      background: "#f0f6ff",
      backgroundAlt: "#e0eeff",
      surface: "#ffffff",
      surfaceSoft: "#f8fbff",
      foreground: "#082f49",
      muted: "#334155",
      line: "#cbd5e1",
      success: "#059669",
      danger: "#dc2626",
    },
    dark: {
      brand: "#60a5fa",
      background: "#0c1428",
      backgroundAlt: "#111d2f",
      surface: "#172139",
      surfaceSoft: "#1e2a3e",
      foreground: "#f0f9ff",
      muted: "#94a3b8",
      line: "#334155",
      success: "#10b981",
      danger: "#fca5a5",
    },
  },

  // GREEN: Professional, technological, reliable
  green: {
    light: {
      brand: "#059669",
      background: "#f0fdf4",
      backgroundAlt: "#dcfce7",
      surface: "#ffffff",
      surfaceSoft: "#f7fee7",
      foreground: "#082f09",
      muted: "#334155",
      line: "#bbf7d0",
      success: "#059669",
      danger: "#dc2626",
    },
    dark: {
      brand: "#10b981",
      background: "#05140d",
      backgroundAlt: "#0a1f16",
      surface: "#0f2818",
      surfaceSoft: "#183d26",
      foreground: "#ecfdf5",
      muted: "#86efac",
      line: "#31784a",
      success: "#10b981",
      danger: "#fca5a5",
    },
  },

  // GREY: Neutral premium, sophisticated, serious
  grey: {
    light: {
      brand: "#475569",
      background: "#f8fafc",
      backgroundAlt: "#e2e8f0",
      surface: "#ffffff",
      surfaceSoft: "#f1f5f9",
      foreground: "#0f172a",
      muted: "#64748b",
      line: "#cbd5e1",
      success: "#059669",
      danger: "#dc2626",
    },
    dark: {
      brand: "#cbd5e1",
      background: "#0f172a",
      backgroundAlt: "#1a202c",
      surface: "#1e293b",
      surfaceSoft: "#334155",
      foreground: "#f1f5f9",
      muted: "#94a3b8",
      line: "#475569",
      success: "#10b981",
      danger: "#fca5a5",
    },
  },

  // PINK: Alternative identity, refined and adult
  pink: {
    light: {
      brand: "#be185d",
      background: "#fdf2f8",
      backgroundAlt: "#fbcfe8",
      surface: "#ffffff",
      surfaceSoft: "#fce7f3",
      foreground: "#500724",
      muted: "#334155",
      line: "#fbbbda",
      success: "#059669",
      danger: "#dc2626",
    },
    dark: {
      brand: "#f472b6",
      background: "#1a0628",
      backgroundAlt: "#2d1039",
      surface: "#3d1552",
      surfaceSoft: "#4d1f6d",
      foreground: "#fecdd3",
      muted: "#f8a7c8",
      line: "#8b5a7d",
      success: "#10b981",
      danger: "#fca5a5",
    },
  },
};

/**
 * Get a specific theme palette and mode
 */
export function getThemePalette(
  paletteKey: ThemePaletteKey,
  mode: ThemeModeKey
): ThemeColorSet {
  return THEME_PALETTES[paletteKey]?.[mode] || THEME_PALETTES.blue.light;
}

/**
 * All available theme palette keys
 */
export const THEME_PALETTE_KEYS: ThemePaletteKey[] = ["blue", "green", "grey", "pink"];

/**
 * All available theme mode keys
 */
export const THEME_MODE_KEYS: ThemeModeKey[] = ["light", "dark"];
