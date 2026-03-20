"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type DashboardScaffoldProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  showDashboardShortcut?: boolean;
};

export default function DashboardScaffold({
  title,
  description,
  children,
  actions,
  showDashboardShortcut = true,
}: DashboardScaffoldProps) {
  const pathname = usePathname();
  const isRootDashboard = pathname === "/dashboard";
  const sectionLabel = pathname.startsWith("/hbx-recovery") ? "HBX Recovery" : "HBX Workspace";

  return (
    <main className="app-shell">
      <div className="app-container">
        <section className="panel page-hero">
          <div className="page-hero__copy">
            <p className="page-overline">{sectionLabel}</p>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          <div className="page-hero__actions">
            {showDashboardShortcut && !isRootDashboard ? (
              <Link href="/dashboard" className="btn btn-secondary btn-sm">
                Voltar ao menu
              </Link>
            ) : null}
            {actions}
          </div>
        </section>

        <div className="page-content">{children}</div>
      </div>
    </main>
  );
}
