"use client";

import React from "react";
import {
  applyThemeConfigToDocument,
  mergeThemeConfigChain,
  resolveThemeConfig,
  type HbxResolvedThemeConfig,
  type HbxThemeConfig,
  type HbxThemeSelection,
} from "@/lib/design-tokens";
import { apiFetch, getToken } from "@/app/dashboard/_lib/api";
import { HBX_THEME_PALETTES, type HbxThemeId, type HbxThemeMode } from "@/lib/theme-palettes";
import {
  HBX_THEME_CONFIG_STORAGE_KEY,
  HBX_THEME_ID_STORAGE_KEY,
  HBX_THEME_MODE_STORAGE_KEY,
  clearStoredThemeConfig,
  persistThemeConfig,
  readStoredThemeConfig,
  setActiveThemeUser,
} from "@/lib/theme-preferences";

export type ThemePreferenceScope = "company" | "system" | "user";

type ThemePreferencePermissions = {
  canEditCompany: boolean;
  canEditSystem: boolean;
  companyId: number | null;
  isAuthenticated: boolean;
};

type ThemePreferenceState = {
  scopes: Record<ThemePreferenceScope, HbxThemeConfig | null>;
  resolved: HbxResolvedThemeConfig;
  permissions: ThemePreferencePermissions;
};

type ThemePreferencePayload = {
  scopes?: Partial<Record<ThemePreferenceScope, HbxThemeConfig | null>>;
  resolved?: HbxThemeConfig | HbxResolvedThemeConfig | null;
  permissions?: Partial<ThemePreferencePermissions>;
};

type ThemeContextValue = {
  selection: HbxThemeSelection;
  activeTheme: (typeof HBX_THEME_PALETTES)[HbxThemeId];
  storageUserId: string | number | null;
  ready: boolean;
  themeState: ThemePreferenceState;
  setThemeId: (themeId: HbxThemeId) => void;
  setMode: (mode: HbxThemeMode) => void;
  setSelection: (selection: HbxThemeSelection) => void;
  saveScopeConfig: (scope: ThemePreferenceScope, config: HbxThemeConfig) => Promise<void>;
  resetScopeConfig: (scope: ThemePreferenceScope) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  setStorageUserId: (userId: string | number | null) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const DEFAULT_PERMISSIONS: ThemePreferencePermissions = {
  canEditCompany: false,
  canEditSystem: false,
  companyId: null,
  isAuthenticated: false,
};

function buildThemeState(
  scopes: Record<ThemePreferenceScope, HbxThemeConfig | null>,
  permissions?: Partial<ThemePreferencePermissions>,
): ThemePreferenceState {
  return {
    scopes,
    resolved: resolveThemeConfig(mergeThemeConfigChain(scopes.system, scopes.company, scopes.user)),
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...(permissions || {}),
    },
  };
}

function createLocalScopeState(userId?: string | number | null) {
  return {
    system: null,
    company: null,
    user: readStoredThemeConfig(userId),
  } satisfies Record<ThemePreferenceScope, HbxThemeConfig | null>;
}

