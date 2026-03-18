"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";

type CurrentUser = {
  id: number;
  username?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: { id: number; name?: string | null } | null;
};

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  badge?: string;
};

type UserModule = {
  key: string;
  name: string;
  description?: string | null;
  serviceUrl?: string | null;
  accessible: boolean;
};

export default function DashboardClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);

  useEffect(() => {
    if (hasToken !== true) return;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const [me, userModules] = await Promise.all([
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
        ]);
        setUser(me);
        setModules(userModules || []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar usuario.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

  const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
  const roleLabel = String(user?.role ?? "").toUpperCase() || "USUARIO";
  const isSystemMaster = Boolean(user?.isSystemMaster);

  const moduleCards = useMemo<ModuleCard[]>(() => {
    const moduleRoutes: Record<string, string> = {
      atendimento: "/dashboard/inbox",
      gerencial: "/dashboard/gerencial",
      hbx_recovery: "/hbx-recovery",
      webscraping: "/dashboard/webscraping",
      website: "/dashboard/website",
      follow_up_internacional: "/dashboard/importacoes/followup-global",
      cadastros: "/dashboard/importacoes/cadastros",
      master: "/dashboard/master",
    };

    const base: ModuleCard[] = modules
      .filter((item) => item.accessible)
      .filter((item) => (item.key === 'gerencial' ? isAdmin : true))
      .map((item) => ({
        title: item.name,
        description: item.description || "Modulo disponivel para seu usuario.",
        href: moduleRoutes[item.key] || "/dashboard",
        badge: item.key === "gerencial" || item.key === "master" ? "ADMIN" : undefined,
      }));

    if (isSystemMaster && !base.some((item) => item.href === "/dashboard/master")) {
      base.push({
        title: "Master",
        description: "Gestao global de empresas, modulos, usuarios e billing.",
        href: "/dashboard/master",
        badge: "ADMIN",
      });
    }

    return base;
  }, [isAdmin, isSystemMaster, modules]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Dashboard">
      <div className="dashboard-home">
        {error ? <div className="alert alert-error">{error}</div> : null}

        <section className="metrics-grid">
          <article className="stat-card">
            <p className="stat-card__label">Empresa</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">
              {isSystemMaster ? "Sistema Global" : user?.company?.name ?? "Nao vinculada"}
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Usuario</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{user?.username ?? "-"}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Perfil</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{roleLabel}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Modulos ativos</p>
            <p className="stat-card__value">{moduleCards.length}</p>
          </article>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {loading ? (
            <div className="panel p-4 text-sm text-muted lg:col-span-2">Carregando modulos...</div>
          ) : (
            moduleCards.map((item) => (
              <Link key={item.href} href={item.href} className="panel panel-interactive p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{item.title}</h2>
                    <p className="text-sm text-muted mt-2 leading-relaxed">{item.description}</p>
                  </div>
                  {item.badge ? <span className="badge badge-brand">{item.badge}</span> : null}
                </div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-(--brand)">
                  Acessar modulo
                  <span aria-hidden="true">{"->"}</span>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>

      {/* Navegacao global removida: já existe o menu superior */}
    </DashboardScaffold>
  );
}
