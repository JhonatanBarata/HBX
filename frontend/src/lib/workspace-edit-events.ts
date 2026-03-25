"use client";

export const WORKSPACE_EDIT_TOGGLE_EVENT = "hbx:workspace-edit-toggle";

export type WorkspaceEditToggleDetail = {
  active: boolean;
};

export function dispatchWorkspaceEditToggle(detail: WorkspaceEditToggleDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceEditToggleDetail>(WORKSPACE_EDIT_TOGGLE_EVENT, { detail }),
  );
}
