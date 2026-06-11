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
import { HbxCorporateIcon, hbxCorporateStyles } from "./corporate/HbxCorporateShell";

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

const NAV_MODE_STORAGE_KEY = "hbx:navigation-mode:v1";
const NAV_MODE_CHANGED_EVENT = "hbx-navigation-mode-changed";
type NavigationMode = "basic" | "advanced";

const BASIC_NAV_ORDER = ["atendimento", "vendas"];
const ADVANCED_NAV_KEYS = new Set([
  "website",
  "financeiro",
  "gerencial",
  "cadastro",
  "planos",
  "master",
]);

const NAV_ITEMS: NavItem[] = [
  {
    key: "atendimento",
    href: "/atendimento",
    label: "Atendimento",
    shortLabel: "AT",
    description: "Conversas e fila.",
    matcher: (route) =>
      route.startsWith("/atendimento") ||
      route.startsWith("/hbx-recovery") ||
      route.startsWith("/auto-replies") ||
      route.startsWith("/messages"),
    category: "commercial",
    moduleKey: "atendimento",
  },
  {
    key: "vendas",
    href: "/vendas",
    label: "Vendas",
    shortLabel: "VD",
    description: "CRM e oportunidades.",
    matcher: (route) => route.startsWith("/vendas"),
    category: "commercial",
    moduleKey: "vendas",
  },
  {
    key: "website",
    href: "/website",
    label: "Website",
    shortLabel: "WB",
    description: "Site e painel.",
    matcher: (route) => route.startsWith("/website"),
    category: "commercial",
    moduleKey: "website",
  },
  {
    key: "cadastro",
    href: "/cadastros",
    label: "Cadastros",
    shortLabel: "CD",
    description: "Clientes.",
    matcher: (route) => route.startsWith("/cadastros"),
    category: "structural",
    companyOnly: true,
    moduleKey: "cadastro",
  },
  {
    key: "financeiro",
    href: "/pagamento",
    label: "Financeiro",
    shortLabel: "FN",
    description: "Cobrança.",
    matcher: (route) => route.startsWith("/pagamento"),
    category: "structural",
    moduleKey: "financeiro",
  },
  {
    key: "planos",
    href: "/planos",
    label: "Planos",
    shortLabel: "PL",
    description: "Catálogo.",
    matcher: (route) => route.startsWith("/planos"),
    category: "structural",
    adminOnly: true,
  },
  {
    key: "gerencial",
    href: "/gerencial",
    label: "Gerencial",
    shortLabel: "GE",
    description: "Equipe.",
    matcher: (route) => route.startsWith("/gerencial"),
    category: "structural",
    adminOnly: true,
    moduleKey: "gerencial",
  },
  {
    key: "master",
    href: "/master",
    label: "Master",
    shortLabel: "MS",
    description: "Visão global.",
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
    hint: "Operação.",
  },
  {
    category: "structural",
    title: "Guias",
    hint: "Gestão.",
  },
  {
    category: "system",
    title: "Sistema",
    hint: "Master.",
  },
];

const BASIC_NAV_SECTIONS: Array<{ key: string; title: string; hint: string; advanced?: boolean }> = [
  {
    key: "main",
    title: "Básico",
    hint: "Comece aqui.",
  },
  {
    key: "advanced",
    title: "Avançado",
    hint: "Configuração.",
    advanced: true,
  },
];

function isSellerRoleLockedModule(item: NavItem, moduleItem: UserModule | null, userRole: string | null) {
  const normalizedRole = String(userRole || "").trim().toUpperCase();
  const normalizedKey = normalizeUserModuleKey(item.moduleKey || item.key);
  if (normalizedRole !== "USER" || !moduleItem || moduleItem.accessible) return false;
  if (normalizedKey === "vendas" || normalizedKey === "webscraping") return false;
  if (moduleItem.blockedCode && moduleItem.blockedCode !== "user_module_blocked") return false;
  return moduleItem.userAllowed === true;
}

