"use client";

import React from "react";
import { THEME_PALETTES } from "@/lib/theme-palettes";

const DEFAULT_THEME_ID = "blue";

const THEME_LABELS: Record<string, string> = {
  blue: "Blue",
  green: "Green",
  grey: "Grey",
  pink: "Pink",
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
  const palette =
    (THEME_PALETTES as any)[id] || (THEME_PALETTES as any)[DEFAULT_THEME_ID];
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

type ThemeSwitcherProps = {
  storageUserId?: string | number | null;
};

export default function ThemeSwitcher({ storageUserId }: ThemeSwitcherProps) {
  const [mode, setMode] = React.useState<'light' | 'dark'>('light');
  const [selectedTheme, setSelectedTheme] = React.useState<string>(DEFAULT_THEME_ID);

  function applyTheme(id: string, nextMode: 'light' | 'dark') {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-theme", id);
    const value = nextMode === 'dark' ? 100 : 0;
    applyThemePalette(id, value);
    document.documentElement.style.setProperty("--theme-strength-pct", `${value}%`);
    document.documentElement.setAttribute('data-theme-mode', nextMode);
    try { localStorage.setItem('theme-mode', nextMode); } catch {}
  }

  function handleChipClick(id: string) {
    if (typeof window === 'undefined') return;
    if (id !== selectedTheme) {
      const nextMode: 'light' | 'dark' = 'light';
      setSelectedTheme(id);
      setMode(nextMode);
      applyTheme(id, nextMode);
      try { localStorage.setItem('theme', id); localStorage.setItem('theme-mode', nextMode); } catch {}
    } else {
      const nextMode: 'light' | 'dark' = mode === 'dark' ? 'light' : 'dark';
      setMode(nextMode);
      applyTheme(id, nextMode);
      try { localStorage.setItem('theme-mode', nextMode); } catch {}
    }
  }

  React.useEffect(() => {
    try {
      const storedMode = (localStorage.getItem('theme-mode') as 'light' | 'dark') || (document.documentElement.getAttribute('data-theme-mode') as 'light' | 'dark') || 'light';
      const storedTheme = (localStorage.getItem('theme') as string) || (document.documentElement.getAttribute('data-theme') as string) || DEFAULT_THEME_ID;
      setSelectedTheme(storedTheme);
      setMode(storedMode);
      applyTheme(storedTheme, storedMode);
    } catch {
      // ignore
    }
  }, [storageUserId]);

  return (
    <div className="theme-switcher-wrap">
      <div className="theme-switcher" role="group" aria-label="Tema visual">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {["blue", "green", "grey", "pink"].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleChipClick(id)}
              className={`theme-chip ${selectedTheme === id ? 'is-selected' : ''} ${id === DEFAULT_THEME_ID ? 'is-primary' : ''}`}
              aria-pressed={selectedTheme === id}
              title={`${THEME_LABELS[id]} - ${mode === 'light' ? 'Light' : 'Dark'}`}
            >
              {THEME_LABELS[id]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
