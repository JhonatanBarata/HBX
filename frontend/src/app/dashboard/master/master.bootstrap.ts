import { apiFetch, getToken } from "../_lib/api";
import type { CurrentUser, MasterWorkspaceBootstrap, WorkspacePayload } from "./master.types";

let masterWorkspaceBootstrapPromise: Promise<MasterWorkspaceBootstrap> | null = null;
let masterWorkspaceBootstrapPromiseToken: string | null = null;
let masterWorkspaceBootstrapSnapshot: (MasterWorkspaceBootstrap & { cachedAt: number }) | null = null;
const MASTER_WORKSPACE_BOOTSTRAP_CACHE_MS = 5000;

export async function fetchMasterWorkspaceBootstrap(useCache: boolean) {
  const token = getToken();
  const now = Date.now();
  const cached = masterWorkspaceBootstrapSnapshot;

  if (
    useCache &&
    cached &&
    cached.token === token &&
    now - cached.cachedAt < MASTER_WORKSPACE_BOOTSTRAP_CACHE_MS
  ) {
    return cached;
  }

  if (useCache && masterWorkspaceBootstrapPromise && masterWorkspaceBootstrapPromiseToken === token) {
    return masterWorkspaceBootstrapPromise;
  }

  const request = Promise.all([
    apiFetch<WorkspacePayload>("/modules/master/workspace"),
    apiFetch<CurrentUser>("/profile/current-user"),
  ]).then(([workspacePayload, userPayload]) => {
    const nextSnapshot = {
      token,
      workspacePayload,
      userPayload,
      cachedAt: Date.now(),
    };
    masterWorkspaceBootstrapSnapshot = nextSnapshot;
    return nextSnapshot;
  });

  masterWorkspaceBootstrapPromise = request;
  masterWorkspaceBootstrapPromiseToken = token;

  try {
    return await request;
  } finally {
    if (masterWorkspaceBootstrapPromise === request) {
      masterWorkspaceBootstrapPromise = null;
      masterWorkspaceBootstrapPromiseToken = null;
    }
  }
}
