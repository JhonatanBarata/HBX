import type {
  AuditEntry,
  CompanyDetailPayload,
  CompanySummary,
  LedgerEntry,
  StatusBucket,
} from "../master.types";
import type {
  MasterCommandFilterId,
  MasterCommandKpi,
  MasterPlanCatalogItem,
  MasterPlanChangePreviewModel,
  MasterPlanKey,
  MasterRealitySnapshot,
  MasterRealityTone,
} from "./MasterCommandCenter.types";

export const MASTER_PLAN_CATALOG: MasterPlanCatalogItem[] = [
  {
    key: "hbx_lite",
    title: "HBX List",
    shortTitle: "List",
    monthlyPrice: 39.9,
    badge: "Entrada",
    modules: ["vendas", "webscraping"],
    entitlements: ["vendas", "webscraping", "opportunity_score"],
  },
  {
    key: "hbx_padrao",
    title: "HBX Lead",
    shortTitle: "Lead",
    monthlyPrice: 99.9,
    badge: "Base comercial",
    modules: ["atendimento", "vendas", "webscraping"],
    entitlements: ["vendas", "atendimento_chat", "webscraping", "radar_premium", "ai_sales_scripts"],
  },
  {
    key: "hbx_melhor",
    title: "HBX Full",
    shortTitle: "Full",
    monthlyPrice: 149.9,
    badge: "Bot e IA",
    modules: ["atendimento", "vendas", "webscraping", "bot_ia"],
    entitlements: [
      "vendas",
      "atendimento_chat",
      "webscraping",
      "bot_ia",
      "radar_premium",
      "recovery_intelligence",
      "digital_audit",
      "opportunity_score",
      "ai_sales_scripts",
    ],
  },
];

export const MASTER_COMMAND_FILTERS: Array<{ id: MasterCommandFilterId; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "critical", label: "Crítico" },
  { id: "no_access", label: "Sem acesso" },
  { id: "billing_pending", label: "Cobrança pendente" },
  { id: "trial_ending", label: "Trial vencendo" },
  { id: "whatsapp_attention", label: "WhatsApp atenção" },
  { id: "weak_activation", label: "Ativação fraca" },
  { id: "manual_premium", label: "Premium manual" },
];

export function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export function toDatetimeLocalValue(value?: string | null) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function buildHardDeleteConfirmation(companyName: string) {
  const normalized = companyName.trim();
  return normalized ? `EXCLUIR ${normalized}` : "EXCLUIR EMPRESA";
}

export function normalizePlanKey(value?: string | null): MasterPlanKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "hbx_lite") return "hbx_lite";
  if (normalized === "hbx_melhor" || normalized === "hbx_vendas_ia") return "hbx_melhor";
  if (normalized === "hbx_padrao" || normalized === "hbx_vendas") return "hbx_padrao";
  return null;
}

export function getPlanCatalogItem(value?: string | null) {
  const normalized = normalizePlanKey(value);
  return MASTER_PLAN_CATALOG.find((plan) => plan.key === normalized) || null;
}

export function commercialPlanLabel(value?: string | null) {
  return getPlanCatalogItem(value)?.title || "Sem plano";
}

export function paymentStatusLabel(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "PAID") return "Pago";
  if (status === "TRIAL") return "Trial";
  if (status === "MANUAL") return "Manual";
  if (status === "PENDING") return "Pendente";
  if (status === "OVERDUE") return "Atrasado";
  if (status === "EXPIRED") return "Expirado";
  if (status === "DISABLED") return "Suspenso";
  return status || "-";
}

export function subscriptionLabel(value?: string | null) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "active") return "Ativa";
  if (status === "trialing") return "Trial";
  if (status === "manual") return "Manual";
  if (status === "past_due") return "Em atraso";
  if (status === "pending_checkout") return "Checkout pendente";
  if (status === "canceled") return "Cancelada";
  if (status === "expired") return "Expirada";
  return status || "-";
}

