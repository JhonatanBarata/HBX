"use client";

import styles from "./PlanSelectionExperience.module.css";

export type PlanSelectionBillingCycle = "monthly" | "annual";
export type PlanSelectionMode = "signup" | "upgrade" | "pending_checkout" | "plans";

export type PlanSelectionCard = {
  key: "hbx_lite" | "hbx_padrao" | "hbx_melhor";
  name: string;
  badge: string;
  monthlyPrice: number | null;
  detail: string;
  cta: string;
  available?: boolean;
  featured?: boolean;
  features: string[];
  note?: string;
  trialCopy?: string;
  promoPrice?: number | null;
  promoLabel?: string;
};

type PlanSelectionExperienceProps = {
  plans: PlanSelectionCard[];
  selectedPlanKey?: string | null;
  billingCycle: PlanSelectionBillingCycle;
  mode: PlanSelectionMode;
  canSelect?: boolean;
  hidePrices?: boolean;
  highlightPlanKey?: string | null;
  busyPlanKey?: string | null;
  deniedMessage?: string | null;
  onSelect?: (planKey: PlanSelectionCard["key"]) => void;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthlyEquivalent(plan: PlanSelectionCard, billingCycle: PlanSelectionBillingCycle) {
  const monthly = Number(plan.monthlyPrice || 0);
  return billingCycle === "annual" ? monthly * 0.8 : monthly;
}

function annualTotal(plan: PlanSelectionCard) {
  return Number(plan.monthlyPrice || 0) * 12 * 0.8;
}

function PlanGlyph({ planKey }: { planKey: PlanSelectionCard["key"] }) {
  if (planKey === "hbx_lite") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M28.4 5.8 12.5 27.2h10.8l-3.7 15 16-21.6H24.8l3.6-14.8Z" />
      </svg>
    );
  }

  if (planKey === "hbx_padrao") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="m9.8 19.2 7.3 5.5L24 10.8l6.9 13.9 7.3-5.5-4.2 18H14l-4.2-18Z" />
        <path d="M15.8 37.2h16.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M28.5 6.5c5.4.2 9.4 1.8 13 5.4-1.2 7.4-4.6 13.4-10.2 18l-9 7.4-8.2-8.2 7.4-9C23.5 17.4 25.8 12.4 28.5 6.5Z" />
      <path d="M16.9 21.6 10 22.8l-3.6 6.7 9.7-.8M26.4 31.1l-1 9.7 6.7-3.6 1.2-6.9M30.5 15.2a2.7 2.7 0 1 0 3.8 3.8 2.7 2.7 0 0 0-3.8-3.8Z" />
    </svg>
  );
}

function actionLabel(plan: PlanSelectionCard, mode: PlanSelectionMode, selected: boolean, busy: boolean) {
  if (plan.key === "hbx_melhor") return "Falar com HBX";
  if (selected && mode === "upgrade") return "Plano ativo";
  if (selected && mode === "signup") return "Selecionado";
  if (busy) return mode === "signup" ? "Criando..." : "Abrindo checkout...";
  if (mode === "pending_checkout") return "Finalizar pagamento";
  if (mode === "upgrade") return "Fazer upgrade";
  return plan.cta;
}

export default function PlanSelectionExperience({
  plans,
  selectedPlanKey,
  billingCycle,
  mode,
  canSelect = true,
  hidePrices = false,
  highlightPlanKey,
  busyPlanKey,
  deniedMessage,
  onSelect,
}: PlanSelectionExperienceProps) {
  return (
    <section className={styles.plansGrid} data-mode={mode} aria-label="Planos">
      {plans.map((plan) => {
        const selected = selectedPlanKey === plan.key;
        const featured = Boolean(plan.featured || highlightPlanKey === plan.key);
        const annual = billingCycle === "annual";
        const hasPrice = !hidePrices && typeof plan.monthlyPrice === "number";
        const displayedPrice = monthlyEquivalent(plan, billingCycle);
        const busy = busyPlanKey === plan.key;
        const disabled = !canSelect || plan.available === false || busy || (selected && mode === "upgrade");
        const billingHint =
          annual && hasPrice
            ? `20% OFF. Cobrado anualmente: ${money(annualTotal(plan))}.`
            : plan.note || (mode === "signup" ? null : plan.key === "hbx_padrao" ? "14 dias grátis. Sem cobrança agora." : "Checkout após confirmação.");
        return (
          <button
            key={plan.key}
            type="button"
            className={styles.planCard}
            data-plan-key={plan.key}
            data-selected={selected ? "true" : "false"}
            data-featured={featured ? "true" : "false"}
            data-disabled={disabled ? "true" : "false"}
            disabled={disabled}
            onClick={() => onSelect?.(plan.key)}
          >
            <span className={styles.planIcon} aria-hidden="true">
              <PlanGlyph planKey={plan.key} />
            </span>
            <span className={styles.badge}>{plan.badge}</span>
            <div className={styles.planTitle}>
              <strong>{plan.name}</strong>
              {plan.trialCopy ? <small>{plan.trialCopy}</small> : null}
            </div>
            {hasPrice ? (
              <div className={styles.priceBlock}>
                {plan.promoPrice !== undefined && plan.promoPrice !== null ? (
                  <>
                    <em>{money(plan.promoPrice)}</em>
                    <span>{annual ? "/mês no anual" : "/mês"}</span>
                    <div className={styles.originalPrice}>
                      <s>{money(displayedPrice)}</s>
                      <small>{plan.promoLabel || "/mês"}</small>
                    </div>
                  </>
                ) : (
                  <>
                    <em>{money(displayedPrice)}</em>
                    <span>{annual ? "/mês no anual" : "/mês"}</span>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.noPriceBlock}>
                <strong>{plan.key === "hbx_melhor" ? "Implantação assistida" : "Plano da empresa"}</strong>
                <span>
                  {plan.key === "hbx_melhor"
                    ? "Configuração com a HBX"
                    : "Valores visíveis apenas para ADMIN"}
                </span>
              </div>
            )}
            {billingHint ? <p className={styles.billingHint}>{billingHint}</p> : null}
            <p className={styles.planDetail}>{plan.detail}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {plan.note ? <small className={styles.planNote}>{plan.note}</small> : null}
            {canSelect ? (
              <span className={styles.planAction}>{actionLabel(plan, mode, selected, busy)}</span>
            ) : (
              <span className={styles.deniedMessage}>
                {deniedMessage || "USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa."}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
