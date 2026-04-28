"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import {
  commercialPlanByKey,
  getCommercialPlanTitle,
  hasBotAi,
  hasVendas,
  type CommercialPlan,
  type CommercialPlanKey,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type BillingCycle = "MONTHLY" | "ANNUAL";

const PLAN_ORDER: CommercialPlanKey[] = ["hbx_lite", "hbx_padrao", "hbx_melhor"];

const FALLBACK_PLANS: Record<CommercialPlanKey, CommercialPlan> = {
  hbx_lite: {
    key: "hbx_lite",
    title: "HBX Lite",
    status: "available",
    monthlyPrice: 29.9,
    headline: "Entrada enxuta para operar vendas sem Bot.",
    annualDiscountPercent: 10,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 0 },
    features: ["Vendas", "Webscraping free/HBX/cache", "Google: 0 buscas por dia", "Sem Atendimento Chat", "Sem Bot"],
  },
  hbx_padrao: {
    key: "hbx_padrao",
    title: "HBX Padrão",
    status: "available",
    monthlyPrice: 79.9,
    headline: "O plano principal para vender e atender com trial seguro.",
    annualDiscountPercent: 10,
    recommended: true,
    trialDays: 30,
    quotas: { googleSearchesPerDay: 2 },
    features: ["Vendas", "Atendimento Chat", "30 dias de trial sem cartão", "Google: 2 buscas por dia", "Sem Bot"],
  },
  hbx_melhor: {
    key: "hbx_melhor",
    title: "HBX Melhor",
    status: "available",
    monthlyPrice: 109.9,
    headline: "Pacote completo com Bot Inteligente liberado após pagamento.",
    annualDiscountPercent: 10,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 6 },
    features: ["Vendas", "Atendimento Chat", "Bot Inteligente", "Google: 6 buscas por dia", "Sem trial"],
  },
};

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function priceFor(plan: CommercialPlan, billingCycle: BillingCycle) {
  const monthly = Number(plan.monthlyPrice || 0);
  if (billingCycle === "MONTHLY") return monthly;
  const discount = Number(plan.annualDiscountPercent ?? 10);
  return monthly * 12 * (1 - discount / 100);
}

function trialLabel(payload: CommercialPlansPayload | null) {
  if (!payload?.current.isTrial) return null;
  const days = payload.current.trialRemainingDays;
  if (typeof days === "number") return `Trial ativo: ${days} dia(s) restantes, sem cobrança automática`;
  return "Trial ativo, sem cobrança automática";
}

