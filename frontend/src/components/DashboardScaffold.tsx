"use client";

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

  return (
    <main className="app-shell">
      <div className="app-container">
        {actions ? (
          <section className="panel page-hero">
            <div className="page-actions">{actions}</div>
          </section>
        ) : null}

        {children}
      </div>
    </main>
  );
}