function resolveBlockedDescription(item: NavItem, moduleItem: UserModule | null, isSystemMaster: boolean, userRole: string | null) {
  const criticalEngine = String(moduleItem?.criticalEngine || "").trim().toLowerCase();

  if (isSellerRoleLockedModule(item, moduleItem, userRole)) {
    return "Política ON; Vendedor só abre Vendas e Radar. Troque para Admin para usar.";
  }

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

function resolveNavDisplay(item: NavItem, override?: PresentationModuleOverride) {
  if (item.key !== "radar_digital") {
    return {
      label: String(override?.label || item.label),
      shortLabel: String(override?.shortLabel || item.shortLabel).slice(0, 4).toUpperCase(),
      description: String(override?.description || item.description),
    };
  }

  const overrideLabel = String(override?.label || "").trim();
  const overrideDescription = String(override?.description || "").trim();
  return {
    label: /webscraping/i.test(overrideLabel) ? item.label : String(overrideLabel || item.label),
    shortLabel: String(override?.shortLabel || item.shortLabel).slice(0, 4).toUpperCase(),
    description: /webscraping/i.test(overrideDescription) ? item.description : String(overrideDescription || item.description),
  };
}

type ModuleNavProps = {
  presentationEditing?: boolean;
  canEditPresentation?: boolean;
  presentationConfig?: PresentationConfig | null;
  onUpdateModulePresentation?: (href: string, patch: Partial<PresentationModuleOverride>) => void;
  compact?: boolean;
  // "corporate" troca SÓ a renderização (sidebar do handoff docs/TEMAS); a
  // lógica de visibilidade por persona é a mesma deste componente.
  variant?: "default" | "corporate";
};

type CorporateNavIcon = "dash" | "leads" | "scrape" | "vendas" | "atend" | "bot" | "relat" | "config" | "users" | "money" | "check" | "search" | "send" | "mail";

const CORPORATE_NAV_ICONS: Record<string, CorporateNavIcon> = {
  inicio: "dash",
  atendimento: "atend",
  vendas: "vendas",
  website: "send",
  cadastro: "users",
  financeiro: "money",
  planos: "check",
  gerencial: "config",
  master: "search",
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

function readNavigationMode(fallback: NavigationMode): NavigationMode {
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(NAV_MODE_STORAGE_KEY);
  return saved === "advanced" || saved === "basic" ? saved : fallback;
}

export default function ModuleNav({
  presentationEditing = false,
  canEditPresentation = false,
  presentationConfig,
  onUpdateModulePresentation,
  compact = false,
  variant = "default",
}: ModuleNavProps) {
  const pathname = usePathname();
  const authenticated = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isSystemMaster, setIsSystemMaster] = useState(false);
  const [hasCompany, setHasCompany] = useState(false);
  const [loading, setLoading] = useState(authenticated);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("basic");

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
      if (isSystemMaster) {
        // Master puro navega minimo (master/exclusoes); a operacao completa
        // so aparece quando assume contexto de empresa (/modules/me decide).
        if (item.key === "master") return true;
        if (!item.moduleKey) return false;
        const masterModuleItem = modulesByKey.get(normalizeUserModuleKey(item.moduleKey)) ?? null;
        return Boolean(masterModuleItem && isModuleVisible(masterModuleItem));
      }
      if (item.companyOnly && !hasCompany) return false;
      const moduleItem = item.moduleKey
        ? modulesByKey.get(normalizeUserModuleKey(item.moduleKey)) ?? null
        : null;
      const sellerRoleLocked = isSellerRoleLockedModule(item, moduleItem, userRole);
      if (item.adminOnly) {
        if (item.key === "master") {
          if (!isSystemMaster) return false;
        } else if (String(userRole || "").toUpperCase() !== "ADMIN" && !sellerRoleLocked) {
          return false;
        }
      }

      if (item.key === "master" && isSystemMaster) return true;

      if (!item.moduleKey) return true;

      if (!moduleItem) return item.category === "commercial";
      return isModuleVisible(moduleItem) || sellerRoleLocked;
    }).sort((left, right) => {
      const leftIndex = BASIC_NAV_ORDER.indexOf(left.key);
      const rightIndex = BASIC_NAV_ORDER.indexOf(right.key);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : 99) - (rightIndex >= 0 ? rightIndex : 99);
      }
      return 0;
    });
  }, [hasCompany, isSystemMaster, loading, modulesByKey, userRole]);

  const privilegedNavigation = isSystemMaster || String(userRole || "").toUpperCase() === "ADMIN";

  useEffect(() => {
    const fallback: NavigationMode = privilegedNavigation ? "advanced" : "basic";
    setNavigationMode(readNavigationMode(fallback));

    const handleNavigationModeChanged = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: NavigationMode }>).detail?.mode;
      setNavigationMode(next === "advanced" || next === "basic" ? next : readNavigationMode(fallback));
    };

    const handleStorage = () => setNavigationMode(readNavigationMode(fallback));

    window.addEventListener(NAV_MODE_CHANGED_EVENT, handleNavigationModeChanged as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(NAV_MODE_CHANGED_EVENT, handleNavigationModeChanged as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [privilegedNavigation]);

  const sections = useMemo(
    () => {
      if (!privilegedNavigation && navigationMode === "basic" && !presentationEditing) {
        return BASIC_NAV_SECTIONS.map((section) => ({
          category: section.key,
          title: section.title,
          hint: section.hint,
          items: navItems.filter((item) => (
            section.advanced ? ADVANCED_NAV_KEYS.has(item.key) : BASIC_NAV_ORDER.includes(item.key)
          )),
        })).filter((section) => section.items.length > 0);
      }

      return NAV_SECTIONS.map((section) => ({
        ...section,
        items: navItems.filter((item) => item.category === section.category),
      })).filter((section) => section.items.length > 0);
    },
    [navItems, navigationMode, presentationEditing, privilegedNavigation],
  );

  if (variant === "corporate") {
    const corporateItems = [
      {
        key: "inicio",
        href: "/boasvindas",
        label: "Início",
        blocked: false,
        blockedDescription: "",
        active: (pathname || "").startsWith("/boasvindas"),
      },
      ...navItems.map((item) => {
        const moduleItem = item.moduleKey
          ? (modulesByKey.get(normalizeUserModuleKey(item.moduleKey)) ?? null)
          : null;
        const blocked = Boolean(moduleItem && isModuleBlocked(moduleItem));
        const href = item.key === "radar_digital"
          ? item.href
          : item.moduleKey
            ? resolveModuleHref(item.moduleKey, moduleItem?.serviceUrl || item.href)
            : item.href;
        return {
          key: item.key,
          href,
          label: item.label,
          blocked,
          blockedDescription: blocked
            ? resolveBlockedDescription(item, moduleItem, isSystemMaster, userRole)
            : "",
          active: item.matcher(pathname || ""),
        };
      }),
    ];

    return (
      <nav style={{ display: "contents" }} aria-label="Navegação do sistema">
        {corporateItems.map((item) => {
          const icon = CORPORATE_NAV_ICONS[item.key] || "dash";
          if (item.blocked) {
            return (
              <button
                key={item.key}
                type="button"
                className={hbxCorporateStyles.navItem}
                disabled
                aria-disabled="true"
                title={item.blockedDescription}
                style={{ opacity: 0.45, cursor: "not-allowed" }}
              >
                <HbxCorporateIcon name={icon} />
                {item.label}
              </button>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              className={hbxCorporateStyles.navItem}
              data-active={item.active}
              aria-current={item.active ? "page" : undefined}
              style={{ textDecoration: "none" }}
            >
              <HbxCorporateIcon name={icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className={`${styles.moduleNavWrap} ${compact ? styles.moduleNavWrapCompact : ""}`}
      data-navigation-mode={navigationMode}
      aria-label="Navegação do sistema"
    >
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
              const display = resolveNavDisplay(item, override);
              const label = display.label;
              const shortLabel = display.shortLabel;
              const description = String(
                blocked
                  ? resolveBlockedDescription(item, moduleItem, isSystemMaster, userRole)
                  : display.description,
              );
              const href = item.key === "radar_digital"
                ? item.href
                : item.moduleKey
                  ? resolveModuleHref(item.moduleKey, moduleItem?.serviceUrl || item.href)
                  : item.href;

              if (presentationEditing && canEditPresentation) {
                return (
                  <div
                    key={item.key}
                    className={active ? styles.moduleCardActive : styles.moduleCard}
                    data-ui-slot="module-card"
                    data-editing="true"
                    draggable
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
                    draggable={false}
                    aria-disabled="true"
                    title={description}
                  >
                    <span className={styles.moduleCardBadge}>{shortLabel}</span>
                    <span className={styles.moduleCardBody}>
                      <strong>{label}</strong>
                      <small className={styles.moduleCardLockNotice}>{description}</small>
                    </span>
                    <span className={styles.moduleCardDescription}>{description}</span>
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
                  draggable
                  aria-current={active ? "page" : undefined}
                >
                  <span className={styles.moduleCardBadge}>{shortLabel}</span>
                  <span className={styles.moduleCardBody}>
                    <strong>{label}</strong>
                  </span>
                  <span className={styles.moduleCardDescription}>{description}</span>
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
