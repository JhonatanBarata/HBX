"use client";

import React from "react";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import { HBX_THEME_PALETTES, HBX_THEME_IDS, type HbxThemeId } from "@/lib/theme-palettes";

export default function ThemeSwitcher() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const { replayGlobalTransition } = useInterfaceTransition();
  const { selection, activeTheme, setMode, setThemeId } = useHbxTheme();

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

  function handleThemeSelection(themeId: HbxThemeId) {
    setThemeId(themeId);
    replayGlobalTransition();
  }

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
        </span>
        <span className="theme-switcher__modeBadge">
          {selection.mode === "dark" ? "Escuro" : "Claro"}
        </span>
      </button>

      {open ? (
        <div className="theme-switcher__panel" role="dialog" aria-label="Selecionar tema visual">
          <div className="theme-switcher__panelHeader">
            <div>
              <p className="theme-switcher__eyebrow">5 temas HBX</p>
              <strong className="theme-switcher__title">Escolha a experiência visual</strong>
            </div>
            <div className="theme-switcher__modeRow" role="group" aria-label="Modo de tema">
              <button
                type="button"
                className={`theme-mode-chip ${selection.mode === "light" ? "is-selected" : ""}`}
                onClick={() => {
                  setMode("light");
                  replayGlobalTransition();
                }}
              >
                Claro
              </button>
              <button
                type="button"
                className={`theme-mode-chip ${selection.mode === "dark" ? "is-selected" : ""}`}
                onClick={() => {
                  setMode("dark");
                  replayGlobalTransition();
                }}
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
                  onClick={() => handleThemeSelection(themeId)}
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
                    </span>
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
