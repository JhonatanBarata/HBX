"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import PlanSelectionExperience, { type PlanSelectionCard } from "@/components/PlanSelectionExperience";
import {
  commercialPlanByKey,
  type CommercialPlan,
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
type PlanKey = PlanSelectionCard["key"];

const PLAN_ORDER: PlanKey[] = ["hbx_lite", "hbx_padrao", "hbx_melhor"];

const FALLBACK_PLANS: Record<PlanKey, CommercialPlan> = {
  hbx_lite: {
    key: "hbx_lite",
    title: "HBX Lite",
    status: "available",
    monthlyPrice: 29.9,
    headline: "Ideal para quem está começando e precisa do essencial.",
    description: "Vendas organizadas, motores gratuitos e gestão simples.",
    annualDiscountPercent: 10,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 0 },
    features: ["Vendas organizadas", "Motores gratuitos/cache", "Gestão simples"],
    legalCopy: "Liberação após pagamento confirmado.",
  },
  hbx_padrao: {
    key: "hbx_padrao",
    title: "HBX Padrão",
    status: "available",
    monthlyPrice: 79.9,
    headline: "Tudo que você precisa para crescer com segurança.",
    description: "Vendas, atendimento e 2 buscas Google por dia.",
    annualDiscountPercent: 10,
    recommended: true,
    trialDays: 30,
    quotas: { googleSearchesPerDay: 2 },
    features: ["Tudo do plano Lite", "Vendas + Atendimento", "2 buscas Google/dia", "Suporte prioritário"],
    legalCopy: "1º mês grátis, sem cartão e sem cobrança automática.",
  },
  hbx_melhor: {
    key: "hbx_melhor",
    title: "HBX Melhor",
    status: "available",
    monthlyPrice: 109.9,
    headline: "Máximo desempenho e controle para grandes operações.",
    description: "Mais buscas, Bot de atendimento e suporte dedicado.",
    annualDiscountPercent: 10,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 6 },
    features: ["Tudo do plano Padrão", "Bot de atendimento", "6 buscas Google por dia", "Suporte dedicado"],
    legalCopy: "Liberação após pagamento confirmado.",
  },
};

const PLAN_LABELS: Record<PlanKey, string> = {
  hbx_lite: "Lite",
  hbx_padrao: "Padrão",
  hbx_melhor: "Max",
};

