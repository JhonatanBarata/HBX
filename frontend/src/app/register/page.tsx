"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import PlanSelectionExperience, { type PlanSelectionCard } from "@/components/PlanSelectionExperience";
import { useRouter } from "next/navigation";
import { useHbxTheme } from "@/components/ThemeProvider";
import { getToken, setToken } from "@/app/_lib/api";
import type { CommercialPlanKey } from "@/lib/commercial-plans";
import styles from "./page.module.css";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
const LOCAL_WELCOME_PATH = "/boasvindas";
const PUBLIC_SIGNUP_ENTITY_TYPE = "PF" as const;
const EMAIL_CONFIRMATION_CHANNEL = "hbx_email_confirmation";
const EMAIL_CONFIRMATION_EVENT_KEY = "hbx_email_confirmation_event";
const CONFIRMATION_POLL_INTERVAL_MS = 4500;
const ENTERPRISE_SUPPORT_MESSAGE = "Olá, quero montar meu plano empresarial HBX para usar no notebook.";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

type SignupResponse = {
  access_token?: string;
  accessToken?: string;
  token?: string;
  status?: string;
  message?: string;
  email?: string;
  canResendConfirmation?: boolean;
  entityType?: "PF" | "PJ";
  companyName?: string;
  trialModuleSelection?: "vendas" | null;
  selectedPlanKey?: CommercialPlanKey | null;
  acquisitionSource?: string;
  warnings?: string[];
  confirmationPollToken?: string | null;
  delivery?: {
    previewUrl?: string | null;
    confirmUrl?: string | null;
    failed?: boolean;
  } | null;
  next?: string | null;
  loginNext?: string | null;
};

type ConfirmationPendingState = {
  email: string;
  message: string;
  canResendConfirmation: boolean;
  deliveryFailed: boolean;
  entityType: "PF" | "PJ" | null;
  companyName: string | null;
  selectedPlanKey: CommercialPlanKey | null;
  warnings: string[];
  confirmationPollToken: string | null;
  previewUrl: string | null;
  confirmUrl: string | null;
};

type ConfirmationStatusResponse = {
  status?: string;
  confirmed?: boolean;
  email?: string | null;
  next?: string | null;
  loginNext?: string | null;
  access_token?: string | null;
  accessToken?: string | null;
  token?: string | null;
};

type EmailConfirmationSignal = {
  type?: string;
  email?: string | null;
  status?: string | null;
  next?: string | null;
  loginNext?: string | null;
  token?: string | null;
  access_token?: string | null;
  accessToken?: string | null;
};

type TrialActivationResponse = {
  message?: string;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  next?: string | null;
};

type SignupPlan = PlanSelectionCard & {
  key: CommercialPlanKey;
};

type TrialFormState = {
  contactName: string;
  cpf: string;
  phone: string;
  acceptedTerms: boolean;
};

const SIGNUP_PLANS: SignupPlan[] = [
  {
    key: "hbx_lite",
    name: "HBX List",
    badge: "List",
    monthlyPrice: 49.9,
    detail: "Radar Digital com cards elegíveis alimentando Vendas.",
    cta: "Assinar agora",
    available: true,
    features: ["Radar Digital + Vendas", "50 cards por pesquisa", "3 pesquisas, total 150 cards", "WhatsApp externo", "Sem Atendimento interno", "Sem Night Factory"],
    note: "Cobrança imediata",
  },
  {
    key: "hbx_padrao",
    name: "HBX Lead",
    badge: "Mais escolhido",
    monthlyPrice: 89.9,
    promoPrice: 0,
    promoLabel: "Após 14 dias 89,90",
    detail: "Radar, Vendas, Atendimento interno e Night Factory.",
    cta: "Começar grátis hoje",
    available: true,
    featured: true,
    features: ["Tudo do HBX List", "Atendimento interno", "Prospecção por filtros", "Night Factory liberado", "Controle de retornos", "Sem Bot IA automático completo"],
    note: "14 dias grátis",
    trialCopy: "14 dias grátis",
  },
  {
    key: "hbx_melhor",
    name: "HBX Full — Bot e IA",
    badge: "Mais completo",
    monthlyPrice: 149.9,
    detail: "Automação completa com Bot IA, Night Factory e prospecção.",
    cta: "Escolher HBX Full",
    available: true,
    features: ["Tudo do HBX Lead", "Bot IA liberado", "Night Factory liberado", "Automação completa", "Qualificação de interessados", "Encaminhamento para humano"],
  },
];

const MOBILE_SIGNUP_PLANS: SignupPlan[] = SIGNUP_PLANS.map((plan) =>
  plan.key === "hbx_melhor"
    ? {
        ...plan,
        name: "Modo empresarial",
        badge: "Desktop",
        available: false,
        monthlyPrice: null,
        detail: "Para notebook/desktop. Bot IA, automações avançadas e atendimento consultivo.",
        cta: "Montar plano empresarial",
        trialCopy: undefined,
        promoPrice: null,
        promoLabel: undefined,
        note: "Disponível apenas no notebook",
      }
    : plan,
);

