"use client";

import type {
  WorkspaceCreateDefaultLayout,
  WorkspacePanelDescriptor,
  WorkspacePanelMap,
} from "./types";

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

type SharedConversationPanelAccent = {
  accent: string;
};

type SharedConversationPanelInput = {
  title: string;
  description: string;
  accent: string;
  minimumWidth: number;
  minimumHeight: number;
  initialWidth?: number;
  initialHeight?: number;
};

type SharedConversationWorkspacePanelsInput = {
  list: SharedConversationPanelInput;
  main: SharedConversationPanelInput;
  composer?: SharedConversationPanelInput;
  context: SharedConversationPanelInput;
};

export function buildSharedConversationWorkspacePanels(
  config: SharedConversationWorkspacePanelsInput,
): WorkspacePanelDescriptor<SharedConversationPanelAccent>[] {
  const descriptors: WorkspacePanelDescriptor<SharedConversationPanelAccent>[] = [
    {
      id: SHARED_CONVERSATION_WORKSPACE_IDS.listPanel,
      title: config.list.title,
      description: config.list.description,
      component: SHARED_CONVERSATION_WORKSPACE_IDS.listComponent,
      params: {
        accent: config.list.accent,
      },
      minimumWidth: config.list.minimumWidth,
      minimumHeight: config.list.minimumHeight,
      initialWidth: config.list.initialWidth,
    },
    {
      id: SHARED_CONVERSATION_WORKSPACE_IDS.mainPanel,
      title: config.main.title,
      description: config.main.description,
      component: SHARED_CONVERSATION_WORKSPACE_IDS.mainComponent,
      params: {
        accent: config.main.accent,
      },
      minimumWidth: config.main.minimumWidth,
      minimumHeight: config.main.minimumHeight,
      initialWidth: config.main.initialWidth,
    },
    {
      id: SHARED_CONVERSATION_WORKSPACE_IDS.contextPanel,
      title: config.context.title,
      description: config.context.description,
      component: SHARED_CONVERSATION_WORKSPACE_IDS.contextComponent,
      params: {
        accent: config.context.accent,
      },
      minimumWidth: config.context.minimumWidth,
      minimumHeight: config.context.minimumHeight,
      initialWidth: config.context.initialWidth,
    },
  ];

  if (config.composer) {
    descriptors.splice(2, 0, {
      id: SHARED_CONVERSATION_WORKSPACE_IDS.composerPanel,
      title: config.composer.title,
      description: config.composer.description,
      component: SHARED_CONVERSATION_WORKSPACE_IDS.composerComponent,
      params: {
        accent: config.composer.accent,
      },
      minimumWidth: config.composer.minimumWidth,
      minimumHeight: config.composer.minimumHeight,
      initialHeight: config.composer.initialHeight,
    });
  }

  return descriptors;
}

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
  const composerPanel = panels[SHARED_CONVERSATION_WORKSPACE_IDS.composerPanel];
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

  if (composerPanel) {
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
  }
};
