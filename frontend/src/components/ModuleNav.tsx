"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, clearApiCache, getToken } from "@/app/_lib/api";
import { MASTER_CONTEXT_CHANGED_EVENT } from "../lib/masterContextEvents";
import { MODULES_CHANGED_EVENT } from "../lib/module-events";
import type { PresentationConfig, PresentationModuleOverride } from "../lib/presentation-config";
import {
  inferModuleCategory,
  isModuleBlocked,
  isModuleVisible,
  normalizeUserModuleKey,
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
    key: "vendas",
    href: "/vendas",
    label: "Vendas",
    shortLabel: "VD",
    description: "CRM principal da operação.",
    matcher: (route) => route.startsWith("/vendas"),
    category: "commercial",
    moduleKey: "vendas",
  },
  {
    key: "atendimento",
    href: "/atendimento",
    label: "Atendimento",
    shortLabel: "AT",
    description: "Conversas e fila humana.",
    matcher: (route) =>
      route.startsWith("/atendimento") ||
      route.startsWith("/hbx-recovery") ||
      route.startsWith("/auto-replies") ||
      route.startsWith("/messages"),
    category: "commercial",
    moduleKey: "atendimento",
  },
  {
    key: "website",
    href: "/website",
    label: "Website",
    shortLabel: "WB",
    description: "Site e admin.",
    matcher: (route) => route.startsWith("/website"),
    category: "commercial",
    moduleKey: "website",
  },
  {
    key: "webscraping",
    href: "/webscraping",
    label: "Webscraping",
    shortLabel: "WS",
    description: "Captação local.",
    matcher: (route) => route.startsWith("/webscraping"),
    category: "commercial",
    moduleKey: "webscraping",
  },
  {
    key: "follow_up_internacional",
    href: "/followup-global",
    label: "Follow Up",
    shortLabel: "FU",
    description: "Follow-up internacional.",
    matcher: (route) =>
      route.startsWith("/followup-global") ||
      route.startsWith("/importacoes/historico") ||
      route.startsWith("/importacoes/novo"),
    category: "commercial",
    moduleKey: "follow_up_internacional",
  },
  {
    key: "cadastro",
    href: "/cadastros",
    label: "Cadastros",
    shortLabel: "CD",
    description: "Clientes e contexto compartilhado.",
    matcher: (route) => route.startsWith("/cadastros") || route.startsWith("/importacoes/cadastros"),
    category: "structural",
    companyOnly: true,
    moduleKey: "cadastro",
  },
  {
    key: "financeiro",
    href: "/pagamento",
    label: "Financeiro",
    shortLabel: "FN",
    description: "Cobrança e plano.",
    matcher: (route) => route.startsWith("/pagamento"),
    category: "structural",
    moduleKey: "financeiro",
  },
  {
    key: "planos",
    href: "/planos",
    label: "Planos",
    shortLabel: "PL",
    description: "Escolha Vendas, Atendimento ou veja disponibilidade.",
    matcher: (route) => route.startsWith("/planos"),
    category: "structural",
  },
  {
    key: "gerencial",
    href: "/gerencial",
    label: "Gerencial",
    shortLabel: "GE",
    description: "Equipe e acessos.",
    matcher: (route) => route.startsWith("/gerencial"),
    category: "structural",
    adminOnly: true,
    moduleKey: "gerencial",
  },
  {
    key: "whatsapp",
    href: "/whatsapp",
    label: "WhatsApp",
    shortLabel: "WA",
    description: "Conexão do canal.",
    matcher: (route) => route.startsWith("/whatsapp"),
    category: "structural",
    companyOnly: true,
    moduleKey: "whatsapp",
  },
  {
    key: "master",
    href: "/master",
    label: "Master",
    shortLabel: "MS",
    description: "Controle global.",
    matcher: (route) => route.startsWith("/master"),
    category: "system",
    adminOnly: true,
    moduleKey: "master",
  },
];