export function paymentMethodLabel(value?: string | null) {
  const method = String(value || "").trim().toUpperCase();
  if (method === "CARD") return "Cartão";
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "Boleto";
  if (method === "MANUAL") return "Manual";
  if (method === "TRANSFERENCIA") return "Transferência";
  if (method === "DINHEIRO") return "Dinheiro";
  return "Sem método";
}

export function billingCycleLabel(value?: string | null) {
  return String(value || "").trim().toUpperCase() === "ANNUAL" ? "Anual" : "Mensal";
}

export function statusBucketLabel(value?: StatusBucket | string | null) {
  if (value === "PAYING") return "Pagando";
  if (value === "MANUAL_PREMIUM") return "Premium manual";
  if (value === "TRIAL") return "Trial";
  if (value === "TRIAL_ENDING") return "Trial vencendo";
  if (value === "OVERDUE") return "Atrasado";
  if (value === "SUSPENDED") return "Suspenso";
  if (value === "NO_METHOD") return "Sem método";
  return "Indefinido";
}

export function companyHasOperationalAccess(company?: Pick<CompanySummary, "isActive" | "paymentStatus" | "subscriptionStatus"> | null) {
  if (!company?.isActive) return false;
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  return (
    paymentStatus === "PAID" ||
    paymentStatus === "TRIAL" ||
    paymentStatus === "MANUAL" ||
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "manual"
  );
}

export function companyNoAccess(company: CompanySummary) {
  return Boolean(
    !company.isActive ||
      company.billingSituation?.canUse === false ||
      company.operationalStatus?.accessActive === false ||
      ["expired", "canceled"].includes(String(company.subscriptionStatus || "").trim().toLowerCase()) ||
      ["EXPIRED", "DISABLED"].includes(String(company.paymentStatus || "").trim().toUpperCase()),
  );
}

export function companyWhatsappAttention(company: CompanySummary) {
  const situation = company.whatsappSituation;
  return Boolean(
    situation?.hasPendingMigration ||
      situation?.hasError ||
      situation?.mode === "none" ||
      situation?.status === "disconnected" ||
      situation?.status === "attention" ||
      situation?.status === "error" ||
      company.whatsappCenter?.status === "ATTENTION" ||
      company.whatsappCenter?.status === "NOT_CONNECTED",
  );
}

export function companyBillingPending(company: CompanySummary) {
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  return Boolean(
    paymentStatus === "PENDING" ||
      paymentStatus === "OVERDUE" ||
      paymentStatus === "EXPIRED" ||
      subscriptionStatus === "past_due" ||
      subscriptionStatus === "pending_checkout" ||
      company.finance?.pendingCount > 0 ||
      company.finance?.failedCount > 0 ||
      company.statusBucket === "OVERDUE" ||
      company.statusBucket === "NO_METHOD",
  );
}

export function companyTrialEnding(company: CompanySummary) {
  const days = Number(company.trialRemainingDays ?? 99);
  return company.statusBucket === "TRIAL_ENDING" || (days >= 0 && days <= 3);
}

export function companyWeakActivation(company: CompanySummary) {
  const activationStatus = String(company.activationStatus || "").trim().toLowerCase();
  return Boolean(
    company.activationNeedsAttention ||
      !company.emailConfirmation?.confirmed ||
      ["needs_activation", "pending_email_confirmation"].includes(activationStatus),
  );
}

export function companyManualPremium(company: CompanySummary) {
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  return Boolean(paymentStatus === "MANUAL" || subscriptionStatus === "manual" || company.statusBucket === "MANUAL_PREMIUM");
}

export function companyMatchesFilter(company: CompanySummary, filter: MasterCommandFilterId) {
  if (filter === "all") return true;
  if (filter === "critical") return company.riskLevel === "critical" || company.operationalStatus?.overallHealth === "red";
  if (filter === "no_access") return companyNoAccess(company);
  if (filter === "billing_pending") return companyBillingPending(company);
  if (filter === "trial_ending") return companyTrialEnding(company);
  if (filter === "whatsapp_attention") return companyWhatsappAttention(company);
  if (filter === "weak_activation") return companyWeakActivation(company);
  if (filter === "manual_premium") return companyManualPremium(company);
  return true;
}

