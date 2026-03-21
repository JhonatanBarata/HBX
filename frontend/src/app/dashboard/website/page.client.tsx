"use client";

import { useEffect, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type WebsitePortal = {
  companyId: number | null;
  companyName: string | null;
  companySlug: string | null;
  configured: boolean;
  websiteEnabled: boolean;
  websitePublicUrl: string | null;
  websiteAdminUrl: string | null;
  websiteProjectId: string | null;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: "public" | "admin";
  adminAllowed: boolean;
  launchTarget: "public" | "admin" | null;
  launchUrl: string | null;
  message: string | null;
};

export default function WebsiteClientPage() {
  const hasToken = useRequireAuth();
  const redirectedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portal, setPortal] = useState<WebsitePortal | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch<WebsitePortal>("/website/portal");
      setPortal(payload);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao abrir o modulo Website.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  useEffect(() => {
    if (loading || redirectedRef.current || !portal?.launchUrl) return;
    redirectedRef.current = true;
    window.location.assign(portal.launchUrl);
  }, [loading, portal]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando modulo Website...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Website"
      description="Abrir o site da empresa e liberar acesso seguro ao admin quando permitido."
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="panel p-4 text-sm text-muted">Carregando configuracao do website...</div>
      ) : (
        <section className="panel p-5 space-y-3">
          <h2 className="text-lg font-semibold">
            {portal?.launchUrl ? "Abrindo website..." : "Website"}
          </h2>
          <p className="text-sm text-muted">
            {portal?.message ||
              (portal?.launchUrl
                ? `Redirecionando para ${portal.launchTarget === "admin" ? "o admin" : "o site publico"} de ${portal.companyName || "sua empresa"}.`
                : "Website nao configurado para esta empresa.")}
          </p>

          {portal?.configured ? (
            <div className="space-y-1 rounded-xl border border-(--line) bg-(--surface-soft) p-3 text-sm text-muted">
              <p>Empresa: {portal.companyName || "-"}</p>
              <p>Site publico: {portal.websitePublicUrl || "-"}</p>
              <p>Admin habilitado: {portal.websiteAdminEnabled ? "Sim" : "Nao"}</p>
              <p>Modo padrao: {portal.websiteLaunchMode === "admin" ? "Admin" : "Publico"}</p>
            </div>
          ) : null}

          {portal?.launchUrl ? (
            <a className="btn btn-primary btn-sm w-fit" href={portal.launchUrl}>
              Abrir agora
            </a>
          ) : null}
        </section>
      )}
    </DashboardScaffold>
  );
}
