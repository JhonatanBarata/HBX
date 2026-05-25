"use client";

import React from "react";
import type { ThemePreferenceScope } from "@/components/ThemeProvider";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import {
  mergeThemeConfigChain,
  playThemeWaveTransition,
  resolveThemeConfig,
  type HbxThemeAppearanceConfig,
  type HbxResolvedThemeConfig,
  type HbxThemeConfig,
  type HbxThemeMotionStyle,
  type HbxThemeSelection,
} from "@/lib/design-tokens";
import { HBX_THEME_PALETTES, HBX_THEME_IDS, type HbxThemeId } from "@/lib/theme-palettes";
import LiquidGlassSegmentedControl from "./LiquidGlassSegmentedControl";

const THEME_MODE_OPTIONS = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
] as const;

const THEME_TRANSITION_OPTIONS: ReadonlyArray<{
  id: HbxThemeMotionStyle;
  label: string;
  controlLabel: string;
  description: string;
}> = [
  {
    id: "liquid-glass",
    label: "Liquid Glass",
    controlLabel: "Liquid Glass",
    description: "Vidro premium com preenchimento líquido, brilho e profundidade controlada.",
  },
  {
    id: "scroll-storytelling",
    label: "Scroll Reveal",
    controlLabel: "Scroll Reveal",
    description: "Revela de forma mais cinematográfica, com entradas em camadas e leitura mais narrativa.",
  },
  {
    id: "micro-interactions",
    label: "Microinterações",
    controlLabel: "Micro",
    description: "Mais contido, rápido e refinado, focado na resposta tátil da interface.",
  },
] as const;

const THEME_EDITOR_COLOR_CONTROLS: ReadonlyArray<{
  id: string;
  key: keyof HbxThemeAppearanceConfig;
  label: string;
  hint: string;
  base?: boolean;
  linkedKeys?: ReadonlyArray<keyof HbxThemeAppearanceConfig>;
}> = [
  {
    id: "base",
    key: "brand",
    label: "Principal",
    hint: "Marca, seleção e menu ativo.",
    base: true,
  },
  {
    id: "primary",
    key: "buttonPrimary",
    label: "Primário",
    hint: "CTA principal.",
  },
  {
    id: "support",
    key: "buttonSecondary",
    label: "Apoio",
    hint: "Ações neutras.",
    linkedKeys: ["menuInactive"],
  },
  {
    id: "success",
    key: "buttonSuccess",
    label: "Sucesso",
    hint: "Confirmações positivas.",
  },
  {
    id: "accent",
    key: "buttonAccent",
    label: "Destaque",
    hint: "Ações especiais.",
  },
] as const;

const THEME_COUNT_LABEL = "Tema HBX";
const HBX_BRAND_MARK_LEAD_MS = 980;
const HBX_BRAND_MARK_PULSE_MS = 1680;
const HBX_BRAND_MARK_RESET_MS = 2700;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function hasThemeConfigEntries(config: HbxThemeConfig | null | undefined) {
  if (!config) return false;

  return Boolean(
    (config.selection && Object.keys(config.selection).length) ||
      (config.appearance && Object.keys(config.appearance).length) ||
      (config.appearanceByTheme && Object.keys(config.appearanceByTheme).length) ||
      (config.motion && Object.keys(config.motion).length),
  );
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((chunk) => `${chunk}${chunk}`)
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

function primeHbxBrandMarkTransition(nextThemeState: HbxResolvedThemeConfig) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.style.setProperty("--hbx-brand-mark-next-primary", nextThemeState.appearance.brand);
  root.style.setProperty("--hbx-brand-mark-next-secondary", nextThemeState.appearance.buttonSecondary);
  root.style.setProperty("--hbx-brand-mark-next-accent", nextThemeState.appearance.buttonAccent);
  root.style.setProperty("--hbx-brand-mark-next-soft", withAlpha(nextThemeState.appearance.brand, 0.34));
  root.style.setProperty("--hbx-header-next-primary", withAlpha(nextThemeState.appearance.brand, 0.2));
  root.style.setProperty("--hbx-header-next-secondary", withAlpha(nextThemeState.appearance.buttonSecondary, 0.18));
  root.style.setProperty("--hbx-header-next-accent", withAlpha(nextThemeState.appearance.buttonAccent, 0.16));
  root.setAttribute("data-hbx-brand-mark-transitioning", "true");
  root.removeAttribute("data-hbx-brand-mark-pulse");

  window.setTimeout(() => {
    root.removeAttribute("data-hbx-brand-mark-transitioning");
  }, HBX_BRAND_MARK_LEAD_MS);

  window.setTimeout(() => {
    root.setAttribute("data-hbx-brand-mark-pulse", "true");
  }, HBX_BRAND_MARK_LEAD_MS + HBX_BRAND_MARK_PULSE_MS);

  window.setTimeout(() => {
    root.removeAttribute("data-hbx-brand-mark-pulse");
    root.style.removeProperty("--hbx-brand-mark-next-primary");
    root.style.removeProperty("--hbx-brand-mark-next-secondary");
    root.style.removeProperty("--hbx-brand-mark-next-accent");
    root.style.removeProperty("--hbx-brand-mark-next-soft");
    root.style.removeProperty("--hbx-header-next-primary");
    root.style.removeProperty("--hbx-header-next-secondary");
    root.style.removeProperty("--hbx-header-next-accent");
  }, HBX_BRAND_MARK_LEAD_MS + HBX_BRAND_MARK_RESET_MS);
}

