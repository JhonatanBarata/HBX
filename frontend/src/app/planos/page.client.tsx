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
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type CurrentUser = {
  isSystemMaster?: boolean;
};

type BillingCycle = "MONTHLY" | "ANNUAL";
type PlanKey = PlanSelectionCard["key"];
type TrialFormState = {
  contactName: string;
  cpf: string;
  phone: string;
  acceptedTerms: boolean;
};

const PLAN_ORDER: PlanKey[] = ["hbx_lite", "hbx_padrao", "hbx_melhor"];

const FALLBACK_PLANS: Record<PlanKey, CommercialPlan> = {
  hbx_lite: {
    key: "hbx_lite",
    title: "HBX List",
    status: "available",
    monthlyPrice: 39.9,
    headline: "Cards simples para começar barato.",
    description: "Leads/cards simples com telefone, site básico, mensagem básica e WhatsApp externo.",
    annualDiscountPercent: 20,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 0, cardsPerSearch: 50, searchesPerCycle: 3, totalCards: 150 },
    features: ["Leads/cards simples", "50 cards por pesquisa", "3 pesquisas, total 150 cards", "Telefone/site básico", "Mensagem básica", "Sem lead inteligente completo"],
    legalCopy: "Liberação após pagamento confirmado.",
  },
  hbx_padrao: {
    key: "hbx_padrao",
    title: "HBX Lead",
    status: "available",
    monthlyPrice: 99.9,
    headline: "Card inteligente: contato, canal, motivo e mensagem.",
    description: "Leads inteligentes com WhatsApp verificado pela HBX, e-mail confirmado/provável, prioridade, canal recomendado e mensagem pronta.",
    annualDiscountPercent: 20,
    recommended: true,
    trialDays: 14,
    quotas: { googleSearchesPerDay: 2 },
    features: ["Leads inteligentes", "WhatsApp verificado pela HBX", "E-mail confirmado/provável", "Prioridade e motivo do lead", "Canal recomendado", "Templates comerciais", "Quem chamar hoje", "Retorno/agenda"],
    legalCopy: "14 dias grátis, sem cartão e sem cobrança automática.",
  },
  hbx_melhor: {
    key: "hbx_melhor",
    title: "HBX Full — Bot e IA",
    status: "available",
    monthlyPrice: 149.9,
    headline: "Automação completa com Bot IA, Radar e Night Factory.",
    description: "Para quem quer o HBX completo com atendimento, prospecção, bot e automação.",
    annualDiscountPercent: 20,
    trialDays: 0,
    quotas: { googleSearchesPerDay: 6 },
    features: ["Tudo do HBX Lead", "Bot IA liberado", "Bot de prospecção pós-resposta", "Respostas automáticas", "Qualificação de interessados", "Night Factory liberado", "Automação completa", "Encaminhamento para humano"],
    legalCopy: "Liberação após pagamento confirmado.",
  },
};

const PLAN_LABELS: Record<PlanKey, string> = {
  hbx_lite: "HBX List",
  hbx_padrao: "HBX Lead",
  hbx_melhor: "HBX Full — Bot e IA",
};

