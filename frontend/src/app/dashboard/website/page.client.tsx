"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { getWebsitePortal } from "@/lib/websiteLaunch";
import { useRequireAuth } from "../_lib/useRequireAuth";

type LaunchState = "loading" | "redirecting" | "error";

function buildFallbackMessage(portal?: {
  message?: string | null;
  companyName?: string | null;
  configured?: boolean;
  websiteAdminEnabled?: boolean;
  websiteAdminUrl?: string | null;
  websiteProjectId?: string | null;
  adminAllowed?: boolean;
}) {
  const portalMessage = String(portal?.message || "").trim();
  if (portalMessage) return portalMessage;

  if (!portal?.configured) {
    return "O website desta empresa ainda nao esta configurado no HBX.";
  }

  if (!portal?.websiteAdminEnabled || !portal?.websiteAdminUrl || !portal?.websiteProjectId) {
    return "O admin protegido deste website ainda nao esta configurado para a empresa ativa.";
  }

  if (portal?.adminAllowed === false) {
    return "Seu usuario nao tem acesso ao admin do website desta empresa.";
  }

  const companyName = String(portal?.companyName || "").trim();
  return companyName
    ? `Nao foi possivel abrir o website protegido de ${companyName}.`
    : "Nao foi possivel abrir o website protegido.";
}

export default function WebsiteClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [launchState, setLaunchState] = useState<LaunchState>("loading");
  const [statusMessage, setStatusMessage] = useState("Preparando o website protegido...");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    async function launchWebsiteAdmin() {
      setLaunchState("loading");
      setStatusMessage("Identificando a empresa ativa e preparando o handoff HBX...");

      try {
        const portal = await getWebsitePortal("admin");
        const launchUrl = String(portal?.launchUrl || "").trim();

        if (!launchUrl) {
          throw new Error(buildFallbackMessage(portal));
        }

        if (cancelled) return;

        const companyName = String(portal?.companyName || "").trim();
        setLaunchState("redirecting");
        setStatusMessage(
          companyName
            ? `Abrindo o admin protegido de ${companyName}...`
            : "Abrindo o admin protegido...",
        );

        window.location.replace(launchUrl);
      } catch (error) {
        if (cancelled) return;
        setLaunchState("error");
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Falha ao abrir o website protegido da empresa ativa.",
        );
      }
    }

    void launchWebsiteAdmin();

    return () => {
      cancelled = true;
    };
  }, [attempt, hasToken]);

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
      description="Atalho operacional para abrir diretamente o admin protegido da empresa ativa."
    >
      <section className="panel p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            {launchState === "error" ? "Nao foi possivel abrir o website" : "Abrindo website protegido..."}
          </h2>
          <p className="text-sm text-muted mt-2">{statusMessage}</p>
        </div>

        {launchState === "error" ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => router.push("/dashboard")}
            >
              Voltar ao dashboard
            </button>
          </div>
        ) : (
          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm text-muted">
            O HBX esta anexando o handoff seguro e redirecionando voce para o admin correto da empresa logada.
          </div>
        )}
      </section>
    </DashboardScaffold>
  );
}