function isPendingCheckout(payload: CommercialPlansPayload | null) {
  const subscriptionStatus = String(payload?.current.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(payload?.current.paymentStatus || "").trim().toUpperCase();
  const onboardingStatus = String(payload?.current.onboardingStatus || "").trim().toLowerCase();
  return subscriptionStatus === "pending_checkout" || paymentStatus === "PENDING" || onboardingStatus === "pending_checkout";
}

function currentPlanKey(payload: CommercialPlansPayload | null): PlanKey | null {
  const key = payload?.current.planKey || payload?.current.selectedPlanKey || null;
  return PLAN_ORDER.includes(key as PlanKey) ? (key as PlanKey) : null;
}

function isPaidOrActive(payload: CommercialPlansPayload | null) {
  const subscriptionStatus = String(payload?.current.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(payload?.current.paymentStatus || "").trim().toUpperCase();
  if (subscriptionStatus === "active" || subscriptionStatus === "authorized") return true;
  if (paymentStatus === "PAID") return true;
  return Boolean(payload?.current.entitlements.vendas && !payload?.current.isTrial);
}

function canStartPadraoTrial(payload: CommercialPlansPayload | null) {
  if (!payload) return true;
  if (payload.current.isTrial || payload.current.trialEndsAt) return false;
  return !isPaidOrActive(payload);
}

function promotedPlanFor(current: PlanKey | null, intent: string): PlanKey | null {
  if (intent === "bot_ia") return "hbx_melhor";
  if (current === "hbx_lite") return "hbx_padrao";
  if (current === "hbx_padrao") return "hbx_melhor";
  if (!current) return "hbx_padrao";
  return null;
}

function planBadge(planKey: PlanKey, current: PlanKey | null, promoted: PlanKey | null) {
  if (planKey === current) return "Plano atual";
  if (planKey === promoted) return "Recomendado";
  if (planKey === "hbx_lite") return "Essencial";
  if (planKey === "hbx_padrao") return "Mais escolhido";
  return "Mais completo";
}

export default function PlanosClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<PlanKey | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [payload, setPayload] = useState<CommercialPlansPayload | null>(null);

  const intent = String(searchParams.get("intent") || "").trim();
  const canSelectPlan = Boolean(payload?.permissions?.canSelectPlan);
  const adminDeniedMessage =
    payload?.permissions?.selectPlanDeniedMessage || "USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.";
  const pendingCheckout = isPendingCheckout(payload);
  const selectedPlanKey = currentPlanKey(payload);
  const promotedPlanKey = promotedPlanFor(selectedPlanKey, intent);
  const padraoTrialAvailable = canStartPadraoTrial(payload);

  const plans = useMemo(
    () => PLAN_ORDER.map((key) => commercialPlanByKey(payload, key) || FALLBACK_PLANS[key]),
    [payload],
  );

  const planCards = useMemo<PlanSelectionCard[]>(
    () =>
      plans.map((plan) => {
        const key = plan.key as PlanKey;
        const isPadrao = key === "hbx_padrao";
        const isCurrent = key === selectedPlanKey;
        const hasFreeTrial = isPadrao && padraoTrialAvailable;
        return {
          key,
          name: PLAN_LABELS[key],
          badge: planBadge(key, selectedPlanKey, promotedPlanKey),
          monthlyPrice: plan.monthlyPrice,
          promoPrice: hasFreeTrial ? 0 : undefined,
          promoLabel: hasFreeTrial ? "Após 1º mês 79,90" : undefined,
          detail:
            key === "hbx_lite"
              ? "Ideal para quem está começando e precisa do essencial."
              : key === "hbx_padrao"
                ? hasFreeTrial
                  ? "Teste o plano principal sem pagar agora."
                  : "Tudo que você precisa para crescer com segurança."
                : "Máximo desempenho e controle para grandes operações.",
          cta: isCurrent ? "Plano atual" : key === promotedPlanKey ? "Subir de plano" : "Escolher plano",
          available: plan.status !== "unavailable",
          featured: key === promotedPlanKey || (!selectedPlanKey && Boolean(plan.recommended)),
          features: plan.features || FALLBACK_PLANS[key].features || [],
          note: hasFreeTrial ? "1º mês grátis" : plan.legalCopy || FALLBACK_PLANS[key].legalCopy || undefined,
          trialCopy: hasFreeTrial ? "1º mês grátis" : undefined,
        };
      }),
    [padraoTrialAvailable, plans, promotedPlanKey, selectedPlanKey],
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

  async function selectPlan(planKey: PlanKey) {
    if (!canSelectPlan) {
      setNotice({ tone: "info", text: adminDeniedMessage });
      return;
    }

    if (pendingCheckout && selectedPlanKey === planKey) {
      router.push("/dashboard/financeiro?focus=payment&reason=pending_checkout");
      return;
    }

    if (!pendingCheckout && selectedPlanKey === planKey) {
      setNotice({ tone: "info", text: "Este já é o plano atual da empresa." });
      return;
    }

    setSavingPlan(planKey);
    setError(null);
    setNotice({
      tone: "info",
      text: planKey === "hbx_padrao" && padraoTrialAvailable
        ? "Ativando o trial interno do HBX Padrão, sem cobrança agora."
        : "Preparando a troca de plano.",
    });
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
        window.setTimeout(() => {
          router.push("/dashboard");
        }, 500);
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
        <main className={styles.page}>
          <section className={styles.modal}>
            <div className={styles.loadingCard}>Carregando planos HBX...</div>
          </section>
        </main>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Planos" hideHeader={true}>
      <main className={styles.page} data-entry-transition="from-login">
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="plans-title">
          <header className={styles.modalHeader}>
            <div className={styles.titleCluster}>
              <span className={styles.brandMark} aria-hidden="true">HBX</span>
              <div>
                <span className={styles.eyebrow}>Planos HBX</span>
                <h1 id="plans-title">Escolha o plano ideal para o seu negócio</h1>
                <p>Seu plano atual fica destacado. Você pode subir ou descer de plano, e o checkout aparece antes de qualquer cobrança.</p>
              </div>
            </div>

            <div className={styles.headerActions}>
              <span className={styles.currentPill}>
                Atual: <strong>{selectedPlanKey ? PLAN_LABELS[selectedPlanKey] : "nenhum"}</strong>
              </span>
              <Link href="/dashboard" className={styles.closeButton} aria-label="Voltar ao dashboard">X</Link>
            </div>
          </header>

          <div className={styles.planControls}>
            <div className={styles.flow} aria-label="Etapas">
              <span data-state="done">SignIn/Login</span>
              <span data-state="current">Plano</span>
              <span>Pagamento</span>
            </div>

            <div className={styles.segmented} role="tablist" aria-label="Ciclo de cobrança">
              <button type="button" data-active={billingCycle === "MONTHLY"} onClick={() => setBillingCycle("MONTHLY")}>Mensal</button>
              <button type="button" data-active={billingCycle === "ANNUAL"} onClick={() => setBillingCycle("ANNUAL")}>Anual <small>10% off</small></button>
            </div>
          </div>

          {pendingCheckout ? (
            <section className={styles.notice} data-tone="info">
              Você tem um checkout pendente. Escolha outro plano ou finalize o pagamento do plano já selecionado.
              <Link href="/dashboard/financeiro?focus=payment&reason=pending_checkout">Finalizar pagamento</Link>
            </section>
          ) : null}

          {intent === "bot_ia" ? (
            <section className={styles.notice} data-tone="info">
              O Bot de atendimento fica disponível no Max. Seu plano atual continua destacado para comparação.
            </section>
          ) : null}

          {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
          {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}

          {loading ? (
            <div className={styles.loadingCard}>Carregando catálogo comercial...</div>
          ) : (
            <div className={styles.planPicker}>
              <PlanSelectionExperience
                plans={planCards}
                selectedPlanKey={selectedPlanKey}
                billingCycle={billingCycle === "ANNUAL" ? "annual" : "monthly"}
                mode="signup"
                canSelect={canSelectPlan}
                hidePrices={!canSelectPlan}
                highlightPlanKey={promotedPlanKey}
                busyPlanKey={savingPlan}
                deniedMessage={adminDeniedMessage}
                onSelect={(planKey) => void selectPlan(planKey)}
              />
            </div>
          )}

          <footer className={styles.footerFacts}>
            <span>Alteração feita pelo ADMIN.</span>
            <span>Plano Padrão grátis só quando o trial ainda está elegível.</span>
            <span>Assinatura recorrente continua pelo Mercado Pago.</span>
          </footer>
        </section>
      </main>
    </DashboardScaffold>
  );
}
