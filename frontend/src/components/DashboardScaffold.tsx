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
  description,
  children,
  actions,
  showDashboardShortcut = true,
}: DashboardScaffoldProps) {
  const pathname = usePathname();
  const { activeTheme, selection } = useHbxTheme();
  const isRootDashboard = pathname === "/dashboard";
  const isRecovery = pathname.startsWith("/hbx-recovery");
  const sectionLabel = isRecovery ? "HBX Recovery" : "HBX Workspace";
  const pageKey = buildPageKey(pathname);

  return (
    <main className="app-shell" data-page-key={pageKey}>
      <div className="app-container">
        <div className="workspace-shell">
          <aside className="workspace-rail">
            <section className="shell-card shell-card--brand">
              <p className="shell-card__eyebrow">Workspace shell</p>
              <strong className="shell-card__title">{activeTheme.shellLabel}</strong>
              <p className="shell-card__copy">{activeTheme.personality}</p>
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

            <section className="shell-card shell-card--meta">
              <div className="shell-metric">
                <strong>{activeTheme.depthLabel}</strong>
                <span>Profundidade do tema</span>
              </div>
              <div className="shell-metric">
                <strong>{activeTheme.inspiration}</strong>
                <span>Base criativa</span>
              </div>
              <div className="shell-metric">
                <strong>{activeTheme.shortLabel}</strong>
                <span>Identificador rapido</span>
              </div>
            </section>
          </aside>

          <section className="workspace-main">
            <section className="panel page-hero">
              <div className="page-hero__copy">
                <p className="page-overline">{sectionLabel}</p>
                <h1>{title}</h1>
                {description ? <p>{description}</p> : null}
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

          <aside className="workspace-context">
            <section className="shell-card shell-card--context">
              <p className="shell-card__eyebrow">Leitura da pagina</p>
              <strong className="shell-card__title">{title}</strong>
              <p className="shell-card__copy">
                {description ||
                  "A mesma logica do produto continua ativa, agora com um shell visual autoral e tokens centrais."}
              </p>
              <div className="shell-card__stack">
                <span className="shell-inline-stat">
                  <strong>{sectionLabel}</strong>
                  <span>Modulo atual</span>
                </span>
                <span className="shell-inline-stat">
                  <strong>{isRecovery ? "Recovery" : "Operacao HBX"}</strong>
                  <span>Contexto</span>
                </span>
                <span className="shell-inline-stat">
                  <strong>{pageKey.replace(/-/g, " ")}</strong>
                  <span>Slug visual</span>
                </span>
              </div>
            </section>

            <section className="shell-card shell-card--hint">
              <p className="shell-card__eyebrow">Guia rapido</p>
              <strong className="shell-card__title">Tema herdado globalmente</strong>
              <p className="shell-card__copy">
                Novas telas passam a herdar tipografia, superficies, sombras, shell e estados via tokens
                centrais.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
