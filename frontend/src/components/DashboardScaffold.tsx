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

function formatSection(pathname: string) {
  const section = pathname
    .replace("/dashboard", "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/-/g, " "))
    .join(" / ");

  return section ? `Dashboard / ${section}` : "Dashboard / menu principal";
}

export default function DashboardScaffold({
  title,
  description,
  children,
  actions,
  showDashboardShortcut = true,
}: DashboardScaffoldProps) {
  const pathname = usePathname();

  return (
    <main className="app-shell">
      <div className="app-container">
        <section className="panel page-hero">
          <div>
            <p className="page-overline">{formatSection(pathname)}</p>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>

          <div className="page-actions">
            {showDashboardShortcut ? (
              <Link href="/dashboard" className="btn btn-secondary btn-sm">
                Dashboard
              </Link>
            ) : null}
            {actions}
          </div>
        </section>

        {children}
      </div>
    </main>
  );
}
