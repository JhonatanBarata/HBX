import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";
import { InterfaceTransitionProvider } from "../components/InterfaceTransitionProvider";
import PageTransition from "../components/PageTransition";
import PreCheckoutGate from "../components/PreCheckoutGate";
import TopBar from "../components/TopBar";
import { ThemeProvider } from "../components/ThemeProvider";
import WhatsAppHelpBubble from "../components/WhatsAppHelpBubble";
import { HBX_THEME_PALETTES } from "../lib/theme-palettes";

export const dynamic = "force-dynamic";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "HBX Solutions",
  description: "Plataforma corporativa de operacao e atendimento",
};

const themeBootstrapScript = `
(function(){
  try {
    var palettes = ${JSON.stringify(HBX_THEME_PALETTES)};
    var ids = ["shadcn"];
    var modes = ["light","dark"];
    var defaultSelection = { themeId: "shadcn", mode: "light" };
    var doc = document.documentElement;
    var storage = window.localStorage;
    var cookie = function(name){
      var parts = ("; " + document.cookie).split("; " + name + "=");
      return parts.length === 2 ? decodeURIComponent((parts.pop() || "").split(";").shift() || "") : null;
    };
    var isThemeId = function(value){ return ids.indexOf(String(value || "").trim().toLowerCase()) !== -1; };
    var isMode = function(value){ return modes.indexOf(String(value || "").trim().toLowerCase()) !== -1; };
    var mapLegacyThemeId = function(value){
      return defaultSelection.themeId;
    };
    var scopedKey = function(base, userId){ return userId ? base + ":" + userId : base; };
    var activeUser = String(storage.getItem("hbx:active-user-id") || "").trim();
    var parseConfig = function(value){
      if (!value) return {};
      try {
        var parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    };
    var rawThemeId =
      storage.getItem(scopedKey("hbx:theme-id", activeUser)) ||
      storage.getItem("hbx:theme-id") ||
      storage.getItem("theme") ||
      cookie("hbx-theme-id");
    var rawMode =
      storage.getItem(scopedKey("hbx:theme-mode", activeUser)) ||
      storage.getItem("hbx:theme-mode") ||
      storage.getItem("theme-mode") ||
      cookie("hbx-theme-mode");
    var resolvedConfig = parseConfig(
      storage.getItem(scopedKey("hbx:theme-resolved-config", activeUser)) ||
      storage.getItem("hbx:theme-resolved-config")
    );
    var storedUserConfig = parseConfig(
      storage.getItem(scopedKey("hbx:theme-config", activeUser)) ||
      storage.getItem("hbx:theme-config")
    );
    var config = Object.keys(resolvedConfig).length ? resolvedConfig : storedUserConfig;
    var configSelection = config.selection || {};
    var themeId = isThemeId(configSelection.themeId)
      ? String(configSelection.themeId).trim().toLowerCase()
      : (isThemeId(rawThemeId) ? String(rawThemeId).trim().toLowerCase() : mapLegacyThemeId(rawThemeId));
    var mode = isMode(configSelection.mode)
      ? String(configSelection.mode).trim().toLowerCase()
      : (isMode(rawMode) ? String(rawMode).trim().toLowerCase() : defaultSelection.mode);
    var theme = palettes[themeId] || palettes[defaultSelection.themeId];
    var palette = (theme && theme[mode]) || palettes[defaultSelection.themeId][defaultSelection.mode];
    var appearanceByTheme = config.appearanceByTheme || {};
    var themeAppearance = appearanceByTheme[themeId] || {};
    var appearance = Object.assign({}, config.appearance || {}, themeAppearance);
    var hex = function(value, fallback){
      return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || "").trim()) ? String(value).trim().toUpperCase() : fallback;
    };
    var rgb = function(color){
      var normalized = String(color || "#000000").replace("#", "");
      if (normalized.length === 3) normalized = normalized.split("").map(function(part){ return part + part; }).join("");
      normalized = (normalized + "000000").slice(0, 6);
      return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
      };
    };
    var alpha = function(color, opacity){
      var value = rgb(color);
      return "rgba(" + value.r + ", " + value.g + ", " + value.b + ", " + opacity + ")";
    };
    var half = function(value){
      var safe = String(value || "").trim();
      var match = /^([0-9.]+)\\s*([a-z%]*)$/i.exec(safe);
      if (!match) return "calc(" + safe + " / 2)";
      return String(parseFloat(match[1]) / 2).replace(/(?:\\.0+)$/g, "") + (match[2] || "");
    };
    var resolvedAppearance = {
      buttonPrimary: hex(appearance.buttonPrimary, palette.buttonPrimary),
      buttonSecondary: hex(appearance.buttonSecondary, palette.buttonSecondary),
      buttonSuccess: hex(appearance.buttonSuccess, palette.buttonSuccess),
      buttonAccent: hex(appearance.buttonAccent, palette.buttonAccent),
      selectionAccent: hex(appearance.selectionAccent, palette.buttonAccent),
      menuActive: hex(appearance.menuActive, palette.buttonPrimary),
      menuInactive: hex(appearance.menuInactive, palette.foregroundSoft),
      menuDisabled: hex(appearance.menuDisabled, palette.warning)
    };
    var motionStyle = ["liquid-glass","scroll-storytelling","micro-interactions"].indexOf(String(config.motion && config.motion.transitionStyle || "")) !== -1
      ? config.motion.transitionStyle
      : "liquid-glass";
    doc.setAttribute("data-theme", themeId);
    doc.setAttribute("data-theme-mode", mode);
    doc.setAttribute("data-theme-shell", String(theme.shellLabel || "").toLowerCase().replace(/\\s+/g, "-"));
    doc.setAttribute("data-motion-style", motionStyle);
    doc.style.colorScheme = mode;
    var vars = {
      "--brand": palette.brand,
      "--brand-solid": palette.brandStrong,
      "--brand-soft": palette.brandSoft,
      "--brand-contrast": palette.brandContrast,
      "--button-primary": resolvedAppearance.buttonPrimary,
      "--button-secondary": resolvedAppearance.buttonSecondary,
      "--button-success": resolvedAppearance.buttonSuccess,
      "--button-accent": resolvedAppearance.buttonAccent,
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
      "--content-gutter": half(theme.chrome.contentGutter),
      "--topbar-blur": theme.chrome.topbarBlur,
      "--workspace-rail-width": theme.workspace.railWidth,
      "--workspace-context-width": theme.workspace.contextWidth,
      "--workspace-gap": theme.workspace.shellGap,
      "--workspace-padding": half(theme.workspace.shellPadding),
      "--workspace-hero-columns": theme.workspace.heroColumns,
      "--workspace-hero-min-height": theme.workspace.heroMinHeight,
      "--font-body": theme.typography.bodyFont,
      "--font-display": theme.typography.displayFont,
      "--font-mono-theme": theme.typography.monoFont,
      "--eyebrow-spacing": theme.typography.eyebrowSpacing,
      "--theme-density-label": '"' + theme.densityLabel + '"',
      "--theme-depth-label": '"' + theme.depthLabel + '"',
      "--theme-shell-label": '"' + theme.shellLabel + '"',
      "--shadow-xs": "0 12px 24px -18px " + alpha(palette.shadow, mode === "light" ? 0.26 : 0.38),
      "--shadow-sm": "0 18px 42px -24px " + alpha(palette.shadow, mode === "light" ? 0.32 : 0.46),
      "--shadow-md": "0 30px 72px -32px " + alpha(palette.shadow, mode === "light" ? 0.38 : 0.54),
      "--shadow-lg": "0 44px 96px -36px " + alpha(palette.shadow, mode === "light" ? 0.44 : 0.62),
      "--shadow-inset": mode === "light" ? "inset 0 1px 0 rgba(255,255,255,0.72)" : "inset 0 1px 0 rgba(255,255,255,0.06)",
      "--panel-glow": alpha(palette.brand, mode === "light" ? 0.12 : 0.2),
      "--hero-glow": alpha(palette.brand, mode === "light" ? 0.18 : 0.26),
      "--hero-outline": alpha(palette.brand, mode === "light" ? 0.18 : 0.28),
      "--soft-ring": alpha(palette.brand, mode === "light" ? 0.12 : 0.22),
      "--hairline": alpha(palette.foreground, mode === "light" ? 0.06 : 0.12),
      "--button-primary-soft": alpha(resolvedAppearance.buttonPrimary, mode === "light" ? 0.18 : 0.3),
      "--button-secondary-soft": alpha(resolvedAppearance.buttonSecondary, mode === "light" ? 0.16 : 0.26),
      "--button-success-soft": alpha(resolvedAppearance.buttonSuccess, mode === "light" ? 0.18 : 0.28),
      "--button-accent-soft": alpha(resolvedAppearance.buttonAccent, mode === "light" ? 0.18 : 0.3),
      "--selection-accent": resolvedAppearance.selectionAccent,
      "--selection-accent-soft": alpha(resolvedAppearance.selectionAccent, mode === "light" ? 0.18 : 0.3),
      "--menu-active": resolvedAppearance.menuActive,
      "--menu-active-soft": alpha(resolvedAppearance.menuActive, mode === "light" ? 0.16 : 0.28),
      "--menu-inactive": resolvedAppearance.menuInactive,
      "--menu-inactive-soft": alpha(resolvedAppearance.menuInactive, mode === "light" ? 0.14 : 0.22),
      "--menu-disabled": resolvedAppearance.menuDisabled,
      "--menu-disabled-soft": alpha(resolvedAppearance.menuDisabled, mode === "light" ? 0.14 : 0.24),
      "--theme-wave-brand": resolvedAppearance.selectionAccent,
      "--theme-wave-secondary": resolvedAppearance.buttonAccent,
      "--theme-wave-tertiary": resolvedAppearance.buttonSecondary,
      "--theme-wave-shadow": alpha(palette.shadow, mode === "light" ? 0.18 : 0.42)
    };
    Object.keys(vars).forEach(function(name){ doc.style.setProperty(name, vars[name]); });
  } catch (_) {}
})();
`;

const browserCacheResetScript = `
(function(){
  try {
    var resetKey = "hbx:browser-cache-reset:2026-05-06-radar";
    if (window.localStorage && window.localStorage.getItem(resetKey) === "done") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations){
        registrations.forEach(function(registration){ registration.unregister(); });
      }).catch(function(){});
    }
    if ("caches" in window) {
      window.caches.keys().then(function(keys){
        keys.forEach(function(key){ window.caches.delete(key); });
      }).catch(function(){});
    }
    if (window.localStorage) window.localStorage.setItem(resetKey, "done");
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: browserCacheResetScript }} />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${ibmPlexMono.variable} antialiased app-root`}
      >
        <ThemeProvider>
          <InterfaceTransitionProvider>
            <TopBar />
            <PreCheckoutGate>
              <PageTransition>{children}</PageTransition>
            </PreCheckoutGate>
            <WhatsAppHelpBubble />
          </InterfaceTransitionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
