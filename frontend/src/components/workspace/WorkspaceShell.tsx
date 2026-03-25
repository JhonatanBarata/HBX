"use client";

import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IWatermarkPanelProps,
} from "dockview";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  WORKSPACE_EDIT_TOGGLE_EVENT,
  type WorkspaceEditToggleDetail,
} from "@/lib/workspace-edit-events";
import { WorkspaceLayoutProvider } from "./WorkspaceLayoutProvider";
import { useWorkspaceLayoutStore } from "./useWorkspaceLayoutStore";
import type {
  WorkspaceComponentRegistry,
  WorkspaceCreateDefaultLayout,
  WorkspaceLayoutScope,
  WorkspacePanelDescriptor,
  WorkspacePanelMap,
} from "./types";
import styles from "./WorkspaceShell.module.css";

type WorkspaceShellProps = {
  moduleLabel: string;
  scope: WorkspaceLayoutScope;
  panels: WorkspacePanelDescriptor[];
  components: WorkspaceComponentRegistry;
  createDefaultLayout: WorkspaceCreateDefaultLayout;
  toolbarSlot?: ReactNode;
  chromeMode?: "full" | "minimal";
  className?: string;
};

function formatSourceLabel(source: "default" | "global" | "user") {
  if (source === "user") return "Preferência local";
  if (source === "global") return "Layout global";
  return "Layout padrão";
}

function formatSavedAtLabel(value: string | null) {
  if (!value) return "Ainda não salvo nesta sessão";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Salvo recentemente";

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkspaceDefaultTab(props: IDockviewPanelHeaderProps<{ accent?: string }>) {
  return (
    <div className={styles.tabContent}>
      <span
        className={styles.tabAccent}
        style={props.params?.accent ? { background: props.params.accent } : undefined}
        aria-hidden="true"
      />
      <span className={styles.tabLabel}>{props.api.title || "Painel"}</span>
    </div>
  );
}

function WorkspaceWatermark({ group }: IWatermarkPanelProps) {
  return (
    <div className={styles.watermark}>
      <div className={styles.watermarkCard}>
        <strong>{group ? "Grupo vazio" : "Workspace pronto para montar"}</strong>
        <p>
          Arraste um painel para encaixar, reorganize as áreas e publique um layout consistente
          para todo o tenant.
        </p>
      </div>
    </div>
  );
}

export default function WorkspaceShell({
  moduleLabel,
  scope,
  panels,
  components,
  createDefaultLayout,
  toolbarSlot,
  chromeMode = "full",
  className,
}: WorkspaceShellProps) {
  const normalizedScope = useMemo<WorkspaceLayoutScope>(
    () => ({
      tenantId: scope.tenantId,
      moduleKey: scope.moduleKey,
      role: scope.role,
      userId: scope.userId,
      isMaster: scope.isMaster,
    }),
    [scope.isMaster, scope.moduleKey, scope.role, scope.tenantId, scope.userId],
  );

  const panelMap = useMemo<WorkspacePanelMap>(
    () =>
      panels.reduce<WorkspacePanelMap>((accumulator, panel) => {
        accumulator[panel.id] = {
          ...panel,
          params: {
            accent: "color-mix(in srgb, var(--brand) 68%, white)",
            ...panel.params,
          },
        };
        return accumulator;
      }, {}),
    [panels],
  );

  const store = useWorkspaceLayoutStore({
    scope: normalizedScope,
    panels: panelMap,
    createDefaultLayout,
  });

  const rootClassName = [styles.root, store.isEditing ? styles.editing : "", className || ""]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!store.canEdit) return;

    const handleWorkspaceEditToggle = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceEditToggleDetail>;
      store.setEditing(Boolean(customEvent.detail?.active));
    };

    window.addEventListener(WORKSPACE_EDIT_TOGGLE_EVENT, handleWorkspaceEditToggle);
    return () => {
      window.removeEventListener(WORKSPACE_EDIT_TOGGLE_EVENT, handleWorkspaceEditToggle);
    };
  }, [store.canEdit, store.setEditing]);

  return (
    <WorkspaceLayoutProvider value={store}>
      <section className={rootClassName}>
        <header className={styles.chrome}>
          {chromeMode === "minimal" ? (
            <>
              <div className={styles.toolbarRow}>
                <div className={styles.titleBlock}>
                  <h2 className={styles.title}>{moduleLabel}</h2>
                </div>
              </div>

              {toolbarSlot ? <div className={styles.toolbarActions}>{toolbarSlot}</div> : null}
            </>
          ) : (
            <>
              <div className={styles.toolbarRow}>
                <div className={styles.titleBlock}>
                  <p className={styles.eyebrow}>Workspace</p>
                  <h2 className={styles.title}>{moduleLabel}</h2>
                  <p className={styles.description}>
                    Layout encaixável com resize estável, grupos por aba e persistência pronta para
                    multi-tenant.
                  </p>
                </div>

                <div className={styles.toolbarActions}>
                  <span className={styles.sourcePill} data-source={store.source}>
                    {formatSourceLabel(store.source)}
                  </span>
                  {store.canEdit ? (
                    <button
                      type="button"
                      className={`btn btn-sm ${store.isEditing ? "btn-primary" : "btn-secondary"}`}
                      onClick={store.toggleEditing}
                      aria-pressed={store.isEditing}
                    >
                      {store.isEditing ? "Sair da edição" : "Modo edição"}
                    </button>
                  ) : null}
                  {store.canEdit ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={store.restoreDefaultLayout}>
                      Restaurar padrão
                    </button>
                  ) : null}
                  {store.canEdit ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={store.saveLocalLayout}>
                      Salvar layout
                    </button>
                  ) : null}
                  {store.canEdit ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={store.publishGlobalLayout}>
                      Publicar global
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.infoRow}>
                <div className={styles.toolbarMeta}>
                  <span className={styles.pill}>Tenant: {normalizedScope.tenantId}</span>
                  <span className={styles.pill}>Módulo: {normalizedScope.moduleKey}</span>
                  <span className={styles.pill}>Perfil: {normalizedScope.role}</span>
                  <span className={styles.hintPill}>Último save: {formatSavedAtLabel(store.lastSavedAt)}</span>
                  {store.isDirty ? <span className={styles.hintPill}>Alterações não salvas</span> : null}
                </div>

                {toolbarSlot ? <div className={styles.toolbarActions}>{toolbarSlot}</div> : null}
              </div>
            </>
          )}

          {store.feedback ? (
            <div className={styles.feedback} data-tone={store.feedback.tone}>
              {store.feedback.text}
            </div>
          ) : null}
        </header>

        <div className={styles.stage}>
          {store.isEditing ? (
            <div className={styles.editModeBanner}>
              <span className={styles.editModeDot} aria-hidden="true" />
              Edição ativa
            </div>
          ) : null}

          <div className={`${styles.dockviewTheme} dockview-theme-light`}>
            <DockviewReact
              className="hbx-dockview"
              components={components}
              defaultTabComponent={WorkspaceDefaultTab}
              watermarkComponent={WorkspaceWatermark}
              onReady={(event: DockviewReadyEvent) => {
                store.handleReady(event);
              }}
              disableFloatingGroups
              hideBorders={false}
              singleTabMode="default"
            />
          </div>
        </div>
      </section>
    </WorkspaceLayoutProvider>
  );
}
