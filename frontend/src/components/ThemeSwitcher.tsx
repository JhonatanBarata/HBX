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
  type HbxThemeMotionStyle,
  type HbxThemeSelection,
} from "@/lib/design-tokens";
import { HBX_THEME_PALETTES, HBX_THEME_IDS, type HbxThemeId } from "@/lib/theme-palettes";
import LiquidGlassSegmentedControl from "./LiquidGlassSegmentedControl";

const THEME_MODE_OPTIONS = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
] as const;

const THEME_SCOPE_DESCRIPTIONS: Record<ThemePreferenceScope, string> = {
  system: "Padrão global do sistema. O master decide aqui.",
  company: "Padrão da empresa para quem não tem override pessoal.",
  user: "Seu override pessoal. Vale só para você.",
};

const THEME_TRANSITION_OPTIONS: ReadonlyArray<{
  id: HbxThemeMotionStyle;
  label: string;
  description: string;
}> = [
  {
    id: "liquid-glass",
    label: "Liquid Glass",
    description: "Vidro premium com preenchimento líquido, brilho e profundidade controlada.",
  },
  {
    id: "scroll-storytelling",
    label: "Scroll Reveal",
    description: "Revela de forma mais cinematográfica, com entradas em camadas e leitura mais narrativa.",
  },
  {
    id: "micro-interactions",
    label: "Microinterações",
    description: "Mais contido, rápido e refinado, focado na resposta tátil da interface.",
  },
] as const;

const THEME_EDITOR_GROUPS: ReadonlyArray<{
  title: string;
  description: string;
  items: ReadonlyArray<{
    key: keyof HbxThemeAppearanceConfig;
    label: string;
    hint: string;
  }>;
}> = [
  {
    title: "Botões",
    description: "Cores dos principais CTAs e ações da interface.",
    items: [
      { key: "buttonPrimary", label: "Botão primário", hint: "Ação principal" },
      { key: "buttonSecondary", label: "Botão secundário", hint: "Apoio e ações neutras" },
      { key: "buttonSuccess", label: "Botão de sucesso", hint: "Confirmações positivas" },
      { key: "buttonAccent", label: "Botão de destaque", hint: "Ações especiais e glow" },
    ],
  },
  {
    title: "Seleções e menus",
    description: "Estados ativos, inativos e desativados da navegação e dos seletores.",
    items: [
      { key: "selectionAccent", label: "Seleção", hint: "Chips, abas e estado selecionado" },
      { key: "menuActive", label: "Menu ativo", hint: "Card de módulo ativo" },
      { key: "menuInactive", label: "Menu inativo", hint: "Texto e selo do estado neutro" },
      { key: "menuDisabled", label: "Menu desativado", hint: "Itens bloqueados ou indisponíveis" },
    ],
  },
] as const;

const THEME_COUNT_LABEL = `${HBX_THEME_IDS.length} temas HBX`;

