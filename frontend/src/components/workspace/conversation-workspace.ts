"use client";

import type { WorkspaceCreateDefaultLayout, WorkspacePanelMap } from "./types";

export const SHARED_CONVERSATION_WORKSPACE_MODULE_KEY = "conversation_workspace";

export const SHARED_CONVERSATION_WORKSPACE_IDS = {
  listPanel: "conversation-list",
  mainPanel: "conversation-main",
  composerPanel: "conversation-composer",
  contextPanel: "conversation-context",
  listComponent: "conversationListPanel",
  mainComponent: "conversationMainPanel",
  composerComponent: "conversationComposerPanel",
  contextComponent: "conversationContextPanel",
} as const;

function requirePanel(panels: WorkspacePanelMap, panelId: string) {
  const panel = panels[panelId];
  if (!panel) {
    throw new Error(`Painel compartilhado ausente no workspace: ${panelId}`);
  }
  return panel;
}

export const createSharedConversationWorkspaceLayout: WorkspaceCreateDefaultLayout = (api, panels) => {
  const listPanel = requirePanel(panels, SHARED_CONVERSATION_WORKSPACE_IDS.listPanel);
  const mainPanel = requirePanel(panels, SHARED_CONVERSATION_WORKSPACE_IDS.mainPanel);
  const composerPanel = requirePanel(panels, SHARED_CONVERSATION_WORKSPACE_IDS.composerPanel);
  const contextPanel = requirePanel(panels, SHARED_CONVERSATION_WORKSPACE_IDS.contextPanel);

  api.addPanel({
    id: listPanel.id,
    title: listPanel.title,
    component: listPanel.component,
    params: listPanel.params,
    minimumWidth: listPanel.minimumWidth,
    minimumHeight: listPanel.minimumHeight,
    initialWidth: listPanel.initialWidth,
  });

  api.addPanel({
    id: mainPanel.id,
    title: mainPanel.title,
    component: mainPanel.component,
    params: mainPanel.params,
    minimumWidth: mainPanel.minimumWidth,
    minimumHeight: mainPanel.minimumHeight,
    initialWidth: mainPanel.initialWidth,
    position: { referencePanel: listPanel.id, direction: "right" },
    floating: false,
  });

  api.addPanel({
    id: contextPanel.id,
    title: contextPanel.title,
    component: contextPanel.component,
    params: contextPanel.params,
    minimumWidth: contextPanel.minimumWidth,
    minimumHeight: contextPanel.minimumHeight,
    initialWidth: contextPanel.initialWidth,
    position: { referencePanel: mainPanel.id, direction: "right" },
    floating: false,
  });

  api.addPanel({
    id: composerPanel.id,
    title: composerPanel.title,
    component: composerPanel.component,
    params: composerPanel.params,
    minimumWidth: composerPanel.minimumWidth,
    minimumHeight: composerPanel.minimumHeight,
    initialHeight: composerPanel.initialHeight,
    position: { referencePanel: mainPanel.id, direction: "below" },
    floating: false,
  });
};