type BillingCycle = "monthly" | "annual";
type RegisterFieldIcon = "company" | "email" | "lock";

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

function getSignupErrorMessage(status: number, data: unknown) {
  const message = getErrorMessage(data);
  if (status === 409) {
    if (!message) return "Cadastro já existe. Altere e-mail, empresa ou telefone do trial para continuar.";
    const normalized = message.toLowerCase();
    if (normalized.includes("e-mail") || normalized.includes("email")) return `Conflito no e-mail: ${message}`;
    if (normalized.includes("empresa")) return `Conflito na empresa: ${message}`;
    if (normalized.includes("telefone")) return `Conflito no telefone do trial: ${message}`;
    return `Conflito no cadastro: ${message}`;
  }
  return message ?? "Erro no registro.";
}

function planName(planKey?: CommercialPlanKey | null) {
  return SIGNUP_PLANS.find((plan) => plan.key === planKey)?.name || "HBX Lead";
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
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

function getPayloadToken(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    access_token?: unknown;
    accessToken?: unknown;
    token?: unknown;
  };
  const token = payload.access_token ?? payload.accessToken ?? payload.token;
  return typeof token === "string" && token.trim() ? token : null;
}

function safeInternalPath(value?: string | null) {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function isLocalMockWelcomeEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    String(process.env.NEXT_PUBLIC_PAYMENTS_PROVIDER || "").trim().toLowerCase() === "mock"
  );
}

function localWelcomePath(reason: "trial" | "pending_checkout") {
  return `${LOCAL_WELCOME_PATH}?reason=${reason}`;
}

function isTrialSignupPlan(planKey?: CommercialPlanKey | null) {
  return planKey === "hbx_padrao";
}

function needsTrialActivationStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase() === "pending_trial_activation";
}

function trialDaysForPlan(planKey?: CommercialPlanKey | null) {
  return planKey === "hbx_padrao" ? 14 : 0;
}

function FieldIcon({ icon }: { icon: RegisterFieldIcon }) {
  if (icon === "company") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 20.2h14.4M6.5 20.2V8.8l5.5-3.5 5.5 3.5v11.4M9.2 11.1h1.4M13.4 11.1h1.4M9.2 14.5h1.4M13.4 14.5h1.4M11.9 20.2v-3.3" />
      </svg>
    );
  }

  if (icon === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 7.2h14.4v10.1H4.8z" />
        <path d="m5.3 7.7 6.7 5.2 6.7-5.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 10.4V8.3a4.5 4.5 0 0 1 9 0v2.1" />
      <path d="M6.1 10.4h11.8v8.8H6.1z" />
      <path d="M12 14.2v2.1" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.8 12s3-5.1 8.2-5.1 8.2 5.1 8.2 5.1-3 5.1-8.2 5.1S3.8 12 3.8 12Z" />
      <path d="M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z" />
      {hidden ? <path d="M5.2 19.1 18.8 4.9" /> : null}
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.9 18.2 6v4.8c0 4.1-2.4 7.4-6.2 9.3-3.8-1.9-6.2-5.2-6.2-9.3V6Z" />
      <path d="m9.4 12 1.8 1.8 3.8-4" />
    </svg>
  );
}

function TrustIcon({ type }: { type: "shield" | "building" | "server" }) {
  if (type === "building") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 20.2h14M7 20.2V7.8L12 4l5 3.8v12.4M9.3 10.7h1.2M13.5 10.7h1.2M9.3 14h1.2M13.5 14h1.2" />
      </svg>
    );
  }

  if (type === "server") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 6.3h13.6v4.7H5.2zM5.2 13h13.6v4.7H5.2z" />
        <path d="M8 8.7h.1M8 15.4h.1M11 8.7h5M11 15.4h5" />
      </svg>
    );
  }

  return <ShieldIcon />;
}

