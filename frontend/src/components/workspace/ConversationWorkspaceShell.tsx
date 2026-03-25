"use client";

import { useMemo, type ReactNode } from "react";
import WorkspaceShell from "./WorkspaceShell";
import {
  SHARED_CONVERSATION_WORKSPACE_MODULE_KEY,
  createSharedConversationWorkspaceLayout,
} from "./conversation-workspace";
import type {
  WorkspaceComponentRegistry,
  WorkspaceLayoutScope,
  WorkspacePanelDescriptor,
} from "./types";

type ConversationWorkspaceShellProps = {
  moduleLabel: string;
  tenantId: string;
  role: string;
  userId: string;
  remountSignature: string;
  isMaster?: boolean;
  panels: WorkspacePanelDescriptor[];
  components: WorkspaceComponentRegistry;
  toolbarSlot?: ReactNode;
  className?: string;
};

export default function ConversationWorkspaceShell({
  moduleLabel,
  tenantId,
  role,
  userId,
  remountSignature,
  isMaster = false,
  panels,
  components,
  toolbarSlot,
  className,
}: ConversationWorkspaceShellProps) {
  const normalizedRole = String(role || "USER").toUpperCase();
  const normalizedUserId = String(userId || "anonymous");
  const normalizedTenantId = String(tenantId || "tenant-default");

  const scope = useMemo<WorkspaceLayoutScope>(
    () => ({
      tenantId: normalizedTenantId,
      moduleKey: SHARED_CONVERSATION_WORKSPACE_MODULE_KEY,
      role: normalizedRole,
      userId: normalizedUserId,
      isMaster,
    }),
    [isMaster, normalizedRole, normalizedTenantId, normalizedUserId],
  );

  const workspaceKey = `${normalizedTenantId}:${normalizedRole}:${normalizedUserId}:${remountSignature}`;

  return (
    <WorkspaceShell
      key={workspaceKey}
      moduleLabel={moduleLabel}
      scope={scope}
      panels={panels}
      components={components}
      createDefaultLayout={createSharedConversationWorkspaceLayout}
      chromeMode="minimal"
      className={className}
      toolbarSlot={toolbarSlot}
    />
  );
}
