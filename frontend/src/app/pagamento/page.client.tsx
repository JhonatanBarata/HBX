"use client";

import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxGuide1, { type HbxGuide1Tab } from "@/components/HbxGuide1";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type BillingCycle = "MONTHLY" | "ANNUAL";
type CheckoutPaymentMethod = "CARD" | "PIX" | "BOLETO";
type PlanKey = "hbx_lite" | "hbx_padrao" | "hbx_melhor";
type PaymentConsentMethod = "CARD" | "PIX";
type FinanceiroGuideTab = "assinatura" | "cobranca" | "historico" | "cartao";

type PaymentConsentFormState = {
  contactName: string;
  cpf: string;
  phone: string;
  email: string;
  acceptedTerms: boolean;
};

type PaymentConsentEditableState = {
  contactName: boolean;
  cpf: boolean;
  phone: boolean;
};

type PaymentProfile = {
  contactName: string;
  contactPhone: string;
  taxDocument: string;
  payerEmail: string;
  acceptedTerms: true;
};

type CheckoutSubmissionContext = {
  billingCycle: BillingCycle;
  companyName: string;
  contactName: string;
  checkoutMode: boolean;
  contactPhone: string;
  payerEmail: string;
  taxDocument: string;
  selectedPlanKey: PlanKey;
  showCardUpdate: boolean;
};
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
type PendingCardSubmission = {
  formData: MercadoPagoBrickFormData;
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
};
type CardPaymentNotice = {
  tone: "info" | "success" | "error";
  title: string;
  text: string;
};
type ApiErrorWithPayload = {
  payload?: {
    code?: string | null;
  } | null;
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
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    billingGraceStartedAt?: string | null;
    billingGraceEndsAt?: string | null;
    billingGraceRemainingHours?: number | null;
    billingGraceReason?: string | null;
    billingGraceEmailStage?: number | null;
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
        create: (type: string, containerId: string, settings: Record<string, unknown>) => Promise<MercadoPagoBrickController>;
      };
    };
  }
}

const MERCADO_PAGO_BRICK_CONTAINER_ID = "mp-card-payment-brick";
const MERCADO_PAGO_BRICK_MAX_ATTEMPTS = 3;
const MERCADO_PAGO_SDK_WAIT_MS = 22000;
const MERCADO_PAGO_BRICK_READY_WAIT_MS = 24000;
const HBX_SUPPORT_PHONE = "5519997024884";
const HBX_FULL_SUPPORT_MESSAGE = "Olá, quero falar com a HBX sobre implantação assistida do HBX Full.";

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
    title: "HBX Full — implantação assistida",
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

function planCycleAmount(planKey: PlanKey, billingCycle: BillingCycle) {
  const monthly = PLAN_CATALOG[planKey].monthly;
  if (billingCycle === "ANNUAL") return Number((monthly * 12 * 0.9).toFixed(2));
  return Number(monthly.toFixed(2));
}

