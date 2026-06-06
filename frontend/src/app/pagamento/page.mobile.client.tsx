"use client";

import Script from "next/script";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { isHbxOperationalCompany, type BillingAccessCompany } from "@/lib/billing-access";
import styles from "./mobile-checkout.module.css";

type BillingCycle = "MONTHLY" | "ANNUAL";
type CheckoutPaymentMethod = "CARD" | "PIX";
type CheckoutStep = "plan" | "method" | "payment";
type PlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";

type MercadoPagoBrickController = { unmount: () => void };
type MercadoPagoIdentificationData = {
  type?: string | null;
  number?: string | number | null;
};
type MercadoPagoPayerData = {
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  identification?: MercadoPagoIdentificationData | null;
};
type MercadoPagoCardholderData = {
  name?: string | null;
  identification?: MercadoPagoIdentificationData | null;
};
type MercadoPagoBrickFormData = {
  token?: string | null;
  cardTokenId?: string | null;
  cardholderName?: string | null;
  cardholderEmail?: string | null;
  paymentMethodId?: string | null;
  issuerId?: string | number | null;
  identificationNumber?: string | number | null;
  docNumber?: string | number | null;
  cardholder?: MercadoPagoCardholderData | null;
  payer?: MercadoPagoPayerData | null;
  formData?: {
    token?: string | null;
    cardholderName?: string | null;
    cardholderEmail?: string | null;
    identificationNumber?: string | number | null;
    docNumber?: string | number | null;
    cardholder?: MercadoPagoCardholderData | null;
    payer?: MercadoPagoPayerData | null;
    paymentMethodId?: string | null;
    issuerId?: string | number | null;
  } | null;
};
type ApiErrorWithPayload = {
  payload?: {
    code?: string | null;
  } | null;
};
type PaymentNotice = {
  tone: "info" | "success" | "error";
  title: string;
  text: string;
};
type PaymentProfile = {
  contactName: string;
  contactPhone: string;
  taxDocument: string;
  payerEmail: string;
  acceptedTerms: true;
};
type CurrentUser = {
  role?: string | null;
  company?: BillingAccessCompany | null;
};
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
    trialEndsAt?: string | null;
    billingGraceEndsAt?: string | null;
    isActive: boolean;
    contactEmail?: string | null;
    primaryContactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
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
    planKey: string;
    billingCycle: BillingCycle;
    status: string;
    payerEmail?: string | null;
    billingContactPhone?: string | null;
    nextBillingAt?: string | null;
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
        create: (type: string, containerId: string, settings: Record<string, unknown>) => Promise<MercadoPagoBrickController>;
      };
    };
  }
}

const MERCADO_PAGO_BRICK_CONTAINER_ID = "mp-mobile-card-payment-brick";
const MERCADO_PAGO_BRICK_MAX_ATTEMPTS = 3;
const MERCADO_PAGO_SDK_WAIT_MS = 22000;
const MERCADO_PAGO_BRICK_READY_WAIT_MS = 24000;
const HBX_SUPPORT_PHONE = "5519997024884";
const HBX_FULL_SUPPORT_MESSAGE = "Olá, quero falar com a HBX sobre implantação assistida do HBX Full.";
const ANNUAL_DISCOUNT_PERCENT = 10;
const ANNUAL_DISCOUNT_MULTIPLIER = 1 - ANNUAL_DISCOUNT_PERCENT / 100;

const PLAN_CATALOG: Record<PlanKey, { title: string; monthly: number; includes: string[] }> = {
  hbx_lite: {
    title: "HBX List",
    monthly: 45,
    includes: ["Cards simples", "Telefone, cidade e segmento", "Site básico", "WhatsApp externo"],
  },
  hbx_padrao: {
    title: "HBX Lead Plus",
    monthly: 99,
    includes: ["Cards inteligentes", "WhatsApp verificado", "Score, motivo, canal e mensagem"],
  },
  hbx_melhor: {
    title: "HBX Full - implantação assistida",
    monthly: 149.9,
    includes: ["Bot e automação", "Atendimento completo", "Configuração com a HBX"],
  },
};