function resolveThemeCardPreview(
  themeId: HbxThemeId,
  mode: HbxThemeSelection["mode"],
  config?: HbxThemeConfig | null,
) {
  const theme = HBX_THEME_PALETTES[themeId];
  const palette = theme[mode];
  const resolved = resolveThemeConfig(mergeThemeConfigChain(config, { selection: { themeId, mode } }));

  return {
    theme,
    palette,
    appearance: resolved.appearance,
  };
}

const SINGLE_THEME_ID = HBX_THEME_IDS[0];

export default function ThemeSwitcher() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorScope, setEditorScope] = React.useState<ThemePreferenceScope>("user");
  const [editorDraftConfig, setEditorDraftConfig] = React.useState<HbxThemeConfig | null>(null);
  const [editorResetPending, setEditorResetPending] = React.useState(false);
  const { replayGlobalTransition } = useInterfaceTransition();
  const {
    selection,
    activeTheme,
    setSelection,
    themeState,
    saveScopeConfig,
    resetScopeConfig,
  } = useHbxTheme();

  const scopeOptions = React.useMemo(() => {
    const items: Array<{ id: ThemePreferenceScope; label: string }> = [{ id: "user", label: "Você" }];

    if (themeState.permissions.canEditCompany && themeState.permissions.companyId) {
      items.unshift({ id: "company", label: "Empresa" });
    }

    if (themeState.permissions.canEditSystem) {
      items.unshift({ id: "system", label: "Sistema" });
    }

    return items;
  }, [themeState.permissions.canEditCompany, themeState.permissions.canEditSystem, themeState.permissions.companyId]);

  const scopedResolved = React.useMemo(
    () => ({
      system: resolveThemeConfig(themeState.scopes.system),
      company: resolveThemeConfig(
        mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company),
      ),
      user: themeState.resolved,
    }),
    [themeState.resolved, themeState.scopes.company, themeState.scopes.system],
  );

  const selectedScopeConfig = themeState.scopes[editorScope];
  const selectedScopeSignature = React.useMemo(
    () => JSON.stringify(selectedScopeConfig || null),
    [selectedScopeConfig],
  );
  const draftScopeSignature = React.useMemo(
    () => JSON.stringify(editorDraftConfig || null),
    [editorDraftConfig],
  );
  const draftScopedResolved = React.useMemo(
    () => ({
      system: resolveThemeConfig(editorDraftConfig),
      company: resolveThemeConfig(mergeThemeConfigChain(themeState.scopes.system, editorDraftConfig)),
      user: resolveThemeConfig(
        mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company, editorDraftConfig),
      ),
    }),
    [editorDraftConfig, themeState.scopes.company, themeState.scopes.system],
  );
  const activeEditorState: HbxResolvedThemeConfig = editorOpen
    ? draftScopedResolved[editorScope]
    : scopedResolved[editorScope];
  const activeEditorConfig = React.useMemo(() => {
    if (!editorOpen) {
      if (editorScope === "system") return themeState.scopes.system;
      if (editorScope === "company") return mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company);
      return mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company, themeState.scopes.user);
    }

    if (editorScope === "system") return editorDraftConfig;
    if (editorScope === "company") return mergeThemeConfigChain(themeState.scopes.system, editorDraftConfig);
    return mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company, editorDraftConfig);
  }, [
    editorDraftConfig,
    editorOpen,
    editorScope,
    themeState.scopes.company,
    themeState.scopes.system,
    themeState.scopes.user,
  ]);
  const editorDirty = editorResetPending || draftScopeSignature !== selectedScopeSignature;
  const canResetScope = Boolean(
    (selectedScopeConfig &&
      ((selectedScopeConfig.selection && Object.keys(selectedScopeConfig.selection).length) ||
        (selectedScopeConfig.appearance && Object.keys(selectedScopeConfig.appearance).length) ||
        (selectedScopeConfig.motion && Object.keys(selectedScopeConfig.motion).length))) ||
      hasThemeConfigEntries(editorDraftConfig),
  );
  const activeEditorPalette = React.useMemo(
    () => HBX_THEME_PALETTES[activeEditorState.selection.themeId][activeEditorState.selection.mode],
    [activeEditorState.selection.mode, activeEditorState.selection.themeId],
  );
  const activeTransitionOption = React.useMemo(
    () =>
      THEME_TRANSITION_OPTIONS.find((option) => option.id === activeEditorState.motion.transitionStyle) ||
      THEME_TRANSITION_OPTIONS[0],
    [activeEditorState.motion.transitionStyle],
  );
  const livePreviewStyle = React.useMemo(
    () =>
      ({
        colorScheme: activeEditorState.selection.mode,
        "--background": activeEditorPalette.background,
        "--background-alt": activeEditorPalette.backgroundAlt,
        "--surface": activeEditorPalette.surface,
        "--surface-soft": activeEditorPalette.surfaceSoft,
        "--surface-raised": activeEditorPalette.surfaceRaised,
        "--header-surface": activeEditorPalette.headerSurface,
        "--nav-surface": activeEditorPalette.navSurface,
        "--brand": activeEditorState.appearance.brand,
        "--brand-solid": activeEditorState.appearance.brand,
        "--foreground": activeEditorPalette.foreground,
        "--foreground-soft": activeEditorPalette.foregroundSoft,
        "--muted": activeEditorPalette.muted,
        "--line": activeEditorPalette.line,
        "--button-primary": activeEditorState.appearance.buttonPrimary,
        "--button-secondary": activeEditorState.appearance.buttonSecondary,
        "--button-success": activeEditorState.appearance.buttonSuccess,
        "--button-accent": activeEditorState.appearance.buttonAccent,
        "--button-primary-soft": withAlpha(
          activeEditorState.appearance.buttonPrimary,
          activeEditorState.selection.mode === "light" ? 0.18 : 0.3,
        ),
        "--button-secondary-soft": withAlpha(
          activeEditorState.appearance.buttonSecondary,
          activeEditorState.selection.mode === "light" ? 0.16 : 0.28,
        ),
        "--button-success-soft": withAlpha(
          activeEditorState.appearance.buttonSuccess,
          activeEditorState.selection.mode === "light" ? 0.18 : 0.28,
        ),
        "--button-accent-soft": withAlpha(
          activeEditorState.appearance.buttonAccent,
          activeEditorState.selection.mode === "light" ? 0.18 : 0.3,
        ),
        "--selection-accent": activeEditorState.appearance.selectionAccent,
        "--selection-accent-soft": withAlpha(
          activeEditorState.appearance.selectionAccent,
          activeEditorState.selection.mode === "light" ? 0.18 : 0.3,
        ),
        "--menu-active": activeEditorState.appearance.menuActive,
        "--menu-active-soft": withAlpha(
          activeEditorState.appearance.menuActive,
          activeEditorState.selection.mode === "light" ? 0.16 : 0.28,
        ),
        "--menu-inactive": activeEditorState.appearance.menuInactive,
        "--menu-inactive-soft": withAlpha(
          activeEditorState.appearance.menuInactive,
          activeEditorState.selection.mode === "light" ? 0.14 : 0.22,
        ),
        "--menu-disabled": activeEditorState.appearance.menuDisabled,
        "--menu-disabled-soft": withAlpha(
          activeEditorState.appearance.menuDisabled,
          activeEditorState.selection.mode === "light" ? 0.14 : 0.24,
        ),
        "--theme-editor-preview-primary": activeEditorState.appearance.buttonPrimary,
        "--theme-editor-preview-brand": activeEditorState.appearance.brand,
        "--theme-editor-preview-secondary": activeEditorState.appearance.buttonSecondary,
        "--theme-editor-preview-success": activeEditorState.appearance.buttonSuccess,
        "--theme-editor-preview-accent": activeEditorState.appearance.buttonAccent,
        "--theme-editor-preview-selection": activeEditorState.appearance.selectionAccent,
        "--theme-editor-preview-menu-active": activeEditorState.appearance.menuActive,
        "--theme-editor-preview-menu-inactive": activeEditorState.appearance.menuInactive,
        "--theme-editor-preview-menu-disabled": activeEditorState.appearance.menuDisabled,
      }) as React.CSSProperties,
    [activeEditorPalette, activeEditorState.appearance, activeEditorState.selection.mode],
  );

  React.useEffect(() => {
    if (!open) {
      setEditorOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const root = document.documentElement;

    if (open) {
      root.setAttribute("data-theme-switcher-open", "true");
      return () => {
        root.removeAttribute("data-theme-switcher-open");
      };
    }

    root.removeAttribute("data-theme-switcher-open");
    return undefined;
  }, [open]);

  React.useEffect(() => {
    if (scopeOptions.some((item) => item.id === editorScope)) return;
    setEditorScope(scopeOptions[scopeOptions.length - 1]?.id || "user");
  }, [editorScope, scopeOptions]);

  React.useEffect(() => {
    if (!editorOpen) return;

    setEditorDraftConfig(selectedScopeConfig ? mergeThemeConfigChain(selectedScopeConfig) : null);
    setEditorResetPending(false);
  }, [editorOpen, editorScope, selectedScopeConfig]);

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
    const hbxBrandMark = document.getElementById("app-modules-trigger");
    const sourceElement = hbxBrandMark || (target instanceof Element
      ? target
      : document.activeElement instanceof Element
        ? document.activeElement
        : rootRef.current);

    const rect = sourceElement?.getBoundingClientRect();
    if (!rect) {
      return { x: window.innerWidth / 2, y: Math.min(112, window.innerHeight * 0.18) };
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  async function applySelection(nextSelection: HbxThemeSelection, target?: EventTarget | null) {
    const normalizedSelection = { ...nextSelection, themeId: SINGLE_THEME_ID };
    const nextThemeState = resolveThemeConfig(
      mergeThemeConfigChain(themeState.scopes.system, themeState.scopes.company, themeState.scopes.user, {
        selection: normalizedSelection,
      }),
    );
    primeHbxBrandMarkTransition(nextThemeState);
    await wait(HBX_BRAND_MARK_LEAD_MS);
    playThemeWaveTransition(
      normalizedSelection,
      resolveTransitionOrigin(target),
      nextThemeState,
    );
    setSelection(normalizedSelection);
    replayGlobalTransition();
  }

  function handleThemeSelection(target?: EventTarget | null) {
    void applySelection({ themeId: SINGLE_THEME_ID, mode: selection.mode }, target);
    setOpen(false);
  }

  function updateEditorDraftConfig(patch: HbxThemeConfig) {
    setEditorResetPending(false);
    setEditorDraftConfig((current) => mergeThemeConfigChain(current, patch));
  }

  function updateScopeSelection(nextSelection: Partial<HbxThemeSelection>) {
    const mergedSelection = {
      themeId: SINGLE_THEME_ID,
      mode: nextSelection.mode || activeEditorState.selection.mode,
    } satisfies HbxThemeSelection;

    updateEditorDraftConfig({ selection: mergedSelection });
  }

  function updateScopeThemeAppearance(
    values: Partial<Record<keyof HbxThemeAppearanceConfig, string>>,
    clearKeys: ReadonlyArray<keyof HbxThemeAppearanceConfig> = [],
  ) {
    setEditorResetPending(false);
    setEditorDraftConfig((current) => {
      const next = mergeThemeConfigChain(current, {
        appearanceByTheme: {
          [activeEditorState.selection.themeId]: values,
        },
      });
      const updatedKeys = [...Object.keys(values), ...clearKeys] as Array<keyof HbxThemeAppearanceConfig>;
      const themeAppearance = next.appearanceByTheme?.[activeEditorState.selection.themeId];

      if (themeAppearance) {
        clearKeys.forEach((key) => {
          delete themeAppearance[key];
        });
      }

      if (next.appearanceByTheme && themeAppearance && !Object.keys(themeAppearance).length) {
        delete next.appearanceByTheme[activeEditorState.selection.themeId];
      }

      if (next.appearanceByTheme && !Object.keys(next.appearanceByTheme).length) {
        delete next.appearanceByTheme;
      }

      if (next.appearance) {
        updatedKeys.forEach((key) => {
          delete next.appearance?.[key];
        });
        if (!Object.keys(next.appearance).length) delete next.appearance;
      }

      return next;
    });
  }

  function updateScopeBaseColor(value: string) {
    updateScopeThemeAppearance(
      {
        brand: value,
        selectionAccent: value,
        menuActive: value,
      },
      ["menuDisabled"],
    );
  }

  function updateScopeColorControl(
    control: (typeof THEME_EDITOR_COLOR_CONTROLS)[number],
    value: string,
  ) {
    if (control.base) {
      updateScopeBaseColor(value);
      return;
    }

    updateScopeThemeAppearance(
      {
        [control.key]: value,
        ...(control.linkedKeys || []).reduce<Partial<Record<keyof HbxThemeAppearanceConfig, string>>>(
          (acc, key) => ({ ...acc, [key]: value }),
          {},
        ),
      },
      ["menuDisabled"],
    );
  }

  function updateScopeMotion(transitionStyle: HbxThemeMotionStyle) {
    updateEditorDraftConfig({ motion: { transitionStyle } });
  }

  function resetEditorDraft() {
    setEditorDraftConfig(null);
    setEditorResetPending(Boolean(selectedScopeConfig));
  }

  function cancelEditorDraft() {
    setEditorDraftConfig(selectedScopeConfig ? mergeThemeConfigChain(selectedScopeConfig) : null);
    setEditorResetPending(false);
    setEditorOpen(false);
  }

  async function applyEditorDraft(target?: EventTarget | null) {
    if (!editorDirty) return;

    if (editorScope === "user") {
      primeHbxBrandMarkTransition(activeEditorState);
      await wait(HBX_BRAND_MARK_LEAD_MS);
      playThemeWaveTransition(activeEditorState.selection, resolveTransitionOrigin(target), activeEditorState);
      replayGlobalTransition();
    }

    if (editorResetPending && !editorDraftConfig) {
      await resetScopeConfig(editorScope);
    } else if (editorDraftConfig) {
      await saveScopeConfig(editorScope, editorDraftConfig);
    }

    setEditorResetPending(false);
    setEditorOpen(false);
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
            background: `linear-gradient(145deg, ${themeState.resolved.appearance.brand}, ${themeState.resolved.appearance.buttonSecondary})`,
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
              <strong className="theme-switcher__title">Personalize a experiência visual</strong>
              <p className="theme-switcher__subtitle">
                Um tema base com controle fino de cores, modo e transições.
              </p>
            </div>
            <div className="theme-switcher__panelActions">
              <div className="theme-switcher__modeRow">
                <LiquidGlassSegmentedControl
                  items={THEME_MODE_OPTIONS}
                  value={selection.mode}
                  ariaLabel="Modo de tema"
                  onChange={(mode) => {
                    void applySelection({ themeId: SINGLE_THEME_ID, mode }, document.activeElement);
                  }}
                />
              </div>

              <button
                type="button"
                className={`theme-switcher__editorToggle ${editorOpen ? "is-open" : ""}`}
                onClick={() => setEditorOpen((current) => !current)}
                aria-expanded={editorOpen}
                aria-label="Abrir editor do tema"
                title="Editar cores e transições"
              >
                <span className="theme-switcher__editorIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M10.35 3.84 9.6 5.74a1 1 0 0 1-.78.62l-2.06.3a1 1 0 0 0-.55 1.69l1.48 1.45a1 1 0 0 1 .29.89l-.35 2.05a1 1 0 0 0 1.45 1.06l1.84-.97a1 1 0 0 1 .93 0l1.84.97a1 1 0 0 0 1.45-1.06l-.35-2.05a1 1 0 0 1 .29-.89l1.48-1.45a1 1 0 0 0-.55-1.69l-2.06-.3a1 1 0 0 1-.78-.62l-.75-1.9a1 1 0 0 0-1.86 0Z" />
                    <circle cx="12" cy="12" r="2.7" />
                  </svg>
                </span>
                <span>Editor</span>
              </button>
            </div>
          </div>

          <div className="theme-switcher__grid">
            {(() => {
              const { theme, palette, appearance } = resolveThemeCardPreview(
                SINGLE_THEME_ID,
                selection.mode,
                activeEditorConfig,
              );

              return (
                <button
                  type="button"
                  onClick={(event) => handleThemeSelection(event.currentTarget)}
                  className="theme-card is-selected"
                  aria-pressed="true"
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
                        style={{
                          background: `linear-gradient(180deg, ${palette.navSurface}, ${withAlpha(appearance.selectionAccent, selection.mode === "light" ? 0.18 : 0.28)})`,
                        }}
                      />
                      <span className="theme-card__previewStack">
                        <span
                          className="theme-card__previewMetric"
                          style={{
                            background: `linear-gradient(145deg, ${withAlpha(appearance.menuActive, selection.mode === "light" ? 0.18 : 0.32)}, ${palette.surface})`,
                          }}
                        />
                        <span
                          className="theme-card__previewMetric"
                          style={{
                            background: `linear-gradient(145deg, ${withAlpha(appearance.menuInactive, selection.mode === "light" ? 0.18 : 0.3)}, ${palette.surfaceRaised})`,
                          }}
                        />
                        <span
                          className="theme-card__previewCta"
                          style={{
                            background: `linear-gradient(145deg, ${appearance.buttonPrimary}, ${appearance.buttonAccent})`,
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
                  </span>
                </button>
              );
            })()}
          </div>

          {editorOpen ? (
            <div className="theme-editor">
              <div className="theme-editor__header">
                <div>
                  <p className="theme-switcher__eyebrow">Tema</p>
                  <strong className="theme-editor__title">Editor</strong>
                </div>

                <div className="theme-editor__scopeWrap">
                  <LiquidGlassSegmentedControl
                    items={scopeOptions}
                    value={editorScope}
                    ariaLabel="Escopo das preferências do tema"
                    onChange={(scope) => setEditorScope(scope)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={resetEditorDraft}
                    disabled={!canResetScope}
                  >
                    Restaurar
                  </button>
                </div>
              </div>

              <section className="theme-editor__section">
                <div className="theme-editor__sectionHeader">
                  <div>
                    <strong>Cores</strong>
                    <p>Principal + quatro ações do sistema.</p>
                  </div>
                </div>

                <div className="theme-editor__tokenGrid theme-editor__tokenGrid--compact">
                  {THEME_EDITOR_COLOR_CONTROLS.map((control) => {
                    const value = activeEditorState.appearance[control.key];

                    return (
                      <label
                        key={control.id}
                        className={control.base ? "theme-editor__baseColorField" : "theme-editor__tokenField"}
                      >
                        <span className="theme-editor__tokenMeta">
                          <strong>{control.label}</strong>
                          <small>{control.hint}</small>
                        </span>
                        <span className="theme-editor__tokenControls">
                          <input
                            type="color"
                            value={value}
                            className="theme-editor__tokenPicker"
                            onChange={(event) => updateScopeColorControl(control, event.target.value)}
                            aria-label={`Escolher cor ${control.label}`}
                          />
                          <span className="theme-editor__tokenValue">{value}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="theme-editor__section">
                <div className="theme-editor__sectionHeader">
                  <div>
                    <strong>Modo e movimento</strong>
                    <p>{activeTransitionOption.label}</p>
                  </div>
                </div>

                <div className="theme-editor__quickControls">
                  <div className="theme-editor__modeBar">
                    <LiquidGlassSegmentedControl
                      items={THEME_MODE_OPTIONS}
                      value={activeEditorState.selection.mode}
                      ariaLabel="Modo do tema neste escopo"
                      onChange={(mode) => updateScopeSelection({ mode })}
                    />
                  </div>

                  <div className="theme-editor__motionSelector">
                    <LiquidGlassSegmentedControl
                      items={THEME_TRANSITION_OPTIONS.map((option) => ({
                        id: option.id,
                        label: option.controlLabel,
                      }))}
                      value={activeEditorState.motion.transitionStyle}
                      ariaLabel="Família de transição do sistema"
                      onChange={(transitionStyle) => updateScopeMotion(transitionStyle)}
                    />
                  </div>
                </div>

                <div className="theme-editor__compactPreview" style={livePreviewStyle} aria-hidden="true">
                  <span className="btn btn-primary btn-sm theme-editor__previewSystemButton">Salvar</span>
                  <span className="btn btn-secondary btn-sm theme-editor__previewSystemButton">Ver</span>
                  <span className="btn btn-success btn-sm theme-editor__previewSystemButton">Ok</span>
                  <span className="btn btn-accent btn-sm theme-editor__previewSystemButton">Destaque</span>
                  <span className="theme-editor__previewChip theme-editor__previewChip--selected">Ativo</span>
                </div>
              </section>

              <div className="theme-editor__footer">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={cancelEditorDraft}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={(event) => void applyEditorDraft(event.currentTarget)}
                  disabled={!editorDirty}
                >
                  Aplicar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