export default function ThemeSwitcher() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorScope, setEditorScope] = React.useState<ThemePreferenceScope>("user");
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

  const activeEditorState = scopedResolved[editorScope];
  const selectedScopeConfig = themeState.scopes[editorScope];
  const canResetScope = Boolean(
    selectedScopeConfig &&
      ((selectedScopeConfig.selection && Object.keys(selectedScopeConfig.selection).length) ||
        (selectedScopeConfig.appearance && Object.keys(selectedScopeConfig.appearance).length) ||
        (selectedScopeConfig.motion && Object.keys(selectedScopeConfig.motion).length)),
  );
  const previewScopeLabel = scopeOptions.find((item) => item.id === editorScope)?.label || "Você";
  const livePreviewStyle = React.useMemo(
    () =>
      ({
        "--theme-editor-preview-primary": activeEditorState.appearance.buttonPrimary,
        "--theme-editor-preview-secondary": activeEditorState.appearance.buttonSecondary,
        "--theme-editor-preview-success": activeEditorState.appearance.buttonSuccess,
        "--theme-editor-preview-accent": activeEditorState.appearance.buttonAccent,
        "--theme-editor-preview-selection": activeEditorState.appearance.selectionAccent,
        "--theme-editor-preview-menu-active": activeEditorState.appearance.menuActive,
        "--theme-editor-preview-menu-inactive": activeEditorState.appearance.menuInactive,
        "--theme-editor-preview-menu-disabled": activeEditorState.appearance.menuDisabled,
      }) as React.CSSProperties,
    [activeEditorState.appearance],
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
    playThemeWaveTransition(
      nextSelection,
      resolveTransitionOrigin(target),
      mergeThemeConfigChain(themeState.resolved, { selection: nextSelection }),
    );
    setSelection(nextSelection);
    replayGlobalTransition();
  }

  function handleThemeSelection(themeId: HbxThemeId, target?: EventTarget | null) {
    applySelection({ themeId, mode: selection.mode }, target);
    setOpen(false);
  }

  function updateScopeSelection(nextSelection: Partial<HbxThemeSelection>, target?: EventTarget | null) {
    const mergedSelection = {
      themeId: nextSelection.themeId || activeEditorState.selection.themeId,
      mode: nextSelection.mode || activeEditorState.selection.mode,
    } satisfies HbxThemeSelection;

    if (editorScope === "user") {
      playThemeWaveTransition(
        mergedSelection,
        resolveTransitionOrigin(target),
        mergeThemeConfigChain(themeState.resolved, { selection: mergedSelection }),
      );
      setSelection(mergedSelection);
      replayGlobalTransition();
      return;
    }

    void saveScopeConfig(editorScope, { selection: mergedSelection });
  }

  function updateScopeAppearance(key: keyof HbxThemeAppearanceConfig, value: string) {
    void saveScopeConfig(editorScope, { appearance: { [key]: value } });
  }

  function updateScopeMotion(transitionStyle: HbxThemeMotionStyle) {
    void saveScopeConfig(editorScope, { motion: { transitionStyle } });
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
              <p className="theme-switcher__subtitle">
                Tema base para o seu uso diário. A engrenagem abre o editor fino de cores e transições.
              </p>
            </div>
            <div className="theme-switcher__panelActions">
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

          {editorOpen ? (
            <div className="theme-editor">
              <div className="theme-editor__header">
                <div>
                  <p className="theme-switcher__eyebrow">Editor premium</p>
                  <strong className="theme-editor__title">Cores e transições</strong>
                  <p className="theme-editor__copy">{THEME_SCOPE_DESCRIPTIONS[editorScope]}</p>
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
                    onClick={() => void resetScopeConfig(editorScope)}
                    disabled={!canResetScope}
                  >
                    Restaurar escopo
                  </button>
                </div>
              </div>

              <section className="theme-editor__section">
                <div className="theme-editor__sectionHeader">
                  <div>
                    <strong>Tema base</strong>
                    <p>Define a base visual do escopo atual.</p>
                  </div>
                </div>

                <div className="theme-editor__presetGrid">
                  {HBX_THEME_IDS.map((themeId) => {
                    const theme = HBX_THEME_PALETTES[themeId];
                    const isActive = activeEditorState.selection.themeId === themeId;

                    return (
                      <button
                        key={`preset-${themeId}`}
                        type="button"
                        className={`theme-editor__preset ${isActive ? "is-active" : ""}`}
                        onClick={(event) => updateScopeSelection({ themeId }, event.currentTarget)}
                      >
                        <strong>{theme.label}</strong>
                        <span>{theme.shellLabel}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="theme-editor__modeBar">
                  <LiquidGlassSegmentedControl
                    items={THEME_MODE_OPTIONS}
                    value={activeEditorState.selection.mode}
                    ariaLabel="Modo do tema neste escopo"
                    onChange={(mode) => updateScopeSelection({ mode }, document.activeElement)}
                  />
                </div>
              </section>

              <section className="theme-editor__section">
                <div className="theme-editor__sectionHeader">
                  <div>
                    <strong>Família de transição</strong>
                    <p>Escolha a linguagem de motion do sistema.</p>
                  </div>
                </div>

                <div className="theme-editor__motionGrid">
                  {THEME_TRANSITION_OPTIONS.map((option) => {
                    const active = activeEditorState.motion.transitionStyle === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`theme-editor__motionCard ${active ? "is-active" : ""}`}
                        onClick={() => updateScopeMotion(option.id)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="theme-editor__motionPreview"
                  data-motion-style={activeEditorState.motion.transitionStyle}
                  style={livePreviewStyle}
                >
                  <span className="theme-editor__motionPreviewEyebrow">Prévia da transição</span>
                  <div className="theme-editor__motionPreviewTrack" aria-hidden="true">
                    <span className="theme-editor__motionPreviewPill">Painel entra</span>
                    <span className="theme-editor__motionPreviewPill">Botão responde</span>
                    <span className="theme-editor__motionPreviewPill">Menu ativa</span>
                  </div>
                </div>

                <p className="theme-editor__recommendation">
                  Recomendação HBX: Liquid Glass controlado + microinterações premium + scroll reveal leve.
                </p>
              </section>

              {THEME_EDITOR_GROUPS.map((group) => (
                <section key={group.title} className="theme-editor__section">
                  <div className="theme-editor__sectionHeader">
                    <div>
                      <strong>{group.title}</strong>
                      <p>{group.description}</p>
                    </div>
                  </div>

                  <div className="theme-editor__tokenGrid">
                    {group.items.map((item) => {
                      const value = activeEditorState.appearance[item.key];

                      return (
                        <label key={item.key} className="theme-editor__tokenField">
                          <span className="theme-editor__tokenMeta">
                            <strong>{item.label}</strong>
                            <small>{item.hint}</small>
                          </span>
                          <span className="theme-editor__tokenControls">
                            <input
                              type="color"
                              value={value}
                              className="theme-editor__tokenPicker"
                              onChange={(event) => updateScopeAppearance(item.key, event.target.value)}
                              aria-label={`Escolher cor de ${item.label}`}
                            />
                            <span className="theme-editor__tokenValue">{value}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="theme-editor__stickyPreview" style={livePreviewStyle}>
                <div className="theme-editor__stickyPreviewHeader">
                  <div>
                    <strong>Prévia ao vivo</strong>
                    <p>Você edita e já vê o resultado final.</p>
                  </div>
                  <span className="theme-editor__stickyPreviewScope">Escopo: {previewScopeLabel}</span>
                </div>

                <div className="theme-editor__stickyPreviewGrid">
                  <section className="theme-editor__previewCard">
                    <div className="theme-editor__previewCardHeader">
                      <strong>Botões</strong>
                      <p>Como os CTAs vão aparecer na interface.</p>
                    </div>

                    <div className="theme-editor__previewButtons" aria-hidden="true">
                      <span className="theme-editor__previewButton theme-editor__previewButton--primary">Salvar</span>
                      <span className="theme-editor__previewButton theme-editor__previewButton--secondary">Ver painel</span>
                      <span className="theme-editor__previewButton theme-editor__previewButton--success">Confirmado</span>
                      <span className="theme-editor__previewButton theme-editor__previewButton--accent">Destaque</span>
                    </div>
                  </section>

                  <section className="theme-editor__previewCard">
                    <div className="theme-editor__previewCardHeader">
                      <strong>Seleções e menus</strong>
                      <p>Estados visuais de navegação, chips e cards.</p>
                    </div>

                    <div className="theme-editor__previewSelection" aria-hidden="true">
                      <span className="theme-editor__previewChip theme-editor__previewChip--selected">Selecionado</span>
                      <span className="theme-editor__previewChip theme-editor__previewChip--neutral">Disponível</span>
                      <span className="theme-editor__previewChip theme-editor__previewChip--disabled">Bloqueado</span>
                    </div>

                    <div className="theme-editor__previewMenus" aria-hidden="true">
                      <span className="theme-editor__previewMenuCard theme-editor__previewMenuCard--active">
                        <strong>Menu ativo</strong>
                        <span>Módulo em foco</span>
                      </span>
                      <span className="theme-editor__previewMenuCard theme-editor__previewMenuCard--inactive">
                        <strong>Menu inativo</strong>
                        <span>Estado neutro</span>
                      </span>
                      <span className="theme-editor__previewMenuCard theme-editor__previewMenuCard--disabled">
                        <strong>Menu desativado</strong>
                        <span>Sem acesso</span>
                      </span>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