export function filterCompanies(companies: CompanySummary[], search: string, filter: MasterCommandFilterId) {
  const normalizedSearch = search.trim().toLowerCase();
  return companies
    .filter((company) => {
      if (!normalizedSearch) return true;
      const haystack = [
        company.name,
        company.primaryContactName,
        company.contactEmail,
        company.contactPhone,
        company.slug,
        commercialPlanLabel(company.selectedPlanKey),
        company.whatsappSituation?.statusLabel,
        company.billingSituation?.statusLabel,
        ...company.modules.map((moduleItem) => moduleItem.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    })
    .filter((company) => companyMatchesFilter(company, filter))
    .sort((left, right) => {
      const riskWeight = { critical: 0, warning: 1, stable: 2 } as const;
      const leftRisk = riskWeight[left.riskLevel] ?? 3;
      const rightRisk = riskWeight[right.riskLevel] ?? 3;
      if (leftRisk !== rightRisk) return leftRisk - rightRisk;
      if (companyNoAccess(left) !== companyNoAccess(right)) return companyNoAccess(left) ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });
}

export function buildCommandKpis(companies: CompanySummary[]): MasterCommandKpi[] {
  return [
    { id: "active", label: "Empresas ativas", value: companies.filter((company) => company.isActive).length, tone: "good" },
    { id: "no_access", label: "Sem acesso", value: companies.filter(companyNoAccess).length, tone: "danger" },
    { id: "overdue", label: "Em atraso", value: companies.filter(companyBillingPending).length, tone: "danger" },
    { id: "trial", label: "Trial vencendo", value: companies.filter(companyTrialEnding).length, tone: "warn" },
    { id: "manual", label: "Manual premium", value: companies.filter(companyManualPremium).length, tone: "warn" },
    { id: "whatsapp", label: "WhatsApp atenção", value: companies.filter(companyWhatsappAttention).length, tone: "warn" },
  ];
}

export function resolveReality(company: CompanySummary): MasterRealitySnapshot {
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  const hasAccess = companyHasOperationalAccess(company);
  const manual = companyManualPremium(company);
  const trial = paymentStatus === "TRIAL" || subscriptionStatus === "trialing";
  const billingPending = companyBillingPending(company);
  const whatsappAttention = companyWhatsappAttention(company);
  const assistedPending = Boolean(company.assistedSetup?.required && company.assistedSetup.status !== "completed");

  let accessLabel = hasAccess ? "Liberado" : "Bloqueado";
  let accessTone: MasterRealityTone = hasAccess ? "good" : "danger";
  if (manual) {
    accessLabel = "Manual";
    accessTone = "warn";
  } else if (trial) {
    accessLabel = "Trial";
    accessTone = "warn";
  }

  let billingLabel = paymentStatusLabel(company.paymentStatus);
  let billingTone: MasterRealityTone = billingPending ? "danger" : "good";
  if (manual) {
    billingLabel = "Manual";
    billingTone = "warn";
  } else if (trial) {
    billingLabel = "Trial";
    billingTone = "warn";
  }

  let nextAction = "Nenhuma ação crítica";
  let nextActionTone: MasterRealityTone = "good";
  let reason = company.operationalStatus?.overallHint || company.financialSituation || "Operação sem bloqueio crítico agora.";

  if (!hasAccess) {
    nextAction = billingPending ? "Regularizar pagamento" : "Revisar acesso";
    nextActionTone = "danger";
    reason = billingPending ? "A empresa está sem acesso por cobrança ou assinatura pendente." : "Acesso operacional bloqueado.";
  } else if (billingPending) {
    nextAction = "Cobrar";
    nextActionTone = "danger";
    reason = "A cobrança precisa de ação antes de afetar a operação.";
  } else if (trial) {
    nextAction = companyTrialEnding(company) ? "Converter trial" : "Aguardar trial";
    nextActionTone = "warn";
    reason = company.trialEndsAt ? `Trial até ${formatDate(company.trialEndsAt)}.` : "Trial ativo.";
  } else if (whatsappAttention) {
    nextAction = "Revisar WhatsApp";
    nextActionTone = "warn";
    reason = company.whatsappSituation?.nextStepLabel || company.whatsappCenter?.statusHint || "WhatsApp precisa de revisão.";
  } else if (assistedPending) {
    nextAction = "Concluir setup";
    nextActionTone = "warn";
    reason = "Plano Full depende de implantação assistida.";
  }

  return {
    accessLabel,
    accessTone,
    billingLabel,
    billingTone,
    planLabel: commercialPlanLabel(company.selectedPlanKey),
    nextAction,
    nextActionTone,
    reason,
  };
}

function diff(left: string[], right: string[]) {
  const previous = new Set(left);
  const current = new Set(right);
  return {
    added: [...current].filter((item) => !previous.has(item)),
    removed: [...previous].filter((item) => !current.has(item)),
  };
}

export function buildPlanChangePreview(company: CompanySummary, nextPlanKey: MasterPlanKey): MasterPlanChangePreviewModel | null {
  const fromPlan = getPlanCatalogItem(company.selectedPlanKey);
  const toPlan = getPlanCatalogItem(nextPlanKey);
  if (!toPlan) return null;
  const moduleDiff = diff(fromPlan?.modules || [], toPlan.modules);
  const entitlementDiff = diff(fromPlan?.entitlements || [], toPlan.entitlements);
  const reality = resolveReality(company);
  return {
    fromPlan,
    toPlan,
    currentValue: Number(company.monthlyValue || fromPlan?.monthlyPrice || 0),
    nextValue: toPlan.monthlyPrice,
    addedModules: moduleDiff.added,
    removedModules: moduleDiff.removed,
    addedEntitlements: entitlementDiff.added,
    removedEntitlements: entitlementDiff.removed,
    billingPreservedAs: paymentStatusLabel(company.paymentStatus),
    accessPreservedAs: reality.accessLabel,
    manualPremiumWarning: companyManualPremium(company),
  };
}

export function recommendedBoardAction(company: CompanySummary) {
  const reality = resolveReality(company);
  if (companyNoAccess(company) || companyBillingPending(company)) return reality.nextAction;
  if (companyWhatsappAttention(company)) return "Revisar WhatsApp";
  if (companyWeakActivation(company)) return "Operar";
  return reality.nextAction;
}

export function auditTitle(entry: AuditEntry) {
  return String(entry.action || "Evento").replace(/_/g, " ");
}

export function compactAuditMetadata(entry: AuditEntry) {
  const metadata = entry.metadata || {};
  const entries = Object.entries(metadata).filter(([key]) => !["previousState", "currentState"].includes(key));
  if (!entries.length) return entry.scope;
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatAuditValue(value)}`)
    .join(" · ");
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && /T\d{2}:\d{2}/.test(value)) return formatDateTime(value);
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.slice(0, 4).join(", ") : "Nenhum";
  if (typeof value === "object") return "Dados alterados";
  return String(value);
}

export function ledgerPaymentLabel(entry?: LedgerEntry | null) {
  if (!entry) return "Sem histórico";
  const paidAt = entry.paidAt ? formatDate(entry.paidAt) : formatDate(entry.createdAt);
  return `${formatCurrency(entry.amount)} · ${paidAt}`;
}

export function riskTone(company: CompanySummary): MasterRealityTone {
  if (company.riskLevel === "critical" || companyNoAccess(company)) return "danger";
  if (company.riskLevel === "warning" || companyBillingPending(company) || companyWhatsappAttention(company)) return "warn";
  return "good";
}

export function activeModuleCount(company: CompanySummary | CompanyDetailPayload["company"]) {
  return company.modules.filter((moduleItem) => moduleItem.enabled).length;
}
