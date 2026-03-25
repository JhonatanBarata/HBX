"use client";

import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from "dockview";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildWorkspaceStorageKeys,
  resolveStoredWorkspaceLayout,
  saveGlobalWorkspaceLayout,
  saveUserWorkspaceLayout,
} from "./storage";
import type {
  WorkspaceCreateDefaultLayout,
  WorkspaceFeedback,
  WorkspaceLayoutScope,
  WorkspaceLayoutSource,
  WorkspaceLayoutStore,
  WorkspacePanelMap,
} from "./types";

function cloneLayout(layout: SerializedDockview) {
  return JSON.parse(JSON.stringify(layout)) as SerializedDockview;
}

type UseWorkspaceLayoutStoreOptions = {
  scope: WorkspaceLayoutScope;
  panels: WorkspacePanelMap;
  createDefaultLayout: WorkspaceCreateDefaultLayout;
};

export function useWorkspaceLayoutStore({
  scope,
  panels,
  createDefaultLayout,
}: UseWorkspaceLayoutStoreOptions): WorkspaceLayoutStore {
  const apiRef = useRef<DockviewApi | null>(null);
  const layoutSubscriptionRef = useRef<{ dispose: () => void } | null>(null);
  const applyingLayoutRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [source, setSource] = useState<WorkspaceLayoutSource>("default");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null);

  const canEdit = Boolean(scope.isMaster);

  const applyWorkspaceOptions = useCallback(() => {
    if (!apiRef.current) return;

    const editingEnabled = canEdit && isEditing;
    apiRef.current.updateOptions({
      locked: !editingEnabled,
      disableDnd: !editingEnabled,
      disableFloatingGroups: true,
      scrollbars: "native",
      hideBorders: false,
    });
  }, [canEdit, isEditing]);

  const finalizeAppliedLayout = useCallback(
    (nextSource: WorkspaceLayoutSource, nextUpdatedAt: string | null, nextDirty = false) => {
      setSource(nextSource);
      setLastSavedAt(nextUpdatedAt);
      setIsDirty(nextDirty);
      applyingLayoutRef.current = false;
    },
    [],
  );

  const applyDefaultLayout = useCallback(
    (api: DockviewApi) => {
      api.clear();
      createDefaultLayout(api, panels);
    },
    [createDefaultLayout, panels],
  );

  const captureLayoutChange = useCallback(() => {
    if (!apiRef.current || applyingLayoutRef.current) return;
    setIsDirty(true);
    setFeedback(null);
  }, []);

  const loadResolvedLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    const resolved = resolveStoredWorkspaceLayout(scope);
    applyingLayoutRef.current = true;
    setFeedback(null);

    try {
      api.clear();

      if (resolved.layout) {
        api.fromJSON(resolved.layout, { reuseExistingPanels: false });
      } else {
        createDefaultLayout(api, panels);
      }

      queueMicrotask(() => {
        cloneLayout(api.toJSON());
        finalizeAppliedLayout(resolved.source, resolved.record?.updatedAt ?? null, false);
      });
    } catch {
      applyDefaultLayout(api);
      queueMicrotask(() => {
        finalizeAppliedLayout("default", null, false);
        setFeedback({
          tone: "error",
          text: "O layout salvo ficou incompatível e o workspace voltou para o padrão do módulo.",
        });
      });
    }
  }, [applyDefaultLayout, createDefaultLayout, finalizeAppliedLayout, panels, scope]);

  const restoreDefaultLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    applyingLayoutRef.current = true;
    applyDefaultLayout(api);

    queueMicrotask(() => {
      finalizeAppliedLayout("default", null, true);
      setFeedback({
        tone: "info",
        text: "Layout padrão reaplicado. Revise a composição e salve se quiser mantê-la.",
      });
    });
  }, [applyDefaultLayout, finalizeAppliedLayout]);

  const saveLocalLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    try {
      const record = saveUserWorkspaceLayout(scope, api.toJSON());
      setSource("user");
      setLastSavedAt(record.updatedAt);
      setIsDirty(false);
      setFeedback({
        tone: "success",
        text: "Layout salvo como preferência local do usuário.",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "Não foi possível salvar a preferência local do workspace.",
      });
    }
  }, [scope]);

  const publishGlobalLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    try {
      const record = saveGlobalWorkspaceLayout(scope, api.toJSON());
      setSource("global");
      setLastSavedAt(record.updatedAt);
      setIsDirty(false);
      setFeedback({
        tone: "success",
        text: "Layout publicado como padrão global do tenant para este módulo.",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "Não foi possível publicar o layout global.",
      });
    }
  }, [scope]);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      layoutSubscriptionRef.current?.dispose();
      layoutSubscriptionRef.current = event.api.onDidLayoutChange(() => {
        captureLayoutChange();
      });

      applyWorkspaceOptions();
      loadResolvedLayout();
    },
    [applyWorkspaceOptions, captureLayoutChange, loadResolvedLayout],
  );

  useEffect(() => {
    applyWorkspaceOptions();
  }, [applyWorkspaceOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const keys = buildWorkspaceStorageKeys(scope);
    const watchedKeys = new Set([keys.user, keys.globalByRole, keys.globalByModule]);
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key || !watchedKeys.has(event.key)) {
        return;
      }

      loadResolvedLayout();
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadResolvedLayout, scope]);

  useEffect(
    () => () => {
      layoutSubscriptionRef.current?.dispose();
    },
    [],
  );

  return {
    canEdit,
    isEditing,
    isDirty,
    source,
    lastSavedAt,
    feedback,
    setEditing: setIsEditing,
    toggleEditing: () => {
      if (!canEdit) return;
      setIsEditing((current) => !current);
    },
    restoreDefaultLayout,
    saveLocalLayout,
    publishGlobalLayout,
    reloadResolvedLayout: loadResolvedLayout,
    handleReady,
  };
}
