"use client";

import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type BillingCycle = "MONTHLY" | "ANNUAL";
type CheckoutPaymentMethod = "CARD" | "PIX" | "BOLETO";
type PlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";

type FinanceiroOverview = {
  generatedAt: string;
  permissions?: {
    canManageBilling?: boolean;
    canStartCheckout?: boolean;
    deniedMessage?: string | null;
  };
  company: {
    id: number;
    name: string;
    paymentStatus: string;
    paymentMethod?: string | null;
    billingCycle: BillingCycle;
    billingProvider?: string | null;
    subscriptionStatus?: string | null;
    selectedPlanKey?: string | null;
    premiumAccess?: boolean;
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    isActive: boolean;
    contactEmail?: string | null;
    contactPhone?: string | null;
    plan?: { id: number; name: string; price: number } | null;
  };
  pricing: {
    billingCycle: BillingCycle;
    monthlyValue: number;
    annualPlanDiscountPercent: number;
    finalCycleAmount: number;
    commercialPlan?: {
      planKey: string;
      title: string;
      monthlyValue: number;
      referenceLabel: string;
      chargeDescription: string;
    } | null;
  };
  paymentOptions: {
    selectedMethod: string;
    card: {
      configured: boolean;
      brand?: string | null;
      last4?: string | null;
      updatedAt?: string | null;
    };
    pix: {
      available: boolean;
      preferred: boolean;
    };
  };
  subscription?: {
    id: string;
    provider: string;
    providerPreapprovalId?: string | null;
    providerPreapprovalPlanId?: string | null;
    planKey: string;
    billingCycle: BillingCycle;
    status: string;
    payerEmail?: string | null;
    billingContactPhone?: string | null;
    cardBrand?: string | null;
    cardLast4?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    nextBillingAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
    lastProviderStatus?: string | null;
  } | null;
  accountStatus: {
    label: string;
    nextDueAt?: string | null;
    lastPayment?: { paidAt?: string | null; amount: number; status: string } | null;
    lastFailure?: { createdAt?: string | null; amount: number; status: string } | null;
  };
  latestCharge?: {
    id: string;
    amount: number;
    currency: string;
    description: string;
    billingCycle: BillingCycle;
    paymentMethod: string;
    status: string;
    lifecycle: string;
    paymentUrl?: string | null;
    pixQrCode?: string | null;
    pixQrCodeBase64?: string | null;
    pixTicketUrl?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
    lastWebhookAt?: string | null;
  } | null;
  history: Array<{
    id: string;
    entryType: string;
    status: string;
    origin?: string | null;
    amount: number;
    paidAt?: string | null;
    paymentMethod?: string | null;
    referenceLabel?: string | null;
    createdAt?: string | null;
  }>;
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => {
      bricks: () => {
        create: (type: string, containerId: string, settings: Record<string, unknown>) => Promise<{ unmount: () => void }>;
      };
    };
  }
}

const PLAN_CATALOG: Record<PlanKey, { title: string; monthly: number; includes: string[] }> = {
  hbx_lite: {
    title: "HBX Lite",
    monthly: 29.9,
    includes: ["Vendas", "Motores gratuitos/HBX/cache", "Entrada com baixo custo"],
  },
  hbx_padrao: {
    title: "HBX Padrão",
    monthly: 79.9,
    includes: ["Vendas", "Atendimento Chat", "2 buscas Google por dia"],
  },
  hbx_melhor: {
    title: "HBX Melhor",
    monthly: 109.9,
    includes: ["Vendas", "Atendimento Chat", "Bot de atendimento", "6 buscas Google por dia"],
  },
};

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function normalizePlanKey(value?: string | null): PlanKey {
  if (value === "hbx_lite") return "hbx_lite";
  if (value === "hbx_melhor") return "hbx_melhor";
  return "hbx_padrao";
}

function planCycleAmount(planKey: PlanKey, billingCycle: BillingCycle) {
  const monthly = PLAN_CATALOG[planKey].monthly;
  if (billingCycle === "ANNUAL") return Number((monthly * 12 * 0.9).toFixed(2));
  return Number(monthly.toFixed(2));
}

function subscriptionLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "trialing") return "Free trial";
  if (normalized === "authorized") return "Autorizada";
  if (normalized === "active") return "Ativa";
  if (normalized === "pending_checkout") return "Checkout pendente";
  if (normalized === "past_due") return "Em atraso";
  if (normalized === "paused") return "Pausada";
  if (normalized === "canceled") return "Cancelada";
  if (normalized === "expired") return "Expirada";
  return normalized || "-";
}

function chargeStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "approved") return "Pago";
  if (normalized === "pending") return "Aguardando";
  if (normalized === "failed") return "Falhou";
  if (normalized === "cancelled") return "Cancelado";
  if (normalized === "refunded") return "Estornado";
  return normalized || "-";
}

function isPendingCheckout(overview: FinanceiroOverview | null, reason?: string | null) {
  const paymentStatus = String(overview?.company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(overview?.company.subscriptionStatus || "").trim().toLowerCase();
  const onboardingReason = String(reason || "").trim().toLowerCase();
  return paymentStatus === "PENDING" || subscriptionStatus === "pending_checkout" || onboardingReason === "pending_checkout";
}

function extractBrickToken(data: any) {
  return String(data?.token || data?.formData?.token || data?.cardTokenId || "").trim();
}

function extractBrickEmail(data: any, fallback: string) {
  return String(data?.payer?.email || data?.formData?.payer?.email || data?.cardholderEmail || fallback || "").trim();
}

function resolveBillingActionError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.toLowerCase();
  if (normalized.includes("property") && normalized.includes("should not exist")) {
    return "O frontend e a API de cobrança estão em versões diferentes. Publique o backend atualizado e tente novamente.";
  }
  if (normalized.includes("mercado pago") || normalized.includes("mercadopago")) {
    return `${fallback} Mercado Pago retornou: ${raw}`;
  }
  if (normalized.includes("metodo de pagamento invalido")) {
    return "A API ainda não reconhece este método de pagamento. Publique o backend atualizado e tente novamente.";
  }
  if (raw) return raw;
  return fallback;
}

