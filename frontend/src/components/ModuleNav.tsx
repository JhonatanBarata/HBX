"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import styles from "./ModuleNav.module.css";

type UserModule = { key: string; accessible: boolean };

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  matcher: (pathname: string) => boolean;
  adminOnly?: boolean;
  moduleKey?: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Menu",
    shortLabel: "ME",
    description: "Resumo de acesso e atalhos por módulo.",
    matcher: (route) => route === "/dashboard",
  },
  {
    href: "/dashboard/inbox",
    label: "Atendimento",
    shortLabel: "AT",
    description: "Inbox, agenda, templates e bot do atendimento.",
    matcher: (route) =>
      route.startsWith("/dashboard/inbox") ||
      route.startsWith("/dashboard/auto-replies") ||
      route.startsWith("/dashboard/messages"),
    moduleKey: "atendimento",
  },
  {
    href: "/dashboard/gerencial",
    label: "Gerencial",
    shortLabel: "GE",
    description: "Usuários, acessos e operação de equipe.",
    matcher: (route) => route.startsWith("/dashboard/gerencial"),
    adminOnly: true,
    moduleKey: "gerencial",
  },
  {
    href: "/hbx-recovery",
    label: "Recovery",
    shortLabel: "RC",
    description: "Cobrança, negociação e console de recuperação.",
    matcher: (route) => route.startsWith("/hbx-recovery"),
    moduleKey: "hbx_recovery",
  },
  {
    href: "/dashboard/webscraping",
    label: "Webscraping",
    shortLabel: "WS",
    description: "Prospecção local integrada ao workspace.",
    matcher: (route) => route.startsWith("/dashboard/webscraping"),
    moduleKey: "webscraping",
  },
  {
    href: "/dashboard/website",
    label: "Website",
    shortLabel: "WB",
    description: "Provisionamento e operação do website por empresa.",
    matcher: (route) => route.startsWith("/dashboard/website"),
    moduleKey: "website",
  },
  {
    href: "/dashboard/importacoes/followup-global",
    label: "Follow Up",
    shortLabel: "FU",
    description: "Importações, histórico e follow-up global.",
    matcher: (route) =>
      route.startsWith("/dashboard/importacoes/followup-global") ||
      route.startsWith("/dashboard/importacoes/historico") ||
      route.startsWith("/dashboard/importacoes/novo"),
    moduleKey: "follow_up_internacional",
  },
  {
    href: "/dashboard/importacoes/cadastros",
    label: "Cadastros",
    shortLabel: "CD",
    description: "Tabelas operacionais e base de fornecedores.",
    matcher: (route) => route.startsWith("/dashboard/importacoes/cadastros"),
    moduleKey: "cadastros",
  },
  {
    href: "/dashboard/master",
    label: "Master",
    shortLabel: "MS",
    description: "Empresas, billing, acessos e configurações globais.",
    matcher: (route) => route.startsWith("/dashboard/master"),
    adminOnly: true,
    moduleKey: "master",
  },
];

export default function ModuleNav() {
  const pathname = usePathname();
  const authenticated = Boolean(getToken());
  const [modules, setModules] = useState<UserModule[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isSystemMaster, setIsSystemMaster] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let mounted = true;

    (async () => {
      try {
        const [myModules, profile] = await Promise.all([
          apiFetch<UserModule[]>("/modules/me"),
          apiFetch<{ role?: string | null; isSystemMaster?: boolean }>("/profile/current-user").catch(
            () => null,
          ),
        ]);
        if (!mounted) return;
        setModules(myModules || []);
        setUserRole(String(profile?.role || null));
        setIsSystemMaster(Boolean(profile?.isSystemMaster));
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authenticated]);

  const accessibleModules = useMemo(
    () => new Set((modules || []).filter((module) => module.accessible).map((module) => module.key)),
    [modules],
  );

  const navItems = useMemo(() => {
    const showAllUntilLoaded = Array.isArray(modules) && modules.length === 0;

    return NAV_ITEMS.filter((item) => {
      if (showAllUntilLoaded) return true;
      if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
      if (!item.adminOnly) return true;
      if (item.href === "/dashboard/master") return isSystemMaster;
      return String(userRole || "").toUpperCase() === "ADMIN";
    });
  }, [accessibleModules, isSystemMaster, modules, userRole]);

  return (
    <nav className={styles.moduleNavWrap} aria-label="Navegação de módulos">
      {navItems.map((item) => {
        const active = item.matcher(pathname || "");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? styles.moduleCardActive : styles.moduleCard}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.moduleCardBadge}>{item.shortLabel}</span>
            <span className={styles.moduleCardBody}>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <span className={styles.moduleCardArrow} aria-hidden="true">
              {active ? "ATIVO" : "ABRIR"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
