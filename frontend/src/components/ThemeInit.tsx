"use client";

import { useEffect } from "react";
import { THEME_PALETTES } from "@/lib/theme-palettes";

const DEFAULT_THEME = "blue";

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

function mixHexColors(fromHex: string, toHex: string, ratio: number) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const channel = (fromValue: number, toValue: number) =>
    Math.round(fromValue + (toValue - fromValue) * safeRatio)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

function applyThemePalette(id: string, nextStrength: number) {
  const palette =
    (THEME_PALETTES as any)[id] || (THEME_PALETTES as any)[DEFAULT_THEME];
  const ratio = Math.max(0, Math.min(100, nextStrength)) / 100;
  const root = document.documentElement.style;
  root.setProperty(
    "--brand",
    mixHexColors(palette.light.brand, palette.dark.brand, ratio)
  );
  root.setProperty(
    "--brand-solid",
    mixHexColors(palette.light.brand, palette.dark.brand, ratio)
  );
  root.setProperty(
    "--background",
    mixHexColors(palette.light.background, palette.dark.background, ratio)
  );
  root.setProperty(
    "--background-alt",
    mixHexColors(
      palette.light.backgroundAlt,
      palette.dark.backgroundAlt,
      ratio
    )
  );
  root.setProperty(
    "--surface",
    mixHexColors(palette.light.surface, palette.dark.surface, ratio)
  );
  root.setProperty(
    "--surface-soft",
    mixHexColors(palette.light.surfaceSoft, palette.dark.surfaceSoft, ratio)
  );
  root.setProperty(
    "--foreground",
    mixHexColors(palette.light.foreground, palette.dark.foreground, ratio)
  );
  root.setProperty(
    "--muted",
    mixHexColors(palette.light.muted, palette.dark.muted, ratio)
  );
  root.setProperty(
    "--line",
    mixHexColors(palette.light.line, palette.dark.line, ratio)
  );
  root.setProperty(
    "--success",
    mixHexColors(palette.light.success, palette.dark.success, ratio)
  );
  root.setProperty(
    "--danger",
    mixHexColors(palette.light.danger, palette.dark.danger, ratio)
  );
  root.setProperty("--brand-contrast", ratio >= 0.58 ? "#06111d" : "#f8fafc");
}

export default function ThemeInit() {
  useEffect(() => {
    try {
      const storedMode =
        (localStorage.getItem("theme-mode") as "light" | "dark") ||
        (document.documentElement.getAttribute("data-theme-mode") as
          | "light"
          | "dark") ||
        "light";
      const storedTheme =
        (localStorage.getItem("theme") as string) ||
        (document.documentElement.getAttribute("data-theme") as string) ||
        DEFAULT_THEME;
      const safeStrength = storedMode === "dark" ? 100 : 0;
      document.documentElement.setAttribute("data-theme", storedTheme);
      document.documentElement.setAttribute("data-theme-mode", storedMode);
      applyThemePalette(storedTheme, safeStrength);
      document.documentElement.style.setProperty(
        "--theme-strength-pct",
        `${safeStrength}%`
      );
    } catch {
      // ignore
    }
  }, []);

  return null;
}
