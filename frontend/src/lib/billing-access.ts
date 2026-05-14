export type BillingAccessCompany = {
  onboardingStatus?: string | null;
  paymentStatus?: string | null;
  subscriptionStatus?: string | null;
  premiumAccess?: boolean | null;
  trialEndsAt?: string | Date | null;
};

export type PreCheckoutReason = "trial_expired" | "payment_failed" | "pending_checkout";

function parseTime(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function resolvePreCheckoutReason(company?: BillingAccessCompany | null, nowMs = Date.now()): PreCheckoutReason | null {
  if (!company) return null;

  const onboardingStatus = String(company.onboardingStatus || "").trim().toLowerCase();
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  const premiumAccess = Boolean(company.premiumAccess);
  const accessReleased =
    premiumAccess ||
    paymentStatus === "PAID" ||
    paymentStatus === "MANUAL" ||
    subscriptionStatus === "active" ||
    subscriptionStatus === "authorized" ||
    subscriptionStatus === "manual";

  if (accessReleased) return null;

  const trialEndsAt = parseTime(company.trialEndsAt);
  const trialExpiredByDate = Boolean(
    trialEndsAt &&
      trialEndsAt < nowMs &&
      (paymentStatus === "TRIAL" || subscriptionStatus === "trialing" || onboardingStatus === "active_trial"),
  );
  const expiredState = paymentStatus === "EXPIRED" || subscriptionStatus === "expired";

  if (trialExpiredByDate || expiredState) return "trial_expired";

  const pendingCheckout =
    paymentStatus === "PENDING" ||
    subscriptionStatus === "pending_checkout" ||
    onboardingStatus === "pending_checkout";

  const paymentFailed =
    paymentStatus === "DISABLED" ||
    paymentStatus === "OVERDUE" ||
    subscriptionStatus === "past_due" ||
    onboardingStatus === "suspended";

  if (paymentFailed) return "payment_failed";

  return pendingCheckout ? "pending_checkout" : null;
}

export function buildPreCheckoutPath(reason: PreCheckoutReason | string | null = "pending_checkout") {
  const normalized = reason === "trial_expired" || reason === "payment_failed" ? reason : "pending_checkout";
  return `/pre-checkout?reason=${normalized}`;
}

export function buildCheckoutPath(reason: PreCheckoutReason | string | null = "pending_checkout") {
  const normalized = reason === "trial_expired" || reason === "payment_failed" ? reason : "pending_checkout";
  return `/pagamento?focus=payment&reason=${normalized}`;
}