export default function FinanceiroClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "";
  const brickControllerRef = useRef<{ unmount: () => void } | null>(null);
  const cardBrickReadyRef = useRef(false);
  const [mpScriptReady, setMpScriptReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [cardBrickWarning, setCardBrickWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceiroOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<CheckoutPaymentMethod>("CARD");
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey>("hbx_melhor");
  const [contactPhone, setContactPhone] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [showCardUpdate, setShowCardUpdate] = useState(false);
  const [forceCheckout, setForceCheckout] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const reason = searchParams.get("reason");
  const canManageBilling = overview?.permissions?.canManageBilling !== false;
  const checkoutMode = Boolean(overview && canManageBilling && (forceCheckout || isPendingCheckout(overview, reason)));
  const shouldRenderBrick = Boolean(overview && canManageBilling && publicKey && ((checkoutMode && checkoutPaymentMethod === "CARD") || showCardUpdate));
  const plan = PLAN_CATALOG[selectedPlanKey];
  const total = planCycleAmount(selectedPlanKey, billingCycle);
  const monthlyTotal = planCycleAmount(selectedPlanKey, "MONTHLY");
  const annualTotal = planCycleAmount(selectedPlanKey, "ANNUAL");
  const annualMonthlyEquivalent = Number((annualTotal / 12).toFixed(2));
  const monthlyEquivalent = billingCycle === "ANNUAL" ? Number((total / 12).toFixed(2)) : total;
  const cycleLabel = billingCycle === "ANNUAL" ? "Anual" : "Mensal";
  const latestPixCharge = overview?.latestCharge?.paymentMethod === "PIX" ? overview.latestCharge : null;
  const latestBoletoCharge = overview?.latestCharge?.paymentMethod === "BOLETO" ? overview.latestCharge : null;

  async function loadOverview(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<FinanceiroOverview>("/financeiro/overview");
      setOverview(payload);
      const nextPlanKey = normalizePlanKey(
        payload.subscription?.planKey || payload.company.selectedPlanKey || payload.pricing.commercialPlan?.planKey,
      );
      if (!background) {
        const pendingCheckoutPayload = isPendingCheckout(payload, reason);
        setSelectedPlanKey(nextPlanKey);
        setBillingCycle(pendingCheckoutPayload ? "MONTHLY" : payload.subscription?.billingCycle || "MONTHLY");
        setContactPhone(payload.subscription?.billingContactPhone || payload.company.contactPhone || "");
        setPayerEmail(payload.subscription?.payerEmail || payload.company.contactEmail || "");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Financeiro.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function submitSubscription(cardFormData: any) {
    const cardTokenId = extractBrickToken(cardFormData);
    const email = extractBrickEmail(cardFormData, payerEmail);
    const printedName = cardholderName.trim();
    if (!printedName) {
      const text = "Informe o nome impresso no cartão.";
      setError(text);
      setPaymentActionError(text);
      throw new Error(text);
    }
    if (!cardTokenId) throw new Error("Mercado Pago não retornou token do cartão.");
    if (!contactPhone.replace(/\D/g, "")) throw new Error("Informe o telefone de contato.");
    setSaving(showCardUpdate && !checkoutMode ? "change-card" : "subscription");
    setError(null);
    setPaymentActionError(null);
    try {
      const payload = showCardUpdate && !checkoutMode
        ? await apiFetch<{ overview?: FinanceiroOverview }>("/financeiro/subscription/change-card", {
            method: "POST",
            body: JSON.stringify({ cardTokenId }),
          })
        : await apiFetch<{ overview?: FinanceiroOverview }>("/financeiro/subscription/create", {
            method: "POST",
            body: JSON.stringify({
              planKey: selectedPlanKey,
              billingCycle,
              cardTokenId,
              payerEmail: email,
              contactPhone,
              paymentMethodId: cardFormData?.paymentMethodId || cardFormData?.formData?.paymentMethodId,
              issuerId: cardFormData?.issuerId || cardFormData?.formData?.issuerId,
            }),
          });
      if (payload?.overview) setOverview(payload.overview);
      else await loadOverview(true);
      setMessage(showCardUpdate && !checkoutMode ? "Cartão atualizado no Mercado Pago." : "Cartão autorizado. A liberação ocorre assim que o Mercado Pago confirmar o primeiro pagamento.");
      setShowCardUpdate(false);
      setForceCheckout(false);
    } catch (actionError) {
      const text = resolveBillingActionError(actionError, "Não conseguimos autorizar o cartão.");
      setError(text);
      setPaymentActionError(text);
      throw actionError;
    } finally {
      setSaving(null);
    }
  }

  async function cancelSubscription() {
    setSaving("cancel-subscription");
    setError(null);
    try {
      const payload = await apiFetch<{ overview?: FinanceiroOverview }>("/financeiro/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (payload?.overview) setOverview(payload.overview);
      else await loadOverview(true);
      setMessage("Cancelamento confirmado no Mercado Pago.");
      setCancelModalOpen(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não conseguimos cancelar a assinatura no provedor. Tente novamente ou fale com suporte.");
    } finally {
      setSaving(null);
    }
  }

  async function startOneOffCheckout(paymentMethod: Exclude<CheckoutPaymentMethod, "CARD">) {
    if (!contactPhone.replace(/\D/g, "")) {
      setError("Informe o telefone de contato antes de gerar a cobrança.");
      return;
    }
    const savingKey = paymentMethod === "PIX" ? "checkout-pix" : "checkout-boleto";
    setSaving(savingKey);
    setError(null);
    setPaymentActionError(null);
    try {
      const payload = await apiFetch<{ charge?: FinanceiroOverview["latestCharge"]; overview?: FinanceiroOverview }>("/financeiro/checkout", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          planKey: selectedPlanKey,
          billingCycle,
          contactPhone,
        }),
      });
      const charge = payload.charge || payload.overview?.latestCharge || null;
      if (payload.overview) setOverview(payload.overview);
      else await loadOverview(true);

      if (paymentMethod === "BOLETO" && charge?.paymentUrl && typeof window !== "undefined") {
        window.open(charge.paymentUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(
        paymentMethod === "PIX"
          ? "Pix gerado. A confirmação do Mercado Pago libera o acesso automaticamente."
          : "Boleto criado no Mercado Pago. A compensação libera o acesso automaticamente.",
      );
    } catch (actionError) {
      const text = resolveBillingActionError(
        actionError,
        paymentMethod === "PIX" ? "Não conseguimos gerar o Pix." : "Não conseguimos criar o boleto.",
      );
      setError(text);
      setPaymentActionError(text);
    } finally {
      setSaving(null);
    }
  }

  useEffect(() => {
    if (hasToken === true) void loadOverview();
  }, [hasToken]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!checkoutMode) return;
    const timer = window.setInterval(() => {
      void loadOverview(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [checkoutMode]);

  useEffect(() => {
    if (!shouldRenderBrick || !window.MercadoPago || !mpScriptReady) return;
    let mounted = true;
    setError(null);
    setCardBrickWarning(null);
    cardBrickReadyRef.current = false;

    try {
      brickControllerRef.current?.unmount();
    } catch {
      // Mercado Pago controls its own iframe lifecycle.
    }
    brickControllerRef.current = null;

    const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    const bricksBuilder = mp.bricks();
    bricksBuilder
      .create("cardPayment", "mp-card-payment-brick", {
        initialization: {
          amount: total,
          payer: {
            email: payerEmail || undefined,
          },
        },
        customization: {
          visual: { style: { theme: "default" } },
          paymentMethods: {
            types: {
              excluded: ["debit_card", "prepaid_card"],
            },
          },
        },
        callbacks: {
          onReady: () => {
            cardBrickReadyRef.current = true;
            setCardBrickWarning(null);
          },
          onSubmit: (cardFormData: any) => submitSubscription(cardFormData),
          onError: (brickError: unknown) => {
            const text = brickError instanceof Error ? brickError.message : "Falha no formulário seguro do Mercado Pago.";
            setError(text);
          },
        },
      })
      .then((controller) => {
        if (!mounted) {
          controller.unmount();
          return;
        }
        brickControllerRef.current = controller;
      })
      .catch((brickError) => {
        const text = brickError instanceof Error ? brickError.message : "Não foi possível carregar o cartão Mercado Pago.";
        setError(text);
        setCardBrickWarning("Não conseguimos carregar o formulário seguro do Mercado Pago. Confira a chave pública e tente recarregar a página.");
      });

    return () => {
      mounted = false;
      try {
        brickControllerRef.current?.unmount();
      } catch {
        // ignore
      }
      brickControllerRef.current = null;
    };
  }, [shouldRenderBrick, mpScriptReady, publicKey, total, payerEmail, checkoutMode, showCardUpdate]);

  useEffect(() => {
    if (!shouldRenderBrick || !publicKey) return;
    setCardBrickWarning(null);
    cardBrickReadyRef.current = false;
    const timer = window.setTimeout(() => {
      if (cardBrickReadyRef.current) return;
      setCardBrickWarning("O formulário seguro do Mercado Pago está demorando para carregar. Confira se a chave pública é a Public Key correta e se o domínio está liberado no Mercado Pago.");
    }, 14000);
    return () => window.clearTimeout(timer);
  }, [shouldRenderBrick, publicKey, total, payerEmail]);

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Financeiro" description="Carregando visão financeira da conta.">
        <section className={styles.loadingCard}>Carregando...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  if (!loading && overview && !canManageBilling) {
    return (
      <DashboardScaffold title="Financeiro" description="Acesso financeiro restrito ao ADMIN.">
        <div className={styles.page}>
          <section className={styles.errorCard}>
            <strong>Seu usuário não pode alterar cobrança.</strong>
            <p className={styles.helperText}>
              {overview.permissions?.deniedMessage || "Seu usuário não pode alterar cobrança. Contate seu ADMIN ou o suporte da empresa."}
            </p>
            <Link href="/dashboard" className="btn btn-secondary btn-sm">Voltar ao sistema</Link>
          </section>
        </div>
      </DashboardScaffold>
    );
  }

  if (loading || !overview) {
    return (
      <DashboardScaffold title="Financeiro" description="Carregando visão financeira da conta.">
        <section className={styles.loadingCard}>Carregando painel financeiro...</section>
      </DashboardScaffold>
    );
  }

  const nextBilling = new Date();
  nextBilling.setMonth(nextBilling.getMonth() + (billingCycle === "ANNUAL" ? 12 : 1));

  const checkout = (
    <div className={styles.page}>
      <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setMpScriptReady(true)} />
      {error ? <section className={styles.errorCard}>{error}</section> : null}
      {message ? <section className={styles.successCard}>{message}</section> : null}

      <section className={styles.checkoutShell}>
        <article className={styles.checkoutMain}>
          <div className={styles.checkoutHero}>
            <div className={styles.checkoutLogo} aria-hidden="true">HBX</div>
            <div>
              <span className={styles.eyebrow}>Contratação HBX</span>
              <h1 className={styles.checkoutTitle}>Finalize sua contratação</h1>
              <p className={styles.heroText}>Confirme o ciclo e escolha como pagar. Cartão ativa a assinatura automática; Pix e boleto quitam o ciclo atual.</p>
            </div>
          </div>

          <div className={styles.checkoutStepper} aria-label="Etapas do checkout">
            <span data-active="true">1. Ciclo</span>
            <span data-active="true">2. Contato</span>
            <span data-active="true">3. Pagamento</span>
          </div>

          <section className={styles.checkoutSection}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Ciclo de cobrança</strong>
                <p className={styles.helperText}>Mensal já vem selecionado. Ele cobra mês a mês e não compromete o limite anual do cartão de uma vez.</p>
              </div>
            </div>
            <div className={styles.cycleCards} role="group" aria-label="Ciclo de cobrança">
              <button type="button" data-active={billingCycle === "MONTHLY"} onClick={() => setBillingCycle("MONTHLY")}>
                <span className={styles.cycleName}>Mensal</span>
                <strong>{formatCurrency(monthlyTotal)}/mês</strong>
                <small>Cobrança automática todo mês. Não é compra anual parcelada.</small>
              </button>
              <button type="button" data-active={billingCycle === "ANNUAL"} onClick={() => setBillingCycle("ANNUAL")}>
                <span className={styles.discountBadge}>10% de desconto</span>
                <span className={styles.cycleName}>Anual</span>
                <strong>{formatCurrency(annualMonthlyEquivalent)}/mês</strong>
                <small>Total de {formatCurrency(annualTotal)} cobrado hoje.</small>
              </button>
            </div>
          </section>

          <section className={styles.checkoutSection}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Contato de confirmação</strong>
                <p className={styles.helperText}>Usamos estes dados para confirmar pagamento, status e suporte da contratação.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Telefone de contato</span>
                <input
                  className={styles.fieldInput}
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Email de confirmação</span>
                <input
                  className={styles.fieldInput}
                  type="email"
                  value={payerEmail}
                  readOnly
                  aria-readonly="true"
                  placeholder="email da conta"
                />
              </label>
            </div>
          </section>

          <section className={styles.checkoutSection}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Método de pagamento</strong>
                <p className={styles.helperText}>Cartão é recorrente automático. Pix e boleto continuam como pagamento avulso do ciclo escolhido.</p>
              </div>
              <span className={styles.statusPill}>Mercado Pago</span>
            </div>
            <div className={styles.paymentMethodGrid} role="group" aria-label="Método de pagamento">
              <button type="button" data-active={checkoutPaymentMethod === "CARD"} onClick={() => setCheckoutPaymentMethod("CARD")}>
                <span>Cartão</span>
                <strong>Assinatura automática</strong>
                <small>Cobra sozinho a cada ciclo no Mercado Pago.</small>
              </button>
              <button type="button" data-active={checkoutPaymentMethod === "PIX"} onClick={() => setCheckoutPaymentMethod("PIX")}>
                <span>Pix</span>
                <strong>Pagamento do ciclo</strong>
                <small>Gera QR Code e libera após confirmação.</small>
              </button>
              <button type="button" data-active={checkoutPaymentMethod === "BOLETO"} onClick={() => setCheckoutPaymentMethod("BOLETO")}>
                <span>Boleto</span>
                <strong>Pagamento do ciclo</strong>
                <small>Abre boleto no Mercado Pago para compensação.</small>
              </button>
            </div>
          </section>

          {checkoutPaymentMethod === "CARD" ? (
            <section className={styles.securePaymentBox}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Cartão seguro Mercado Pago</strong>
                  <p className={styles.helperText}>O HBX recebe apenas o token temporário de autorização. Número completo e código de segurança não passam pelo nosso servidor.</p>
                </div>
                <span className={styles.statusPill}>Recorrente</span>
              </div>
              <div className={styles.cardExperience}>
                <div className={styles.cardMock} aria-hidden="true">
                  <div className={styles.cardMockTop}>
                    <span>HBX</span>
                    <small>Mercado Pago</small>
                  </div>
                  <strong>•••• •••• •••• ••••</strong>
                  <div className={styles.cardMockBottom}>
                    <span>{cardholderName.trim() || "Nome no cartão"}</span>
                    <span>{billingCycle === "ANNUAL" ? "Anual" : "Mensal"}</span>
                  </div>
                </div>
                <div className={styles.cardTokenPanel}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Nome impresso no cartão</span>
                    <input
                      className={styles.fieldInput}
                      autoComplete="cc-name"
                      value={cardholderName}
                      onChange={(event) => setCardholderName(event.target.value)}
                      placeholder="Como aparece no cartão"
                    />
                  </label>
                  {!publicKey ? (
                    <div className={styles.setupNotice}>
                      <strong>Cartão em configuração neste ambiente.</strong>
                      <p>A chave pública do Mercado Pago precisa estar ativa no frontend para exibir o formulário seguro. Pix e boleto seguem disponíveis para este ciclo.</p>
                    </div>
                  ) : (
                    <div id="mp-card-payment-brick" className={styles.mpBrick} />
                  )}
                  {cardBrickWarning ? (
                    <div className={styles.setupNotice}>
                      <strong>Formulário do cartão não carregou.</strong>
                      <p>{cardBrickWarning}</p>
                    </div>
                  ) : null}
                  {paymentActionError && checkoutPaymentMethod === "CARD" ? (
                    <div className={styles.setupNotice}>
                      <strong>Não foi possível concluir pelo cartão.</strong>
                      <p>{paymentActionError}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {checkoutPaymentMethod === "PIX" ? (
            <section className={styles.securePaymentBox}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Pix Mercado Pago</strong>
                  <p className={styles.helperText}>Pix quita o ciclo selecionado. Ele não cria cobrança automática para os próximos ciclos.</p>
                </div>
                <span className={styles.statusPill}>Avulso</span>
              </div>
              <div className={styles.alternativePaymentPanel}>
                <div>
                  <strong>{formatCurrency(total)}</strong>
                  <p>{cycleLabel} HBX via Pix. Acesso liberado automaticamente quando o Mercado Pago confirmar.</p>
                </div>
                <button type="button" className="btn btn-primary" disabled={saving === "checkout-pix"} onClick={() => void startOneOffCheckout("PIX")}>
                  {saving === "checkout-pix" ? "Gerando Pix..." : "Gerar Pix"}
                </button>
              </div>
              {latestPixCharge?.pixQrCodeBase64 || latestPixCharge?.pixQrCode ? (
                <div className={styles.pixResult}>
                  {latestPixCharge?.pixQrCodeBase64 ? (
                    <img className={styles.qrImage} alt="QR Code Pix Mercado Pago" src={`data:image/png;base64,${latestPixCharge.pixQrCodeBase64}`} />
                  ) : null}
                  {latestPixCharge?.pixQrCode ? (
                    <div className={styles.copyArea}>
                      <textarea readOnly value={latestPixCharge?.pixQrCode || ""} aria-label="Código Pix copia e cola" />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          void navigator.clipboard?.writeText(latestPixCharge?.pixQrCode || "");
                          setMessage("Código Pix copiado.");
                        }}
                      >
                        Copiar código
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {paymentActionError && checkoutPaymentMethod === "PIX" ? (
                <div className={styles.setupNotice}>
                  <strong>Não foi possível gerar o Pix.</strong>
                  <p>{paymentActionError}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {checkoutPaymentMethod === "BOLETO" ? (
            <section className={styles.securePaymentBox}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Boleto Mercado Pago</strong>
                  <p className={styles.helperText}>Boleto quita o ciclo selecionado após compensação. Não é recorrência automática.</p>
                </div>
                <span className={styles.statusPill}>Avulso</span>
              </div>
              <div className={styles.alternativePaymentPanel}>
                <div>
                  <strong>{formatCurrency(total)}</strong>
                  <p>{cycleLabel} HBX via boleto. O Mercado Pago controla emissão, vencimento e compensação.</p>
                </div>
                <button type="button" className="btn btn-primary" disabled={saving === "checkout-boleto"} onClick={() => void startOneOffCheckout("BOLETO")}>
                  {saving === "checkout-boleto" ? "Criando boleto..." : "Criar boleto"}
                </button>
              </div>
              {latestBoletoCharge?.paymentUrl ? (
                <a className={styles.paymentLink} href={latestBoletoCharge.paymentUrl} target="_blank" rel="noreferrer">
                  Abrir boleto no Mercado Pago
                </a>
              ) : null}
              {paymentActionError && checkoutPaymentMethod === "BOLETO" ? (
                <div className={styles.setupNotice}>
                  <strong>Não foi possível criar o boleto.</strong>
                  <p>{paymentActionError}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className={styles.termsBox}>
            <span>Mensal no cartão cobra mês a mês, sem usar o limite anual de uma vez.</span>
            <span>Sem fidelidade: assinatura pode ser cancelada no Financeiro.</span>
            <span>Pix e boleto são alternativas avulsas para regularizar o ciclo.</span>
          </div>
        </article>

        <aside className={styles.checkoutSummaryPanel}>
          <div>
            <span className={styles.eyebrow}>Resumo</span>
            <strong className={styles.summaryPlan}>{plan.title}</strong>
          </div>
          <div className={styles.priceStack}>
            <span>{formatCurrency(monthlyEquivalent)}/mês</span>
            <strong>{cycleLabel}: {formatCurrency(total)} hoje</strong>
            <small>
              {checkoutPaymentMethod === "CARD"
                ? billingCycle === "ANNUAL"
                  ? "Assinatura anual com 10% de desconto."
                  : "Assinatura mensal recorrente, sem usar limite anual."
                : "Pagamento avulso do ciclo selecionado."}
            </small>
          </div>
          <div className={styles.summaryList}>
            {plan.includes.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className={styles.summaryFacts}>
            <div><span>{checkoutPaymentMethod === "CARD" ? "Próxima cobrança" : "Liberação"}</span><strong>{checkoutPaymentMethod === "CARD" ? nextBilling.toLocaleDateString("pt-BR") : "Após confirmação"}</strong></div>
            <div><span>Método</span><strong>{checkoutPaymentMethod === "CARD" ? "Cartão recorrente" : checkoutPaymentMethod === "PIX" ? "Pix avulso" : "Boleto avulso"}</strong></div>
            <div><span>Segurança</span><strong>Mercado Pago</strong></div>
          </div>
          <p className={styles.summarySupport}>Após a confirmação, o HBX atualiza seu acesso automaticamente.</p>
        </aside>
      </section>
    </div>
  );

  if (checkoutMode) {
    return (
      <DashboardScaffold title="Finalize sua contratação" description="Confirme plano, contato e cartão seguro.">
        {checkout}
      </DashboardScaffold>
    );
  }

  const activeSubscription = overview.subscription;
  const canCancel = ["active", "authorized", "past_due"].includes(String(activeSubscription?.status || "").toLowerCase());

  return (
    <DashboardScaffold title="Financeiro" description="Assinatura, status de acesso e pagamentos recentes.">
      <div className={styles.page}>
        <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setMpScriptReady(true)} />
        {error ? <section className={styles.errorCard}>{error}</section> : null}
        {message ? <section className={styles.successCard}>{message}</section> : null}

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>HBX assinatura</span>
            <h1 className={styles.heroTitle}>{overview.pricing.commercialPlan?.title || PLAN_CATALOG[normalizePlanKey(overview.company.selectedPlanKey)].title}</h1>
            <p className={styles.heroText}>
              {overview.accountStatus.label} • próximo marco em {formatDate(overview.accountStatus.nextDueAt)}
            </p>
          </div>
          <div className={styles.heroPanel}>
            <span className={styles.statusPill}>{subscriptionLabel(overview.company.subscriptionStatus)}</span>
            <strong className={styles.heroValue}>
              {overview.company.subscriptionStatus === "trialing"
                ? `${overview.company.trialRemainingDays ?? 0} dia(s)`
                : formatCurrency(overview.pricing.finalCycleAmount)}
            </strong>
            <small className={styles.heroHint}>
              {overview.company.subscriptionStatus === "trialing" ? "Trial interno sem cobrança automática" : "Ciclo financeiro atual"}
            </small>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Assinatura Mercado Pago</strong>
                <p className={styles.helperText}>Status usado pelo HBX para liberar ou bloquear acesso.</p>
              </div>
              {activeSubscription ? <span className={styles.statusPill}>{subscriptionLabel(activeSubscription.status)}</span> : <span className={styles.mutedPill}>Sem assinatura</span>}
            </div>
            <div className={styles.infoGrid}>
              <div><span>Provider</span><strong>{activeSubscription?.provider || overview.company.billingProvider || "manual"}</strong></div>
              <div><span>Ciclo</span><strong>{(activeSubscription?.billingCycle || overview.company.billingCycle) === "ANNUAL" ? "Anual" : "Mensal"}</strong></div>
              <div><span>Cartão</span><strong>{overview.paymentOptions.card.last4 ? `${overview.paymentOptions.card.brand || "Cartão"} final ${overview.paymentOptions.card.last4}` : "Não exibido"}</strong></div>
              <div><span>Próxima cobrança</span><strong>{formatDate(activeSubscription?.nextBillingAt || overview.accountStatus.nextDueAt)}</strong></div>
              <div><span>Período atual</span><strong>{formatDate(activeSubscription?.currentPeriodEnd || overview.company.trialEndsAt)}</strong></div>
              <div><span>ID assinatura</span><strong>{activeSubscription?.providerPreapprovalId || "-"}</strong></div>
            </div>
            <div className={styles.formActions}>
              {overview.company.subscriptionStatus === "trialing" ? (
                <button type="button" className="btn btn-primary" onClick={() => setForceCheckout(true)}>
                  Assinar para continuar
                </button>
              ) : null}
              {activeSubscription?.providerPreapprovalId ? (
                <button type="button" className="btn btn-secondary" onClick={() => setShowCardUpdate((current) => !current)}>
                  Trocar cartão
                </button>
              ) : null}
              {canCancel ? (
                <button type="button" className="btn btn-secondary" onClick={() => setCancelModalOpen(true)}>
                  Cancelar assinatura
                </button>
              ) : null}
            </div>
          </article>

          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Última cobrança</strong>
                <p className={styles.helperText}>As confirmações do Mercado Pago aparecem aqui assim que o webhook atualizar a conta.</p>
              </div>
              <span className={overview.latestCharge?.status === "approved" ? styles.statusPill : styles.mutedPill}>
                {overview.latestCharge ? chargeStatusLabel(overview.latestCharge.status) : "Sem cobrança"}
              </span>
            </div>
            {overview.latestCharge ? (
              <div className={styles.infoGrid}>
                <div><span>Descrição</span><strong>{overview.latestCharge.description}</strong></div>
                <div><span>Valor</span><strong>{formatCurrency(overview.latestCharge.amount)}</strong></div>
                <div><span>Atualizado</span><strong>{formatDate(overview.latestCharge.lastWebhookAt || overview.latestCharge.createdAt)}</strong></div>
              </div>
            ) : (
              <div className={styles.emptyState}>Ainda não há confirmação de pagamento para mostrar.</div>
            )}
          </article>
        </section>

        {showCardUpdate ? (
          <section className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Trocar cartão</strong>
                <p className={styles.helperText}>O novo cartão será tokenizado pelo Mercado Pago e enviado ao provedor da assinatura.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCardUpdate(false)}>Fechar</button>
            </div>
            {!publicKey ? (
              <div className={styles.setupNotice}>
                <strong>Cartão em configuração neste ambiente.</strong>
                <p>A chave pública do Mercado Pago precisa estar ativa no frontend para exibir o formulário seguro.</p>
              </div>
            ) : (
              <div id="mp-card-payment-brick" className={styles.mpBrick} />
            )}
          </section>
        ) : null}

        <section className={styles.panelCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>Histórico recente</strong>
              <p className={styles.helperText}>USER não visualiza estes dados; somente ADMIN acessa cobrança.</p>
            </div>
          </div>
          <div className={styles.historyList}>
            {overview.history.length ? overview.history.slice(0, 8).map((entry) => (
              <article key={entry.id} className={styles.historyItem}>
                <div>
                  <strong>{entry.referenceLabel || entry.entryType}</strong>
                  <p>{entry.origin || "origem interna"} • {entry.paymentMethod || "método interno"}</p>
                </div>
                <div className={styles.historyRight}>
                  <strong>{formatCurrency(entry.amount)}</strong>
                  <span>{entry.paidAt ? formatDate(entry.paidAt) : chargeStatusLabel(entry.status)}</span>
                </div>
              </article>
            )) : (
              <div className={styles.emptyState}>Ainda não há histórico financeiro para mostrar.</div>
            )}
          </div>
        </section>

        {cancelModalOpen ? (
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="cancel-subscription-title">
            <section className={styles.modalCard}>
              <h2 id="cancel-subscription-title">Cancelar assinatura</h2>
              <p>
                Ao cancelar, novas cobranças serão interrompidas. Seu acesso permanecerá ativo até o fim do período já pago, se houver período pago em aberto.
              </p>
              <div className={styles.formActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setCancelModalOpen(false)}>Voltar</button>
                <button type="button" className="btn btn-primary" disabled={saving === "cancel-subscription"} onClick={() => void cancelSubscription()}>
                  {saving === "cancel-subscription" ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardScaffold>
  );
}
