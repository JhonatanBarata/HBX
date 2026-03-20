import {
  HBX_THEME_PALETTES,
  type HbxThemeId,
  type HbxThemeMode,
} from "./theme-palettes";

export type HbxThemeSelection = {
  themeId: HbxThemeId;
  mode: HbxThemeMode;
};

export const DEFAULT_THEME_SELECTION: HbxThemeSelection = {
  themeId: "shadcn",
  mode: "light",
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

function withAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function applyThemeSelectionToDocument(selection: HbxThemeSelection) {
  if (typeof document === "undefined") return;

  const theme = HBX_THEME_PALETTES[selection.themeId];
  const palette = theme[selection.mode];
  const root = document.documentElement;

  root.setAttribute("data-theme", selection.themeId);
  root.setAttribute("data-theme-mode", selection.mode);
  root.setAttribute("data-theme-shell", theme.shellLabel.toLowerCase().replace(/\s+/g, "-"));
  root.style.colorScheme = selection.mode;

  const variables: Record<string, string> = {
    "--brand": palette.brand,
    "--brand-solid": palette.brandStrong,
    "--brand-soft": palette.brandSoft,
    "--brand-contrast": palette.brandContrast,
    "--background": palette.background,
    "--background-alt": palette.backgroundAlt,
    "--surface": palette.surface,
    "--surface-soft": palette.surfaceSoft,
    "--surface-raised": palette.surfaceRaised,
    "--header-surface": palette.headerSurface,
    "--nav-surface": palette.navSurface,
    "--field-surface": palette.fieldSurface,
    "--hero-from": palette.heroFrom,
    "--hero-to": palette.heroTo,
    "--hero-spotlight": palette.heroSpotlight,
    "--table-head": palette.tableHead,
    "--chat-inbound": palette.chatInbound,
    "--chat-outbound": palette.chatOutbound,
    "--chat-system": palette.chatSystem,
    "--foreground": palette.foreground,
    "--foreground-soft": palette.foregroundSoft,
    "--muted": palette.muted,
    "--line": palette.line,
    "--success": palette.success,
    "--warning": palette.warning,
    "--danger": palette.danger,
    "--info": palette.info,
    "--overlay": palette.overlay,
    "--radius-xs": theme.chrome.radiusXs,
    "--radius-sm": theme.chrome.radiusSm,
    "--radius-md": theme.chrome.radiusMd,
    "--radius-lg": theme.chrome.radiusLg,
    "--radius-xl": theme.chrome.radiusXl,
    "--control-radius": theme.chrome.radiusSm,
    "--panel-radius": theme.chrome.radiusLg,
    "--hero-radius": theme.chrome.radiusXl,
    "--pill-radius": "999px",
    "--topbar-frame-width": theme.chrome.topbarWidth,
    "--app-max-width": theme.chrome.contentWidth,
    "--content-gutter": theme.chrome.contentGutter,
    "--topbar-blur": theme.chrome.topbarBlur,
    "--theme-density-label": `"${theme.densityLabel}"`,
    "--theme-depth-label": `"${theme.depthLabel}"`,
    "--shadow-xs": `0 10px 22px -18px ${withAlpha(palette.shadow, 0.3)}`,
    "--shadow-sm": `0 18px 40px -24px ${withAlpha(palette.shadow, 0.34)}`,
    "--shadow-md": `0 28px 64px -30px ${withAlpha(palette.shadow, 0.42)}`,
    "--shadow-lg": `0 42px 96px -36px ${withAlpha(palette.shadow, 0.48)}`,
    "--shadow-inset": `inset 0 1px 0 ${selection.mode === "light" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.06)"}`,
    "--panel-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.18),
    "--hero-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.2 : 0.24),
  };

  Object.entries(variables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}
