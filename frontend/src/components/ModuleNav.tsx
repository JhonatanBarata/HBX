"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import { MASTER_CONTEXT_CHANGED_EVENT } from "../lib/masterContextEvents";
import type { PresentationConfig, PresentationModuleOverride } from "../lib/presentation-config";
import {
  formatCriticalEngineLabel,
  inferModuleCategory,
  isModuleBlocked,
  isModuleVisible,
  normalizeUserModuleKey,
  resolveModuleBlockedActionLabel,
  resolveModuleBlockedHref,
  resolveModuleHref,
  type HbxModuleCategory,
  type UserModule,
} from "../lib/hbx-modules";
import styles from "./ModuleNav.module.css";

type NavItem = {
  key: string;
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  matcher: (pathname: string) => boolean;
  category: HbxModuleCategory;
  adminOnly?: boolean;
  companyOnly?: boolean;
  moduleKey?: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "atendimento",
    href: "/dashboard/inbox",
    label: "Atendimento",
    shortLabel: "AT",
    description: "Inbox, agenda conectada e bot do atendimento.",
    matcher: (route) =>
      route.startsWith("/dashboard/inbox") ||
      route.startsWith("/hbx-recovery") ||
      route.startsWith("/dashboard/auto-replies") ||
      route.startsWith("/dashboard/messages"),
    category: "commercial",
    moduleKey: "atendimento",
  },
  {
    key: "vendas",
    href: "/dashboard/vendas",
    label: "Vendas",
    shortLabel: "VD",
    description: "CRM agenda viva com leads, retornos e próximos passos.",
    matcher: (route) => route.startsWith("/dashboard/vendas"),
    category: "commercial",
    moduleKey: "vendas",
  },
  {
    key: "website",
    href: "/dashboard/website",
    label: "Website",
    shortLabel: "WB",
    description: "Abrir o site da empresa e entrar no admin com segurança.",
    matcher: (route) => route.startsWith("/dashboard/website"),
    category: "commercial",
    moduleKey: "website",
  },
  {
    key: "webscraping",
    href: "/dashboard/webscraping",
    label: "Webscraping",
    shortLabel: "WS",
    description: "Prospecção local integrada ao workspace.",
    matcher: (route) => route.startsWith("/dashboard/webscraping"),
    category: "commercial",
    moduleKey: "webscraping",
  },
  {
    key: "follow_up_internacional",
    href: "/dashboard/importacoes/followup-global",
    label: "Follow Up",
    shortLabel: "FU",
    description: "Importações, histórico e follow-up global.",
    matcher: (route) =>
      route.startsWith("/dashboard/importacoes/followup-global") ||
      route.startsWith("/dashboard/importacoes/historico") ||
      route.startsWith("/dashboard/importacoes/novo"),
    category: "commercial",
    moduleKey: "follow_up_internacional",
  },
  {
    key: "cadastro",
    href: "/dashboard/importacoes/cadastros",
    label: "Cadastro",
    shortLabel: "CD",
    description: "Base estrutural de clientes e tabelas operacionais.",
    matcher: (route) => route.startsWith("/dashboard/importacoes/cadastros"),
    category: "structural",
    companyOnly: true,
  },
  {
    key: "financeiro",
    href: "/dashboard/financeiro",
    label: "Financeiro",
    shortLabel: "FN",
    description: "Conta, cobrança, trial e regularização do acesso.",
    matcher: (route) => route.startsWith("/dashboard/financeiro"),
    category: "structural",
    moduleKey: "financeiro",
  },
  {
    key: "gerencial",
    href: "/dashboard/gerencial",
    label: "Gerencial",
    shortLabel: "GE",
    description: "Usuários, permissões e operação da equipe.",
    matcher: (route) => route.startsWith("/dashboard/gerencial"),
    category: "structural",
    adminOnly: true,
    moduleKey: "gerencial",
  },
  {
    key: "whatsapp",
    href: "/dashboard/whatsapp",
    label: "WhatsApp",
    shortLabel: "WA",
    description: "Conexão do motor oficial ou temporário.",
    matcher: (route) => route.startsWith("/dashboard/whatsapp"),
    category: "structural",
    companyOnly: true,
  },
  {
    key: "master",
    href: "/dashboard/master",
    label: "Master",
    shortLabel: "MS",
    description: "Empresas, billing, acessos e configurações globais.",
    matcher: (route) => route.startsWith("/dashboard/master"),
    category: "system",
    adminOnly: true,
    moduleKey: "master",
  },
];

