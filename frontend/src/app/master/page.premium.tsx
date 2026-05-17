"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { fetchMasterWorkspaceBootstrap } from "./master.bootstrap";
import type { CurrentUser, WorkspacePayload } from "./master.types";
import MasterCommandCenter from "./_command-center/MasterCommandCenter";

export default function MasterPremiumPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const { workspacePayload, userPayload } = await fetchMasterWorkspaceBootstrap(!background);
      setWorkspace(workspacePayload);
      setCurrentUser(userPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a central MASTER.");
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadWorkspace(false);
  }, [hasToken, loadWorkspace]);

  const initialCompanyId = useMemo(() => {
    const companyId = Number(searchParams.get("companyId") || searchParams.get("cliente") || 0);
    return Number.isFinite(companyId) && companyId > 0 ? companyId : null;
  }, [searchParams]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando central MASTER...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Master Command Center" hideHeader>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <MasterCommandCenter
        workspace={workspace}
        currentUser={currentUser}
        loading={loading}
        refreshing={refreshing}
        initialCompanyId={initialCompanyId}
        initialSection={searchParams.get("tab")}
        initialPanel={searchParams.get("panel")}
        onReload={loadWorkspace}
        setWorkspace={setWorkspace}
        setCurrentUser={setCurrentUser}
      />
    </DashboardScaffold>
  );
}
