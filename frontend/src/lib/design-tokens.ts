import {
  HBX_THEME_PALETTES,
  isHbxThemeId,
  isHbxThemeMode,
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

export const HBX_THEME_MOTION_STYLES = [
  "liquid-glass",
  "scroll-storytelling",
  "micro-interactions",
] as const;

export type HbxThemeMotionStyle = (typeof HBX_THEME_MOTION_STYLES)[number];

export type HbxThemeAppearanceConfig = {
  brand?: string;
  buttonPrimary?: string;
  buttonSecondary?: string;
  buttonSuccess?: string;
  buttonAccent?: string;
  selectionAccent?: string;
  menuActive?: string;
  menuInactive?: string;
  menuDisabled?: string;
};

export type HbxThemeMotionConfig = {
  transitionStyle?: HbxThemeMotionStyle;
};

export type HbxThemeConfig = {
  selection?: Partial<HbxThemeSelection>;
  appearance?: HbxThemeAppearanceConfig;
  motion?: HbxThemeMotionConfig;
};

export type HbxResolvedThemeConfig = {
  selection: HbxThemeSelection;
  appearance: Required<HbxThemeAppearanceConfig>;
  motion: {
    transitionStyle: HbxThemeMotionStyle;
  };
};

export const DEFAULT_THEME_SELECTION: HbxThemeSelection = {
  themeId: "shadcn",
  mode: "light",
};

export const DEFAULT_THEME_MOTION_STYLE: HbxThemeMotionStyle = "liquid-glass";

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function normalizeColor(value: unknown) {
  return isHexColor(value) ? value.trim().toUpperCase() : null;
}

function resolveThemeId(value: unknown): HbxThemeId {
  const normalized = String(value || "").trim().toLowerCase();
  return isHbxThemeId(normalized) ? normalized : DEFAULT_THEME_SELECTION.themeId;
}

function resolveThemeMode(value: unknown): HbxThemeMode {
  const normalized = String(value || "").trim().toLowerCase();
  return isHbxThemeMode(normalized) ? normalized : DEFAULT_THEME_SELECTION.mode;
}

export function isHbxThemeMotionStyle(value: unknown): value is HbxThemeMotionStyle {
  return HBX_THEME_MOTION_STYLES.includes(String(value || "").trim().toLowerCase() as HbxThemeMotionStyle);
}

export function mergeThemeConfigChain(...configs: Array<HbxThemeConfig | null | undefined>): HbxThemeConfig {
  return configs.reduce<HbxThemeConfig>((acc, config) => {
    if (!config) return acc;

    if (config.selection) {
      acc.selection = {
        ...(acc.selection || {}),
        ...config.selection,
      };
    }

    if (config.appearance) {
      acc.appearance = {
        ...(acc.appearance || {}),
        ...config.appearance,
      };
    }

    if (config.motion) {
      acc.motion = {
        ...(acc.motion || {}),
        ...config.motion,
      };
    }

    return acc;
  }, {});
}

export function sanitizeThemeConfig(config?: HbxThemeConfig | null): HbxThemeConfig | null {
  if (!config) return null;

  const resolvedSelection = config.selection
    ? {
        ...(config.selection.themeId ? { themeId: resolveThemeId(config.selection.themeId) } : {}),
        ...(config.selection.mode ? { mode: resolveThemeMode(config.selection.mode) } : {}),
      }
    : undefined;

  const resolvedAppearance = config.appearance
    ? {
        ...(normalizeColor(config.appearance.brand)
          ? { brand: normalizeColor(config.appearance.brand) as string }
          : {}),
        ...(normalizeColor(config.appearance.buttonPrimary)
          ? { buttonPrimary: normalizeColor(config.appearance.buttonPrimary) as string }
          : {}),
        ...(normalizeColor(config.appearance.buttonSecondary)
          ? { buttonSecondary: normalizeColor(config.appearance.buttonSecondary) as string }
          : {}),
        ...(normalizeColor(config.appearance.buttonSuccess)
          ? { buttonSuccess: normalizeColor(config.appearance.buttonSuccess) as string }
          : {}),
        ...(normalizeColor(config.appearance.buttonAccent)
          ? { buttonAccent: normalizeColor(config.appearance.buttonAccent) as string }
          : {}),
        ...(normalizeColor(config.appearance.selectionAccent)
          ? { selectionAccent: normalizeColor(config.appearance.selectionAccent) as string }
          : {}),
        ...(normalizeColor(config.appearance.menuActive)
          ? { menuActive: normalizeColor(config.appearance.menuActive) as string }
          : {}),
        ...(normalizeColor(config.appearance.menuInactive)
          ? { menuInactive: normalizeColor(config.appearance.menuInactive) as string }
          : {}),
        ...(normalizeColor(config.appearance.menuDisabled)
          ? { menuDisabled: normalizeColor(config.appearance.menuDisabled) as string }
          : {}),
      }
    : undefined;

  const resolvedMotion = config.motion
    ? {
        ...(isHbxThemeMotionStyle(config.motion.transitionStyle)
          ? { transitionStyle: config.motion.transitionStyle }
          : {}),
      }
    : undefined;

  const sanitized: HbxThemeConfig = {
    ...(resolvedSelection && Object.keys(resolvedSelection).length ? { selection: resolvedSelection } : {}),
    ...(resolvedAppearance && Object.keys(resolvedAppearance).length ? { appearance: resolvedAppearance } : {}),
    ...(resolvedMotion && Object.keys(resolvedMotion).length ? { motion: resolvedMotion } : {}),
  };

  return Object.keys(sanitized).length ? sanitized : null;
}

export function buildThemeAppearanceDefaults(selection: HbxThemeSelection) {
  const theme = HBX_THEME_PALETTES[selection.themeId];
  const palette = theme[selection.mode];

  return {
    brand: palette.brand,
    buttonPrimary: palette.buttonPrimary,
    buttonSecondary: palette.buttonSecondary,
    buttonSuccess: palette.buttonSuccess,
    buttonAccent: palette.buttonAccent,
    selectionAccent: palette.buttonAccent,
    menuActive: palette.buttonPrimary,
    menuInactive: palette.foregroundSoft,
    menuDisabled: palette.warning,
  } satisfies Required<HbxThemeAppearanceConfig>;
}

export function resolveThemeConfig(config?: HbxThemeConfig | null): HbxResolvedThemeConfig {
  const selection: HbxThemeSelection = {
    themeId: resolveThemeId(config?.selection?.themeId),
    mode: resolveThemeMode(config?.selection?.mode),
  };
  const defaults = buildThemeAppearanceDefaults(selection);

  return {
    selection,
    appearance: {
      brand: normalizeColor(config?.appearance?.brand) || defaults.brand,
      buttonPrimary: normalizeColor(config?.appearance?.buttonPrimary) || defaults.buttonPrimary,
      buttonSecondary: normalizeColor(config?.appearance?.buttonSecondary) || defaults.buttonSecondary,
      buttonSuccess: normalizeColor(config?.appearance?.buttonSuccess) || defaults.buttonSuccess,
      buttonAccent: normalizeColor(config?.appearance?.buttonAccent) || defaults.buttonAccent,
      selectionAccent: normalizeColor(config?.appearance?.selectionAccent) || defaults.selectionAccent,
      menuActive: normalizeColor(config?.appearance?.menuActive) || defaults.menuActive,
      menuInactive: normalizeColor(config?.appearance?.menuInactive) || defaults.menuInactive,
      menuDisabled: normalizeColor(config?.appearance?.menuDisabled) || defaults.menuDisabled,
    },
    motion: {
      transitionStyle: isHbxThemeMotionStyle(config?.motion?.transitionStyle)
        ? config.motion.transitionStyle
        : DEFAULT_THEME_MOTION_STYLE,
    },
  };
}

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

export function playThemeWaveTransition(
  selection: HbxThemeSelection,
  origin?: ThemeTransitionOrigin,
  config?: HbxThemeConfig | HbxResolvedThemeConfig | null,
) {
  if (typeof document === "undefined") return;

  const resolved = resolveThemeConfig(config || { selection });
  const theme = HBX_THEME_PALETTES[resolved.selection.themeId];
  const palette = theme[resolved.selection.mode];
  const overlay = ensureThemeWaveOverlay();
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? Math.min(112, window.innerHeight * 0.18);
  const animationDuration = Math.round(
    (
      resolved.motion.transitionStyle === "micro-interactions"
        ? 760
        : resolved.motion.transitionStyle === "scroll-storytelling"
          ? 1460
          : 1240
    ) * 1.15,
  );

  overlay.style.setProperty("--theme-wave-x", `${Math.round(x)}px`);
  overlay.style.setProperty("--theme-wave-y", `${Math.round(y)}px`);
  overlay.style.setProperty("--theme-wave-brand", resolved.appearance.selectionAccent);
  overlay.style.setProperty("--theme-wave-secondary", resolved.appearance.buttonAccent);
  overlay.style.setProperty("--theme-wave-tertiary", resolved.appearance.buttonSecondary);
  overlay.style.setProperty(
    "--theme-wave-shadow",
    withAlpha(palette.shadow, resolved.selection.mode === "light" ? 0.18 : 0.42),
  );
  overlay.style.setProperty("--theme-wave-duration", `${animationDuration}ms`);
  overlay.dataset.motionStyle = resolved.motion.transitionStyle;

  overlay.dataset.state = "idle";
  void overlay.offsetWidth;
  overlay.dataset.state = "active";

  if (overlay.__resetTimer) {
    window.clearTimeout(overlay.__resetTimer);
  }

  overlay.__resetTimer = window.setTimeout(() => {
    overlay.dataset.state = "idle";
  }, animationDuration + 80);
}

export function applyThemeConfigToDocument(config?: HbxThemeConfig | HbxResolvedThemeConfig | null) {
  if (typeof document === "undefined") return;

  const resolved = resolveThemeConfig(config);
  const { selection } = resolved;
  const theme = HBX_THEME_PALETTES[selection.themeId];
  const palette = theme[selection.mode];
  const root = document.documentElement;

  root.setAttribute("data-theme", selection.themeId);
  root.setAttribute("data-theme-mode", selection.mode);
  root.setAttribute("data-theme-shell", theme.shellLabel.toLowerCase().replace(/\s+/g, "-"));
  root.setAttribute("data-motion-style", resolved.motion.transitionStyle);
  root.style.colorScheme = selection.mode;

  const variables: Record<string, string> = {
    "--brand": resolved.appearance.brand,
    "--brand-solid": resolved.appearance.brand,
    "--brand-soft": palette.brandSoft,
    "--brand-contrast": palette.brandContrast,
    "--button-primary": resolved.appearance.buttonPrimary,
    "--button-secondary": resolved.appearance.buttonSecondary,
    "--button-success": resolved.appearance.buttonSuccess,
    "--button-accent": resolved.appearance.buttonAccent,
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
    "--panel-glow": withAlpha(resolved.appearance.brand, selection.mode === "light" ? 0.12 : 0.2),
    "--hero-glow": withAlpha(resolved.appearance.brand, selection.mode === "light" ? 0.18 : 0.26),
    "--hero-outline": withAlpha(resolved.appearance.brand, selection.mode === "light" ? 0.18 : 0.28),
    "--soft-ring": withAlpha(resolved.appearance.brand, selection.mode === "light" ? 0.12 : 0.22),
    "--hairline": withAlpha(palette.foreground, selection.mode === "light" ? 0.06 : 0.12),
    "--button-primary-soft": withAlpha(resolved.appearance.buttonPrimary, selection.mode === "light" ? 0.18 : 0.3),
    "--button-secondary-soft": withAlpha(
      resolved.appearance.buttonSecondary,
      selection.mode === "light" ? 0.16 : 0.26,
    ),
    "--button-success-soft": withAlpha(resolved.appearance.buttonSuccess, selection.mode === "light" ? 0.18 : 0.28),
    "--button-accent-soft": withAlpha(resolved.appearance.buttonAccent, selection.mode === "light" ? 0.18 : 0.3),
    "--selection-accent": resolved.appearance.selectionAccent,
    "--selection-accent-soft": withAlpha(resolved.appearance.selectionAccent, selection.mode === "light" ? 0.18 : 0.3),
    "--menu-active": resolved.appearance.menuActive,
    "--menu-active-soft": withAlpha(resolved.appearance.menuActive, selection.mode === "light" ? 0.16 : 0.28),
    "--menu-inactive": resolved.appearance.menuInactive,
    "--menu-inactive-soft": withAlpha(resolved.appearance.menuInactive, selection.mode === "light" ? 0.14 : 0.22),
    "--menu-disabled": resolved.appearance.menuDisabled,
    "--menu-disabled-soft": withAlpha(resolved.appearance.menuDisabled, selection.mode === "light" ? 0.14 : 0.24),
    "--theme-wave-brand": resolved.appearance.selectionAccent,
    "--theme-wave-secondary": resolved.appearance.buttonAccent,
    "--theme-wave-tertiary": resolved.appearance.buttonSecondary,
    "--theme-wave-shadow": withAlpha(palette.shadow, selection.mode === "light" ? 0.18 : 0.42),
  };

  Object.entries(variables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}

export function applyThemeSelectionToDocument(selection: HbxThemeSelection) {
  applyThemeConfigToDocument({ selection });
}
