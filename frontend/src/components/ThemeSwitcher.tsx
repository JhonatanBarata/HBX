"use client";

import React from "react";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import {
  playThemeWaveTransition,
  type HbxThemeSelection,
} from "@/lib/design-tokens";
import { HBX_THEME_PALETTES, HBX_THEME_IDS, type HbxThemeId } from "@/lib/theme-palettes";
import LiquidGlassSegmentedControl from "./LiquidGlassSegmentedControl";

const THEME_MODE_OPTIONS = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
] as const;

const THEME_COUNT_LABEL = `${HBX_THEME_IDS.length} temas HBX`;

export default function ThemeSwitcher() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const { replayGlobalTransition } = useInterfaceTransition();
  const { selection, activeTheme, setSelection } = useHbxTheme();

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

  function resolveTransitionOrigin(target?: EventTarget | null) {
    const sourceElement = target instanceof Element
      ? target
      : document.activeElement instanceof Element
        ? document.activeElement
        : rootRef.current;

    const rect = sourceElement?.getBoundingClientRect();
    if (!rect) {
      return { x: window.innerWidth / 2, y: Math.min(112, window.innerHeight * 0.18) };
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function applySelection(nextSelection: HbxThemeSelection, target?: EventTarget | null) {
    playThemeWaveTransition(nextSelection, resolveTransitionOrigin(target));
    setSelection(nextSelection);
    replayGlobalTransition();
  }

  function handleThemeSelection(themeId: HbxThemeId, target?: EventTarget | null) {
    applySelection({ themeId, mode: selection.mode }, target);
    setOpen(false);
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
              <p className="theme-switcher__eyebrow">{THEME_COUNT_LABEL}</p>
              <strong className="theme-switcher__title">Escolha a experiência visual</strong>
            </div>
            <div className="theme-switcher__modeRow">
              <LiquidGlassSegmentedControl
                items={THEME_MODE_OPTIONS}
                value={selection.mode}
                ariaLabel="Modo de tema"
                onChange={(mode) => {
                  applySelection({ themeId: selection.themeId, mode }, document.activeElement);
                }}
              />
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
                  onClick={(event) => handleThemeSelection(themeId, event.currentTarget)}
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
                            background: `linear-gradient(145deg, ${palette.buttonPrimary}, ${palette.buttonAccent})`,
                          }}
                        />
                      </span>
                    </span>
                  </span>

                  <span className="theme-card__copy">
                    <span className="theme-card__headline">
                      <strong>{theme.label}</strong>
                      <span>{theme.shellLabel}</span>
                    </span>
                    <span className="theme-card__description">{theme.description}</span>
                    <span className="theme-card__actionsPreview" aria-hidden="true">
                      <span className="theme-card__actionSwatch" style={{ background: palette.buttonPrimary }} />
                      <span className="theme-card__actionSwatch" style={{ background: palette.buttonSecondary }} />
                      <span className="theme-card__actionSwatch" style={{ background: palette.buttonSuccess }} />
                      <span className="theme-card__actionSwatch" style={{ background: palette.buttonAccent }} />
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