function isPendingCheckout(payload: CommercialPlansPayload | null) {
  const subscriptionStatus = String(payload?.current.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(payload?.current.paymentStatus || "").trim().toUpperCase();
  const onboardingStatus = String(payload?.current.onboardingStatus || "").trim().toLowerCase();
  return subscriptionStatus === "pending_checkout" || paymentStatus === "PENDING" || onboardingStatus === "pending_checkout";
}

export default function PlanosClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<CommercialPlanKey | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [payload, setPayload] = useState<CommercialPlansPayload | null>(null);

  const intent = String(searchParams.get("intent") || "").trim();
  const canSelectPlan = Boolean(payload?.permissions?.canSelectPlan);
  const adminDeniedMessage =
    payload?.permissions?.selectPlanDeniedMessage || "Peça para um administrador selecionar este plano.";
  const currentTrialLabel = trialLabel(payload);
  const pendingCheckout = isPendingCheckout(payload);
  const vendasActive = hasVendas(payload);
  const botActive = hasBotAi(payload);

  const plans = useMemo(
    () => PLAN_ORDER.map((key) => commercialPlanByKey(payload, key) || FALLBACK_PLANS[key]),
    [payload],
  );

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CommercialPlansPayload>("/commercial-plans/me");
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar os planos HBX.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadPlans();
  }, [hasToken, loadPlans]);

  async function selectPlan(planKey: CommercialPlanKey) {
    if (!canSelectPlan) {
      setNotice({ tone: "info", text: adminDeniedMessage });
      return;
    }

    setSavingPlan(planKey);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/financeiro/preferences", {
        method: "PATCH",
        body: JSON.stringify({ billingCycle }),
      }).catch(() => null);
      const next = await apiFetch<CommercialPlansPayload>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({ planKey }),
      });
      setPayload(next);
      if (planKey === "hbx_padrao" && next.current.isTrial) {
        setNotice({ tone: "success", text: "Trial do HBX Padrão iniciado por 30 dias. Não haverá cobrança automática." });
        return;
      }
      router.push("/dashboard/financeiro?focus=payment");
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao contratar o plano.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setSavingPlan(null);
    }
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Planos" description="Carregando planos HBX." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando planos HBX...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Planos" hideHeader={true}>
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Pacotes HBX</span>
            <h1>Escolha o plano certo sem cobrança automática.</h1>
            <p>O Master troca o plano comercial da empresa; módulos são permissões internas derivadas do pacote.</p>
            <div className={styles.flow}>
              <span>1. Plano</span>
              <span>2. Checkout</span>
              <span>3. Pagamento</span>
              <span>4. Acesso</span>
            </div>
          </div>

          <aside className={styles.statusPanel}>
            <span>Status comercial</span>
            <strong>{getCommercialPlanTitle(payload?.current.planKey || payload?.current.selectedPlanKey || null)}</strong>
            {currentTrialLabel ? <small>{currentTrialLabel}</small> : null}
            {pendingCheckout ? <small>Pagamento pendente — finalize PIX ou cartão.</small> : null}
            {!currentTrialLabel && !pendingCheckout ? <small>{botActive ? "Bot liberado" : vendasActive ? "Acessos derivados do plano" : "Sem plano ativo"}</small> : null}
          </aside>
        </section>

        <section className={styles.billingBand}>
          <div>
            <strong>Contratação por pacote</strong>
            <p>Não existe preço por módulo. O Financeiro cobra somente o valor do plano selecionado.</p>
          </div>
          <div className={styles.segmented} role="tablist" aria-label="Ciclo de cobrança">
            <button type="button" data-active={billingCycle === "MONTHLY"} onClick={() => setBillingCycle("MONTHLY")}>Mensal</button>
            <button type="button" data-active={billingCycle === "ANNUAL"} onClick={() => setBillingCycle("ANNUAL")}>Anual -10%</button>
          </div>
        </section>

        {pendingCheckout ? (
          <section className={styles.intentCard}>
            <strong>Pagamento pendente</strong>
            <p>Finalize PIX ou cartão no Financeiro para liberar o plano selecionado. Selecionar plano não gerou cobrança.</p>
            <Link href="/dashboard/financeiro?focus=payment" className={styles.inlineCta}>Finalizar checkout</Link>
          </section>
        ) : null}

        {intent === "bot_ia" ? (
          <section className={styles.intentCard}>
            <strong>O BOT Inteligente faz parte do HBX Melhor</strong>
            <p>Para configurar o Bot, escolha o plano Melhor e finalize o pagamento antes de usar a IA.</p>
          </section>
        ) : null}

        {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
        {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}

        {loading ? (
          <section className={styles.loadingCard}>Carregando catálogo comercial...</section>
        ) : (
          <section className={styles.planGrid} aria-label="Planos HBX">
            {plans.map((plan) => {
              const active = payload?.current.planKey === plan.key;
              const saving = savingPlan === plan.key;
              const cycleAmount = priceFor(plan, billingCycle);
              const monthlyEquivalent = billingCycle === "ANNUAL" ? cycleAmount / 12 : Number(plan.monthlyPrice || 0);
              return (
                <article key={plan.key} className={styles.flipCard} data-featured={plan.recommended ? "true" : "false"}>
                  <div className={styles.flipInner}>
                    <div className={styles.cardFace}>
                      <div className={styles.planHeader}>
                        <span>{plan.title}</span>
                        <small>{plan.key === "hbx_lite" ? "Mais barato" : plan.key === "hbx_padrao" ? "Mais escolhido" : "Bot incluso"}</small>
                      </div>
                      <strong className={styles.price}>
                        {billingCycle === "ANNUAL" ? money(cycleAmount) : money(plan.monthlyPrice)}
                        <span>{billingCycle === "ANNUAL" ? "/ano" : "/mês"}</span>
                      </strong>
                      {billingCycle === "ANNUAL" ? <p className={styles.equivalent}>{money(monthlyEquivalent)}/mês equivalente com 10% de desconto</p> : null}
                      <p>{plan.headline}</p>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={active || saving}
                        onClick={() => void selectPlan(plan.key)}
                      >
                        {active ? "Plano ativo" : saving ? "Abrindo checkout..." : "Contratar"}
                      </button>
                      {!canSelectPlan && !active ? <small className={styles.adminHint}>{adminDeniedMessage}</small> : null}
                    </div>
                    <div className={styles.cardFaceBack}>
                      <span className={styles.backLabel}>Inclui</span>
                      <ul>
                        {(plan.features || FALLBACK_PLANS[plan.key].features || []).map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                      <p>
                        Google: {plan.quotas?.googleSearchesPerDay ?? FALLBACK_PLANS[plan.key].quotas?.googleSearchesPerDay} busca(s)/dia.
                        Motores free/HBX/cache não consomem essa quota.
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </DashboardScaffold>
  );
}