function normalizePayload(
  payload: ThemePreferencePayload | null | undefined,
  fallbackScopes: Record<ThemePreferenceScope, HbxThemeConfig | null>,
) {
  const nextScopes: Record<ThemePreferenceScope, HbxThemeConfig | null> = {
    system: payload?.scopes?.system ?? fallbackScopes.system,
    company: payload?.scopes?.company ?? fallbackScopes.company,
    user: payload?.scopes?.user ?? fallbackScopes.user,
  };
  const nextResolved = payload?.resolved
    ? resolveThemeConfig(payload.resolved)
    : resolveThemeConfig(mergeThemeConfigChain(nextScopes.system, nextScopes.company, nextScopes.user));

  return {
    scopes: nextScopes,
    resolved: nextResolved,
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...(payload?.permissions || {}),
    },
  } satisfies ThemePreferenceState;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [storageUserId, setStorageUserIdState] = React.useState<string | number | null>(null);
  const [themeState, setThemeState] = React.useState<ThemePreferenceState>(() =>
    buildThemeState({ system: null, company: null, user: null }),
  );
  const [ready, setReady] = React.useState(false);
  const themeStateRef = React.useRef(themeState);
  const storageUserIdRef = React.useRef<string | number | null>(storageUserId);
  const didSkipInitialDocumentApplyRef = React.useRef(false);
  const scopeRequestVersionRef = React.useRef<Record<ThemePreferenceScope, number>>({
    system: 0,
    company: 0,
    user: 0,
  });

  const commitThemeState = React.useCallback((nextState: ThemePreferenceState) => {
    themeStateRef.current = nextState;
    setThemeState(nextState);
    return nextState;
  }, []);

  React.useEffect(() => {
    themeStateRef.current = themeState;
  }, [themeState]);

  React.useEffect(() => {
    storageUserIdRef.current = storageUserId;
  }, [storageUserId]);

  React.useLayoutEffect(() => {
    if (!didSkipInitialDocumentApplyRef.current) {
      didSkipInitialDocumentApplyRef.current = true;
      return;
    }

    applyThemeConfigToDocument(themeState.resolved);
  }, [themeState.resolved]);

  const refreshPreferences = React.useCallback(async () => {
    const localScopes = createLocalScopeState(storageUserIdRef.current);
    commitThemeState(
      buildThemeState(
        {
          system: themeStateRef.current.scopes.system,
          company: themeStateRef.current.scopes.company,
          user: localScopes.user,
        },
        themeStateRef.current.permissions,
      ),
    );

    if (!getToken()) {
      commitThemeState(buildThemeState(localScopes));
      setReady(true);
      return;
    }

    try {
      const payload = await apiFetch<ThemePreferencePayload>("/profile/theme-preferences");
      commitThemeState(normalizePayload(payload, localScopes));
    } catch {
      commitThemeState(buildThemeState(localScopes, { isAuthenticated: Boolean(getToken()) }));
    } finally {
      setReady(true);
    }
  }, [commitThemeState]);

  React.useEffect(() => {
    void refreshPreferences();
  }, [refreshPreferences, storageUserId]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key &&
        !event.key.startsWith(HBX_THEME_CONFIG_STORAGE_KEY) &&
        !event.key.startsWith(HBX_THEME_ID_STORAGE_KEY) &&
        !event.key.startsWith(HBX_THEME_MODE_STORAGE_KEY) &&
        event.key !== "theme" &&
        event.key !== "theme-mode"
      ) {
        return;
      }
      void refreshPreferences();
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshPreferences]);

  const saveScopeConfig = React.useCallback(
    async (scope: ThemePreferenceScope, config: HbxThemeConfig) => {
      const currentState = themeStateRef.current;
      const optimisticScopes: Record<ThemePreferenceScope, HbxThemeConfig | null> = {
        ...currentState.scopes,
        [scope]: mergeThemeConfigChain(currentState.scopes[scope], config),
      };
      commitThemeState(buildThemeState(optimisticScopes, currentState.permissions));

      if (scope === "user") {
        persistThemeConfig(optimisticScopes.user || {}, storageUserIdRef.current);
      }

      if (!getToken()) {
        return;
      }

      const requestVersion = (scopeRequestVersionRef.current[scope] || 0) + 1;
      scopeRequestVersionRef.current[scope] = requestVersion;

      try {
        const payload = await apiFetch<ThemePreferencePayload>("/profile/theme-preferences", {
          method: "PATCH",
          body: JSON.stringify({ scope, config }),
        });

        if (scopeRequestVersionRef.current[scope] !== requestVersion) {
          return;
        }

        const latestState = themeStateRef.current;
        const fallbackScopes: Record<ThemePreferenceScope, HbxThemeConfig | null> = {
          system: scope === "system" ? optimisticScopes.system : latestState.scopes.system,
          company: scope === "company" ? optimisticScopes.company : latestState.scopes.company,
          user: scope === "user" ? optimisticScopes.user : latestState.scopes.user,
        };

        commitThemeState(normalizePayload(payload, fallbackScopes));
      } catch {
        // keep optimistic local state when remote persistence is unavailable
      }
    },
    [commitThemeState],
  );

  const resetScopeConfig = React.useCallback(
    async (scope: ThemePreferenceScope) => {
      const currentState = themeStateRef.current;
      const optimisticScopes: Record<ThemePreferenceScope, HbxThemeConfig | null> = {
        ...currentState.scopes,
        [scope]: null,
      };
      commitThemeState(buildThemeState(optimisticScopes, currentState.permissions));

      if (scope === "user") {
        clearStoredThemeConfig(storageUserIdRef.current);
      }

      if (!getToken()) {
        return;
      }

      const requestVersion = (scopeRequestVersionRef.current[scope] || 0) + 1;
      scopeRequestVersionRef.current[scope] = requestVersion;

      try {
        const payload = await apiFetch<ThemePreferencePayload>("/profile/theme-preferences", {
          method: "PATCH",
          body: JSON.stringify({ scope, reset: true }),
        });

        if (scopeRequestVersionRef.current[scope] !== requestVersion) {
          return;
        }

        const latestState = themeStateRef.current;
        const fallbackScopes: Record<ThemePreferenceScope, HbxThemeConfig | null> = {
          system: scope === "system" ? optimisticScopes.system : latestState.scopes.system,
          company: scope === "company" ? optimisticScopes.company : latestState.scopes.company,
          user: scope === "user" ? optimisticScopes.user : latestState.scopes.user,
        };

        commitThemeState(normalizePayload(payload, fallbackScopes));
      } catch {
        // keep optimistic local state when remote persistence is unavailable
      }
    },
    [commitThemeState],
  );

  const setThemeId = React.useCallback(
    (themeId: HbxThemeId) => {
      void saveScopeConfig("user", { selection: { themeId, mode: themeState.resolved.selection.mode } });
    },
    [saveScopeConfig, themeState.resolved.selection.mode],
  );

  const setMode = React.useCallback(
    (mode: HbxThemeMode) => {
      void saveScopeConfig("user", { selection: { themeId: themeState.resolved.selection.themeId, mode } });
    },
    [saveScopeConfig, themeState.resolved.selection.themeId],
  );

  const setSelection = React.useCallback(
    (nextSelection: HbxThemeSelection) => {
      void saveScopeConfig("user", { selection: nextSelection });
    },
    [saveScopeConfig],
  );

  const setStorageUserId = React.useCallback((userId: string | number | null) => {
    setStorageUserIdState(userId);
    setActiveThemeUser(userId);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      selection: themeState.resolved.selection,
      activeTheme: HBX_THEME_PALETTES[themeState.resolved.selection.themeId],
      storageUserId,
      ready,
      themeState,
      setThemeId,
      setMode,
      setSelection,
      saveScopeConfig,
      resetScopeConfig,
      refreshPreferences,
      setStorageUserId,
    }),
    [
      ready,
      refreshPreferences,
      resetScopeConfig,
      saveScopeConfig,
      setMode,
      setSelection,
      setStorageUserId,
      setThemeId,
      storageUserId,
      themeState,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useHbxTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useHbxTheme must be used inside ThemeProvider.");
  }
  return context;
}