function openHbxFullSupport() {
  if (typeof window === "undefined") return;
  window.open(
    `https://wa.me/${HBX_SUPPORT_PHONE}?text=${encodeURIComponent(HBX_FULL_SUPPORT_MESSAGE)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function subscriptionLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "trialing") return "Free trial";
  if (normalized === "authorized") return "Autorizada";
  if (normalized === "active") return "Ativa";
  if (normalized === "grace") return "Tolerância 48h";
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

export default function FinanceiroClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const isFrontMock = searchParams.get("mock") === "front";
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "";
  const isMockPayments =
    process.env.NODE_ENV === "development" &&
    String(process.env.NEXT_PUBLIC_PAYMENTS_PROVIDER || "").trim().toLowerCase() === "mock";
  const brickControllerRef = useRef<MercadoPagoBrickController | null>(null);
  const brickCreatingRef = useRef(false);
  const brickRunIdRef = useRef(0);
  const cardBrickReadyRef = useRef(false);
  const checkoutSubmissionRef = useRef<CheckoutSubmissionContext | null>(null);
  const [mpScriptReady, setMpScriptReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [cardBrickWarning, setCardBrickWarning] = useState<string | null>(null);
  const [cardPaymentNotice, setCardPaymentNotice] = useState<CardPaymentNotice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceiroOverview | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState<FinanceiroGuideTab>("assinatura");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<CheckoutPaymentMethod>("CARD");
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey>("hbx_padrao");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [payerTaxDocument, setPayerTaxDocument] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [showCardUpdate, setShowCardUpdate] = useState(false);
  const [forceCheckout, setForceCheckout] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [paymentConsentMethod, setPaymentConsentMethod] = useState<PaymentConsentMethod | null>(null);
  const [paymentConsentForm, setPaymentConsentForm] = useState<PaymentConsentFormState>({
    contactName: "",
    cpf: "",
    phone: "",
    email: "",
    acceptedTerms: false,
  });
  const [paymentConsentEditable, setPaymentConsentEditable] = useState<PaymentConsentEditableState>({
    contactName: false,
    cpf: false,
    phone: false,
  });
  const pendingCardSubmissionRef = useRef<PendingCardSubmission | null>(null);

  const reason = searchParams.get("reason");
  const canManageBilling = overview?.permissions?.canManageBilling !== false;
  const checkoutMode = Boolean(overview && canManageBilling && (forceCheckout || isPendingCheckout(overview, reason)));
  const shouldRenderBrick = Boolean(!isFrontMock && overview && canManageBilling && !isMockPayments && publicKey && ((checkoutMode && checkoutPaymentMethod === "CARD") || showCardUpdate));
  const plan = PLAN_CATALOG[selectedPlanKey];
  const selectedPlanIsAssisted = selectedPlanKey === "hbx_melhor";
  const total = planCycleAmount(selectedPlanKey, billingCycle);
  const monthlyTotal = planCycleAmount(selectedPlanKey, "MONTHLY");
  const annualTotal = planCycleAmount(selectedPlanKey, "ANNUAL");
  const annualMonthlyEquivalent = Number((annualTotal / 12).toFixed(2));
  const renewalCycleLabel = billingCycle === "ANNUAL" ? "anual" : "mensal";
  const subscriptionLineLabel = billingCycle === "ANNUAL" ? "Assinatura anual" : "Assinatura mensal";
  const legalRenewalCopy = `Renova ${renewalCycleLabel} até cancelar. Cobraremos ${formatCurrency(total)} com base no plano selecionado e nas vagas ativas. Cancele quando quiser em Configurações. Ao assinar, você concorda com os Termos comerciais e autoriza o armazenamento e a cobrança do seu método de pagamento.`;
  const latestPixCharge = overview?.latestCharge?.paymentMethod === "PIX" ? overview.latestCharge : null;
  const paymentConsentPhoneDigits = normalizeBrazilPhone(paymentConsentForm.phone);
  const paymentConsentTaxDigits = onlyDigits(paymentConsentForm.cpf);
  const contactPhoneDigits = normalizeBrazilPhone(contactPhone);
  const pixContactReady =
    contactName.trim().length >= 3 &&
    contactPhoneDigits.length >= 10 &&
    isValidTaxDocument(payerTaxDocument);
  const paymentConsentReady =
    paymentConsentForm.contactName.trim().length >= 3 &&
    paymentConsentPhoneDigits.length >= 10 &&
    isValidTaxDocument(paymentConsentTaxDigits) &&
    paymentConsentForm.acceptedTerms;

  useEffect(() => {
    checkoutSubmissionRef.current = {
      billingCycle,
      companyName: overview?.company.name || "",
      contactName,
      checkoutMode,
      contactPhone,
      payerEmail,
      taxDocument: payerTaxDocument,
      selectedPlanKey,
      showCardUpdate,
    };
  }, [billingCycle, contactName, checkoutMode, contactPhone, overview?.company.name, payerEmail, payerTaxDocument, selectedPlanKey, showCardUpdate]);

  const loadOverview = useCallback(async (background = false) => {
    if (isFrontMock) {
      setOverview(MOCK_FRONT_OVERVIEW);
      setSelectedPlanKey("hbx_padrao");
      setBillingCycle("MONTHLY");
      setContactName("Cliente Preview");
      setContactPhone(formatBrazilPhone("19997024884"));
      setPayerTaxDocument(formatTaxDocument("39053344705"));
      setPayerEmail("financeiro@hbxpreview.com");
      setForceCheckout(true);
      setCheckoutPaymentMethod(searchParams.get("method") === "pix" ? "PIX" : "CARD");
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
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Financeiro.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [isFrontMock, reason, searchParams]);

  const openPaymentConsent = useCallback((method: PaymentConsentMethod, cardFormData?: MercadoPagoBrickFormData | null) => {
    const context = checkoutSubmissionRef.current;
    const brickName = method === "CARD" ? extractBrickCardholderName(cardFormData) : "";
    const brickTaxDocument = method === "CARD" ? extractBrickTaxDocument(cardFormData) : "";
    const nextContactName = (
      method === "CARD"
        ? brickName || context?.contactName || ""
        : context?.contactName || ""
    ).trim();
    const nextTaxDocument = formatTaxDocument(
      method === "CARD"
        ? brickTaxDocument || context?.taxDocument || ""
        : context?.taxDocument || "",
    );
    const nextPhone = formatBrazilPhone(context?.contactPhone || "");
    setPaymentConsentEditable({
      contactName: nextContactName.length < 3,
      cpf: !isValidTaxDocument(nextTaxDocument),
      phone: normalizeBrazilPhone(nextPhone).length < 10,
    });
    setPaymentConsentForm({
      contactName: nextContactName,
      cpf: nextTaxDocument,
      phone: nextPhone,
      email: context?.payerEmail || "",
      acceptedTerms: false,
    });
    setPaymentConsentMethod(method);
    setError(null);
    setPaymentActionError(null);
  }, []);

  const closePaymentConsent = useCallback(() => {
    if (paymentConsentMethod === "CARD") {
      pendingCardSubmissionRef.current?.reject(new Error("Autorização de pagamento cancelada."));
      pendingCardSubmissionRef.current = null;
    }
    setPaymentConsentMethod(null);
    setPaymentConsentForm((current) => ({ ...current, acceptedTerms: false }));
  }, [paymentConsentMethod]);

  function buildPaymentProfileFromConsent(): PaymentProfile | null {
    const nextProfile = {
      contactName: paymentConsentForm.contactName.trim(),
      contactPhone: paymentConsentPhoneDigits,
      taxDocument: paymentConsentTaxDigits,
      payerEmail: paymentConsentForm.email.trim(),
    };
    if (
      nextProfile.contactName.length < 3 ||
      nextProfile.contactPhone.length < 10 ||
      !isValidTaxDocument(nextProfile.taxDocument) ||
      !paymentConsentForm.acceptedTerms
    ) {
      return null;
    }
    return { ...nextProfile, acceptedTerms: true };
  }

  const executeSubscription = useCallback(async (cardFormData: MercadoPagoBrickFormData, profile: PaymentProfile) => {
    const context = checkoutSubmissionRef.current;
    if (!context) throw new Error("Checkout ainda não está pronto. Tente novamente.");
    if (context.selectedPlanKey === "hbx_melhor") {
      throw new Error("HBX Full exige implantação assistida com a HBX.");
    }
    const cardTokenId = extractBrickToken(cardFormData);
    const email = extractBrickEmail(cardFormData, profile.payerEmail || context.payerEmail);
    if (!cardTokenId) throw new Error("Mercado Pago não retornou token do cartão.");
    if (!profile.contactPhone) throw new Error("Informe o telefone de contato.");
    setSaving(context.showCardUpdate && !context.checkoutMode ? "change-card" : "subscription");
    setError(null);
    setPaymentActionError(null);
    setCardPaymentNotice({
      tone: "info",
      title: isMockPayments ? "Assinatura mock." : "Cartão tokenizado.",
      text: isMockPayments ? "Enviando liberação local para o HBX." : "Enviando autorização para o HBX e Mercado Pago. Aguarde a resposta.",
    });
    try {
      console.info("[HBX financeiro] Enviando assinatura para /financeiro/subscription/create.", {
        mode: context.showCardUpdate && !context.checkoutMode ? "change-card" : "subscription",
        planKey: context.selectedPlanKey,
        billingCycle: context.billingCycle,
        hasCardToken: Boolean(cardTokenId),
        hasContactPhone: Boolean(profile.contactPhone),
        hasTaxDocument: Boolean(profile.taxDocument),
      });
      const payload = context.showCardUpdate && !context.checkoutMode
        ? await apiFetch<{ overview?: FinanceiroOverview; grace?: boolean; message?: string | null }>("/financeiro/subscription/change-card", {
            method: "POST",
            body: JSON.stringify({
              cardTokenId,
              contactName: profile.contactName,
              contactPhone: profile.contactPhone,
              taxDocument: profile.taxDocument,
              acceptedTerms: profile.acceptedTerms,
            }),
          })
        : await apiFetch<{ overview?: FinanceiroOverview; grace?: boolean; message?: string | null }>("/financeiro/subscription/create", {
            method: "POST",
            body: JSON.stringify({
              planKey: context.selectedPlanKey,
              billingCycle: context.billingCycle,
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
        setCardPaymentNotice({
          tone: "info",
          title: "Acesso liberado por 48h.",
          text,
        });
        setMessage(text);
        setShowCardUpdate(false);
        setForceCheckout(false);
        return;
      }
      setCardPaymentNotice({
        tone: "success",
        title: "Acesso liberado.",
        text: context.showCardUpdate && !context.checkoutMode
          ? isMockPayments ? "O cartão mock foi atualizado." : "O cartão foi atualizado no Mercado Pago."
          : isMockPayments ? "A assinatura mock foi autorizada localmente." : "A assinatura foi autorizada no Mercado Pago. A cobrança recorrente será confirmada pelo webhook do provedor.",
      });
      setMessage(context.showCardUpdate && !context.checkoutMode
        ? isMockPayments ? "Cartão mock atualizado." : "Cartão atualizado no Mercado Pago."
        : isMockPayments ? "Acesso liberado. Assinatura mock autorizada." : "Acesso liberado. Assinatura autorizada no Mercado Pago.");
      setShowCardUpdate(false);
      setForceCheckout(false);
    } catch (actionError) {
      const text = resolveBillingActionError(actionError, "Não conseguimos autorizar o cartão.");
      setError(text);
      setPaymentActionError(text);
      setCardPaymentNotice({
        tone: "error",
        title: "Cartão não autorizado.",
        text,
      });
      throw actionError;
    } finally {
      setSaving(null);
    }
  }, [
    isMockPayments,
    loadOverview,
  ]);

  const executeMockSubscription = useCallback(() => {
    const context = checkoutSubmissionRef.current;
    if (!context) {
      setPaymentActionError("Checkout ainda não está pronto. Recarregue a página e tente novamente.");
      return;
    }
    const profile: PaymentProfile = {
      contactName: (context.contactName || context.companyName || "Cliente HBX").trim(),
      contactPhone: normalizeBrazilPhone(context.contactPhone) || "19997024884",
      taxDocument: onlyDigits(context.taxDocument) || "39053344705",
      payerEmail: context.payerEmail,
      acceptedTerms: true,
    };
    void executeSubscription({
      token: "mock-card-token",
      paymentMethodId: "mock",
      cardholderName: profile.contactName,
      cardholderEmail: profile.payerEmail,
      identificationNumber: profile.taxDocument,
    }, profile).catch(() => null);
  }, [executeSubscription]);

  const submitSubscription = useCallback((cardFormData: MercadoPagoBrickFormData) => {
    const context = checkoutSubmissionRef.current;
    if (!context) {
      const message = "Checkout ainda não está pronto. Recarregue a página e tente novamente.";
      setPaymentActionError(message);
      setCardPaymentNotice({ tone: "error", title: "Checkout indisponível.", text: message });
      return Promise.reject(new Error(message));
    }

    const cardholderName = extractBrickCardholderName(cardFormData);
    const taxDocument = onlyDigits(extractBrickTaxDocument(cardFormData) || context.taxDocument);
    const profile: PaymentProfile = {
      contactName: (cardholderName || context.contactName || context.companyName || "").trim(),
      contactPhone: normalizeBrazilPhone(context.contactPhone),
      taxDocument,
      payerEmail: extractBrickEmail(cardFormData, context.payerEmail),
      acceptedTerms: true,
    };

    if (profile.contactPhone.length < 10) {
      const message = "Informe o telefone de contato antes de pagar com cartão.";
      setPaymentActionError(message);
      setCardPaymentNotice({ tone: "error", title: "Telefone pendente.", text: message });
      console.warn("[HBX financeiro] Pagamento por cartão bloqueado: telefone ausente.");
      return Promise.reject(new Error(message));
    }

    if (profile.contactName.length < 3 || !isValidTaxDocument(profile.taxDocument)) {
      const message = "O Mercado Pago não retornou nome e CPF/CNPJ válidos do titular. Revise os campos do formulário do cartão e tente novamente.";
      setPaymentActionError(message);
      setCardPaymentNotice({ tone: "error", title: "Dados do titular pendentes.", text: message });
      console.warn("[HBX financeiro] Pagamento por cartão bloqueado: dados do titular ausentes no Brick.", {
        hasContactName: profile.contactName.length >= 3,
        hasValidTaxDocument: isValidTaxDocument(profile.taxDocument),
      });
      return Promise.reject(new Error(message));
    }

    setPaymentActionError(null);
    setCardPaymentNotice({
      tone: "info",
      title: "Cartão tokenizado.",
      text: "Chamando o backend do HBX para criar a assinatura.",
    });
    console.info("[HBX financeiro] Cartão tokenizado. Chamando /financeiro/subscription/create.");
    return executeSubscription(cardFormData, profile);
  }, [executeSubscription]);

  const executeOneOffCheckout = useCallback(async (paymentMethod: Exclude<CheckoutPaymentMethod, "CARD">, profile: PaymentProfile) => {
    const context = checkoutSubmissionRef.current;
    if (!context) throw new Error("Checkout ainda não está pronto. Tente novamente.");
    if (context.selectedPlanKey === "hbx_melhor") {
      throw new Error("HBX Full exige implantação assistida com a HBX.");
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
          planKey: context.selectedPlanKey,
          billingCycle: context.billingCycle,
          contactName: profile.contactName,
          contactPhone: profile.contactPhone,
          taxDocument: profile.taxDocument,
          acceptedTerms: profile.acceptedTerms,
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
  }, [loadOverview]);

  async function confirmPaymentConsent() {
    const profile = buildPaymentProfileFromConsent();
    if (!profile || !paymentConsentMethod) {
      setPaymentActionError("Informe nome completo, telefone, CPF/CNPJ e aceite a autorização para continuar.");
      return;
    }

    setContactName(profile.contactName);
    setContactPhone(formatBrazilPhone(profile.contactPhone));
    setPayerTaxDocument(formatTaxDocument(profile.taxDocument));
    if (profile.payerEmail) setPayerEmail(profile.payerEmail);

    const method = paymentConsentMethod;
    const pendingCardSubmission = pendingCardSubmissionRef.current;
    setPaymentConsentMethod(null);
    setPaymentConsentForm((current) => ({ ...current, acceptedTerms: false }));

    if (method === "CARD" && pendingCardSubmission) {
      try {
        await executeSubscription(pendingCardSubmission.formData, profile);
        pendingCardSubmission.resolve({ ok: true });
      } catch (actionError) {
        pendingCardSubmission.reject(actionError);
      } finally {
        pendingCardSubmissionRef.current = null;
      }
      return;
    }

    if (method === "CARD" && isMockPayments) {
      await executeSubscription({
        token: "mock-card-token",
        paymentMethodId: "mock",
        cardholderName: profile.contactName,
        cardholderEmail: profile.payerEmail,
        identificationNumber: profile.taxDocument,
      }, profile);
      return;
    }

    if (method === "PIX") {
      await executeOneOffCheckout("PIX", profile);
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

  useEffect(() => {
    if (hasToken === true) void loadOverview();
  }, [hasToken, loadOverview]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (isFrontMock || !checkoutMode) return;
    const timer = window.setInterval(() => {
      void loadOverview(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [checkoutMode, isFrontMock, loadOverview]);

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

    const scheduleRetry = (attempt: number, reason: string) => {
      if (!isActive()) return;
      teardownBrick();
      if (attempt >= MERCADO_PAGO_BRICK_MAX_ATTEMPTS) {
        setCardBrickWarning(reason);
        setError("Não foi possível carregar o cartão Mercado Pago. Tente recarregar a página ou use Pix.");
        return;
      }
      setCardBrickWarning(`${reason} Tentando novamente (${attempt + 1}/${MERCADO_PAGO_BRICK_MAX_ATTEMPTS})...`);
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
      setError(null);
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
              email: checkoutSubmissionRef.current?.payerEmail || undefined,
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
            onSubmit: (cardFormData: MercadoPagoBrickFormData) => {
              console.info("[HBX financeiro] Mercado Pago Brick onSubmit disparou.", {
                hasToken: Boolean(extractBrickToken(cardFormData)),
                paymentMethodId: cardFormData?.paymentMethodId || cardFormData?.formData?.paymentMethodId || null,
                issuerId: cardFormData?.issuerId || cardFormData?.formData?.issuerId || null,
              });
              return submitSubscription(cardFormData);
            },
            onError: (brickError: unknown) => {
              if (!isActive(attemptToken)) return;
              const text = brickError instanceof Error ? brickError.message : "Falha no formulário seguro do Mercado Pago.";
              console.error("[HBX financeiro] Mercado Pago Brick onError.", brickError);
              setCardPaymentNotice({
                tone: "error",
                title: "Erro no formulário do cartão.",
                text,
              });
              setError(text);
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
        scheduleRetry(attempt, `${text}`);
      }
    };

    setError(null);
    setCardBrickWarning(null);
    void mountBrick(1);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      teardownBrick();
    };
  }, [shouldRenderBrick, mpScriptReady, publicKey, total, submitSubscription]);

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Financeiro" description="Carregando visão financeira da conta." hideHeader>
        <section className={styles.loadingCard}>Carregando...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  if (!loading && overview && !canManageBilling) {
    return (
      <DashboardScaffold title="Financeiro" description="Acesso financeiro restrito ao ADMIN." hideHeader>
        <div className={styles.page}>
          <section className={styles.errorCard}>
            <strong>Seu usuário não pode alterar cobrança.</strong>
            <p className={styles.helperText}>
              {overview.permissions?.deniedMessage || "Seu usuário não pode alterar cobrança. Contate seu ADMIN ou o suporte da empresa."}
            </p>
            <Link href="/boasvindas" className="btn btn-secondary btn-sm">Voltar ao sistema</Link>
          </section>
        </div>
      </DashboardScaffold>
    );
  }

  if (loading || !overview) {
    return (
      <DashboardScaffold title="Financeiro" description="Carregando visão financeira da conta." hideHeader>
        <section className={styles.loadingCard}>Carregando painel financeiro...</section>
      </DashboardScaffold>
    );
  }

  const changePlanHref = "/planos?mode=pending_checkout&reason=change_plan";

  const assistedCheckout = (
    <div className={`${styles.page} ${styles.checkoutPage}`}>
      <section className={styles.checkoutShell}>
        <article className={styles.checkoutMain}>
          <div className={styles.checkoutHero}>
            <div className={styles.checkoutLogo} aria-hidden="true">HBX</div>
            <div>
              <span className={styles.eyebrow}>Venda assistida</span>
              <h1 className={styles.checkoutTitle}>HBX Full — implantação assistida</h1>
              <p className={styles.heroText}>Bot, automação e atendimento completo exigem configuração com a HBX.</p>
            </div>
          </div>
          <div className={styles.checkoutFactsGrid} aria-label="Implantação HBX Full">
            <div>
              <span>Plano</span>
              <strong>HBX Full</strong>
              <small>Automação completa</small>
            </div>
            <div>
              <span>Modelo</span>
              <strong>Assistido</strong>
              <small>Configuração HBX</small>
            </div>
            <div>
              <span>Próximo passo</span>
              <strong>Falar com HBX</strong>
              <small>Sem compra automática</small>
            </div>
          </div>
          <div className={styles.alternativePaymentPanel}>
            <div>
              <strong>Falar com HBX</strong>
              <p>Vamos configurar bot, automação e atendimento completo com segurança.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openHbxFullSupport}>
              Falar com HBX
            </button>
          </div>
          <Link href="/planos" className={styles.changePlanButton}>Voltar aos planos List e Lead</Link>
        </article>
      </section>
    </div>
  );

  const checkout = selectedPlanIsAssisted ? assistedCheckout : (
    <div className={`${styles.page} ${styles.checkoutPage}`}>
      <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setMpScriptReady(true)} />
      {error ? <section className={styles.errorCard}>{error}</section> : null}
      {message ? <section className={styles.successCard}>{message}</section> : null}

      <section className={styles.checkoutShell}>
        <header className={styles.checkoutTopbar}>
          <Link href={changePlanHref} className={styles.checkoutBackLink} aria-label="Voltar para planos">&lt;</Link>
          <h1 className={styles.checkoutTitle}>Configure o seu plano</h1>
        </header>
        <article className={styles.checkoutMain}>
          <div className={styles.checkoutCompactGrid}>
            <div className={styles.checkoutLeftRail}>
              <section className={styles.checkoutSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Detalhes do plano</strong>
                  </div>
                </div>
                <div className={styles.cycleCards} role="group" aria-label="Ciclo de cobrança">
                  <button type="button" data-active={billingCycle === "MONTHLY"} onClick={() => setBillingCycle("MONTHLY")}>
                    <span className={styles.cycleName}>Faturamento mensal</span>
                    <strong>{formatCurrency(monthlyTotal)}/mês</strong>
                  </button>
                  <button type="button" data-active={billingCycle === "ANNUAL"} onClick={() => setBillingCycle("ANNUAL")}>
                    <span className={styles.cycleName}>Faturamento anual</span>
                    <span className={styles.discountBadge}>Salvar 10%</span>
                    <strong>{formatCurrency(annualMonthlyEquivalent)}/mês</strong>
                  </button>
                </div>
              </section>

              <div className={styles.checkoutPlanLine} aria-label="Plano escolhido">
                <span>{plan.title}</span>
                <strong>{formatCurrency(total)}</strong>
                <Link href={changePlanHref}>Trocar plano</Link>
              </div>

              <section className={styles.checkoutSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Informações de contato</strong>
                  </div>
                </div>
                <label className={styles.field} htmlFor="checkout-contact-email">
                  <span className={styles.fieldLabel}>E-mail</span>
                  <input
                    id="checkout-contact-email"
                    className={styles.fieldInput}
                    autoComplete="email"
                    value={payerEmail}
                    onChange={(event) => setPayerEmail(event.target.value)}
                    placeholder="email@empresa.com"
                  />
                </label>
              </section>
            </div>

            <div className={styles.checkoutPaymentRail}>
          <section className={styles.checkoutSection}>
            <div className={styles.sectionHeader}>
              <div>
                <strong>Pagamento</strong>
              </div>
              <span className={styles.statusPill}>Mercado Pago</span>
            </div>
            <div className={styles.paymentMethodGrid} role="group" aria-label="Método de pagamento">
              <button type="button" data-active={checkoutPaymentMethod === "CARD"} onClick={() => setCheckoutPaymentMethod("CARD")}>
                <span>Cartão</span>
              </button>
              <button type="button" data-active={checkoutPaymentMethod === "PIX"} onClick={() => setCheckoutPaymentMethod("PIX")}>
                <span>Pix</span>
              </button>
            </div>
          </section>

          {checkoutPaymentMethod === "CARD" ? (
            <section className={styles.securePaymentBox}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Cartão</strong>
                </div>
                <span className={styles.statusPill}>Recorrente</span>
              </div>
              <div className={styles.cardTokenPanel}>
                <div className={styles.cardExperience}>
                  <div className={styles.cardPaymentStack}>
                    <div className={styles.paymentDataBox}>
                      <div>
                        <strong>Contato financeiro</strong>
                      </div>
                      <label className={styles.field} htmlFor="checkout-card-contact-phone">
                        <span className={styles.fieldLabel}>Telefone de contato</span>
                        <input
                          id="checkout-card-contact-phone"
                          className={styles.fieldInput}
                          inputMode="tel"
                          autoComplete="tel"
                          value={contactPhone}
                          onChange={(event) => setContactPhone(formatBrazilPhone(event.target.value))}
                          placeholder="(19)9 9702-4884"
                        />
                      </label>
                    </div>
                    {isFrontMock ? (
                      <div className={styles.setupNotice}>
                        <strong>Preview do formulário de cartão.</strong>
                        <p>Número do cartão</p>
                        <input className={styles.fieldInput} readOnly value="5031 7557 3453 0604" />
                        <p>Nome impresso</p>
                        <input className={styles.fieldInput} readOnly value="CLIENTE PREVIEW" />
                        <p>Validade e CVV</p>
                        <div className={styles.paymentDataGrid}>
                          <input className={styles.fieldInput} readOnly value="11/30" />
                          <input className={styles.fieldInput} readOnly value="123" />
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" disabled>
                          Assinar com cartão
                        </button>
                      </div>
                    ) : isMockPayments ? (
                      <div className={styles.setupNotice}>
                        <strong>Assinatura mock ativa.</strong>
                        <p>Este ambiente libera o acesso localmente sem abrir Mercado Pago.</p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={saving === "subscription"}
                          onClick={executeMockSubscription}
                        >
                          {saving === "subscription" ? "Liberando..." : "Liberar assinatura mock"}
                        </button>
                      </div>
                    ) : !publicKey ? (
                      <div className={styles.setupNotice}>
                        <strong>Cartão em configuração neste ambiente.</strong>
                        <p>A chave pública do Mercado Pago precisa estar ativa no frontend para exibir o formulário seguro. Pix segue disponível para este ciclo.</p>
                      </div>
                    ) : (
                      <div id="mp-card-payment-brick" className={styles.mpBrick} />
                    )}
                  </div>
                </div>
                {cardBrickWarning ? (
                  <div className={styles.setupNotice}>
                    <strong>Formulário do cartão não carregou.</strong>
                    <p>{cardBrickWarning}</p>
                  </div>
                ) : null}
                {cardPaymentNotice ? (
                  <div className={styles.cardPaymentNotice} data-tone={cardPaymentNotice.tone}>
                    <strong>{cardPaymentNotice.title}</strong>
                    <p>{cardPaymentNotice.text}</p>
                  </div>
                ) : null}
                {paymentActionError && checkoutPaymentMethod === "CARD" ? (
                  <div className={styles.setupNotice}>
                    <strong>Não foi possível concluir pelo cartão.</strong>
                    <p>{paymentActionError}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {checkoutPaymentMethod === "PIX" ? (
            <section className={styles.securePaymentBox}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Pix</strong>
                </div>
                <span className={styles.statusPill}>Avulso</span>
              </div>
              <div className={styles.paymentDataBox}>
                <div>
                  <strong>Dados do pagador</strong>
                </div>
                <div className={styles.paymentDataGrid}>
                  <label className={styles.field} htmlFor="checkout-pix-contact-name">
                    <span className={styles.fieldLabel}>Nome completo</span>
                    <input
                      id="checkout-pix-contact-name"
                      className={styles.fieldInput}
                      autoComplete="name"
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      placeholder="Nome completo"
                    />
                  </label>
                  <label className={styles.field} htmlFor="checkout-pix-contact-phone">
                    <span className={styles.fieldLabel}>Telefone de contato</span>
                    <input
                      id="checkout-pix-contact-phone"
                      className={styles.fieldInput}
                      inputMode="tel"
                      autoComplete="tel"
                      value={contactPhone}
                      onChange={(event) => setContactPhone(formatBrazilPhone(event.target.value))}
                      placeholder="(19)9 9702-4884"
                    />
                  </label>
                  <label className={styles.field} htmlFor="checkout-pix-tax-document">
                    <span className={styles.fieldLabel}>CPF/CNPJ</span>
                    <input
                      id="checkout-pix-tax-document"
                      className={styles.fieldInput}
                      inputMode="numeric"
                      autoComplete="off"
                      value={payerTaxDocument}
                      onChange={(event) => setPayerTaxDocument(formatTaxDocument(event.target.value))}
                      placeholder="000.000.000-00"
                    />
                  </label>
                </div>
              </div>
              <div className={styles.alternativePaymentPanel}>
                <div>
                  <strong>{formatCurrency(total)}</strong>
                  <p>Liberação após confirmação.</p>
                </div>
                <button type="button" className="btn btn-primary" disabled={!pixContactReady || saving === "checkout-pix"} onClick={() => openPaymentConsent("PIX")}>
                  {saving === "checkout-pix" ? "Gerando Pix..." : "Gerar Pix"}
                </button>
              </div>
              {latestPixCharge?.pixQrCodeBase64 || latestPixCharge?.pixQrCode ? (
                <div className={styles.pixResult}>
                  {latestPixCharge?.pixQrCodeBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
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

            </div>
          </div>
        </article>
        <aside className={styles.checkoutSummaryPanel} aria-label="Resumo do plano">
          <div>
            <h2 className={styles.summaryPlan}>{plan.title}</h2>
            <p className={styles.summarySupport}>Principais recursos</p>
          </div>
          <ul className={styles.summaryFeatures}>
            {plan.includes.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryRows}>
            <div>
              <span>{subscriptionLineLabel}</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <div>
              <span>Imposto estimado</span>
              <strong>{formatCurrency(0)}</strong>
            </div>
            <div data-total="true">
              <span>A pagar hoje</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
          {billingCycle === "ANNUAL" ? (
            <p className={styles.annualSavings}>
              Você economiza {formatCurrency((monthlyTotal * 12) - annualTotal)} por ano ao escolher o plano anual.
            </p>
          ) : null}
          <p className={styles.checkoutLegalCopy}>
            {legalRenewalCopy.split("Termos comerciais")[0]}
            <Link href="/termos-comerciais" target="_blank">Termos comerciais</Link>
            {legalRenewalCopy.split("Termos comerciais")[1]}
          </p>
        </aside>
      </section>
    </div>
  );

  if (checkoutMode) {
    return (
      <DashboardScaffold title="Finalize sua contratação" description="Confirme plano, contato e cartão seguro." hideHeader>
        {checkout}
      </DashboardScaffold>
    );
  }

  const activeSubscription = overview.subscription;
  const canCancel = ["active", "authorized", "past_due"].includes(String(activeSubscription?.status || "").toLowerCase());
  const guideTabs: Array<HbxGuide1Tab<FinanceiroGuideTab>> = [
    { key: "assinatura", label: "Assinatura", badge: subscriptionLabel(overview.company.subscriptionStatus) },
    { key: "cobranca", label: "Cobrança", badge: formatCurrency(overview.pricing.finalCycleAmount) },
    { key: "historico", label: "Histórico", badge: overview.history.length },
    { key: "cartao", label: "Cartão", badge: overview.paymentOptions.card.last4 || "-" },
  ];

  function handleGuideChange(tab: FinanceiroGuideTab) {
    setActiveGuideTab(tab);
    if (tab === "cartao" && activeSubscription?.providerPreapprovalId) {
      setShowCardUpdate(true);
    }
  }

  return (
    <DashboardScaffold title="Financeiro" description="Assinatura, status de acesso e pagamentos recentes." hideHeader>
      <div className={styles.page}>
        {!isMockPayments ? (
          <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setMpScriptReady(true)} />
        ) : null}
        {error ? <section className={styles.errorCard}>{error}</section> : null}
        {message ? <section className={styles.successCard}>{message}</section> : null}

        <div className="hbx-guide1-slot">
          <HbxGuide1 tabs={guideTabs} activeKey={activeGuideTab} ariaLabel="Financeiro" onChange={handleGuideChange} />
        </div>

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
            {isMockPayments ? (
              <div className={styles.setupNotice}>
                <strong>Cartão mock ativo.</strong>
                <p>Este ambiente atualiza o cartão localmente sem abrir Mercado Pago.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saving === "change-card"}
                  onClick={executeMockSubscription}
                >
                  {saving === "change-card" ? "Atualizando..." : "Atualizar cartão mock"}
                </button>
              </div>
            ) : !publicKey ? (
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

        {paymentConsentMethod ? (
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="payment-consent-title">
            <section className={`${styles.modalCard} ${styles.paymentConsentCard}`}>
              <header className={styles.paymentConsentHeader}>
                <div>
                  <span className={styles.eyebrow}>{paymentConsentMethod === "CARD" ? "Cartão Mercado Pago" : "Pix Mercado Pago"}</span>
                  <h2 id="payment-consent-title">Autorizar dados de pagamento</h2>
                  <p>
                    Antes de continuar, confirme os dados que o HBX vai salvar internamente para contato,
                    suporte e identificação da contratação. O número do cartão e o código de segurança continuam protegidos pelo Mercado Pago.
                  </p>
                </div>
                <button type="button" className={styles.dialogCloseButton} aria-label="Fechar" onClick={closePaymentConsent}>
                  X
                </button>
              </header>

              <div className={styles.paymentConsentSummary}>
                <div>
                  <span>Nome</span>
                  <strong>{paymentConsentForm.contactName || "Pendente"}</strong>
                </div>
                <div>
                  <span>Telefone</span>
                  <strong>{paymentConsentForm.phone || "Pendente"}</strong>
                </div>
                <div>
                  <span>CPF/CNPJ</span>
                  <strong>{paymentConsentForm.cpf || "Pendente"}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{paymentConsentForm.email || "Conta HBX"}</strong>
                </div>
              </div>

              {paymentConsentEditable.contactName || paymentConsentEditable.phone || paymentConsentEditable.cpf ? (
                <div className={styles.paymentConsentGrid}>
                  {paymentConsentEditable.contactName ? (
                    <label className={styles.field} htmlFor="payment-consent-name">
                      <span className={styles.fieldLabel}>Nome completo</span>
                      <input
                        id="payment-consent-name"
                        className={styles.fieldInput}
                        autoComplete="name"
                        value={paymentConsentForm.contactName}
                        onChange={(event) => setPaymentConsentForm((current) => ({ ...current, contactName: event.target.value }))}
                        placeholder="Nome completo do responsável"
                      />
                    </label>
                  ) : null}

                  {paymentConsentEditable.phone ? (
                    <label className={styles.field} htmlFor="payment-consent-phone">
                      <span className={styles.fieldLabel}>Telefone de contato</span>
                      <input
                        id="payment-consent-phone"
                        className={styles.fieldInput}
                        inputMode="tel"
                        autoComplete="tel"
                        value={paymentConsentForm.phone}
                        onChange={(event) => setPaymentConsentForm((current) => ({ ...current, phone: formatBrazilPhone(event.target.value) }))}
                        placeholder="(19)9 9702-4884"
                      />
                    </label>
                  ) : null}

                  {paymentConsentEditable.cpf ? (
                    <label className={styles.field} htmlFor="payment-consent-cpf">
                      <span className={styles.fieldLabel}>CPF/CNPJ</span>
                      <input
                        id="payment-consent-cpf"
                        className={styles.fieldInput}
                        inputMode="numeric"
                        autoComplete="off"
                        value={paymentConsentForm.cpf}
                        onChange={(event) => setPaymentConsentForm((current) => ({ ...current, cpf: formatTaxDocument(event.target.value) }))}
                        placeholder="000.000.000-00"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <label className={styles.paymentConsentTerms} htmlFor="payment-consent-terms">
                <input
                  id="payment-consent-terms"
                  type="checkbox"
                  checked={paymentConsentForm.acceptedTerms}
                  onChange={(event) => setPaymentConsentForm((current) => ({ ...current, acceptedTerms: event.target.checked }))}
                />
                <span>
                  Autorizo o HBX a usar nome completo, telefone, CPF/CNPJ e e-mail informados para contato,
                  validação da contratação e suporte financeiro deste pagamento. Entendo que dados sensíveis do cartão
                  permanecem tokenizados pelo Mercado Pago e não são armazenados pelo HBX.
                </span>
              </label>

              {paymentActionError ? (
                <div className={styles.setupNotice}>
                  <strong>Revise os dados antes de continuar.</strong>
                  <p>{paymentActionError}</p>
                </div>
              ) : null}

              <div className={styles.formActions}>
                <button type="button" className="btn btn-secondary" onClick={closePaymentConsent}>Voltar</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!paymentConsentReady || saving === "subscription" || saving === "checkout-pix"}
                  onClick={() => void confirmPaymentConsent()}
                >
                  {saving === "subscription" || saving === "checkout-pix"
                    ? "Processando..."
                    : paymentConsentMethod === "CARD"
                      ? "Autorizar cartão"
                      : "Gerar Pix autorizado"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

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