const NAV_SECTIONS: Array<{ category: HbxModuleCategory; title: string; hint: string }> = [
  {
    category: "commercial",
    title: "Módulos",
    hint: "Áreas comercializáveis e operacionais.",
  },
  {
    category: "structural",
    title: "Guias",
    hint: "Configuração, base e apoio estrutural.",
  },
  {
    category: "system",
    title: "Sistema",
    hint: "Operação global e contexto MASTER.",
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
  const [hasCompany, setHasCompany] = useState(false);
  const [loading, setLoading] = useState(authenticated);

  useEffect(() => {
    let mounted = true;

    async function loadNavigationContext() {
      if (!authenticated) {
        if (!mounted) return;
        setModules([]);
        setUserRole(null);
        setIsSystemMaster(false);
        setHasCompany(false);
        setLoading(false);
        return;
      }

      // If the app already prefetched modules/profile (e.g. DashboardScaffold), use them
      if (typeof window !== "undefined" && (window as any).__hbx_prefetch && Array.isArray((window as any).__hbx_prefetch.modules)) {
        const pre = (window as any).__hbx_prefetch;
        if (!mounted) return;
        setModules(Array.isArray(pre.modules) ? pre.modules : []);
        setUserRole(String(pre.profile?.role || null));
        setIsSystemMaster(Boolean(pre.profile?.isSystemMaster));
        setHasCompany(Boolean(pre.profile?.company?.id));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [myModules, profile] = await Promise.all([
          apiFetch<UserModule[]>("/modules/me"),
          apiFetch<{ role?: string | null; isSystemMaster?: boolean; company?: { id?: number | null } | null }>("/profile/current-user").catch(
            () => null,
          ),
        ]);
        if (!mounted) return;
        setModules(Array.isArray(myModules) ? myModules : []);
        setUserRole(String(profile?.role || null));
        setIsSystemMaster(Boolean(profile?.isSystemMaster));
        setHasCompany(Boolean(profile?.company?.id));
      } catch {
        if (!mounted) return;
        setModules([]);
        setUserRole(null);
        setIsSystemMaster(false);
        setHasCompany(false);
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

  const modulesByKey = useMemo(() => {
    const registry = new Map<string, UserModule>();
    for (const moduleItem of modules) {
      const key = normalizeUserModuleKey(moduleItem.key);
      if (!key) continue;
      const current = registry.get(key);
      if (!current) {
        registry.set(key, moduleItem);
        continue;
      }

      const currentCategory = current.category || inferModuleCategory(current.key);
      const nextCategory = moduleItem.category || inferModuleCategory(moduleItem.key);
      if (current.accessible !== moduleItem.accessible) {
        if (moduleItem.accessible) {
          registry.set(key, moduleItem);
        }
        continue;
      }
      if (currentCategory !== nextCategory) continue;
      if (!current.blockedReason && moduleItem.blockedReason) {
        registry.set(key, moduleItem);
      }
    }
    return registry;
  }, [modules]);

  const navItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (loading) return false;
      if (item.companyOnly && !hasCompany) return false;
      if (item.adminOnly) {
        if (item.key === "master") {
          if (!isSystemMaster) return false;
        } else if (String(userRole || "").toUpperCase() !== "ADMIN") {
          return false;
        }
      }

      if (!item.moduleKey) return true;

      const moduleItem = modulesByKey.get(normalizeUserModuleKey(item.moduleKey));
      if (!moduleItem) return false;
      return isModuleVisible(moduleItem);
    });
  }, [hasCompany, isSystemMaster, loading, modulesByKey, userRole]);

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: navItems.filter((item) => item.category === section.category),
      })).filter((section) => section.items.length > 0),
    [navItems],
  );

  return (
    <nav className={styles.moduleNavWrap} aria-label="Navegação do sistema">
      {sections.map((section) => (
        <section key={section.category} className={styles.navSection}>
          <div className={styles.navSectionHeader}>
            <p className={styles.navSectionTitle}>{section.title}</p>
            <p className={styles.navSectionHint}>{section.hint}</p>
          </div>

          <div className={styles.navSectionGrid}>
            {section.items.map((item) => {
              const active = item.matcher(pathname || "");
              const moduleItem = item.moduleKey ? modulesByKey.get(normalizeUserModuleKey(item.moduleKey)) : null;
              const blocked = Boolean(moduleItem && isModuleBlocked(moduleItem));
              const override = presentationConfig?.modules?.[item.href];
              const label = String(override?.label || item.label);
              const shortLabel = String(override?.shortLabel || item.shortLabel).slice(0, 4).toUpperCase();
              const description = String(
                override?.description || moduleItem?.blockedReason || item.description,
              );
              const href = item.moduleKey
                ? resolveModuleHref(item.moduleKey, moduleItem?.serviceUrl || item.href)
                : item.href;
              const blockedHref = moduleItem ? resolveModuleBlockedHref(moduleItem) : item.href;
              const blockedEngineLabel = moduleItem?.criticalEngine
                ? formatCriticalEngineLabel(moduleItem.criticalEngine)
                : null;
              const blockedActionLabel = moduleItem
                ? resolveModuleBlockedActionLabel(moduleItem)
                : "Resolver";

              if (presentationEditing && canEditPresentation) {
                return (
                  <div
                    key={item.key}
                    className={active ? styles.moduleCardActive : styles.moduleCard}
                    data-ui-slot="module-card"
                    data-editing="true"
                  >
                    <span className={styles.moduleCardBadge}>
                      <input
                        className={styles.moduleBadgeInput}
                        value={shortLabel}
                        maxLength={4}
                        aria-label={`Sigla do item ${item.label}`}
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
                        aria-label={`Título do item ${item.label}`}
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
                        aria-label={`Descrição do item ${item.label}`}
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

              if (blocked) {
                return (
                  <Link
                    key={item.key}
                    href={blockedHref}
                    className={active ? styles.moduleCardDisabledActive : styles.moduleCardDisabled}
                    data-ui-slot="module-card"
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.moduleCardBadge}>{shortLabel}</span>
                    <span className={styles.moduleCardBody}>
                      <strong>{label}</strong>
                      <small>{description}</small>
                      {blockedEngineLabel ? <em className={styles.moduleCardMeta}>Motor crítico: {blockedEngineLabel}</em> : null}
                    </span>
                    <span className={styles.moduleCardArrow} aria-hidden="true">
                      {blockedActionLabel}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={href}
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
          </div>
        </section>
      ))}
      {loading ? <p className={styles.moduleNavStatus}>Carregando navegação...</p> : null}
    </nav>
  );
}
