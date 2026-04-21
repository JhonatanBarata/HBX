import {
  HBX_THEME_PALETTES,
  type HbxThemeId,
  type HbxThemeMode,
} from "./theme-palettes";

export type HbxThemeSelection = {
  themeId: HbxThemeId;
  mode: HbxThemeMode;
};

export type ThemeTransitionOrigin = {
  x: number;
  y: number;
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

type ThemeWaveOverlayElement = HTMLDivElement & {
  __resetTimer?: number;
};

const THEME_WAVE_OVERLAY_ID = "hbx-theme-wave-overlay";

function ensureThemeWaveOverlay() {
  let overlay = document.getElementById(THEME_WAVE_OVERLAY_ID) as ThemeWaveOverlayElement | null;
  if (overlay) return overlay;

  overlay = document.createElement("div") as ThemeWaveOverlayElement;
  overlay.id = THEME_WAVE_OVERLAY_ID;
  overlay.className = "theme-wave-overlay";
  overlay.dataset.state = "idle";
  overlay.setAttribute("aria-hidden", "true");

  ["drop", "ripple", "flood", "sheen"].forEach((part) => {
    const node = document.createElement("span");
    node.className = `theme-wave-overlay__${part}`;
    overlay?.appendChild(node);
  });

  document.body.appendChild(overlay);
  return overlay;
}

function halveCssValue(value: string) {
  const safe = String(value).trim();
  const m = /^([0-9.]+)\s*([a-z%]*)$/i.exec(safe);
  if (m) {
    const num = parseFloat(m[1]);
    const unit = m[2] || "";
    const half = (num / 2).toString().replace(/(?:\.0+)$/g, "");
    return `${half}${unit}`;
  }
  return `calc(${safe} / 2)`;
}

export function playThemeWaveTransition(selection: HbxThemeSelection, origin?: ThemeTransitionOrigin) {
  if (typeof document === "undefined") return;

  const theme = HBX_THEME_PALETTES[selection.themeId];
  const palette = theme[selection.mode];
  const overlay = ensureThemeWaveOverlay();
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? Math.min(112, window.innerHeight * 0.18);

  overlay.style.setProperty("--theme-wave-x", `${Math.round(x)}px`);
  overlay.style.setProperty("--theme-wave-y", `${Math.round(y)}px`);
  overlay.style.setProperty("--theme-wave-brand", palette.brand);
  overlay.style.setProperty("--theme-wave-secondary", palette.buttonAccent);
  overlay.style.setProperty("--theme-wave-tertiary", palette.buttonSecondary);
  overlay.style.setProperty(
    "--theme-wave-shadow",
    withAlpha(palette.shadow, selection.mode === "light" ? 0.18 : 0.42),
  );

  overlay.dataset.state = "idle";
  void overlay.offsetWidth;
  overlay.dataset.state = "active";

  if (overlay.__resetTimer) {
    window.clearTimeout(overlay.__resetTimer);
  }

  overlay.__resetTimer = window.setTimeout(() => {
    overlay.dataset.state = "idle";
  }, 1240);
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
    "--button-primary": palette.buttonPrimary,
    "--button-secondary": palette.buttonSecondary,
    "--button-success": palette.buttonSuccess,
    "--button-accent": palette.buttonAccent,
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
    "--content-gutter": halveCssValue(theme.chrome.contentGutter),
    "--topbar-blur": theme.chrome.topbarBlur,
    "--workspace-rail-width": theme.workspace.railWidth,
    "--workspace-context-width": theme.workspace.contextWidth,
    "--workspace-gap": theme.workspace.shellGap,
    "--workspace-padding": halveCssValue(theme.workspace.shellPadding),
    "--workspace-hero-columns": theme.workspace.heroColumns,
    "--workspace-hero-min-height": theme.workspace.heroMinHeight,
    "--font-body": theme.typography.bodyFont,
    "--font-display": theme.typography.displayFont,
    "--font-mono-theme": theme.typography.monoFont,
    "--eyebrow-spacing": theme.typography.eyebrowSpacing,
    "--theme-density-label": `"${theme.densityLabel}"`,
    "--theme-depth-label": `"${theme.depthLabel}"`,
    "--theme-shell-label": `"${theme.shellLabel}"`,
    "--shadow-xs": `0 12px 24px -18px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.26 : 0.38)}`,
    "--shadow-sm": `0 18px 42px -24px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.32 : 0.46)}`,
    "--shadow-md": `0 30px 72px -32px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.38 : 0.54)}`,
    "--shadow-lg": `0 44px 96px -36px ${withAlpha(palette.shadow, selection.mode === "light" ? 0.44 : 0.62)}`,
    "--shadow-inset": `inset 0 1px 0 ${selection.mode === "light" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.06)"}`,
    "--panel-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.2),
    "--hero-glow": withAlpha(palette.brand, selection.mode === "light" ? 0.18 : 0.26),
    "--hero-outline": withAlpha(palette.brand, selection.mode === "light" ? 0.18 : 0.28),
    "--soft-ring": withAlpha(palette.brand, selection.mode === "light" ? 0.12 : 0.22),
    "--hairline": withAlpha(palette.foreground, selection.mode === "light" ? 0.06 : 0.12),
    "--button-primary-soft": withAlpha(palette.buttonPrimary, selection.mode === "light" ? 0.18 : 0.3),
    "--button-secondary-soft": withAlpha(
      palette.buttonSecondary,
      selection.mode === "light" ? 0.16 : 0.26,
    ),
    "--button-success-soft": withAlpha(palette.buttonSuccess, selection.mode === "light" ? 0.18 : 0.28),
    "--button-accent-soft": withAlpha(palette.buttonAccent, selection.mode === "light" ? 0.18 : 0.3),
    "--theme-wave-brand": palette.brand,
    "--theme-wave-secondary": palette.buttonAccent,
    "--theme-wave-tertiary": palette.buttonSecondary,
    "--theme-wave-shadow": withAlpha(palette.shadow, selection.mode === "light" ? 0.18 : 0.42),
  };

  Object.entries(variables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}
