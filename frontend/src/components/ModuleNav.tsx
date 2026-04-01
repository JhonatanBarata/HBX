"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import { MASTER_CONTEXT_CHANGED_EVENT } from "../lib/masterContextEvents";
import type { PresentationConfig, PresentationModuleOverride } from "../lib/presentation-config";
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
    description: "Inbox, agenda conectada e bot do atendimento.",
    matcher: (route) =>
      route.startsWith("/dashboard/inbox") ||
      route.startsWith("/hbx-recovery") ||
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
    description: "Abrir o site da empresa e entrar no admin com segurança.",
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
    label: "Cadastro",
    shortLabel: "CD",
    description: "Base obrigatoria de clientes e tabelas operacionais do sistema.",
    matcher: (route) => route.startsWith("/dashboard/importacoes/cadastros"),
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

type ModuleNavProps = {
  presentationEditing?: boolean;
  canEditPresentation?: boolean;
  presentationConfig?: PresentationConfig | null;
  onUpdateModulePresentation?: (href: string, patch: Partial<PresentationModuleOverride>) => void;
};

function subscribeAuth(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("auth-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("auth-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getAuthSnapshot() {
  return Boolean(getToken());
}

function getAuthServerSnapshot() {
  return false;
}

export default function ModuleNav({
  presentationEditing = false,
  canEditPresentation = false,
  presentationConfig,
  onUpdateModulePresentation,
}: ModuleNavProps) {
  const pathname = usePathname();
  const authenticated = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isSystemMaster, setIsSystemMaster] = useState(false);
  const [loading, setLoading] = useState(authenticated);

  useEffect(() => {
    let mounted = true;

    async function loadNavigationContext() {
      if (!authenticated) {
        if (!mounted) return;
        setModules([]);
        setUserRole(null);
        setIsSystemMaster(false);
        setLoading(false);
        return;
      }

      setLoading(true);
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
        if (!mounted) return;
        setModules([]);
        setUserRole(null);
        setIsSystemMaster(false);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadNavigationContext();

    function handleMasterContextChanged() {
      void loadNavigationContext();
    }

    window.addEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);

    return () => {
      mounted = false;
      window.removeEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    };
  }, [authenticated]);

  const accessibleModules = useMemo(() => {
    const keys = new Set((modules || []).filter((module) => module.accessible).map((module) => module.key));
    if (keys.has("hbx_recovery")) {
      keys.add("atendimento");
    }
    return keys;
  }, [modules]);

  const navItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.href === "/dashboard") return true;
      if (loading) return false;
      if (item.moduleKey && !accessibleModules.has(item.moduleKey)) return false;
      if (!item.adminOnly) return true;
      if (item.href === "/dashboard/master") return isSystemMaster;
      return String(userRole || "").toUpperCase() === "ADMIN";
    });
  }, [accessibleModules, isSystemMaster, loading, userRole]);

  return (
    <nav className={styles.moduleNavWrap} aria-label="Navegação de módulos">
      {navItems.map((item) => {
        const active = item.matcher(pathname || "");
        const override = presentationConfig?.modules?.[item.href];
        const label = String(override?.label || item.label);
        const shortLabel = String(override?.shortLabel || item.shortLabel).slice(0, 4).toUpperCase();
        const description = String(override?.description || item.description);

        if (presentationEditing && canEditPresentation) {
          return (
            <div
              key={item.href}
              className={active ? styles.moduleCardActive : styles.moduleCard}
              data-ui-slot="module-card"
              data-editing="true"
            >
              <span className={styles.moduleCardBadge}>
                <input
                  className={styles.moduleBadgeInput}
                  value={shortLabel}
                  maxLength={4}
                  aria-label={`Sigla do módulo ${item.label}`}
                  onChange={(event) =>
                    onUpdateModulePresentation?.(item.href, {
                      shortLabel: event.target.value.toUpperCase(),
                    })
                  }
                />
              </span>
              <span className={styles.moduleCardBody}>
                <input
                  className={styles.moduleEditInput}
                  value={label}
                  aria-label={`Título do módulo ${item.label}`}
                  onChange={(event) =>
                    onUpdateModulePresentation?.(item.href, {
                      label: event.target.value,
                    })
                  }
                />
                <textarea
                  className={styles.moduleEditTextarea}
                  value={description}
                  rows={3}
                  aria-label={`Descrição do módulo ${item.label}`}
                  onChange={(event) =>
                    onUpdateModulePresentation?.(item.href, {
                      description: event.target.value,
                    })
                  }
                />
              </span>
              <span className={styles.moduleCardArrow} aria-hidden="true">
                EDITAR
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? styles.moduleCardActive : styles.moduleCard}
            data-ui-slot="module-card"
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.moduleCardBadge}>{shortLabel}</span>
            <span className={styles.moduleCardBody}>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <span className={styles.moduleCardArrow} aria-hidden="true">
              {active ? "ATIVO" : "ABRIR"}
            </span>
          </Link>
        );
      })}
      {loading ? <p className={styles.moduleNavStatus}>Carregando módulos...</p> : null}
    </nav>
  );
}