const MOCK_FRONT_OVERVIEW: FinanceiroOverview = {
  generatedAt: "2026-05-21T12:00:00.000Z",
  permissions: { canManageBilling: true, canStartCheckout: true },
  company: {
    id: 0,
    name: "HBX Preview",
    paymentStatus: "PENDING",
    paymentMethod: "CARD",
    billingCycle: "MONTHLY",
    billingProvider: "mercadopago",
    subscriptionStatus: "pending_checkout",
    selectedPlanKey: "hbx_padrao",
    premiumAccess: false,
    isActive: true,
    contactEmail: "financeiro@hbxpreview.com",
    primaryContactName: "Cliente Preview",
    contactPhone: "19997024884",
    taxDocument: "39053344705",
    plan: { id: 0, name: "HBX Lead Plus", price: 99 },
  },
  pricing: {
    billingCycle: "MONTHLY",
    monthlyValue: 99,
    annualPlanDiscountPercent: 10,
    finalCycleAmount: 99,
    commercialPlan: {
      planKey: "hbx_padrao",
      title: "HBX Lead Plus",
      monthlyValue: 99,
      referenceLabel: "mensal",
      chargeDescription: "Assinatura HBX Lead Plus",
    },
  },
  paymentOptions: {
    selectedMethod: "CARD",
    card: { configured: false },
    pix: { available: true, preferred: false },
  },
  subscription: null,
  accountStatus: { label: "Checkout pendente" },
  latestCharge: null,
  history: [],
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

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
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

function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;
  const calculate = (weights: number[]) => {
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return (
    calculate([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12]) &&
    calculate([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13])
  );
}

function isValidTaxDocument(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function formatTaxDocument(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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

function normalizePlanKey(value?: string | null): PlanKey {
  if (value === "hbx_lite") return "hbx_lite";
  if (value === "hbx_melhor") return "hbx_melhor";
  return "hbx_padrao";
}

function normalizePaymentMethod(value?: string | null): CheckoutPaymentMethod {
  return String(value || "").trim().toUpperCase() === "PIX" ? "PIX" : "CARD";
}

function planCycleAmount(planKey: PlanKey, billingCycle: BillingCycle) {
  const monthly = PLAN_CATALOG[planKey].monthly;
  if (billingCycle === "ANNUAL") return Number((monthly * 12 * ANNUAL_DISCOUNT_MULTIPLIER).toFixed(2));
  return Number(monthly.toFixed(2));
}

function discountedMonthlyAmount(planKey: PlanKey) {
  return Number((PLAN_CATALOG[planKey].monthly * ANNUAL_DISCOUNT_MULTIPLIER).toFixed(2));
}

function isBillingGraceActive(company?: FinanceiroOverview["company"] | null) {
  if (!company?.billingGraceEndsAt) return false;
  const endsAt = new Date(company.billingGraceEndsAt).getTime();
  return Number.isFinite(endsAt) && endsAt >= Date.now() && Boolean(company.isActive);
}

function isPendingCheckout(overview: FinanceiroOverview | null, reason?: string | null) {
  const paymentStatus = String(overview?.company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(overview?.company.subscriptionStatus || "").trim().toLowerCase();
  const onboardingReason = String(reason || "").trim().toLowerCase();
  if (isBillingGraceActive(overview?.company)) return false;
  const accessReleased =
    paymentStatus === "PAID" ||
    paymentStatus === "MANUAL" ||
    subscriptionStatus === "active" ||
    subscriptionStatus === "authorized" ||
    subscriptionStatus === "manual" ||
    Boolean(overview?.company.premiumAccess);
  if (accessReleased) return false;
  return (
    paymentStatus === "PENDING" ||
    paymentStatus === "EXPIRED" ||
    paymentStatus === "DISABLED" ||
    paymentStatus === "OVERDUE" ||
    subscriptionStatus === "pending_checkout" ||
    subscriptionStatus === "expired" ||
    subscriptionStatus === "past_due" ||
    onboardingReason === "pending_checkout" ||
    onboardingReason === "trial_expired" ||
    onboardingReason === "payment_failed"
  );
}

function extractBrickToken(data: MercadoPagoBrickFormData | null | undefined) {
  return String(data?.token || data?.formData?.token || data?.cardTokenId || "").trim();
}

function extractBrickEmail(data: MercadoPagoBrickFormData | null | undefined, fallback: string) {
  return String(data?.payer?.email || data?.formData?.payer?.email || data?.cardholderEmail || fallback || "").trim();
}

function normalizeCandidate(value: unknown) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized || "";
}

function firstCandidate(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeCandidate(value);
    if (normalized) return normalized;
  }
  return "";
}

function joinName(first?: string | null, last?: string | null) {
  return [first, last].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function extractBrickCardholderName(data: MercadoPagoBrickFormData | null | undefined) {
  return firstCandidate(
    data?.cardholderName,
    data?.formData?.cardholderName,
    data?.cardholder?.name,
    data?.formData?.cardholder?.name,
    data?.payer?.name,
    joinName(data?.payer?.first_name, data?.payer?.last_name),
    data?.formData?.payer?.name,
    joinName(data?.formData?.payer?.first_name, data?.formData?.payer?.last_name),
  );
}

function extractBrickTaxDocument(data: MercadoPagoBrickFormData | null | undefined) {
  return formatTaxDocument(firstCandidate(
    data?.payer?.identification?.number,
    data?.formData?.payer?.identification?.number,
    data?.cardholder?.identification?.number,
    data?.formData?.cardholder?.identification?.number,
    data?.identificationNumber,
    data?.formData?.identificationNumber,
    data?.docNumber,
    data?.formData?.docNumber,
  ));
}

function resolveBillingActionError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.toLowerCase();
  const payload = typeof error === "object" && error && "payload" in error
    ? (error as ApiErrorWithPayload).payload
    : null;
  const code = String(payload?.code || "").trim();
  if (
    code === "MERCADO_PAGO_MASTER_NOT_LINKED" ||
    normalized.includes("configure no master") ||
    normalized.includes("token master") ||
    normalized.includes("mercado pago nao configurado") ||
    normalized.includes("mercado pago não configurado")
  ) {
    return "Pagamento temporariamente indisponível. A configuração Mercado Pago desta empresa precisa ser revisada pelo HBX.";
  }
  if (normalized.includes("property") && normalized.includes("should not exist")) {
    return "O frontend e a API de cobrança estão em versões diferentes. Publique o backend atualizado e tente novamente.";
  }
  if (
    normalized.includes("cc_val_") ||
    normalized.includes("credit card validation has failed") ||
    normalized.includes("card validation has failed")
  ) {
    return "Cartão não autorizado pelo Mercado Pago. Revise número, validade, CVV, nome e CPF do titular, ou tente outro cartão.";
  }
  if (normalized.includes("cc_rejected") || normalized.includes("rejected") || normalized.includes("unauthorized")) {
    return "Cartão recusado pelo Mercado Pago. Use outro cartão ou confirme com o banco se compras online/recorrentes estão liberadas.";
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

function clearMercadoPagoBrickContainer() {
  if (typeof document === "undefined") return;
  const root = document.getElementById(MERCADO_PAGO_BRICK_CONTAINER_ID);
  root?.replaceChildren();
}

function waitForMercadoPagoSdk(isActive: () => boolean) {
  return new Promise<Window["MercadoPago"] | null>((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (!isActive()) {
        resolve(null);
        return;
      }
      if (typeof window !== "undefined" && window.MercadoPago) {
        resolve(window.MercadoPago);
        return;
      }
      if (Date.now() - startedAt >= MERCADO_PAGO_SDK_WAIT_MS) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 250);
    };
    tick();
  });
}

function openHbxFullSupport() {
  if (typeof window === "undefined") return;
  window.open(
    `https://wa.me/${HBX_SUPPORT_PHONE}?text=${encodeURIComponent(HBX_FULL_SUPPORT_MESSAGE)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function focusMobileBrick() {
  if (typeof document === "undefined") return;
  document.getElementById(MERCADO_PAGO_BRICK_CONTAINER_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function MobilePaymentCheckoutPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFrontMock = searchParams.get("mock") === "front";
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "";
  const isMockPayments =
    process.env.NODE_ENV === "development" &&
    String(process.env.NEXT_PUBLIC_PAYMENTS_PROVIDER || "").trim().toLowerCase() === "mock";
  const initialMethod = normalizePaymentMethod(searchParams.get("method"));
  const initialStep = searchParams.get("focus") === "payment" ? "payment" : "plan";
  const brickControllerRef = useRef<MercadoPagoBrickController | null>(null);
  const brickCreatingRef = useRef(false);
  const brickRunIdRef = useRef(0);
  const cardBrickReadyRef = useRef(false);
  const [mpScriptReady, setMpScriptReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"subscription" | "checkout-pix" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(null);
  const [cardBrickWarning, setCardBrickWarning] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceiroOverview | null>(null);
  const [step, setStep] = useState<CheckoutStep>(initialStep);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<CheckoutPaymentMethod>(initialMethod);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey>("hbx_padrao");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [payerTaxDocument, setPayerTaxDocument] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [operationalRedirecting, setOperationalRedirecting] = useState(false);

  const reason = searchParams.get("reason");
  const canManageBilling = overview?.permissions?.canManageBilling !== false;
  const checkoutMode = Boolean(overview && canManageBilling && (isFrontMock || isPendingCheckout(overview, reason)));
  const selectedPlanIsAssisted = selectedPlanKey === "hbx_melhor";
  const plan = PLAN_CATALOG[selectedPlanKey];
  const total = planCycleAmount(selectedPlanKey, billingCycle);
  const monthlyTotal = planCycleAmount(selectedPlanKey, "MONTHLY");
  const annualTotal = planCycleAmount(selectedPlanKey, "ANNUAL");
  const annualMonthlyEquivalent = Number((annualTotal / 12).toFixed(2));
  const displayAmount = billingCycle === "ANNUAL" ? annualMonthlyEquivalent : monthlyTotal;
  const displayAmountLabel = billingCycle === "ANNUAL" ? "por mês no anual" : "cobrança mensal";
  const annualFormula = `${formatCurrency(monthlyTotal)} - ${ANNUAL_DISCOUNT_PERCENT}% = ${formatCurrency(annualMonthlyEquivalent)} x 12 meses = ${formatCurrency(annualTotal)}`;
  const monthlyFormula = `${formatCurrency(monthlyTotal)} x 1 mês = ${formatCurrency(monthlyTotal)}`;
  const cardFormula = billingCycle === "ANNUAL" ? annualFormula : monthlyFormula;
  const latestPixCharge = overview?.latestCharge?.paymentMethod === "PIX" ? overview.latestCharge : null;
  const profileReady = useMemo(() => {
    return (
      contactName.trim().length >= 3 &&
      normalizeBrazilPhone(contactPhone).length >= 10 &&
      isValidTaxDocument(payerTaxDocument) &&
      acceptedTerms
    );
  }, [acceptedTerms, contactName, contactPhone, payerTaxDocument]);
  const shouldRenderBrick = Boolean(
    step === "payment" &&
    checkoutPaymentMethod === "CARD" &&
    !selectedPlanIsAssisted &&
    !isFrontMock &&
    overview &&
    checkoutMode &&
    canManageBilling &&
    !isMockPayments &&
    publicKey,
  );

  useEffect(() => {
    document.body.dataset.hbxPaymentMobile = "true";
    return () => {
      delete document.body.dataset.hbxPaymentMobile;
    };
  }, []);

  useEffect(() => {
    if (!hasToken || isFrontMock) return;
    let active = true;

    apiFetch<CurrentUser>("/profile/current-user")
      .then((profile) => {
        if (!active || !isHbxOperationalCompany(profile?.company)) return;
        setOperationalRedirecting(true);
        const role = String(profile?.role || "").trim().toUpperCase();
        router.replace(role === "USER" ? "/mobile/vendas" : "/gerencial");
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [hasToken, isFrontMock, router]);

  const loadOverview = useCallback(async (background = false) => {
    if (isFrontMock) {
      setOverview(MOCK_FRONT_OVERVIEW);
      setSelectedPlanKey("hbx_padrao");
      setBillingCycle("MONTHLY");
      setContactName("Cliente Preview");
      setContactPhone(formatBrazilPhone("19997024884"));
      setPayerTaxDocument(formatTaxDocument("39053344705"));
      setPayerEmail("financeiro@hbxpreview.com");
      setCheckoutPaymentMethod(normalizePaymentMethod(searchParams.get("method")));
      setStep(searchParams.get("focus") === "payment" ? "payment" : "plan");
      setLoading(false);
      setError(null);
      return;
    }

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
        setContactName(payload.company.primaryContactName || "");
        setContactPhone(formatBrazilPhone(payload.subscription?.billingContactPhone || payload.company.contactPhone || ""));
        setPayerTaxDocument(formatTaxDocument(payload.company.taxDocument || ""));
        setPayerEmail(payload.subscription?.payerEmail || payload.company.contactEmail || "");
        setCheckoutPaymentMethod(normalizePaymentMethod(searchParams.get("method") || payload.paymentOptions.selectedMethod));
        setStep(searchParams.get("focus") === "payment" ? "payment" : "plan");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Financeiro.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [isFrontMock, reason, searchParams]);

  useEffect(() => {
    if (hasToken === true) void loadOverview();
  }, [hasToken, loadOverview]);

  useEffect(() => {
    if (isFrontMock || !checkoutMode) return;
    const timer = window.setInterval(() => {
      void loadOverview(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [checkoutMode, isFrontMock, loadOverview]);

  const buildPaymentProfile = useCallback((cardFormData?: MercadoPagoBrickFormData | null): PaymentProfile | null => {
    const cardName = extractBrickCardholderName(cardFormData);
    const cardTaxDocument = extractBrickTaxDocument(cardFormData);
    const profile = {
      contactName: (cardName || contactName || overview?.company.name || "").trim(),
      contactPhone: normalizeBrazilPhone(contactPhone),
      taxDocument: onlyDigits(cardTaxDocument || payerTaxDocument),
      payerEmail: extractBrickEmail(cardFormData, payerEmail || overview?.company.contactEmail || ""),
    };

    if (profile.contactName.length < 3) {
      setNotice({ tone: "error", title: "Nome pendente.", text: "Informe o nome completo do responsável financeiro." });
      return null;
    }
    if (profile.contactPhone.length < 10) {
      setNotice({ tone: "error", title: "Telefone pendente.", text: "Informe um telefone de contato válido." });
      return null;
    }
    if (!isValidTaxDocument(profile.taxDocument)) {
      setNotice({ tone: "error", title: "CPF/CNPJ pendente.", text: "Informe um CPF ou CNPJ válido para identificar a contratação." });
      return null;
    }
    if (!acceptedTerms) {
      setNotice({ tone: "error", title: "Autorização pendente.", text: "Autorize o uso dos dados financeiros para continuar." });
      return null;
    }

    return { ...profile, acceptedTerms: true };
  }, [acceptedTerms, contactName, contactPhone, overview?.company.contactEmail, overview?.company.name, payerEmail, payerTaxDocument]);

  const executeSubscription = useCallback(async (cardFormData: MercadoPagoBrickFormData, profile: PaymentProfile) => {
    if (selectedPlanKey === "hbx_melhor") {
      throw new Error("HBX Full exige implantação assistida com a HBX.");
    }
    const cardTokenId = extractBrickToken(cardFormData);
    const email = extractBrickEmail(cardFormData, profile.payerEmail);
    if (!cardTokenId) throw new Error("Mercado Pago não retornou token do cartão.");

    setSaving("subscription");
    setError(null);
    setNotice({
      tone: "info",
      title: isMockPayments ? "Assinatura mock." : "Cartão tokenizado.",
      text: isMockPayments ? "Enviando liberação local para o HBX." : "Enviando autorização para o HBX e Mercado Pago.",
    });

    try {
      const payload = await apiFetch<{ overview?: FinanceiroOverview; grace?: boolean; message?: string | null }>("/financeiro/subscription/create", {
        method: "POST",
        body: JSON.stringify({
          planKey: selectedPlanKey,
          billingCycle,
          cardTokenId,
          ...(email ? { payerEmail: email } : {}),
          contactName: profile.contactName,
          contactPhone: profile.contactPhone,
          taxDocument: profile.taxDocument,
          acceptedTerms: profile.acceptedTerms,
          paymentMethodId: cardFormData?.paymentMethodId || cardFormData?.formData?.paymentMethodId,
          issuerId: cardFormData?.issuerId || cardFormData?.formData?.issuerId,
        }),
      });
      if (payload?.overview) setOverview(payload.overview);
      else await loadOverview(true);
      if (payload?.grace) {
        const text = payload.message || "O Mercado Pago não autorizou a cobrança, mas o acesso segue liberado por 48 horas para normalização.";
        setNotice({ tone: "info", title: "Acesso liberado por 48h.", text });
        return;
      }
      setNotice({
        tone: "success",
        title: "Acesso liberado.",
        text: isMockPayments
          ? "A assinatura mock foi autorizada localmente."
          : "A assinatura foi autorizada no Mercado Pago. A confirmação final chega pelo webhook.",
      });
    } catch (actionError) {
      const text = resolveBillingActionError(actionError, "Não conseguimos autorizar o cartão.");
      setError(text);
      setNotice({ tone: "error", title: "Cartão não autorizado.", text });
      throw actionError;
    } finally {
      setSaving(null);
    }
  }, [billingCycle, isMockPayments, loadOverview, selectedPlanKey]);

  const submitCardPayment = useCallback((cardFormData: MercadoPagoBrickFormData) => {
    const profile = buildPaymentProfile(cardFormData);
    if (!profile) return Promise.reject(new Error("Dados financeiros pendentes."));
    setNotice({ tone: "info", title: "Cartão tokenizado.", text: "Chamando o backend do HBX para criar a assinatura." });
    return executeSubscription(cardFormData, profile);
  }, [buildPaymentProfile, executeSubscription]);

  const executeMockSubscription = useCallback(() => {
    const profile = buildPaymentProfile({
      cardholderName: contactName,
      identificationNumber: payerTaxDocument,
      cardholderEmail: payerEmail,
    });
    if (!profile) return;
    void executeSubscription({
      token: "mock-card-token",
      paymentMethodId: "mock",
      cardholderName: profile.contactName,
      cardholderEmail: profile.payerEmail,
      identificationNumber: profile.taxDocument,
    }, profile).catch(() => null);
  }, [buildPaymentProfile, contactName, executeSubscription, payerEmail, payerTaxDocument]);

  const executePixCheckout = useCallback(async () => {
    if (selectedPlanKey === "hbx_melhor") {
      openHbxFullSupport();
      return;
    }
    const profile = buildPaymentProfile();
    if (!profile) return;

    if (isFrontMock) {
      const mockCharge: NonNullable<FinanceiroOverview["latestCharge"]> = {
        id: "mock-mobile-pix",
        amount: total,
        currency: "BRL",
        description: `Assinatura ${plan.title}`,
        billingCycle,
        paymentMethod: "PIX",
        status: "pending",
        lifecycle: "pending",
        pixQrCode: "00020126580014br.gov.bcb.pix0136hbx-mobile-preview-mercadopago520400005303986540599.005802BR5903HBX6009SAO PAULO62070503***6304ABCD",
        createdAt: new Date().toISOString(),
      };
      setOverview((current) => current ? { ...current, latestCharge: mockCharge } : current);
      setNotice({
        tone: "success",
        title: "Pix gerado.",
        text: "Preview mobile gerou um Pix mock para validação visual.",
      });
      return;
    }

    setSaving("checkout-pix");
    setError(null);
    setNotice(null);
    try {
      const payload = await apiFetch<{ charge?: FinanceiroOverview["latestCharge"]; overview?: FinanceiroOverview }>("/financeiro/checkout", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "PIX",
          planKey: selectedPlanKey,
          billingCycle,
          contactName: profile.contactName,
          contactPhone: profile.contactPhone,
          taxDocument: profile.taxDocument,
          acceptedTerms: profile.acceptedTerms,
        }),
      });
      if (payload.overview) setOverview(payload.overview);
      else await loadOverview(true);
      setNotice({
        tone: "success",
        title: "Pix gerado.",
        text: "A confirmação do Mercado Pago libera o acesso automaticamente.",
      });
    } catch (actionError) {
      const text = resolveBillingActionError(actionError, "Não conseguimos gerar o Pix.");
      setError(text);
      setNotice({ tone: "error", title: "Não foi possível gerar o Pix.", text });
    } finally {
      setSaving(null);
    }
  }, [billingCycle, buildPaymentProfile, isFrontMock, loadOverview, plan.title, selectedPlanKey, total]);

  useEffect(() => {
    if (!shouldRenderBrick || !publicKey) return;
    const runId = brickRunIdRef.current + 1;
    brickRunIdRef.current = runId;
    let cancelled = false;
    let activeAttemptToken = 0;
    let retryTimer: number | null = null;
    let readyTimer: number | null = null;

    const isActive = (attemptToken?: number) =>
      !cancelled &&
      brickRunIdRef.current === runId &&
      (attemptToken === undefined || activeAttemptToken === attemptToken);

    const clearReadyTimer = () => {
      if (!readyTimer) return;
      window.clearTimeout(readyTimer);
      readyTimer = null;
    };

    const teardownBrick = () => {
      clearReadyTimer();
      brickCreatingRef.current = false;
      try {
        brickControllerRef.current?.unmount();
      } catch {
        // Mercado Pago controls its own iframe lifecycle.
      }
      brickControllerRef.current = null;
      clearMercadoPagoBrickContainer();
    };

    const scheduleRetry = (attempt: number, reasonText: string) => {
      if (!isActive()) return;
      teardownBrick();
      if (attempt >= MERCADO_PAGO_BRICK_MAX_ATTEMPTS) {
        setCardBrickWarning(reasonText);
        setNotice({ tone: "error", title: "Cartão indisponível.", text: "Não foi possível carregar o cartão Mercado Pago. Use Pix ou tente recarregar." });
        return;
      }
      setCardBrickWarning(`${reasonText} Tentando novamente (${attempt + 1}/${MERCADO_PAGO_BRICK_MAX_ATTEMPTS})...`);
      retryTimer = window.setTimeout(() => {
        void mountBrick(attempt + 1);
      }, 900 + attempt * 600);
    };

    const mountBrick = async (attempt: number) => {
      if (!isActive() || brickCreatingRef.current) return;
      const attemptToken = activeAttemptToken + 1;
      activeAttemptToken = attemptToken;
      brickCreatingRef.current = true;
      cardBrickReadyRef.current = false;
      setCardBrickWarning(attempt > 1 ? `Recarregando formulário seguro do Mercado Pago (${attempt}/${MERCADO_PAGO_BRICK_MAX_ATTEMPTS})...` : null);
      teardownBrick();
      brickCreatingRef.current = true;

      const MercadoPago = await waitForMercadoPagoSdk(() => isActive(attemptToken));
      if (!isActive(attemptToken)) return;
      if (!MercadoPago) {
        scheduleRetry(attempt, "O SDK do Mercado Pago demorou para responder.");
        return;
      }

      readyTimer = window.setTimeout(() => {
        if (!isActive(attemptToken) || cardBrickReadyRef.current) return;
        scheduleRetry(attempt, "O formulário seguro do Mercado Pago demorou para carregar.");
      }, MERCADO_PAGO_BRICK_READY_WAIT_MS);

      try {
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        const controller = await mp.bricks().create("cardPayment", MERCADO_PAGO_BRICK_CONTAINER_ID, {
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
              if (!isActive(attemptToken)) return;
              clearReadyTimer();
              brickCreatingRef.current = false;
              cardBrickReadyRef.current = true;
              setCardBrickWarning(null);
            },
            onSubmit: submitCardPayment,
            onError: (brickError: unknown) => {
              if (!isActive(attemptToken)) return;
              const text = brickError instanceof Error ? brickError.message : "Falha no formulário seguro do Mercado Pago.";
              setNotice({ tone: "error", title: "Erro no formulário do cartão.", text });
            },
          },
        });

        if (!isActive(attemptToken)) {
          try {
            controller.unmount();
          } catch {
            // ignore stale controller cleanup
          }
          return;
        }
        brickControllerRef.current = controller;
      } catch (brickError) {
        if (!isActive(attemptToken)) return;
        const text = brickError instanceof Error ? brickError.message : "Não foi possível carregar o cartão Mercado Pago.";
        scheduleRetry(attempt, text);
      }
    };

    setCardBrickWarning(null);
    void mountBrick(1);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      teardownBrick();
    };
  }, [mpScriptReady, payerEmail, publicKey, shouldRenderBrick, submitCardPayment, total]);

  const goBack = () => {
    if (step === "payment") {
      setStep(selectedPlanIsAssisted ? "plan" : "method");
      return;
    }
    if (step === "method") {
      setStep("plan");
      return;
    }
    router.push("/planos");
  };

  const primaryDisabled =
    saving !== null ||
    (step === "payment" &&
      !selectedPlanIsAssisted &&
      !profileReady) ||
    (step === "payment" &&
      checkoutPaymentMethod === "CARD" &&
      !selectedPlanIsAssisted &&
      !isFrontMock &&
      !isMockPayments &&
      !publicKey);

  const primaryLabel = (() => {
    if (step === "plan") return selectedPlanIsAssisted ? "Falar com HBX" : "Continuar";
    if (step === "method") return "Continuar";
    if (selectedPlanIsAssisted) return "Falar com HBX";
    if (checkoutPaymentMethod === "PIX") return saving === "checkout-pix" ? "Gerando Pix..." : "Gerar Pix";
    if (isFrontMock) return "Simular assinatura";
    if (isMockPayments) return saving === "subscription" ? "Liberando..." : "Liberar assinatura mock";
    return "Abrir cartão seguro";
  })();

  const handlePrimaryAction = () => {
    if (step === "plan") {
      if (selectedPlanIsAssisted) {
        openHbxFullSupport();
        return;
      }
      setStep("method");
      return;
    }
    if (step === "method") {
      setStep("payment");
      return;
    }
    if (selectedPlanIsAssisted) {
      openHbxFullSupport();
      return;
    }
    if (checkoutPaymentMethod === "PIX") {
      void executePixCheckout();
      return;
    }
    if (isFrontMock) {
      setNotice({ tone: "success", title: "Preview concluído.", text: "Fluxo de cartão validado no mock visual." });
      return;
    }
    if (isMockPayments) {
      executeMockSubscription();
      return;
    }
    focusMobileBrick();
  };

  if (operationalRedirecting) return null;

  const renderShell = (children: React.ReactNode, options?: { showSticky?: boolean }) => (
    <main className={styles.mobileShell}>
      {!isFrontMock ? (
        <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setMpScriptReady(true)} />
      ) : null}
      <div className={styles.mobilePage}>
        <header className={styles.mobileTopbar}>
          <button type="button" className={styles.backButton} aria-label="Voltar" onClick={goBack}>
            &lt;
          </button>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>HBX</span>
            <span>Pagamento</span>
          </div>
          <Link className={styles.closeButton} href="/planos" aria-label="Fechar">
            X
          </Link>
        </header>

        {children}
      </div>
      {options?.showSticky ? (
        <footer className={styles.stickyBar}>
          <div className={styles.stickySummary}>
            <span>{plan.title}</span>
            <strong>{formatCurrency(displayAmount)}</strong>
          </div>
          <button type="button" className={styles.primaryButton} disabled={primaryDisabled} onClick={handlePrimaryAction}>
            {primaryLabel}
          </button>
        </footer>
      ) : null}
    </main>
  );

  if (hasToken === null || loading) {
    return renderShell(<section className={styles.loadingCard}>Carregando checkout...</section>);
  }

  if (!hasToken) return null;

  if (!overview) {
    return renderShell(
      <section className={styles.errorCard}>
        <strong>Não foi possível carregar o pagamento.</strong>
        <p>{error || "Tente recarregar a página."}</p>
      </section>,
    );
  }

  if (!canManageBilling) {
    return renderShell(
      <section className={styles.errorCard}>
        <strong>Seu usuário não pode alterar cobrança.</strong>
        <p>{overview.permissions?.deniedMessage || "Contate seu ADMIN ou o suporte da empresa."}</p>
        <Link href="/boasvindas" className={styles.secondaryButton}>Voltar ao sistema</Link>
      </section>,
    );
  }

  if (!checkoutMode) {
    return renderShell(
      <section className={styles.resultCard}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.kicker}>Conta ativa</span>
            <h2>{overview.accountStatus.label || "Pagamento em dia"}</h2>
            <p>{overview.subscription?.nextBillingAt ? `Próxima cobrança em ${formatDate(overview.subscription.nextBillingAt)}.` : "Sua conta não exige checkout agora."}</p>
          </div>
          <span className={styles.statusPill}>OK</span>
        </div>
        <div className={styles.assistedActions}>
          <Link href="/boasvindas" className={styles.primaryButton}>Abrir sistema</Link>
          <Link href="/planos" className={styles.secondaryButton}>Ver planos</Link>
        </div>
      </section>,
    );
  }

  const stepIndex = step === "plan" ? 0 : step === "method" ? 1 : 2;

  return renderShell(
    <>
      <section className={styles.heroCard}>
        <div className={styles.heroHeader}>
          <div>
            <span className={styles.kicker}>Checkout HBX</span>
            <h1 className={styles.title}>Finalize seu plano</h1>
          </div>
          <span className={styles.securePill}>Mercado Pago</span>
        </div>
        <div className={styles.stepper} style={{ "--hbx-mobile-step": stepIndex } as React.CSSProperties}>
          <span data-active={step === "plan"}>
            <b>1</b>
            Plano
          </span>
          <span data-active={step === "method"}>
            <b>2</b>
            Método
          </span>
          <span data-active={step === "payment"}>
            <b>3</b>
            Pagamento
          </span>
        </div>
      </section>

      <div className={styles.stack}>
        {error ? (
          <section className={styles.errorCard}>
            <strong>Revise o pagamento.</strong>
            <p>{error}</p>
          </section>
        ) : null}

        {notice ? (
          <section className={styles.noticeCard} data-tone={notice.tone}>
            <strong>{notice.title}</strong>
            <p>{notice.text}</p>
          </section>
        ) : null}

        {step === "plan" ? (
          <>
            {(Object.keys(PLAN_CATALOG) as PlanKey[]).map((planKey) => {
              const item = PLAN_CATALOG[planKey];
              const active = selectedPlanKey === planKey;
              const annualActive = active && billingCycle === "ANNUAL";
              const cardDisplayAmount = annualActive ? discountedMonthlyAmount(planKey) : planCycleAmount(planKey, "MONTHLY");
              const cardDisplayLabel = annualActive ? "por mês no anual" : "cobrança mensal";
              return (
                <article
                  key={planKey}
                  className={styles.planCard}
                  data-active={active}
                  data-annual={annualActive}
                >
                  <button
                    type="button"
                    className={styles.planSelectButton}
                    onClick={() => {
                      setSelectedPlanKey(planKey);
                      setBillingCycle("MONTHLY");
                    }}
                  >
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.kicker}>{planKey === "hbx_melhor" ? "Assistido" : "Autoatendimento"}</span>
                        <h2>{item.title}</h2>
                        <p>{item.includes.slice(0, 2).join(" + ")}</p>
                      </div>
                    </div>
                    <div className={styles.priceBlock}>
                      <strong>{formatCurrency(cardDisplayAmount)}</strong>
                      <span>{cardDisplayLabel}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={styles.annualRibbon}
                    data-active={annualActive}
                    aria-label={`${annualActive ? "Remover" : "Aplicar"} 10% de desconto anual no ${item.title}`}
                    onClick={() => {
                      setSelectedPlanKey(planKey);
                      setBillingCycle(annualActive ? "MONTHLY" : "ANNUAL");
                    }}
                  >
                    <span>10%</span>
                    <small>Desconto anual</small>
                  </button>
                </article>
              );
            })}
          </>
        ) : null}

        {step === "method" ? (
          <>
            <section className={styles.formCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>{plan.title}</h2>
                  <p>{billingCycle === "ANNUAL" ? "Anual com 10% de desconto" : "Assinatura mensal"}</p>
                </div>
                <span className={styles.statusPill}>{formatCurrency(displayAmount)}</span>
              </div>
              <ul className={styles.features}>
                {plan.includes.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </section>

            <section className={styles.methodCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Método de pagamento</h2>
                  <p>Cartão cria assinatura recorrente. Pix libera após confirmação.</p>
                </div>
              </div>
              <div className={styles.methodGrid} role="group" aria-label="Método de pagamento">
                <button type="button" className={styles.methodButton} data-active={checkoutPaymentMethod === "CARD"} onClick={() => setCheckoutPaymentMethod("CARD")}>
                  <span>
                    <strong>Cartão</strong>
                    <small>Assinatura Mercado Pago</small>
                  </span>
                  <b>••••</b>
                </button>
                <button type="button" className={styles.methodButton} data-active={checkoutPaymentMethod === "PIX"} onClick={() => setCheckoutPaymentMethod("PIX")}>
                  <span>
                    <strong>Pix</strong>
                    <small>Cobrança avulsa</small>
                  </span>
                  <b>QR</b>
                </button>
              </div>
            </section>
          </>
        ) : null}

        {step === "payment" && selectedPlanIsAssisted ? (
          <section className={styles.assistedCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.kicker}>Implantação assistida</span>
                <h2>HBX Full exige configuração com a HBX</h2>
                <p>Bot, automação e atendimento completo entram por implantação acompanhada.</p>
              </div>
              <span className={styles.statusPill}>HBX Full</span>
            </div>
            <div className={styles.assistedActions}>
              <button type="button" className={styles.primaryButton} onClick={openHbxFullSupport}>Falar com HBX</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setStep("plan")}>Trocar plano</button>
            </div>
          </section>
        ) : null}

        {step === "payment" && !selectedPlanIsAssisted ? (
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2>{checkoutPaymentMethod === "PIX" ? "Dados para Pix" : "Dados para cartão"}</h2>
                <p>{checkoutPaymentMethod === "PIX" ? "O QR Code aparece depois da autorização." : "O cartão é tokenizado pelo Mercado Pago."}</p>
              </div>
              <span className={styles.statusPill}>{plan.title}</span>
            </div>

            {checkoutPaymentMethod === "CARD" ? (
              <div className={styles.paymentCardPreview} aria-label="Resumo visual do cartão">
                <div className={styles.paymentCardGlow} />
                <div className={styles.paymentCardTop}>
                  <span className={styles.paymentCardChip} aria-hidden="true" />
                  <span className={styles.paymentCardBrand}>
                    <i aria-hidden="true" />
                    <b>Mercado Pago</b>
                  </span>
                </div>
                <div className={styles.paymentCardNumber} aria-hidden="true">
                  <span>5031</span>
                  <span>7557</span>
                  <span>3453</span>
                  <span>0604</span>
                </div>
                <div className={styles.paymentCardFormula}>
                  <span>{billingCycle === "ANNUAL" ? "Resultado do anual" : "Resultado do mensal"}</span>
                  <strong>{cardFormula}</strong>
                </div>
                <div className={styles.paymentCardFooter}>
                  <span>{plan.title}</span>
                  <small>{billingCycle === "ANNUAL" ? "12 meses com desconto" : displayAmountLabel}</small>
                </div>
              </div>
            ) : null}

            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="mobile-checkout-name">
                <span>Nome completo</span>
                <input
                  id="mobile-checkout-name"
                  autoComplete="name"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Nome do responsável"
                />
              </label>
              <label className={styles.field} htmlFor="mobile-checkout-phone">
                <span>Telefone</span>
                <input
                  id="mobile-checkout-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(formatBrazilPhone(event.target.value))}
                  placeholder="(19)9 9702-4884"
                />
              </label>
              <label className={styles.field} htmlFor="mobile-checkout-document">
                <span>CPF/CNPJ</span>
                <input
                  id="mobile-checkout-document"
                  inputMode="numeric"
                  autoComplete="off"
                  value={payerTaxDocument}
                  onChange={(event) => setPayerTaxDocument(formatTaxDocument(event.target.value))}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className={styles.field} htmlFor="mobile-checkout-email">
                <span>E-mail financeiro</span>
                <input
                  id="mobile-checkout-email"
                  type="email"
                  autoComplete="email"
                  value={payerEmail}
                  onChange={(event) => setPayerEmail(event.target.value)}
                  placeholder="financeiro@empresa.com"
                />
              </label>
            </div>

            <label className={styles.termsBox} htmlFor="mobile-payment-terms">
              <input
                id="mobile-payment-terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                Autorizo o HBX a usar os dados informados para validar a contratação e suporte financeiro. Dados sensíveis do cartão permanecem tokenizados pelo Mercado Pago.
              </span>
            </label>

            {checkoutPaymentMethod === "CARD" ? (
              <>
                {isFrontMock ? (
                  null
                ) : isMockPayments ? (
                  <div className={styles.mockCard}>
                    <strong>Assinatura mock ativa.</strong>
                    <p>Este ambiente libera o acesso localmente sem abrir Mercado Pago.</p>
                  </div>
                ) : !publicKey ? (
                  <div className={styles.noticeCard} data-tone="error">
                    <strong>Cartão em configuração.</strong>
                    <p>A chave pública do Mercado Pago precisa estar ativa no frontend.</p>
                  </div>
                ) : (
                  <div id={MERCADO_PAGO_BRICK_CONTAINER_ID} className={styles.mpBrick} />
                )}

                {cardBrickWarning ? (
                  <div className={styles.noticeCard} data-tone="error">
                    <strong>Formulário do cartão não carregou.</strong>
                    <p>{cardBrickWarning}</p>
                  </div>
                ) : null}
              </>
            ) : null}

            {checkoutPaymentMethod === "PIX" && (latestPixCharge?.pixQrCodeBase64 || latestPixCharge?.pixQrCode) ? (
              <div className={styles.resultCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2>Pix Mercado Pago</h2>
                    <p>Use o QR Code ou copie o código Pix.</p>
                  </div>
                  <span className={styles.statusPill}>Aguardando</span>
                </div>
                {latestPixCharge?.pixQrCodeBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.qrImage} alt="QR Code Pix Mercado Pago" src={`data:image/png;base64,${latestPixCharge.pixQrCodeBase64}`} />
                ) : null}
                {latestPixCharge?.pixQrCode ? (
                  <div className={styles.copyArea}>
                    <textarea readOnly value={latestPixCharge.pixQrCode} aria-label="Código Pix copia e cola" />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        void navigator.clipboard?.writeText(latestPixCharge.pixQrCode || "");
                        setNotice({ tone: "success", title: "Código copiado.", text: "Código Pix copiado para a área de transferência." });
                      }}
                    >
                      Copiar código
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </>,
    { showSticky: true },
  );
}
