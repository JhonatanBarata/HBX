"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";
import { resolveWebsiteOnlyDestination } from "@/lib/websiteLaunch";

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
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [redirectingToWebsite, setRedirectingToWebsite] = useState(false);

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
          loadError instanceof Error ? loadError.message : "Falha ao carregar usuário.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

  const isAdmin = String(user?.role ?? "").toUpperCase() === "ADMIN";
  const roleLabel = String(user?.role ?? "").toUpperCase() || "USUÁRIO";
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
        description: item.description || "Módulo disponível para seu usuário.",
        href: moduleRoutes[item.key] || "/dashboard",
        badge: item.key === "gerencial" || item.key === "master" ? "ADMIN" : undefined,
      }));

    if (isSystemMaster && !base.some((item) => item.href === "/dashboard/master")) {
      base.push({
        title: "Master",
        description: "Gestão global de empresas, módulos, usuários e billing.",
        href: "/dashboard/master",
        badge: "ADMIN",
      });
    }

    return base;
  }, [isAdmin, isSystemMaster, modules]);

  useEffect(() => {
    if (hasToken !== true || loading || redirectingToWebsite) return;
    if (moduleCards.length !== 1 || moduleCards[0]?.href !== "/dashboard/website") return;

    let cancelled = false;
    setRedirectingToWebsite(true);

    resolveWebsiteOnlyDestination()
      .then((destination) => {
        if (cancelled) return;
        if (!destination) {
          setRedirectingToWebsite(false);
          return;
        }
        if (/^https?:\/\//i.test(destination)) {
          window.location.assign(destination);
          return;
        }
        router.replace(destination);
      })
      .catch(() => {
        if (!cancelled) {
          setRedirectingToWebsite(false);
          router.replace("/dashboard/website");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken, loading, moduleCards, redirectingToWebsite, router]);

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

  if (redirectingToWebsite) {
    return (
      <DashboardScaffold title="Dashboard">
        <div className="panel p-4 text-sm text-muted">Abrindo o admin do website...</div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Dashboard">
      <div className="dashboard-home">
        {error ? <div className="alert alert-error">{error}</div> : null}

        <section className="metrics-grid">
          <article className="stat-card">
            <p className="stat-card__label">Empresa</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">
              {isSystemMaster ? "Sistema Global" : user?.company?.name ?? "Não vinculada"}
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Usuário</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{user?.username ?? "-"}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Perfil</p>
            <p className="stat-card__value text-[1.1rem] leading-tight">{roleLabel}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Módulos ativos</p>
            <p className="stat-card__value">{moduleCards.length}</p>
          </article>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {loading ? (
            <div className="panel p-4 text-sm text-muted lg:col-span-2">Carregando módulos...</div>
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
                  Acessar módulo
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
