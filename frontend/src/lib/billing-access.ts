export type BillingAccessCompany = {
  companyKind?: string | null;
  trialEndsAt?: string | Date | null;
  // Estado canônico vindo de /profile/current-user (backend é a fonte única
  // após o DROP do PR-002 — nada de campos crus de cobrança no frontend).
  accessReleased?: boolean | null;
  accessState?: string | null;
};

export type PreCheckoutReason = "trial_expired" | "payment_failed" | "pending_checkout";

export function resolvePreCheckoutReason(company?: BillingAccessCompany | null): PreCheckoutReason | null {
  if (!company) return null;

  // Projeção do estado canônico (DROP): accessReleased e accessState vêm do
  // backend. accessState só é enviado para o público de cobrança (ADMIN);
  // vendedor recebe accessReleased e nunca chega a um motivo de checkout.
  if (company.accessReleased === true) return null;
  const accessState = String(company.accessState || "").trim().toLowerCase();
  if (accessState === "pending_checkout") return "pending_checkout";
  if (accessState === "overdue" || accessState === "suspended") return "payment_failed";
  return null;
}

export function buildPreCheckoutPath(reason: PreCheckoutReason | string | null = "pending_checkout") {
  const normalized = reason === "trial_expired" || reason === "payment_failed" ? reason : "pending_checkout";
  return `/pre-checkout?reason=${normalized}`;
}

export function buildCheckoutPath(reason: PreCheckoutReason | string | null = "pending_checkout") {
  const normalized = reason === "trial_expired" || reason === "payment_failed" ? reason : "pending_checkout";
  return `/pagamento?focus=payment&reason=${normalized}`;
}
