"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useHbxTheme } from "@/components/ThemeProvider";
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
  const { activeTheme, selection } = useHbxTheme();
  const isRootDashboard = pathname === "/dashboard";
  const sectionLabel = pathname.startsWith("/hbx-recovery") ? "HBX Recovery" : "HBX Workspace";
  const pageKey = buildPageKey(pathname);

  return (
    <main className="app-shell" data-page-key={pageKey}>
      <div className="app-container">
        <div className="workspace-shell">
          <aside className="workspace-rail">
            <section className="shell-card shell-card--brand">
              <p className="shell-card__eyebrow">Workspace shell</p>
              <strong className="shell-card__title">{activeTheme.shellLabel}</strong>
              <div className="shell-card__tags">
                <span>{activeTheme.label}</span>
                <span>{activeTheme.densityLabel}</span>
                <span>{selection.mode === "dark" ? "Dark" : "Light"}</span>
              </div>
            </section>

            <section className="shell-card shell-card--nav">
              <div className="shell-card__header">
                <div>
                  <p className="shell-card__eyebrow">Modulos</p>
                  <strong className="shell-card__title">Navegacao principal</strong>
                </div>
              </div>
              <ModuleNav />
            </section>
          </aside>

          <section className="workspace-main">
            <section className="panel page-hero">
              <div className="page-hero__copy">
                <p className="page-overline">{sectionLabel}</p>
                <h1>{title}</h1>
              </div>

              <div className="page-hero__sidebar">
                <div className="page-hero__meta">
                  <span className="page-hero__metaChip">
                    <strong>{activeTheme.label}</strong>
                    <span>Tema ativo</span>
                  </span>
                  <span className="page-hero__metaChip">
                    <strong>{activeTheme.shellLabel}</strong>
                    <span>App shell</span>
                  </span>
                  <span className="page-hero__metaChip">
                    <strong>{activeTheme.densityLabel}</strong>
                    <span>Ritmo</span>
                  </span>
                </div>

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