function isPendingCheckout(payload: CommercialPlansPayload | null) {
  if (isPaidOrActive(payload)) return false;
  const subscriptionStatus = String(payload?.current.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(payload?.current.paymentStatus || "").trim().toUpperCase();
  const onboardingStatus = String(payload?.current.onboardingStatus || "").trim().toLowerCase();
  const billingGraceEndsAt = payload?.current.billingGraceEndsAt ? new Date(payload.current.billingGraceEndsAt).getTime() : NaN;
  if (subscriptionStatus === "grace" && Number.isFinite(billingGraceEndsAt) && billingGraceEndsAt >= Date.now()) return false;
  return subscriptionStatus === "pending_checkout" || paymentStatus === "PENDING" || onboardingStatus === "pending_checkout";
}

function currentPlanKey(payload: CommercialPlansPayload | null): PlanKey | null {
  const key = payload?.current.planKey || payload?.current.selectedPlanKey || null;
  return PLAN_ORDER.includes(key as PlanKey) ? (key as PlanKey) : null;
}

function isPaidOrActive(payload: CommercialPlansPayload | null) {
  const subscriptionStatus = String(payload?.current.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(payload?.current.paymentStatus || "").trim().toUpperCase();
  const billingGraceEndsAt = payload?.current.billingGraceEndsAt ? new Date(payload.current.billingGraceEndsAt).getTime() : NaN;
  if (subscriptionStatus === "grace" && Number.isFinite(billingGraceEndsAt) && billingGraceEndsAt >= Date.now()) return true;
  if (subscriptionStatus === "active" || subscriptionStatus === "authorized" || subscriptionStatus === "manual") return true;
  if (paymentStatus === "PAID" || paymentStatus === "MANUAL") return true;
  if (payload?.current.premiumAccess && !payload?.current.isTrial) return true;
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
  if (planKey === "hbx_lite") return "Vendas";
  if (planKey === "hbx_padrao") return "Mais escolhido";
  return "Mais completo";
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function hasRepeatedDigits(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatBrazilPhone(value: string) {
  const rawDigits = onlyDigits(value).slice(0, 13);
  const digits = rawDigits.startsWith("55") && rawDigits.length > 11 ? rawDigits.slice(2, 13) : rawDigits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 1) return `(${ddd})${number}`;
  if (number.length <= 5) return `(${ddd})${number.slice(0, 1)} ${number.slice(1)}`;
  if (number.length === 8) return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  return `(${ddd})${number.slice(0, 1)} ${number.slice(1, 5)}-${number.slice(5, 9)}`;
}

function normalizeBrazilPhone(value: string) {
  const digits = onlyDigits(value);
  return digits.startsWith("55") && digits.length > 11 ? digits.slice(2, 13) : digits.slice(0, 11);
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
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [trialForm, setTrialForm] = useState<TrialFormState>({
    contactName: "",
    cpf: "",
    phone: "",
    acceptedTerms: false,
  });

  const intent = String(searchParams.get("intent") || "").trim();
  const canSelectPlan = Boolean(payload?.permissions?.canSelectPlan);
  const adminDeniedMessage =
    payload?.permissions?.selectPlanDeniedMessage || "USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.";
  const pendingCheckout = isPendingCheckout(payload);
  const selectedPlanKey = currentPlanKey(payload);
  const promotedPlanKey = promotedPlanFor(selectedPlanKey, intent);
  const padraoTrialAvailable = canStartPadraoTrial(payload);
  const trialPhoneDigits = normalizeBrazilPhone(trialForm.phone);
  const trialCpfDigits = onlyDigits(trialForm.cpf);
  const trialFormReady =
    trialForm.contactName.trim().length >= 3 &&
    isValidCpf(trialCpfDigits) &&
    trialPhoneDigits.length >= 10 &&
    trialForm.acceptedTerms;

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
          promoLabel: hasFreeTrial ? "Após 14 dias 99,90" : undefined,
          detail:
            key === "hbx_lite"
              ? "Para quem quer encontrar novos clientes e organizar a prospecção."
              : key === "hbx_padrao"
                ? hasFreeTrial
                  ? "Teste vendas + WhatsApp conectado dentro do sistema sem pagar agora."
                  : "Para quem quer prospectar e atender pelo WhatsApp dentro do HBX."
                : "Para quem quer automatizar atendimento, respostas e prospecção com segurança.",
          cta: isCurrent ? "Plano atual" : key === promotedPlanKey ? "Subir de plano" : "Escolher plano",
          available: plan.status !== "unavailable",
          featured: key === promotedPlanKey || (!selectedPlanKey && Boolean(plan.recommended)),
          features: plan.features || FALLBACK_PLANS[key].features || [],
          note: hasFreeTrial ? "14 dias grátis" : plan.legalCopy || FALLBACK_PLANS[key].legalCopy || undefined,
          trialCopy: hasFreeTrial ? "14 dias grátis" : undefined,
        };
      }),
    [padraoTrialAvailable, plans, promotedPlanKey, selectedPlanKey],
  );

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    let redirectedToMaster = false;
    try {
      const currentUser = await apiFetch<CurrentUser>("/profile/current-user").catch(() => null);
      if (currentUser?.isSystemMaster) {
        redirectedToMaster = true;
        router.replace("/master");
        return;
      }
      const data = await apiFetch<CommercialPlansPayload>("/commercial-plans/me");
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar os planos HBX.");
    } finally {
      if (!redirectedToMaster) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadPlans();
  }, [hasToken, loadPlans]);

  async function selectPlan(planKey: PlanKey) {
    if (!canSelectPlan) {
      setNotice({ tone: "info", text: adminDeniedMessage });
      return;
    }

    if (selectedPlanKey === planKey) {
      setNotice({ tone: "info", text: "Este é seu plano atual." });
      setTrialModalOpen(false);
      setError(null);
      return;
    }

    if (planKey === "hbx_padrao" && padraoTrialAvailable) {
      setTrialModalOpen(true);
      setNotice(null);
      setError(null);
      return;
    }

    setSavingPlan(planKey);
    setError(null);
    setNotice({
      tone: "info",
      text: planKey === "hbx_padrao" && padraoTrialAvailable
        ? "Ativando o trial interno do HBX Lead, sem cobrança agora."
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
        setNotice({ tone: "success", text: "Trial do HBX Lead iniciado por 14 dias. Não haverá cobrança automática." });
        window.setTimeout(() => {
          router.push("/boasvindas");
        }, 500);
        return;
      }
      router.push("/pagamento?focus=payment");
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao contratar o plano.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setSavingPlan(null);
    }
  }

  async function submitTrial() {
    if (!trialFormReady) {
      setNotice({ tone: "error", text: "Informe nome, CPF válido, telefone de contato e aceite os termos para iniciar o trial." });
      return;
    }

    setSavingPlan("hbx_padrao");
    setError(null);
    setNotice({ tone: "info", text: "Validando telefone e ativando o trial do HBX Lead." });
    try {
      const next = await apiFetch<CommercialPlansPayload>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({
          planKey: "hbx_padrao",
          trialContactName: trialForm.contactName.trim(),
          trialTaxDocument: trialCpfDigits,
          trialContactPhone: trialPhoneDigits,
          acceptedTerms: trialForm.acceptedTerms,
        }),
      });
      setPayload(next);
      setTrialModalOpen(false);
      setNotice({ tone: "success", text: "Trial do HBX Lead iniciado por 14 dias. Não haverá cobrança automática." });
      window.setTimeout(() => {
        router.push("/boasvindas");
      }, 500);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao iniciar o trial.";
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
          <section className={styles.plansSurface}>
            <div className={styles.loadingCard}>Carregando planos HBX...</div>
          </section>
        </main>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Planos" hideHeader={true}>
      <main className={styles.page}>
        <section className={styles.plansSurface} aria-labelledby="plans-title" data-trial-active={trialModalOpen}>
          <header className={styles.modalHeader}>
            <div className={styles.titleCluster}>
              <div>
                <span className={styles.eyebrow}>{trialModalOpen ? "Trial HBX Lead" : "Planos HBX"}</span>
                <h1 id="plans-title">{trialModalOpen ? "Liberar trial" : "Planos HBX"}</h1>
                <p>
                  {trialModalOpen
                    ? "Confirme o responsável para ativar os 14 dias."
                    : "Compare os planos sem bloquear sua operação."}
                </p>
              </div>
            </div>

            <div className={styles.headerActions}>
              <span className={styles.currentPill}>
                {trialModalOpen ? "Plano:" : "Atual:"} <strong>{trialModalOpen ? "HBX Lead trial" : selectedPlanKey ? PLAN_LABELS[selectedPlanKey] : "nenhum"}</strong>
              </span>
              <Link href="/boasvindas" className={styles.closeButton} aria-label="Voltar ao dashboard">X</Link>
            </div>
          </header>

          <div className={styles.planControls}>
            {!trialModalOpen ? (
              <div className={styles.segmented} role="tablist" aria-label="Ciclo de cobrança">
                <button type="button" data-active={billingCycle === "MONTHLY"} onClick={() => setBillingCycle("MONTHLY")}>Mensal</button>
                <button type="button" data-active={billingCycle === "ANNUAL"} onClick={() => setBillingCycle("ANNUAL")}>Anual <small>20% OFF</small></button>
              </div>
            ) : null}
          </div>

          {pendingCheckout && !trialModalOpen ? (
            <section className={styles.notice} data-tone="info">
              Checkout pendente. Você pode trocar o plano ou finalizar o pagamento.
              <Link href="/pagamento?focus=payment&reason=pending_checkout">Finalizar pagamento</Link>
            </section>
          ) : null}

          {intent === "bot_ia" && !trialModalOpen ? (
            <section className={styles.notice} data-tone="info">
              Bot IA disponível no plano HBX Full — Bot e IA.
            </section>
          ) : null}

          {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
          {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}

          {trialModalOpen ? (
            <section className={styles.trialInline} aria-labelledby="trial-title">
              <aside className={styles.trialSummary}>
                <span className={styles.trialSummaryBadge}>14 dias grátis</span>
                <h2 id="trial-title">HBX Lead</h2>
                <p>14 dias sem cobrança automática. Pagamento só no checkout.</p>
                <dl>
                  <div>
                    <dt>Validação</dt>
                    <dd>Telefone único por trial</dd>
                  </div>
                  <div>
                    <dt>Documento</dt>
                    <dd>CPF válido do responsável</dd>
                  </div>
                  <div>
                    <dt>Cobrança</dt>
                    <dd>Nenhuma cobrança automática agora</dd>
                  </div>
                </dl>
              </aside>

              <div className={styles.trialDialog}>
                <div className={styles.trialFormGrid}>
                  <label className={styles.trialField} htmlFor="trial-contact-name">
                    <span>Nome completo</span>
                    <input
                      id="trial-contact-name"
                      autoComplete="name"
                      value={trialForm.contactName}
                      onChange={(event) => setTrialForm((current) => ({ ...current, contactName: event.target.value }))}
                      placeholder="Como gostaria de ser chamado"
                    />
                  </label>

                  <label className={styles.trialField} htmlFor="trial-cpf">
                    <span>CPF</span>
                    <input
                      id="trial-cpf"
                      inputMode="numeric"
                      autoComplete="off"
                      value={trialForm.cpf}
                      onChange={(event) => setTrialForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
                      placeholder="000.000.000-00"
                    />
                  </label>

                  <label className={styles.trialField} htmlFor="trial-contact-phone">
                    <span>Telefone de contato</span>
                    <input
                      id="trial-contact-phone"
                      inputMode="tel"
                      autoComplete="tel"
                      value={trialForm.phone}
                      onChange={(event) => setTrialForm((current) => ({ ...current, phone: formatBrazilPhone(event.target.value) }))}
                      placeholder="(19)9 9702-4884"
                    />
                  </label>
                </div>

                <label className={styles.termsAccept} htmlFor="trial-terms">
                  <input
                    id="trial-terms"
                    type="checkbox"
                    checked={trialForm.acceptedTerms}
                    onChange={(event) => setTrialForm((current) => ({ ...current, acceptedTerms: event.target.checked }))}
                  />
                  <span>
                    Aceito iniciar o trial gratuito de 14 dias do HBX Lead, sem cobrança automática agora, e autorizo o uso do CPF, Nome Completo e Telefone informado para contato, validação de elegibilidade e vínculo do WhatsApp do trial. Para trocar o telefone será necessário acionar o suporte.
                  </span>
                </label>

                <footer className={styles.trialDialogActions}>
                  <button type="button" className="btn btn-secondary" onClick={() => setTrialModalOpen(false)}>
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!trialFormReady || savingPlan === "hbx_padrao"}
                    onClick={() => void submitTrial()}
                  >
                    {savingPlan === "hbx_padrao" ? "Ativando trial..." : "Iniciar 14 dias grátis"}
                  </button>
                </footer>
              </div>
            </section>
          ) : loading ? (
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

          {!trialModalOpen ? <footer className={styles.footerFacts}>
            <span>ADMIN altera planos.</span>
            <span>Trial conforme elegibilidade.</span>
            <span>Checkout pelo Mercado Pago.</span>
          </footer> : null}
        </section>
      </main>
    </DashboardScaffold>
  );
}