const NAV_SECTIONS: Array<{ category: HbxModuleCategory; title: string; hint: string }> = [
  {
    category: "commercial",
    title: "Módulos",
    hint: "Operação ativa.",
  },
  {
    category: "structural",
    title: "Guias",
    hint: "Próximas etapas.",
  },
  {
    category: "system",
    title: "Sistema",
    hint: "Controle global.",
  },
];

function resolveBlockedDescription(item: NavItem, moduleItem: UserModule | null, isSystemMaster: boolean) {
  const criticalEngine = String(moduleItem?.criticalEngine || "").trim().toLowerCase();

  if (!isSystemMaster && item.category === "structural") {
    if (item.key === "financeiro") return "Disponível na próxima etapa.";
    if (item.key === "whatsapp") return "Conexão liberada quando precisar.";
    return "Em breve nesta operação.";
  }

  if (normalizeUserModuleKey(item.key) === "vendas") return "Conclua o setup principal.";
  if (criticalEngine === "whatsapp") return "Aguardando conexão do canal.";
  if (criticalEngine === "payment") return "Aguardando liberação da operação.";
  return "Indisponível nesta fase.";
}

type ModuleNavProps = {
  presentationEditing?: boolean;
  canEditPresentation?: boolean;
  presentationConfig?: PresentationConfig | null;
  onUpdateModulePresentation?: (href: string, patch: Partial<PresentationModuleOverride>) => void;
};

type PrefetchedDashboardPayload = {
  modules?: UserModule[];
  profile?: {
    role?: string | null;
    isSystemMaster?: boolean;
    company?: { id?: number | null } | null;
  } | null;
};

type HbxPrefetchWindow = Window & {
  __hbx_prefetch?: PrefetchedDashboardPayload;
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

    async function loadNavigationContext(options?: { forceNetwork?: boolean }) {
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
      const prefetchedWindow = typeof window !== "undefined" ? (window as HbxPrefetchWindow) : null;
      if (!options?.forceNetwork && prefetchedWindow?.__hbx_prefetch && Array.isArray(prefetchedWindow.__hbx_prefetch.modules)) {
        const pre = prefetchedWindow.__hbx_prefetch;
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
        if (options?.forceNetwork) {
          clearApiCache("/modules/me");
          clearApiCache("/profile/current-user");
        }
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
        if (prefetchedWindow) {
          prefetchedWindow.__hbx_prefetch = {
            modules: Array.isArray(myModules) ? myModules : [],
            profile,
          };
        }
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
      void loadNavigationContext({ forceNetwork: true });
    }

    function handleModulesChanged() {
      void loadNavigationContext({ forceNetwork: true });
      window.setTimeout(() => {
        if (mounted) void loadNavigationContext({ forceNetwork: true });
      }, 1500);
    }

    window.addEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    window.addEventListener(MODULES_CHANGED_EVENT, handleModulesChanged);

    return () => {
      mounted = false;
      window.removeEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
      window.removeEventListener(MODULES_CHANGED_EVENT, handleModulesChanged);
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
              const moduleItem = item.moduleKey
                ? (modulesByKey.get(normalizeUserModuleKey(item.moduleKey)) ?? null)
                : null;
              const blocked = Boolean(moduleItem && isModuleBlocked(moduleItem));
              const override = presentationConfig?.modules?.[item.href];
              const label = String(override?.label || item.label);
              const shortLabel = String(override?.shortLabel || item.shortLabel).slice(0, 4).toUpperCase();
              const description = String(
                blocked
                  ? resolveBlockedDescription(item, moduleItem, isSystemMaster)
                  : override?.description || item.description,
              );
              const href = item.moduleKey
                ? resolveModuleHref(item.moduleKey, moduleItem?.serviceUrl || item.href)
                : item.href;

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
                  <div
                    key={item.key}
                    className={active ? styles.moduleCardDisabledActive : styles.moduleCardDisabled}
                    data-ui-slot="module-card"
                    aria-disabled="true"
                  >
                    <span className={styles.moduleCardBadge}>{shortLabel}</span>
                    <span className={styles.moduleCardBody}>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch={false}
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
      {loading ? <p className={styles.moduleNavStatus}>Carregando módulos...</p> : null}
    </nav>
  );
}
