export type CommercialPlanKey = "hbx_vendas" | "hbx_vendas_ia" | "hbx_recovery";
export type CommercialEntitlementKey = "vendas" | "bot_ia" | "recovery";

export type CommercialPlan = {
  key: CommercialPlanKey;
  title: string;
  status: "available" | "unavailable" | string;
  monthlyPrice: number | null;
  trialDays?: number | null;
  headline?: string | null;
  introMonthlyPrice?: number | null;
  introCycles?: number | null;
  disabledReason?: string | null;
  features?: string[];
  priceBreakdown?: {
    vendas: number;
    bot_ia: number;
    botAiIntroDiscountPercent: number;
    introTotal: number;
    regularTotal: number;
  } | null;
  legalCopy?: string | null;
};

export type CommercialPlansPayload = {
  current: {
    planKey: CommercialPlanKey | null;
    entitlements: Record<CommercialEntitlementKey, boolean>;
    subscriptionStatus?: string | null;
    paymentStatus?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    isTrial?: boolean;
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

export function getBotAiPlanRedirectFromError(error: unknown, fallback = "/dashboard/planos?intent=bot_ia") {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (candidate.code === "BOT_IA_PLAN_REQUIRED") {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  const message = String(candidate.message || "");
  if (message.includes("BOT Inteligente") || message.includes("HBX Vendas + IA")) {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  return null;
}
