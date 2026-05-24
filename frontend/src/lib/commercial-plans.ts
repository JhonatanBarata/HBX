export type CommercialPlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";
export type CommercialEntitlementKey =
  | "vendas"
  | "atendimento_chat"
  | "webscraping"
  | "bot_ia"
  | "recovery"
  | "radar_premium"
  | "recovery_intelligence"
  | "digital_audit"
  | "opportunity_score"
  | "ai_sales_scripts";

export type CommercialPlan = {
  key: CommercialPlanKey;
  title: string;
  status: "available" | "unavailable" | string;
  monthlyPrice: number | null;
  trialDays?: number | null;
  headline?: string | null;
  description?: string | null;
  disabledReason?: string | null;
  features?: string[];
  legalCopy?: string | null;
  recommended?: boolean;
  includedUsers?: number;
  extraUserMonthlyPrice?: number;
  requiresAssistedSetup?: boolean;
  setupFeeMode?: "none" | "negotiated";
  hidden?: boolean;
  requiresCheckout?: boolean;
  annualDiscountPercent?: number;
  quotas?: {
    googleSearchesPerDay?: number;
    cardsPerMonth?: number;
    dailyCardSafetyLimit?: number;
    cardsPerSearch?: number;
    searchesPerCycle?: number;
    totalCards?: number;
  };
};

export type CommercialBillingBreakdown = {
  baseMonthly: number;
  includedUsers: number;
  billableUsers: number;
  extraUsers: number;
  extraUserMonthlyPrice: number;
  extraUsersMonthlyAmount: number;
  extraUsersProratedAmount?: number;
  extraUsersBillableDays?: number;
  billedImmediately?: boolean;
  billingMode?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  monthlyTotal: number;
  cycleAmount: number;
};

export type CommercialPlansPayload = {
  current: {
    planKey: CommercialPlanKey | null;
    entitlements: Record<CommercialEntitlementKey, boolean>;
    selectedPlanKey?: CommercialPlanKey | null;
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    onboardingStatus?: string | null;
    subscriptionStatus?: string | null;
    paymentStatus?: string | null;
    premiumAccess?: boolean | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    billingGraceEndsAt?: string | null;
    billingGraceRemainingHours?: number | null;
    isTrial?: boolean;
    billingBreakdown?: CommercialBillingBreakdown | null;
    assistedSetup?: {
      required: boolean;
      status: string;
      completedAt?: string | null;
      message?: string | null;
    } | null;
  };
  plans: CommercialPlan[];
  permissions?: {
    canSelectPlan?: boolean;
    selectPlanDeniedMessage?: string | null;
  };
};

export function hasVendas(payload?: CommercialPlansPayload | null) {
  return Boolean(payload?.current.entitlements.vendas);
}

export function hasBotAi(payload?: CommercialPlansPayload | null) {
  return Boolean(payload?.current.entitlements.vendas && payload.current.entitlements.bot_ia);
}

export function commercialPlanByKey(payload: CommercialPlansPayload | null, key: CommercialPlanKey) {
  return payload?.plans.find((plan) => plan.key === key) || null;
}

export function getCommercialPlanTitle(key?: CommercialPlanKey | null) {
  if (key === "hbx_lite") return "HBX List";
  if (key === "hbx_melhor") return "HBX Full — Bot e IA";
  if (key === "hbx_padrao") return "HBX Lead";
  return "Sem plano comercial";
}

export function getBotAiPlanRedirectFromError(error: unknown, fallback = "/planos?intent=bot_ia") {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (candidate.code === "BOT_IA_PLAN_REQUIRED") {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  const message = String(candidate.message || "");
  if (message.includes("Bot de atendimento") || message.includes("HBX Full") || message.includes("HBX Melhor")) {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  return null;
}
