export type HbxModuleCategory = "commercial" | "structural" | "system";

export type UserModule = {
  key: string;
  name: string;
  description?: string | null;
  serviceUrl?: string | null;
  accessible: boolean;
  visible?: boolean;
  category?: HbxModuleCategory | null;
  entryEligible?: boolean;
  blockedByEngine?: boolean;
  blockedReason?: string | null;
  blockedCode?: string | null;
  criticalEngine?: string | null;
  sortOrder?: number;
  companyEnabled?: boolean;
  userAllowed?: boolean;
};

const MODULE_SORT_ORDER = [
  "atendimento",
  "vendas",
  "website",
  "webscraping",
  "follow_up_internacional",
  "financeiro",
  "gerencial",
  "master",
  "exclusoes",
];

export function normalizeUserModuleKey(key: string) {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized === "hbx_recovery" ? "atendimento" : normalized;
}

export function inferModuleCategory(key: string): HbxModuleCategory {
  const normalized = normalizeUserModuleKey(key);
  if (normalized === "financeiro" || normalized === "gerencial" || normalized === "cadastro" || normalized === "whatsapp") {
    return "structural";
  }
  if (normalized === "master" || normalized === "exclusoes") {
    return "system";
  }
  return "commercial";
}

export function resolveModuleHref(key: string, fallback?: string | null) {
  const normalized = normalizeUserModuleKey(key);
  const routes: Record<string, string> = {
    atendimento: "/dashboard/inbox",
    vendas: "/dashboard/vendas",
    gerencial: "/dashboard/gerencial",
    webscraping: "/dashboard/webscraping",
    financeiro: "/dashboard/financeiro",
    website: "/dashboard/website",
    follow_up_internacional: "/dashboard/importacoes/followup-global",
    master: "/dashboard/master",
    exclusoes: "/dashboard/master/exclusoes",
    whatsapp: "/dashboard/whatsapp",
  };

  return routes[normalized] || String(fallback || "").trim() || "/dashboard";
}

export function compareUserModules(left: UserModule, right: UserModule) {
  const leftKey = normalizeUserModuleKey(left.key);
  const rightKey = normalizeUserModuleKey(right.key);
  const leftOrder = Number.isFinite(Number(left.sortOrder))
    ? Number(left.sortOrder)
    : (MODULE_SORT_ORDER.indexOf(leftKey) >= 0 ? MODULE_SORT_ORDER.indexOf(leftKey) : MODULE_SORT_ORDER.length + 10);
  const rightOrder = Number.isFinite(Number(right.sortOrder))
    ? Number(right.sortOrder)
    : (MODULE_SORT_ORDER.indexOf(rightKey) >= 0 ? MODULE_SORT_ORDER.indexOf(rightKey) : MODULE_SORT_ORDER.length + 10);

  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
}

export function isModuleVisible(module: UserModule) {
  return module.visible !== false;
}

export function isCommercialEntryCandidate(module: UserModule) {
  const category = module.category || inferModuleCategory(module.key);
  return isModuleVisible(module) && category === "commercial" && module.entryEligible !== false;
}

export function isModuleBlocked(module: UserModule) {
  return isModuleVisible(module) && !module.accessible && Boolean(module.blockedByEngine || module.blockedReason);
}

export function formatCriticalEngineLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "webscraping") return "Webscraping";
  if (normalized === "payment") return "Pagamento";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Motor";
}

export function resolveModuleBlockedHref(module: Pick<UserModule, "key" | "criticalEngine" | "blockedCode">) {
  const blockedCode = String(module.blockedCode || "").trim().toLowerCase();
  const criticalEngine = String(module.criticalEngine || "").trim().toLowerCase();
  const normalizedKey = normalizeUserModuleKey(module.key);

  if (criticalEngine === "whatsapp") {
    if (blockedCode === "whatsapp_missing") return "/dashboard/whatsapp?focus=official";
    return "/dashboard/whatsapp?focus=status";
  }

  if (criticalEngine === "payment") {
    return "/dashboard/financeiro?focus=payment";
  }

  if (criticalEngine === "webscraping") {
    return "/dashboard/webscraping";
  }

  return resolveModuleHref(normalizedKey);
}

export function resolveModuleBlockedActionLabel(module: Pick<UserModule, "criticalEngine">) {
  const criticalEngine = String(module.criticalEngine || "").trim().toLowerCase();
  if (criticalEngine === "whatsapp") return "Corrigir motor";
  if (criticalEngine === "payment") return "Regularizar";
  if (criticalEngine === "webscraping") return "Ver runtime";
  return "Resolver";
}

export function getFirstOperationalModule(modules: UserModule[]) {
  return [...modules]
    .filter((module) => module.accessible && isCommercialEntryCandidate(module))
    .sort(compareUserModules)[0] || null;
}
