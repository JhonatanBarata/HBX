"use client";

import type {
  WorkspaceLayoutRecord,
  WorkspaceLayoutScope,
  WorkspaceResolvedLayout,
} from "./types";
import type { SerializedDockview } from "dockview";
import { SHARED_CONVERSATION_WORKSPACE_MODULE_KEY } from "./conversation-workspace";

const STORAGE_NAMESPACE = "hbx.workspace.v1";

function normalizeKeyPart(value: string) {
  return encodeURIComponent(String(value || "default").trim().toLowerCase() || "default");
}

function cloneLayout(layout: SerializedDockview): SerializedDockview {
  return JSON.parse(JSON.stringify(layout)) as SerializedDockview;
}

export function buildWorkspaceStorageKeys(scope: WorkspaceLayoutScope) {
  const tenantId = normalizeKeyPart(scope.tenantId);
  const moduleKey = normalizeKeyPart(scope.moduleKey);
  const role = normalizeKeyPart(scope.role);
  const userId = normalizeKeyPart(scope.userId);

  return {
    globalByRole: `${STORAGE_NAMESPACE}:global:${tenantId}:${moduleKey}:${role}`,
    globalByModule: `${STORAGE_NAMESPACE}:global:${tenantId}:${moduleKey}:all`,
    user: `${STORAGE_NAMESPACE}:user:${tenantId}:${moduleKey}:${role}:${userId}`,
  };
}

function isWorkspaceLayoutRecord(value: unknown): value is WorkspaceLayoutRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<WorkspaceLayoutRecord>;
  return (
    candidate.version === 1 &&
    (candidate.source === "global" || candidate.source === "user") &&
    typeof candidate.tenantId === "string" &&
    typeof candidate.moduleKey === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.updatedAt === "string" &&
    Boolean(candidate.layout)
  );
}

function safeReadRecord(storageKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isWorkspaceLayoutRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeWriteRecord(storageKey: string, record: WorkspaceLayoutRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(record));
}

function resolveLegacyConversationWorkspaceLayout(scope: WorkspaceLayoutScope) {
  if (scope.moduleKey !== SHARED_CONVERSATION_WORKSPACE_MODULE_KEY) return null;

  const legacyScopes: WorkspaceLayoutScope[] = ["inbox", "hbx_recovery"].map((moduleKey) => ({
    ...scope,
    moduleKey,
  }));

  const legacyRecords = legacyScopes
    .flatMap((legacyScope) => {
      const keys = buildWorkspaceStorageKeys(legacyScope);
      return [
        safeReadRecord(keys.user),
        safeReadRecord(keys.globalByRole),
        safeReadRecord(keys.globalByModule),
      ];
    })
    .filter(Boolean) as WorkspaceLayoutRecord[];

  if (!legacyRecords.length) return null;

  return legacyRecords
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return rightTime - leftTime;
    })[0];
}

export function resolveStoredWorkspaceLayout(scope: WorkspaceLayoutScope): WorkspaceResolvedLayout {
  const keys = buildWorkspaceStorageKeys(scope);
  const userLayout = safeReadRecord(keys.user);
  if (userLayout) {
    return {
      source: "user",
      record: userLayout,
      layout: cloneLayout(userLayout.layout),
    };
  }

  const roleGlobalLayout = safeReadRecord(keys.globalByRole);
  if (roleGlobalLayout) {
    return {
      source: "global",
      record: roleGlobalLayout,
      layout: cloneLayout(roleGlobalLayout.layout),
    };
  }

  const moduleGlobalLayout = safeReadRecord(keys.globalByModule);
  if (moduleGlobalLayout) {
    return {
      source: "global",
      record: moduleGlobalLayout,
      layout: cloneLayout(moduleGlobalLayout.layout),
    };
  }

  const legacyLayout = resolveLegacyConversationWorkspaceLayout(scope);
  if (legacyLayout) {
    return {
      source: legacyLayout.source,
      record: legacyLayout,
      layout: cloneLayout(legacyLayout.layout),
    };
  }

  return {
    source: "default",
    record: null,
    layout: null,
  };
}

function buildRecord(
  scope: WorkspaceLayoutScope,
  source: WorkspaceLayoutRecord["source"],
  layout: SerializedDockview,
): WorkspaceLayoutRecord {
  return {
    version: 1,
    source,
    tenantId: scope.tenantId,
    moduleKey: scope.moduleKey,
    role: scope.role,
    userId: source === "user" ? scope.userId : undefined,
    updatedAt: new Date().toISOString(),
    publishedBy: source === "global" ? scope.userId : undefined,
    layout: cloneLayout(layout),
  };
}

export function saveUserWorkspaceLayout(
  scope: WorkspaceLayoutScope,
  layout: SerializedDockview,
) {
  const record = buildRecord(scope, "user", layout);
  safeWriteRecord(buildWorkspaceStorageKeys(scope).user, record);
  return record;
}

export function saveGlobalWorkspaceLayout(
  scope: WorkspaceLayoutScope,
  layout: SerializedDockview,
) {
  const record = buildRecord(scope, "global", layout);
  const keys = buildWorkspaceStorageKeys(scope);
  safeWriteRecord(keys.globalByRole, record);
  safeWriteRecord(keys.globalByModule, record);
  return record;
}
