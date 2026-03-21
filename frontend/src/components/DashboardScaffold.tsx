"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ModuleNav from "./ModuleNav";

type DashboardScaffoldProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  showDashboardShortcut?: boolean;
};

function buildPageKey(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "dashboard";
}

export default function DashboardScaffold({
  title,
  children,
  actions,
  showDashboardShortcut = true,
}: DashboardScaffoldProps) {
  const pathname = usePathname();
  const isRootDashboard = pathname === "/dashboard";
  const sectionLabel = pathname.startsWith("/hbx-recovery") ? "HBX Recovery" : "HBX Workspace";
  const pageKey = buildPageKey(pathname);

  return (
    <main className="app-shell" data-page-key={pageKey}>
      <div className="app-container">
        <div className="workspace-shell">
          <aside className="workspace-rail">
            <section className="shell-card shell-card--nav">
              <div className="shell-card__header">
                <div>
                  <p className="shell-card__eyebrow">Módulos</p>
                  <strong className="shell-card__title">Navegação principal</strong>
                </div>
              </div>
              <ModuleNav />
            </section>
          </aside>

          <section className="workspace-main">
            <section className="panel page-hero">
              <div className="page-hero__copy">
                <span className="page-overline">{sectionLabel}</span>
                <h1>{title}</h1>
              </div>

              <div className="page-hero__sidebar">
                <div className="page-hero__actions">
                  {showDashboardShortcut && !isRootDashboard ? (
                    <Link href="/dashboard" className="btn btn-secondary btn-sm">
                      Voltar ao menu
                    </Link>
                  ) : null}
                  {actions}
                </div>
              </div>
            </section>

            <div className="page-content">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
