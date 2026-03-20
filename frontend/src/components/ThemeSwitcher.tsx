"use client";

import React from "react";
import { applyThemeSelectionToDocument } from "@/lib/design-tokens";
import { HBX_THEME_PALETTES, HBX_THEME_IDS, type HbxThemeId } from "@/lib/theme-palettes";
import {
  persistThemeSelection,
  readStoredThemeSelection,
} from "@/lib/theme-preferences";

type ThemeSwitcherProps = {
  storageUserId?: string | number | null;
};

export default function ThemeSwitcher({ storageUserId }: ThemeSwitcherProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [selection, setSelection] = React.useState(() =>
    readStoredThemeSelection(storageUserId),
  );

  const activeTheme = HBX_THEME_PALETTES[selection.themeId];

  function commitTheme(nextThemeId: HbxThemeId, explicitMode?: "light" | "dark") {
    const nextSelection = {
      themeId: nextThemeId,
      mode:
        explicitMode ??
        (selection.themeId === nextThemeId && selection.mode === "light" ? "dark" : "light"),
    } as const;

    setSelection(nextSelection);
    applyThemeSelectionToDocument(nextSelection);
    persistThemeSelection(nextSelection, storageUserId);
  }

  React.useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    const nextSelection = readStoredThemeSelection(storageUserId);
    setSelection(nextSelection);
    applyThemeSelectionToDocument(nextSelection);
  }, [storageUserId]);

  return (
    <div className="theme-switcher-wrap" ref={rootRef}>
      <button
        type="button"
        className={`theme-switcher__trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className="theme-switcher__trigger-preview"
          style={{
            background: `linear-gradient(145deg, ${activeTheme[selection.mode].brand}, ${activeTheme[selection.mode].brandStrong})`,
          }}
          aria-hidden="true"
        />
        <span className="theme-switcher__trigger-copy">
          <span className="theme-switcher__label">Tema visual</span>
          <strong>{activeTheme.label}</strong>
          <span className="theme-switcher__trigger-meta">{activeTheme.shellLabel}</span>
        </span>
        <span className="theme-switcher__modeBadge">
          {selection.mode === "dark" ? "Dark" : "Light"}
        </span>
      </button>

      {open ? (
        <div className="theme-switcher__panel" role="dialog" aria-label="Selecionar tema visual">
          <div className="theme-switcher__panelHeader">
            <div>
              <p className="theme-switcher__eyebrow">5 skins HBX</p>
              <strong className="theme-switcher__title">Escolha a experiencia visual</strong>
              <p className="theme-switcher__subtitle">
                O HBX troca shell, profundidade, ritmo e assinatura visual em tempo real, preservando os mesmos fluxos e contratos.
              </p>
            </div>
            <div className="theme-switcher__modeRow" role="group" aria-label="Modo de tema">
              <button
                type="button"
                className={`theme-mode-chip ${selection.mode === "light" ? "is-selected" : ""}`}
                onClick={() => commitTheme(selection.themeId, "light")}
              >
                Claro
              </button>
              <button
                type="button"
                className={`theme-mode-chip ${selection.mode === "dark" ? "is-selected" : ""}`}
                onClick={() => commitTheme(selection.themeId, "dark")}
              >
                Escuro
              </button>
            </div>
          </div>

          <div className="theme-switcher__grid">
            {HBX_THEME_IDS.map((themeId) => {
              const theme = HBX_THEME_PALETTES[themeId];
              const palette = theme[selection.mode];
              const active = selection.themeId === themeId;

              return (
                <button
                  key={themeId}
                  type="button"
                  onClick={() => commitTheme(themeId)}
                  className={`theme-card ${active ? "is-selected" : ""}`}
                  aria-pressed={active}
                >
                  <span
                    className="theme-card__preview"
                    style={{
                      background: `linear-gradient(155deg, ${palette.heroFrom}, ${palette.heroTo})`,
                    }}
                    aria-hidden="true"
                  >
                    <span
                      className="theme-card__previewTop"
                      style={{ background: palette.headerSurface }}
                    />
                    <span className="theme-card__previewBody">
                      <span
                        className="theme-card__previewNav"
                        style={{ background: palette.navSurface }}
                      />
                      <span className="theme-card__previewStack">
                        <span
                          className="theme-card__previewMetric"
                          style={{ background: palette.surface }}
                        />
                        <span
                          className="theme-card__previewMetric"
                          style={{ background: palette.surfaceRaised }}
                        />
                        <span
                          className="theme-card__previewCta"
                          style={{
                            background: `linear-gradient(145deg, ${palette.brand}, ${palette.brandStrong})`,
                          }}
                        />
                      </span>
                    </span>
                  </span>

                  <span className="theme-card__copy">
                    <span className="theme-card__headline">
                      <strong>{theme.label}</strong>
                      <span>{theme.inspiration}</span>
                    </span>
                    <span className="theme-card__tags">
                      <span>{theme.shellLabel}</span>
                      <span>{theme.densityLabel}</span>
                      <span>{theme.depthLabel}</span>
                    </span>
                    <span className="theme-card__description">{theme.description}</span>
                    <span className="theme-card__personality">{theme.personality}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
