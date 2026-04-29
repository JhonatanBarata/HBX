export type CommercialPlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";
export type CommercialEntitlementKey = "vendas" | "atendimento_chat" | "webscraping" | "bot_ia";

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
  annualDiscountPercent?: number;
  quotas?: {
    googleSearchesPerDay?: number;
  };
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

export function getCommercialPlanTitle(key?: CommercialPlanKey | null) {
  if (key === "hbx_lite") return "HBX Lite";
  if (key === "hbx_melhor") return "HBX Melhor";
  if (key === "hbx_padrao") return "HBX Padrão";
  return "Sem plano comercial";
}

export function getBotAiPlanRedirectFromError(error: unknown, fallback = "/dashboard/planos?intent=bot_ia") {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (candidate.code === "BOT_IA_PLAN_REQUIRED") {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  const message = String(candidate.message || "");
  if (message.includes("Bot de atendimento") || message.includes("HBX Melhor")) {
    return typeof candidate.redirectTo === "string" ? candidate.redirectTo : fallback;
  }
  return null;
}
