"use client";

import { useEffect } from "react";
import { clampThemeStrength, readStoredThemeStrength } from "@/lib/theme-preferences";

const THEME_PALETTES: Record<
  string,
  {
    light: {
      brand: string;
      background: string;
      backgroundAlt: string;
      surface: string;
      surfaceSoft: string;
      foreground: string;
      muted: string;
      line: string;
    };
    dark: {
      brand: string;
      background: string;
      backgroundAlt: string;
      surface: string;
      surfaceSoft: string;
      foreground: string;
      muted: string;
      line: string;
    };
  }
> = {
  primary: {
    light: {
      brand: "#0b4f8a",
      background: "#edf2f8",
      backgroundAlt: "#e1e9f3",
      surface: "#ffffff",
      surfaceSoft: "#f4f8ff",
      foreground: "#0f172a",
      muted: "#475569",
      line: "#d9e3ef",
    },
    dark: {
      brand: "#5aa2ff",
      background: "#07111d",
      backgroundAlt: "#0b1727",
      surface: "#0e1d31",
      surfaceSoft: "#12243a",
      foreground: "#edf4ff",
      muted: "#9ab0ca",
      line: "#1e3652",
    },
  },
  secondary: {
    light: {
      brand: "#0f766e",
      background: "#ebf5f4",
      backgroundAlt: "#dcedea",
      surface: "#ffffff",
      surfaceSoft: "#f1fbf9",
      foreground: "#0f172a",
      muted: "#3f4b5b",
      line: "#d2e5e2",
    },
    dark: {
      brand: "#35d2c4",
      background: "#051412",
      backgroundAlt: "#0a1c1a",
      surface: "#0d2421",
      surfaceSoft: "#12302c",
      foreground: "#ecfffb",
      muted: "#95bbb5",
      line: "#1b4843",
    },
  },
  neutral: {
    light: {
      brand: "#334155",
      background: "#eef1f5",
      backgroundAlt: "#e0e5ec",
      surface: "#ffffff",
      surfaceSoft: "#f6f8fb",
      foreground: "#0f172a",
      muted: "#4b5563",
      line: "#d8dee8",
    },
    dark: {
      brand: "#b6c2d1",
      background: "#0a0f16",
      backgroundAlt: "#111926",
      surface: "#151f2d",
      surfaceSoft: "#1a2737",
      foreground: "#f1f5f9",
      muted: "#9aa6b2",
      line: "#253243",
    },
  },
  pink: {
    light: {
      brand: "#d946b7",
      background: "#fdf0f8",
      backgroundAlt: "#f8e1f1",
      surface: "#ffffff",
      surfaceSoft: "#fff5fb",
      foreground: "#2a1324",
      muted: "#7a4f6f",
      line: "#efcfe4",
    },
    dark: {
      brand: "#ff8de1",
      background: "#170613",
      backgroundAlt: "#220b1b",
      surface: "#2b1022",
      surfaceSoft: "#38152d",
      foreground: "#fff1fb",
      muted: "#d2a8c6",
      line: "#5c264b",
    },
  },
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
  const palette = THEME_PALETTES[id] || THEME_PALETTES.primary;
  const ratio = Math.max(0, Math.min(100, nextStrength)) / 100;
  const root = document.documentElement.style;
  root.setProperty("--brand", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
  root.setProperty("--brand-solid", mixHexColors(palette.light.brand, palette.dark.brand, ratio));
  root.setProperty("--background", mixHexColors(palette.light.background, palette.dark.background, ratio));
  root.setProperty(
    "--background-alt",
    mixHexColors(palette.light.backgroundAlt, palette.dark.backgroundAlt, ratio),
  );
  root.setProperty("--surface", mixHexColors(palette.light.surface, palette.dark.surface, ratio));
  root.setProperty(
    "--surface-soft",
    mixHexColors(palette.light.surfaceSoft, palette.dark.surfaceSoft, ratio),
  );
  root.setProperty(
    "--foreground",
    mixHexColors(palette.light.foreground, palette.dark.foreground, ratio),
  );
  root.setProperty("--muted", mixHexColors(palette.light.muted, palette.dark.muted, ratio));
  root.setProperty("--line", mixHexColors(palette.light.line, palette.dark.line, ratio));
  root.setProperty("--brand-contrast", ratio >= 0.58 ? "#06111d" : "#f8fafc");
}

export default function ThemeInit() {
  useEffect(() => {
    try {
      const storedMode = (localStorage.getItem("theme-mode") as "light" | "dark") || "light";
      const safeStrength = storedMode === "dark" ? 100 : 0;
      document.documentElement.setAttribute("data-theme", "primary");
      document.documentElement.setAttribute("data-theme-mode", storedMode);
      localStorage.setItem("theme", "primary");
      applyThemePalette("primary", safeStrength);
      document.documentElement.style.setProperty(
        "--theme-strength-pct",
        `${safeStrength}%`,
      );
    } catch {
      // ignore
    }
  }, []);

  return null;
}
