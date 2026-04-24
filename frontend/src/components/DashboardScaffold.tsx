"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ModuleNav from "./ModuleNav";
import QrPairedNextStepPrompt from "./QrPairedNextStepPrompt";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import { MASTER_CONTEXT_CHANGED_EVENT } from "../lib/masterContextEvents";
import {
  clearPresentationConfig,
  createDefaultPresentationConfig,
  readPresentationConfig,
  savePresentationConfig,
  type PresentationConfig,
  type PresentationModuleOverride,
} from "../lib/presentation-config";
import { dispatchWorkspaceEditToggle } from "../lib/workspace-edit-events";
import styles from "./DashboardScaffold.module.css";

type DashboardScaffoldProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  showDashboardShortcut?: boolean;
  hideHeader?: boolean;
  hideNavigationRail?: boolean;
  hideHoverModules?: boolean;
  layoutMode?: "default" | "workspace";
};

type NavPeekAnchorRect = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

const MODULES_PEEK_EVENT = "hbx:modules-peek";
const MODULES_TRIGGER_ID = "app-modules-trigger";

function buildPageKey(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "dashboard";
}

type PresentationProfile = {
  tenantId: string;
  userId: string;
  isSystemMaster: boolean;
};

function subscribeAuth(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("auth-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("auth-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getAuthSnapshot() {
  return Boolean(getToken());
}

function getAuthServerSnapshot() {
  return false;
}

export default function DashboardScaffold({
  title,
  description,
  children,
  actions,
  showDashboardShortcut = true,
  hideHeader = false,
  hideNavigationRail = true,
  hideHoverModules = false,
  layoutMode = "default",
}: DashboardScaffoldProps) {
  const navPeekCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isRootDashboard = pathname === "/dashboard";
  const defaultSectionLabel =
    pathname.startsWith("/hbx-recovery") || pathname.startsWith("/dashboard/inbox/recovery")
      ? "Atendimento"
      : "HBX Workspace";
  const pageKey = buildPageKey(pathname);
  const isWorkspaceMode = layoutMode === "workspace";
  // Mostrar o painel "peek" dos módulos escondidos no canto esquerdo por padrão
  // (padrão global: navegação em rail escondida, modules peek disponível).
  const shouldShowHoverModules = !hideHoverModules;
  const authenticated = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);
  const [presentationProfile, setPresentationProfile] = useState<PresentationProfile | null>(null);
  const [presentationConfig, setPresentationConfig] = useState<PresentationConfig | null>(null);
  const [presentationEditing, setPresentationEditing] = useState(false);
  const [navPeekOpen, setNavPeekOpen] = useState(false);
  const [navPeekPortalReady, setNavPeekPortalReady] = useState(false);
  const navPeekPanelRef = useRef<HTMLElement | null>(null);
  const [navPeekPanelStyle, setNavPeekPanelStyle] = useState<CSSProperties | null>(null);

  const cancelNavPeekClose = useCallback(() => {
    if (!navPeekCloseTimerRef.current) return;
    clearTimeout(navPeekCloseTimerRef.current);
    navPeekCloseTimerRef.current = null;
  }, []);

  const scheduleNavPeekClose = useCallback((delay = 420) => {
    cancelNavPeekClose();
    navPeekCloseTimerRef.current = setTimeout(() => {
      setNavPeekOpen(false);
      navPeekCloseTimerRef.current = null;
    }, delay);
  }, [cancelNavPeekClose]);

  const syncNavPeekPanelPosition = useCallback((anchorRect?: NavPeekAnchorRect | null) => {
    const rect =
      anchorRect || document.getElementById(MODULES_TRIGGER_ID)?.getBoundingClientRect() || null;
    if (!rect) return;
    const panelWidth = Math.min(360, Math.max(280, window.innerWidth - 24));
    const left = Math.min(
      Math.max(12, Math.round(rect.left)),
      Math.max(12, window.innerWidth - panelWidth - 12),
    );

    setNavPeekPanelStyle({
      top: `${Math.round(rect.bottom + 12)}px`,
      left: `${left}px`,
      width: `min(360px, calc(100vw - 24px))`,
    });
  }, []);

  const openNavPeek = useCallback((anchorRect?: NavPeekAnchorRect | null) => {
    cancelNavPeekClose();
    syncNavPeekPanelPosition(anchorRect);
    setNavPeekOpen(true);
  }, [cancelNavPeekClose, syncNavPeekPanelPosition]);

  const closeNavPeek = useCallback(() => {
    cancelNavPeekClose();
    setNavPeekOpen(false);
  }, [cancelNavPeekClose]);

  const toggleNavPeek = useCallback((anchorRect?: NavPeekAnchorRect | null) => {
    cancelNavPeekClose();
    syncNavPeekPanelPosition(anchorRect);
    setNavPeekOpen((current) => !current);
  }, [cancelNavPeekClose, syncNavPeekPanelPosition]);

  const loadPresentationProfile = useCallback(async () => {
    if (!authenticated) {
      setPresentationProfile(null);
      setPresentationConfig(null);
      return;
    }

    try {
      const profile = await apiFetch<{
        id?: number | null;
        username?: string | null;
        email?: string | null;
        isSystemMaster?: boolean;
        company?: { id?: number | null } | null;
      }>("/profile/current-user");

      const tenantId = String(profile?.company?.id || "tenant-default");
      const userId = String(profile?.id || profile?.username || profile?.email || "anonymous");
      setPresentationProfile({
        tenantId,
        userId,
        isSystemMaster: Boolean(profile?.isSystemMaster),
      });
      setPresentationConfig(readPresentationConfig(tenantId));
    } catch {
      setPresentationProfile(null);
      setPresentationConfig(null);
    }
  }, [authenticated]);

  useEffect(() => {
    setNavPeekPortalReady(true);
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPresentationProfile();
    }, 0);

    const handleMasterContextChanged = () => {
      void loadPresentationProfile();
    };

    window.addEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    };
  }, [loadPresentationProfile]);

  // Prefetch modules and profile early so ModuleNav can render instantly on hover
  useEffect(() => {
    if (typeof window === "undefined" || !authenticated) return;
    let mounted = true;

    const prefetchModules = async () => {
      try {
        const [modules, profile] = await Promise.all([
          apiFetch("/modules/me"),
          apiFetch("/profile/current-user").catch(() => null),
        ]);
        if (!mounted) return;
        (window as Window & { __hbx_prefetch?: { modules: unknown[]; profile: unknown } }).__hbx_prefetch = {
          modules: Array.isArray(modules) ? modules : [],
          profile,
        };
      } catch {
        // ignore prefetch errors
      }
    };

    const timer = window.setTimeout(() => {
      void prefetchModules();
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [authenticated]);

  useEffect(() => {
    if (typeof window === "undefined" || !presentationProfile?.tenantId) return;

    const storageKey = `hbx.presentation.v1:global:${encodeURIComponent(
      presentationProfile.tenantId.trim().toLowerCase(),
    )}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== storageKey) return;
      setPresentationConfig(readPresentationConfig(presentationProfile.tenantId));
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [presentationProfile?.tenantId]);

  const canEditPresentation = Boolean(presentationProfile?.isSystemMaster);

  useEffect(() => {
    if (!isWorkspaceMode || !canEditPresentation) return;
    dispatchWorkspaceEditToggle({ active: presentationEditing });
  }, [canEditPresentation, isWorkspaceMode, presentationEditing]);

  useEffect(
    () => () => {
      cancelNavPeekClose();
    },
    [cancelNavPeekClose],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    root.dataset.hbxModulesPeekAvailable = shouldShowHoverModules ? "true" : "false";
    root.dataset.hbxModulesPeekOpen = shouldShowHoverModules && navPeekOpen ? "true" : "false";

    return () => {
      delete root.dataset.hbxModulesPeekAvailable;
      delete root.dataset.hbxModulesPeekOpen;
    };
  }, [navPeekOpen, shouldShowHoverModules]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleModulesPeekEvent = (nativeEvent: Event) => {
      const event = nativeEvent as CustomEvent<{ action?: "close" | "open" | "toggle"; anchorRect?: NavPeekAnchorRect | null }>;

      if (!shouldShowHoverModules) {
        setNavPeekOpen(false);
        return;
      }

      if (event.detail?.action === "close") {
        closeNavPeek();
        return;
      }

      if (event.detail?.action === "open") {
        openNavPeek(event.detail?.anchorRect || null);
        return;
      }

      toggleNavPeek(event.detail?.anchorRect || null);
    };

    window.addEventListener(MODULES_PEEK_EVENT, handleModulesPeekEvent as EventListener);
    return () => {
      window.removeEventListener(MODULES_PEEK_EVENT, handleModulesPeekEvent as EventListener);
    };
  }, [closeNavPeek, openNavPeek, shouldShowHoverModules, toggleNavPeek]);

  useEffect(() => {
    if (!navPeekOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        document.getElementById(MODULES_TRIGGER_ID)?.contains(target) ||
        navPeekPanelRef.current?.contains(target)
      ) {
        return;
      }
      closeNavPeek();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [closeNavPeek, navPeekOpen]);

  useEffect(() => {
    if (!navPeekOpen) return;
    syncNavPeekPanelPosition();
    const handleViewportChange = () => syncNavPeekPanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [navPeekOpen, syncNavPeekPanelPosition]);

  useEffect(() => {
    if (!navPeekOpen) return;
    if (!shouldShowHoverModules) {
      closeNavPeek();
    }
  }, [closeNavPeek, navPeekOpen, shouldShowHoverModules]);

  const updatePresentationConfig = useCallback(
    (updater: (current: PresentationConfig) => PresentationConfig) => {
      if (!presentationProfile?.tenantId) return;

      setPresentationConfig((current) => {
        const base = current || createDefaultPresentationConfig(presentationProfile.tenantId);
        const next = updater(base);
        return savePresentationConfig({
          ...next,
          tenantId: presentationProfile.tenantId,
          updatedBy: presentationProfile.userId,
        });
      });
    },
    [presentationProfile],
  );

  const pageOverride = presentationConfig?.pages?.[pageKey];
  const resolvedSectionLabel = pageOverride?.sectionLabel || defaultSectionLabel;
  const resolvedTitle = pageOverride?.title || title;
  const resolvedDescription = pageOverride?.description || description || "";
  const resolvedNavEyebrow = presentationConfig?.nav.eyebrow || "Módulos";
  const resolvedNavTitle = presentationConfig?.nav.title || "Navegação principal";

  const shellStyle = useMemo<CSSProperties>(
    () =>
      ({
        ["--workspace-rail-width" as string]: `${presentationConfig?.layout.navWidth || 292}px`,
        ["--workspace-hero-min-height" as string]: `${presentationConfig?.layout.heroMinHeight || 132}px`,
        ["--workspace-stage-height" as string]:
          presentationConfig?.layout.workspaceHeight && presentationConfig.layout.workspaceHeight > 0
            ? `${presentationConfig.layout.workspaceHeight}px`
            : undefined,
      }) satisfies CSSProperties,
    [
      presentationConfig?.layout.heroMinHeight,
      presentationConfig?.layout.navWidth,
      presentationConfig?.layout.workspaceHeight,
    ],
  );

  const updatePageCopy = useCallback(
    (patch: Partial<{ sectionLabel: string; title: string; description: string }>) => {
      updatePresentationConfig((current) => ({
        ...current,
        pages: {
          ...current.pages,
          [pageKey]: {
            ...current.pages[pageKey],
            ...patch,
          },
        },
      }));
    },
    [pageKey, updatePresentationConfig],
  );

  const updateModulePresentation = useCallback(
    (href: string, patch: Partial<PresentationModuleOverride>) => {
      updatePresentationConfig((current) => ({
        ...current,
        modules: {
          ...current.modules,
          [href]: {
            ...current.modules[href],
            ...patch,
          },
        },
      }));
    },
    [updatePresentationConfig],
  );

  const restorePresentationDefaults = useCallback(() => {
    if (!presentationProfile?.tenantId) return;
    clearPresentationConfig(presentationProfile.tenantId);
    setPresentationConfig(createDefaultPresentationConfig(presentationProfile.tenantId));
  }, [presentationProfile]);

  return (
    <main
      className={`app-shell ${isWorkspaceMode ? "app-shell--workspace" : ""}`}
      data-page-key={pageKey}
    >
      <div
        className={`app-container ${isWorkspaceMode ? "app-container--workspace" : ""}`}
        style={shellStyle}
      >
        <div
          className={`workspace-shell ${isWorkspaceMode ? "workspace-shell--workspace" : ""}`}
          style={hideNavigationRail ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}
        >
          {!hideNavigationRail ? (
            <aside className="workspace-rail">
              <section className="shell-card shell-card--nav">
                <div className="shell-card__header">
                  <div>
                    <p className="shell-card__eyebrow">{resolvedNavEyebrow}</p>
                    <strong className="shell-card__title">{resolvedNavTitle}</strong>
                  </div>
                </div>
                <ModuleNav
                  presentationEditing={presentationEditing}
                  canEditPresentation={canEditPresentation}
                  presentationConfig={presentationConfig}
                  onUpdateModulePresentation={updateModulePresentation}
                />
              </section>
            </aside>
          ) : null}

          <section className={`workspace-main ${isWorkspaceMode ? "workspace-main--workspace" : ""}`}>
            <section
              className={`panel page-hero ${isWorkspaceMode ? "page-hero--workspace" : ""}`}
              style={{ display: hideHeader ? "none" : "block" }}
            >
              <div className="page-hero__copy">
                <span className="page-overline">{resolvedSectionLabel}</span>
                <h1>{resolvedTitle}</h1>
                {resolvedDescription ? <p>{resolvedDescription}</p> : null}
              </div>

              <div className="page-hero__sidebar">
                <div className="page-hero__actions">
                  {canEditPresentation ? (
                    <button
                      type="button"
                      className={`btn btn-sm ${presentationEditing ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setPresentationEditing((current) => !current)}
                    >
                      {presentationEditing ? "Fechar edição UI" : "Editar interface"}
                    </button>
                  ) : null}
                  {canEditPresentation && presentationEditing ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={restorePresentationDefaults}>
                      Restaurar interface
                    </button>
                  ) : null}
                  {showDashboardShortcut && !isRootDashboard ? (
                    <Link href="/dashboard" prefetch={false} className="btn btn-secondary btn-sm">
                      Voltar ao menu
                    </Link>
                  ) : null}
                  {actions}
                </div>
              </div>

              {canEditPresentation && presentationEditing ? (
                <div className="presentation-editor">
                  <label className="presentation-editor__field">
                    <span>Rótulo superior</span>
                    <input
                      className="field"
                      value={resolvedSectionLabel}
                      onChange={(event) => updatePageCopy({ sectionLabel: event.target.value })}
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Título da página</span>
                    <input
                      className="field"
                      value={resolvedTitle}
                      onChange={(event) => updatePageCopy({ title: event.target.value })}
                    />
                  </label>
                  <label className="presentation-editor__field presentation-editor__field--wide">
                    <span>Descrição</span>
                    <textarea
                      className="field"
                      rows={3}
                      value={resolvedDescription}
                      onChange={(event) => updatePageCopy({ description: event.target.value })}
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Header módulos</span>
                    <input
                      className="field"
                      value={resolvedNavTitle}
                      onChange={(event) =>
                        updatePresentationConfig((current) => ({
                          ...current,
                          nav: {
                            ...current.nav,
                            title: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Eyebrow módulos</span>
                    <input
                      className="field"
                      value={resolvedNavEyebrow}
                      onChange={(event) =>
                        updatePresentationConfig((current) => ({
                          ...current,
                          nav: {
                            ...current.nav,
                            eyebrow: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Largura módulos</span>
                    <input
                      className="field"
                      type="number"
                      min={248}
                      max={440}
                      value={presentationConfig?.layout.navWidth || 292}
                      onChange={(event) =>
                        updatePresentationConfig((current) => ({
                          ...current,
                          layout: {
                            ...current.layout,
                            navWidth: Math.max(248, Math.min(440, Number(event.target.value) || 292)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Altura header</span>
                    <input
                      className="field"
                      type="number"
                      min={96}
                      max={220}
                      value={presentationConfig?.layout.heroMinHeight || 132}
                      onChange={(event) =>
                        updatePresentationConfig((current) => ({
                          ...current,
                          layout: {
                            ...current.layout,
                            heroMinHeight: Math.max(96, Math.min(220, Number(event.target.value) || 132)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="presentation-editor__field">
                    <span>Altura workspace</span>
                    <input
                      className="field"
                      type="number"
                      min={0}
                      max={1600}
                      value={presentationConfig?.layout.workspaceHeight || 0}
                      onChange={(event) =>
                        updatePresentationConfig((current) => ({
                          ...current,
                          layout: {
                            ...current.layout,
                            workspaceHeight: Math.max(0, Number(event.target.value) || 0),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <div className={`page-content ${isWorkspaceMode ? "page-content--workspace" : ""}`}>
              {children}
            </div>
          </section>
        </div>
      </div>
      {shouldShowHoverModules && navPeekPortalReady
        ? createPortal(
            <aside
              ref={navPeekPanelRef}
              id="workspace-hover-module-nav"
              className={styles.navPeekPanel}
              data-open={navPeekOpen ? "true" : "false"}
              aria-hidden={!navPeekOpen}
              style={
                navPeekPanelStyle || {
                  top: "calc(var(--topbar-total-height) + 12px)",
                  left: "12px",
                  width: "min(360px, calc(100vw - 24px))",
                }
              }
              onMouseEnter={() => openNavPeek()}
              onPointerEnter={() => openNavPeek()}
              onMouseLeave={() => scheduleNavPeekClose()}
              onPointerLeave={() => scheduleNavPeekClose()}
            >
              <section className="shell-card shell-card--nav">
                <div className="shell-card__header">
                  <div>
                    <p className="shell-card__eyebrow">{resolvedNavEyebrow}</p>
                    <strong className="shell-card__title">{resolvedNavTitle}</strong>
                  </div>
                </div>
                <ModuleNav
                  presentationEditing={presentationEditing}
                  canEditPresentation={canEditPresentation}
                  presentationConfig={presentationConfig}
                  onUpdateModulePresentation={updateModulePresentation}
                />
              </section>
            </aside>,
            document.body,
          )
        : null}
      <QrPairedNextStepPrompt />
    </main>
  );
}
