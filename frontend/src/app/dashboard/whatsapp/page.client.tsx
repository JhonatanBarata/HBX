"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type UserProfile = {
  isSystemMaster?: boolean;
};

export default function WhatsAppConfigClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    apiFetch<UserProfile>("/profile/current-user")
      .then((profile) => {
        if (!mounted) return;
        const master = Boolean(profile?.isSystemMaster);
        setIsMaster(master);
        if (!master) router.replace("/dashboard");
      })
      .catch(() => {
        if (!mounted) return;
        router.replace("/dashboard");
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, [hasToken, router]);

  if (hasToken === null || checking) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken || !isMaster) return null;

  return (
    <DashboardScaffold
      title="WhatsApp API"
      description="A configuracao foi centralizada no painel Master por empresa."
      actions={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => router.push("/dashboard/master")}
        >
          Abrir Master
        </button>
      }
    >
      <div className="alert alert-info">
        Use o painel Master para criar empresas e configurar/validar credenciais WhatsApp por empresa.
      </div>
    </DashboardScaffold>
  );
}