export default function RegisterPage() {
  const router = useRouter();
  const { selection } = useHbxTheme();
  const [selectedPlanKey, setSelectedPlanKey] = useState<CommercialPlanKey>("hbx_padrao");
  const [registerStep, setRegisterStep] = useState<"plans" | "form">("plans");
  const [registerSequence, setRegisterSequence] = useState<"plans-first" | "form-first">("plans-first");
  const [registerTransition, setRegisterTransition] = useState<"idle" | "selecting">("idle");
  const [mobileRegisterFlow, setMobileRegisterFlow] = useState(false);
  const billingCycle: BillingCycle = "monthly";
  const [companyName, setCompanyName] = useState("");
  const [attendantName, setAttendantName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstAccessInfo, setFirstAccessInfo] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState<ConfirmationPendingState | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [confirmationActionMessage, setConfirmationActionMessage] = useState<string | null>(null);
  const [confirmationAutoMessage, setConfirmationAutoMessage] = useState("Aguardando confirmação do e-mail...");
  const [confirmationAutoError, setConfirmationAutoError] = useState<string | null>(null);
  const [entryTransition, setEntryTransition] = useState(false);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [trialForm, setTrialForm] = useState<TrialFormState>({
    contactName: "",
    cpf: "",
    phone: "",
    acceptedTerms: false,
  });
  const autoLoginCompletedRef = useRef(false);
  const registerStepTimerRef = useRef<number | null>(null);
  const trialPhoneDigits = normalizeBrazilPhone(trialForm.phone);
  const trialCpfDigits = onlyDigits(trialForm.cpf);
  const trialFormReady =
    trialForm.contactName.trim().length >= 3 &&
    isValidCpf(trialCpfDigits) &&
    trialPhoneDigits.length >= 10 &&
    trialForm.acceptedTerms;
  const enterpriseSupportUrl = `https://wa.me/5519997024884?text=${encodeURIComponent(ENTERPRISE_SUPPORT_MESSAGE)}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("firstAccess");
      if (!raw) return;

      const payload = JSON.parse(raw) as { username?: string; message?: string };
      if (payload?.username) setUsername(String(payload.username));
      if (payload?.message) setFirstAccessInfo(String(payload.message));
      localStorage.removeItem("firstAccess");
    } catch {
      // ignore localStorage parsing errors
    }
  }, []);

  useEffect(() => {
    return () => {
      if (registerStepTimerRef.current !== null) {
        window.clearTimeout(registerStepTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const applyMobileFlow = () => {
      const isMobile = mediaQuery.matches;
      const params = new URLSearchParams(window.location.search);
      const start = params.get("start");
      const fromLogin = params.get("from") === "login";
      const sequence = start === "trial" || start === "plans" ? "plans-first" : start === "form" || fromLogin || isMobile ? "form-first" : "plans-first";
      setMobileRegisterFlow(isMobile);
      setRegisterSequence(sequence);
      setRegisterStep(start === "trial" ? "form" : sequence === "form-first" ? "form" : "plans");
      setRegisterTransition("idle");
      if (start === "trial" && getToken()) {
        setSelectedPlanKey("hbx_padrao");
        setConfirmationPending(null);
        setTrialModalOpen(true);
      }
    };
    applyMobileFlow();
    mediaQuery.addEventListener("change", applyMobileFlow);
    return () => mediaQuery.removeEventListener("change", applyMobileFlow);
  }, []);

  useEffect(() => {
    const fromLogin = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "login";
    let storedTransition = false;
    try {
      storedTransition = sessionStorage.getItem("hbx_register_transition") === "from-login";
      sessionStorage.removeItem("hbx_register_transition");
    } catch {
      storedTransition = false;
    }
    if (fromLogin || storedTransition) {
      setEntryTransition(true);
    }
  }, []);

  useEffect(() => {
    if (!confirmationPending) return;

    const pendingState = confirmationPending;
    let cancelled = false;
    let pollTimeout: number | null = null;
    let channel: BroadcastChannel | null = null;
    const pendingEmail = normalizeEmail(pendingState.email);
    const loginUsername = username.trim() || pendingEmail;
    const loginPassword = password;

    autoLoginCompletedRef.current = false;
    setConfirmationAutoMessage("Aguardando confirmação do e-mail...");
    setConfirmationAutoError(null);

    function resolveDestination(signal?: EmailConfirmationSignal | ConfirmationStatusResponse | null) {
      if (needsTrialActivationStatus(signal?.status)) {
        return "/register?start=trial";
      }
      if (isLocalMockWelcomeEnabled()) {
        return localWelcomePath(isTrialSignupPlan(pendingState.selectedPlanKey) ? "trial" : "pending_checkout");
      }
      return (
        safeInternalPath(signal?.next) ||
        safeInternalPath(signal?.loginNext) ||
        (isTrialSignupPlan(pendingState.selectedPlanKey)
          ? "/boasvindas"
          : "/pagamento?focus=payment&reason=pending_checkout")
      );
    }

    function matchesCurrentEmail(signal?: EmailConfirmationSignal | ConfirmationStatusResponse | null) {
      const signalEmail = normalizeEmail(signal?.email);
      return !signalEmail || signalEmail === pendingEmail;
    }

    async function completeAutoLogin(signal?: EmailConfirmationSignal | ConfirmationStatusResponse | null) {
      if (cancelled || autoLoginCompletedRef.current || !matchesCurrentEmail(signal)) return;
      autoLoginCompletedRef.current = true;
      setConfirmationAutoError(null);
      setConfirmationAutoMessage(
        needsTrialActivationStatus(signal?.status)
          ? "E-mail confirmado. Abrindo ativação do trial..."
          : "E-mail confirmado. Entrando automaticamente...",
      );

      const destination = resolveDestination(signal);
      const signalToken = getPayloadToken(signal);
      const existingToken = signalToken || getToken();

      if (existingToken) {
        setToken(existingToken);
        if (needsTrialActivationStatus(signal?.status)) {
          setSelectedPlanKey("hbx_padrao");
          setConfirmationPending(null);
          setTrialModalOpen(true);
          setRegisterStep("form");
          setRegisterTransition("idle");
          return;
        }
        router.replace(destination);
        return;
      }

      if (!loginPassword) {
        setConfirmationAutoError("E-mail confirmado. Use o botão de login para entrar.");
        autoLoginCompletedRef.current = false;
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: loginUsername, password: loginPassword, forceSession: true }),
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setConfirmationAutoError(getErrorMessage(data) ?? "E-mail confirmado, mas não foi possível entrar automaticamente.");
          autoLoginCompletedRef.current = false;
          return;
        }

        const token = getPayloadToken(data);
        if (!token) {
          setConfirmationAutoError("E-mail confirmado, mas o backend não retornou a sessão.");
          autoLoginCompletedRef.current = false;
          return;
        }

        setToken(token);
        if (needsTrialActivationStatus(signal?.status) || safeInternalPath((data as { next?: string | null })?.next) === "/register?start=trial") {
          setSelectedPlanKey("hbx_padrao");
          setConfirmationPending(null);
          setTrialModalOpen(true);
          setRegisterStep("form");
          setRegisterTransition("idle");
          return;
        }
        router.replace(safeInternalPath((data as { next?: string | null })?.next) || destination);
      } catch {
        setConfirmationAutoError("E-mail confirmado, mas houve falha ao conectar para entrar automaticamente.");
        autoLoginCompletedRef.current = false;
      }
    }

    function handleSignal(raw: unknown) {
      if (!raw || typeof raw !== "object") return;
      const signal = raw as EmailConfirmationSignal;
      if (signal.type && signal.type !== "hbx-email-confirmed") return;
      void completeAutoLogin(signal);
    }

    async function pollConfirmationStatus() {
      if (cancelled || autoLoginCompletedRef.current || !pendingState.confirmationPollToken) return;

      try {
        const response = await fetch(`${API_URL}/auth/email-confirmation-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollToken: pendingState.confirmationPollToken }),
        });
        const data: unknown = await response.json().catch(() => null);

        if (response.ok) {
          const payload = (data as ConfirmationStatusResponse | null) ?? null;
          if (payload?.confirmed || (payload?.status && payload.status !== "pending_email_confirmation")) {
            await completeAutoLogin(payload);
            return;
          }
        }
      } catch {
        // Keep the waiting UI calm; the e-mail link page also notifies this tab when possible.
      }

      if (!cancelled && !autoLoginCompletedRef.current) {
        pollTimeout = window.setTimeout(() => void pollConfirmationStatus(), CONFIRMATION_POLL_INTERVAL_MS);
      }
    }

    if (typeof window !== "undefined") {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(EMAIL_CONFIRMATION_CHANNEL);
        channel.onmessage = (event) => handleSignal(event.data);
      }

      const handleStorage = (event: StorageEvent) => {
        if (event.key !== EMAIL_CONFIRMATION_EVENT_KEY || !event.newValue) return;
        try {
          handleSignal(JSON.parse(event.newValue) as unknown);
        } catch {
          // ignore malformed storage events
        }
      };

      window.addEventListener("storage", handleStorage);
      pollTimeout = window.setTimeout(() => void pollConfirmationStatus(), 1200);

      return () => {
        cancelled = true;
        if (pollTimeout !== null) window.clearTimeout(pollTimeout);
        window.removeEventListener("storage", handleStorage);
        channel?.close();
      };
    }

    return () => {
      cancelled = true;
      if (pollTimeout !== null) window.clearTimeout(pollTimeout);
    };
  }, [confirmationPending, password, router, username]);

  async function resendConfirmation(targetEmail: string) {
    setConfirmationActionMessage(null);
    setResendingConfirmation(true);

    try {
      const response = await fetch(`${API_URL}/auth/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setConfirmationActionMessage(getErrorMessage(data) ?? "Não foi possível reenviar a confirmação agora.");
        return;
      }

      const payload = (data as SignupResponse | null) ?? null;
      setConfirmationPending((current) =>
        current
          ? {
              ...current,
              previewUrl:
                payload?.delivery?.previewUrl && String(payload.delivery.previewUrl).trim()
                  ? String(payload.delivery.previewUrl)
                  : current.previewUrl,
              confirmUrl:
                payload?.delivery?.confirmUrl && String(payload.delivery.confirmUrl).trim()
                  ? String(payload.delivery.confirmUrl)
                  : current.confirmUrl,
              deliveryFailed: Boolean(payload?.delivery?.failed),
              message: String(payload?.message || "").trim() || current.message,
              confirmationPollToken:
                payload?.confirmationPollToken && String(payload.confirmationPollToken).trim()
                  ? String(payload.confirmationPollToken)
                  : current.confirmationPollToken,
            }
          : current,
      );
      setConfirmationActionMessage(
        String(payload?.message || "").trim() ||
          "Se existir uma conta com confirmação pendente, enviaremos um novo link em instantes.",
      );
    } catch {
      setConfirmationActionMessage("Falha ao conectar no backend.");
    } finally {
      setResendingConfirmation(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (registerSequence === "form-first" && registerStep === "form" && !confirmationPending) {
      setError(null);
      if (password !== confirmPassword) {
        setError("As senhas não conferem.");
        return;
      }
      if (String(attendantName || "").trim().replace(/\s+/g, " ").length < 2) {
        setError("Informe o nome do atendente/vendedor.");
        return;
      }
      setRegisterTransition("selecting");
      window.setTimeout(() => {
        setRegisterStep("plans");
        setRegisterTransition("idle");
      }, 260);
      return;
    }
    await submitRegistration();
  }

  async function submitRegistration(_forceTrial = false, planKeyOverride?: CommercialPlanKey) {
    const planKey = planKeyOverride || selectedPlanKey;
    setError(null);
    setConfirmationPending(null);
    setConfirmationActionMessage(null);
    setConfirmationAutoMessage("Aguardando confirmação do e-mail...");
    setConfirmationAutoError(null);
    autoLoginCompletedRef.current = false;

    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

    try {
      const normalizedCompanyName = String(companyName || "").trim();
      const normalizedAttendantName = String(attendantName || "").trim().replace(/\s+/g, " ");
      if (normalizedAttendantName.length < 2) {
        setError("Informe o nome do atendente/vendedor.");
        setLoading(false);
        return;
      }
      const bodyPayload = {
        entityType: PUBLIC_SIGNUP_ENTITY_TYPE,
        companyName: normalizedCompanyName,
        name: normalizedAttendantName,
        selectedPlanKey: planKey,
        username: username.trim() || email.trim().toLowerCase(),
        email,
        password,
      };

      const signupRes = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const signupData: unknown = await signupRes.json().catch(() => null);

      if (!signupRes.ok) {
        setError(getSignupErrorMessage(signupRes.status, signupData));
        return;
      }

      const payload = (signupData as SignupResponse | null) ?? null;
      const token =
        (typeof payload?.access_token === "string" && payload.access_token) ||
        (typeof payload?.accessToken === "string" && payload.accessToken) ||
        (typeof payload?.token === "string" && payload.token);

      if (token) {
        setTrialModalOpen(false);
        setToken(token);
        const payloadNext = safeInternalPath(payload?.next);
        router.push(
          payloadNext ||
          (isLocalMockWelcomeEnabled()
            ? localWelcomePath(isTrialSignupPlan(planKey) ? "trial" : "pending_checkout")
            : isTrialSignupPlan(planKey)
              ? "/register?start=trial"
              : "/pagamento?focus=payment&reason=pending_checkout"),
        );
        return;
      }

      if (payload?.status === "pending_email_confirmation") {
        setTrialModalOpen(false);
        setConfirmationPending({
          email: String(payload.email || email),
          message:
            String(payload.message || "").trim() ||
            "Cadastro criado. Confirme seu e-mail para continuar.",
          canResendConfirmation: Boolean(payload.canResendConfirmation),
          deliveryFailed: Boolean(payload.delivery?.failed),
          entityType:
            payload.entityType === "PF" || payload.entityType === "PJ"
              ? payload.entityType
              : PUBLIC_SIGNUP_ENTITY_TYPE,
          companyName: payload.companyName ? String(payload.companyName) : null,
          selectedPlanKey: payload.selectedPlanKey || planKey,
          warnings: Array.isArray(payload.warnings)
            ? payload.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [],
          confirmationPollToken:
            payload.confirmationPollToken && String(payload.confirmationPollToken).trim()
              ? String(payload.confirmationPollToken)
              : null,
          previewUrl:
            payload.delivery?.previewUrl && String(payload.delivery.previewUrl).trim()
              ? String(payload.delivery.previewUrl)
              : null,
          confirmUrl:
            payload.delivery?.confirmUrl && String(payload.delivery.confirmUrl).trim()
              ? String(payload.delivery.confirmUrl)
              : null,
        });
        return;
      }

      setError(getErrorMessage(signupData) ?? "Registro não retornou um próximo passo válido.");
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  async function submitTrialRegistration() {
    if (!trialFormReady) {
      setError("Informe nome, CPF válido, telefone de contato e aceite os termos para iniciar o trial.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/activate-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          trialContactName: trialForm.contactName.trim(),
          trialTaxDocument: trialCpfDigits,
          trialContactPhone: trialPhoneDigits,
          acceptedTerms: trialForm.acceptedTerms,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(getSignupErrorMessage(response.status, data));
        return;
      }
      const payload = (data as TrialActivationResponse | null) ?? null;
      setTrialModalOpen(false);
      router.replace(safeInternalPath(payload?.next) || "/boasvindas");
    } catch {
      setError("Falha ao conectar no backend.");
    } finally {
      setLoading(false);
    }
  }

  function handlePlanSelect(planKey: CommercialPlanKey) {
    if (registerTransition === "selecting") return;
    setError(null);
    setConfirmationPending(null);
    if (mobileRegisterFlow && planKey === "hbx_melhor") {
      window.open(enterpriseSupportUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (registerStepTimerRef.current !== null) {
      window.clearTimeout(registerStepTimerRef.current);
    }
    setSelectedPlanKey(planKey);
    setError(null);
    setRegisterTransition("selecting");
    registerStepTimerRef.current = window.setTimeout(() => {
      if (registerSequence === "form-first" && registerStep === "plans") {
        setRegisterTransition("idle");
        registerStepTimerRef.current = null;
        void submitRegistration(false, planKey);
        return;
      }
      setRegisterStep("form");
      setRegisterTransition("idle");
      registerStepTimerRef.current = null;
    }, 420);
  }

  return (
    <main
      className={`login-stage ${styles.registerStage}`}
      data-login-theme={selection.themeId}
      data-login-mode={selection.mode}
      data-login-ready="true"
      data-login-surface={mobileRegisterFlow ? "hbx-mobile" : undefined}
      data-login-state="idle"
      data-login-video="off"
    >
      <Link className={styles.desktopBackButton} href="/login">
        Voltar
      </Link>
      <div className="login-stage__grid" aria-hidden />
      <div className="login-visuals" aria-hidden>
        <div className="login-side-theme login-side-theme--left">
          <span className="login-side-theme__ambient" />
          <span className="login-side-theme__helix" />
        </div>
        <div className="login-side-theme login-side-theme--right">
          <span className="login-side-theme__ambient" />
          <span className="login-side-theme__helix" />
        </div>
        <div className="login-core">
          <span className="login-core__halo" />
          <span className="login-core__pulse" />
          <span className="login-core__ring login-core__ring--outer" />
          <span className="login-core__ring login-core__ring--mid" />
          <span className="login-core__beam login-core__beam--left" />
          <span className="login-core__beam login-core__beam--right" />
        </div>
        <div className="login-drop" />
        <div className="login-drop login-drop-bottom" />
        <div className="login-drop login-drop-left" />
        <div className="login-drop login-drop-right" />
        <span className="login-meteor" style={{ left: "12%", animationDelay: "120ms" }} />
        <span className="login-meteor" style={{ left: "28%", animationDelay: "420ms" }} />
        <span className="login-meteor" style={{ left: "68%", animationDelay: "220ms" }} />
        <span className="login-meteor" style={{ left: "84%", animationDelay: "640ms" }} />
      </div>

      <div
        className={`login-console ${styles.registerConsole}`}
        data-entry-transition={entryTransition ? "from-login" : "ready"}
        data-register-step={confirmationPending ? "confirmation" : registerStep}
        data-register-transition={registerTransition}
        data-confirmation-pending={confirmationPending ? "true" : "false"}
      >
        {confirmationPending && mobileRegisterFlow ? (
          <section className={styles.mobileConfirmationWait} aria-live="polite">
            <div className={styles.mobileConfirmationLogo}>HBX</div>
            <div className={styles.mobileConfirmationText}>
              <span>Cadastro criado</span>
              <h1>Aguardando confirmação de email</h1>
              <p>{confirmationPending.email}</p>
            </div>
            <div className={styles.mobileConfirmationStatus} data-error={confirmationAutoError ? "true" : "false"}>
              {confirmationAutoError ? null : <span className={styles.autoConfirmSpinner} aria-hidden="true" />}
              <p>{confirmationAutoError || confirmationAutoMessage}</p>
            </div>
            {confirmationActionMessage ? <p className={styles.muted}>{confirmationActionMessage}</p> : null}
            {confirmationPending.canResendConfirmation ? (
              <button
                type="button"
                className="btn btn-secondary login-button"
                disabled={resendingConfirmation}
                onClick={() => void resendConfirmation(confirmationPending.email)}
              >
                {resendingConfirmation ? "Reenviando..." : "Reenviar confirmação"}
              </button>
            ) : null}
          </section>
        ) : null}

        {!confirmationPending && registerStep === "plans" ? (
        <aside className="login-side login-side--left" aria-label="Planos">
          <div className={`login-side__panel ${styles.registerPlansPanel}`}>
            <div className={styles.plansHeader}>
              <div>
                <h1>Escolha o plano ideal pro seu negócio</h1>
              </div>
            </div>
            <PlanSelectionExperience
              plans={mobileRegisterFlow ? MOBILE_SIGNUP_PLANS : SIGNUP_PLANS}
              selectedPlanKey={selectedPlanKey}
              billingCycle={billingCycle}
              mode="signup"
              onSelect={handlePlanSelect}
            />
            {mobileRegisterFlow ? (
              <a className={styles.enterpriseSupportButton} href={enterpriseSupportUrl} target="_blank" rel="noreferrer">
                Montar plano empresarial no WhatsApp
              </a>
            ) : null}
            {mobileRegisterFlow && error ? <div className="msg-error"><div className="text-sm">{error}</div></div> : null}
          </div>
        </aside>
        ) : null}

        {(!mobileRegisterFlow && confirmationPending) || (!confirmationPending && registerStep === "form") ? (
        <div className="login-shell">
          <div className={`login-card card ${styles.registerCard}`}>
            <div className="login-card__chrome" aria-hidden />

            {confirmationPending ? (
              <div className={styles.confirmation}>
                <header className="login-card__header">
                  <div className="login-card__brandBlock">
                    <div className="login-card__brandMark" aria-hidden>
                      <span className="login-card__brandMarkCore">HBX</span>
                    </div>
                    <div className="login-card__themeCopy">
                      <p className="login-card__themeLabel">Cadastro criado</p>
                      <p className="login-card__themeHint">{planName(confirmationPending.selectedPlanKey)}</p>
                    </div>
                  </div>
                  <h1 className="login-card__title">
                    {isTrialSignupPlan(confirmationPending.selectedPlanKey)
                      ? "Teste grátis pronto"
                      : "Confirme seu Email para continuar"}
                  </h1>
                  <p className="login-card__copy login-card__copy--compact">
                    {isTrialSignupPlan(confirmationPending.selectedPlanKey)
                      ? "Confirme o e-mail para ativar seu acesso."
                      : "Confirme o e-mail e siga para o checkout."}
                  </p>
                </header>

                <div className={styles.summaryBox}>
                  <div>
                    <span>E-mail</span>
                    <strong>{confirmationPending.email}</strong>
                  </div>
                </div>
                {confirmationPending.deliveryFailed ? (
                  <p className={styles.warningText}>Entrega falhou. Reenvie a confirmação.</p>
                ) : null}
                {confirmationActionMessage ? <p className={styles.muted}>{confirmationActionMessage}</p> : null}
                <div className={styles.confirmActions}>
                  {confirmationPending.canResendConfirmation ? (
                    <button
                      type="button"
                      className="btn btn-secondary login-button"
                      disabled={resendingConfirmation}
                      onClick={() => void resendConfirmation(confirmationPending.email)}
                    >
                      {resendingConfirmation ? "Reenviando..." : "Reenviar"}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-primary login-button" onClick={() => router.push("/login")}>
                    Ir para login
                  </button>
                </div>
                <div className={styles.autoConfirmStatus} data-error={confirmationAutoError ? "true" : "false"} aria-live="polite">
                  {confirmationAutoError ? null : <span className={styles.autoConfirmSpinner} aria-hidden="true" />}
                  <p>{confirmationAutoError || confirmationAutoMessage}</p>
                </div>
              </div>
            ) : (
              <>
                <header className="login-card__header">
                  <div className="login-card__themeRow">
                    <div className="page-overline login-card__overline">Cadastro seguro</div>
                  </div>
                  <div className="login-card__brandBlock">
                    <div className="login-card__brandMark" aria-hidden>
                      <span className="login-card__brandMarkCore">HBX</span>
                    </div>
                    <div className="login-card__themeCopy">
                      <p className="login-card__themeLabel">HBX</p>
                      <p className="login-card__themeHint">Acesse sua conta com segurança e continue de onde parou.</p>
                    </div>
                  </div>
                  <span className={styles.cardDivider} aria-hidden />
                  <h1 className="login-card__title">Criar conta na HBX</h1>
                  <p className="login-card__copy">Comece com segurança e teste o plano ideal para sua operação.</p>
                  {!mobileRegisterFlow ? (
                    <button
                      type="button"
                      className={styles.changePlanButton}
                      onClick={() => {
                        setError(null);
                        setRegisterStep("plans");
                      }}
                    >
                      Plano selecionado: {planName(selectedPlanKey)}. Trocar plano
                    </button>
                  ) : null}
                </header>

                <form onSubmit={handleRegister} className={`login-form ${styles.form}`}>
                  <div className="login-field">
                    <label className="login-label" htmlFor="register-company">
                      Empresa
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.fieldIcon}>
                        <FieldIcon icon="company" />
                      </span>
                      <input
                        id="register-company"
                        className="input"
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Nome da sua empresa"
                        autoComplete="organization"
                        required
                      />
                    </div>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="register-email">
                      E-mail
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.fieldIcon}>
                        <FieldIcon icon="email" />
                      </span>
                      <input
                        id="register-email"
                        className="input"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Digite seu e-mail"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="register-attendant-name">
                      Nome do atendente/vendedor
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.fieldIcon}>
                        <FieldIcon icon="company" />
                      </span>
                      <input
                        id="register-attendant-name"
                        className="input"
                        value={attendantName}
                        onChange={(event) => setAttendantName(event.target.value)}
                        placeholder="Nome que aparecerá em {{funcionario}}"
                        autoComplete="name"
                        required
                      />
                    </div>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="register-password">
                      Senha
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.fieldIcon}>
                        <FieldIcon icon="lock" />
                      </span>
                      <input
                        id="register-password"
                        className="input"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Crie uma senha segura"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className={styles.passwordToggle}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        <EyeIcon hidden={!showPassword} />
                      </button>
                    </div>
                  </div>

                  <div className="login-field">
                    <label className="login-label" htmlFor="register-confirm-password">
                      Confirmar senha
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.fieldIcon}>
                        <FieldIcon icon="lock" />
                      </span>
                      <input
                        id="register-confirm-password"
                        className="input"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirme sua senha"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className={styles.passwordToggle}
                        aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                        onClick={() => setShowConfirmPassword((current) => !current)}
                      >
                        <EyeIcon hidden={!showConfirmPassword} />
                      </button>
                    </div>
                  </div>

                  {error ? <div className="msg-error"><div className="text-sm">{error}</div></div> : null}

                  {firstAccessInfo ? (
                    <div className="msg-info">
                      <div className="text-sm">{firstAccessInfo}</div>
                    </div>
                  ) : null}

                  <button disabled={loading} className={`btn btn-primary login-button ${styles.submitButton}`}>
                    <span>
                      {registerSequence === "form-first" && registerStep === "form"
                        ? "Continuar para planos"
                        : loading
                        ? "Criando..."
                        : isTrialSignupPlan(selectedPlanKey)
                          ? "Começar 14 dias grátis"
                          : "Criar e ir ao checkout"}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>

                  <p className={styles.loginLink}>
                    Já tem conta? <Link href="/login">Entrar</Link>
                  </p>

                  <div className={styles.securityLine}>
                    <span>
                      <ShieldIcon />
                    </span>
                    Seus dados estão protegidos em conformidade com a LGPD.
                  </div>
                </form>
              </>
            )}
          </div>
          <div className={styles.trustStrip} aria-label="Garantias de segurança">
            <div>
              <TrustIcon type="shield" />
              <span>Dados protegidos<br />24/7 com criptografia</span>
            </div>
            <div>
              <TrustIcon type="building" />
              <span>Conformidade<br />LGPD</span>
            </div>
            <div>
              <TrustIcon type="server" />
              <span>Infraestrutura<br />segura e estável</span>
            </div>
          </div>
        </div>
        ) : null}
      </div>
      {trialModalOpen && typeof document !== "undefined" ? createPortal((
        <div className={styles.dialogOverlay} role="presentation">
          <section className={styles.trialDialog} role="dialog" aria-modal="true" aria-labelledby="register-trial-title">
            <header className={styles.trialDialogHeader}>
              <div>
                <span className={styles.eyebrow}>Trial {planName(selectedPlanKey)}</span>
                <h2 id="register-trial-title">Antes de liberar seus 14 dias</h2>
                <p>Precisamos confirmar um contato real. Esse telefone será o único permitido para vincular o WhatsApp durante o trial.</p>
              </div>
              <button
                type="button"
                className={styles.dialogCloseButton}
                aria-label="Fechar"
                onClick={() => setTrialModalOpen(false)}
              >
                X
              </button>
            </header>

            <div className={styles.trialFormGrid}>
              <label className={styles.trialField} htmlFor="register-trial-contact-name">
                <span>Nome completo</span>
                <input
                  id="register-trial-contact-name"
                  autoComplete="name"
                  value={trialForm.contactName}
                  onChange={(event) => setTrialForm((current) => ({ ...current, contactName: event.target.value }))}
                  placeholder="Como gostaria de ser chamado"
                />
              </label>

              <label className={styles.trialField} htmlFor="register-trial-cpf">
                <span>CPF</span>
                <input
                  id="register-trial-cpf"
                  inputMode="numeric"
                  autoComplete="off"
                  value={trialForm.cpf}
                  onChange={(event) => setTrialForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
                  placeholder="000.000.000-00"
                />
              </label>

              <label className={styles.trialField} htmlFor="register-trial-contact-phone">
                <span>Telefone de contato</span>
                <input
                  id="register-trial-contact-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={trialForm.phone}
                  onChange={(event) => setTrialForm((current) => ({ ...current, phone: formatBrazilPhone(event.target.value) }))}
                  placeholder="(19)9 9702-4884"
                />
              </label>
            </div>

            <label className={styles.termsAccept} htmlFor="register-trial-terms">
              <input
                id="register-trial-terms"
                type="checkbox"
                checked={trialForm.acceptedTerms}
                onChange={(event) => setTrialForm((current) => ({ ...current, acceptedTerms: event.target.checked }))}
              />
              <span>
                Aceito iniciar o trial gratuito de {trialDaysForPlan(selectedPlanKey)} dias do {planName(selectedPlanKey)}, sem cobrança automática agora, e autorizo o uso do CPF, nome completo e telefone informado para contato e validação de elegibilidade do trial.
                Para trocar o telefone do WhatsApp será necessário acionar o suporte.
              </span>
            </label>

            {error ? (
              <div className={`msg-error ${styles.trialError}`} role="alert">
                <div className="text-sm">{error}</div>
              </div>
            ) : null}

            <footer className={styles.trialDialogActions}>
              <button type="button" className="btn btn-secondary" onClick={() => setTrialModalOpen(false)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!trialFormReady || loading}
                onClick={() => void submitTrialRegistration()}
              >
                {loading ? "Criando..." : "Iniciar 14 dias grátis"}
              </button>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </main>
  );
}
