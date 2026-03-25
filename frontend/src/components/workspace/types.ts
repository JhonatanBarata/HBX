"use client";

import type {
  DockviewApi,
  DockviewReadyEvent,
  IDockviewPanelProps,
  SerializedDockview,
} from "dockview";
import type { FunctionComponent } from "react";

export type WorkspaceLayoutSource = "default" | "draft" | "global" | "user";

export type WorkspaceLayoutScope = {
  tenantId: string;
  moduleKey: string;
  role: string;
  userId: string;
  isMaster?: boolean;
};

export type WorkspacePanelDescriptor<TParams extends object = Record<string, unknown>> = {
  id: string;
  title: string;
  description?: string;
  component: string;
  params?: TParams;
  minimumWidth?: number;
  minimumHeight?: number;
  maximumWidth?: number;
  maximumHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
};

export type WorkspacePanelMap = Record<string, WorkspacePanelDescriptor>;

export type WorkspaceComponentRegistry = Record<string, FunctionComponent<IDockviewPanelProps>>;

export type WorkspaceCreateDefaultLayout = (
  api: DockviewApi,
  panels: WorkspacePanelMap,
) => void;

export type WorkspaceLayoutRecord = {
  version: 1;
  source: Exclude<WorkspaceLayoutSource, "default">;
  tenantId: string;
  moduleKey: string;
  role: string;
  userId?: string;
  updatedAt: string;
  publishedBy?: string;
  layout: SerializedDockview;
};

export type WorkspaceResolvedLayout = {
  source: WorkspaceLayoutSource;
  record: WorkspaceLayoutRecord | null;
  layout: SerializedDockview | null;
};

export type WorkspaceFeedback = {
  tone: "info" | "success" | "error";
  text: string;
};

export type WorkspaceLayoutStore = {
  canEdit: boolean;
  isEditing: boolean;
  isDirty: boolean;
  source: WorkspaceLayoutSource;
  lastSavedAt: string | null;
  feedback: WorkspaceFeedback | null;
  setEditing: (nextValue: boolean) => void;
  toggleEditing: () => void;
  restoreDefaultLayout: () => void;
  saveLocalLayout: () => void;
  publishGlobalLayout: () => void;
  reloadResolvedLayout: () => void;
  handleReady: (event: DockviewReadyEvent) => void;
};
