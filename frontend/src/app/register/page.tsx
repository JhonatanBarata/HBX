"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";
import type { CommercialPlanKey } from "@/lib/commercial-plans";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const PUBLIC_SIGNUP_ENTITY_TYPE = "PF" as const;

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
  delivery?: {
    previewUrl?: string | null;
    confirmUrl?: string | null;
    failed?: boolean;
  } | null;
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
  previewUrl: string | null;
  confirmUrl: string | null;
};

type SignupPlan = {
  key: CommercialPlanKey;
  name: string;
  badge: string;
  monthlyPrice: number;
  detail: string;
  cta: string;
  available: boolean;
  featured?: boolean;
  features: string[];
  note: string;
  trialCopy?: string;
};

const SIGNUP_PLANS: SignupPlan[] = [
  {
    key: "hbx_lite",
    name: "HBX Lite",
    badge: "Essencial",
    monthlyPrice: 29.9,
    detail: "Para começar com uma rotina comercial mais organizada.",
    cta: "Escolher Lite",
    available: true,
    features: ["Vendas organizadas", "Motores gratuitos/HBX/cache", "Gestão simples para começar"],
    note: "Pagamento apenas no checkout/Financeiro.",
  },
  {
    key: "hbx_padrao",
    name: "HBX Padrão",
    badge: "Mais escolhido",
    monthlyPrice: 79.9,
    detail: "Teste o plano completo para vendas e atendimento sem pagar agora.",
    cta: "Começar grátis hoje",
    available: true,
    featured: true,
    features: ["1º mês grátis", "Vendas + Atendimento Chat", "2 buscas Google por dia", "Motores gratuitos/HBX/cache", "Ideal para começar com mais força"],
    note: "Sem cobrança agora. Sem cartão no cadastro.",
    trialCopy: "Teste grátis por 30 dias",
  },
  {
    key: "hbx_melhor",
    name: "HBX Melhor",
    badge: "Mais completo",
    monthlyPrice: 109.9,
    detail: "Mais volume, atendimento e automação em um só plano.",
    cta: "Escolher Melhor",
    available: true,
    features: ["Vendas + Atendimento Chat", "Bot de atendimento", "Buscas Google/dia: 6", "Motores gratuitos/HBX/cache"],
    note: "Pagamento apenas no checkout/Financeiro.",
  },
];

type BillingCycle = "monthly" | "annual";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthlyEquivalent(plan: SignupPlan, billingCycle: BillingCycle) {
  return billingCycle === "annual" ? plan.monthlyPrice * 0.9 : plan.monthlyPrice;
}

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

function planName(planKey?: CommercialPlanKey | null) {
  return SIGNUP_PLANS.find((plan) => plan.key === planKey)?.name || "HBX Padrão";
}

export default function RegisterPage() {
  const router = useRouter();
  const [selectedPlanKey, setSelectedPlanKey] = useState<CommercialPlanKey>("hbx_padrao");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstAccessInfo, setFirstAccessInfo] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState<ConfirmationPendingState | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [confirmationActionMessage, setConfirmationActionMessage] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => SIGNUP_PLANS.find((plan) => plan.key === selectedPlanKey) || SIGNUP_PLANS[1],
    [selectedPlanKey],
  );
  const selectedPlanIsTrial = selectedPlanKey === "hbx_padrao";

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
    setError(null);
    setLoading(true);
    setConfirmationPending(null);
    setConfirmationActionMessage(null);

    try {
      const normalizedCompanyName = String(companyName || "").trim();
      const bodyPayload = {
        entityType: PUBLIC_SIGNUP_ENTITY_TYPE,
        companyName: normalizedCompanyName,
        name: normalizedCompanyName,
        selectedPlanKey,
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
        setError(getErrorMessage(signupData) ?? "Erro no registro.");
        return;
      }

      const payload = (signupData as SignupResponse | null) ?? null;
      const token =
        (typeof payload?.access_token === "string" && payload.access_token) ||
        (typeof payload?.accessToken === "string" && payload.accessToken) ||
        (typeof payload?.token === "string" && payload.token);

      if (token) {
        setToken(token);
        router.push("/dashboard");
        return;
      }

      if (payload?.status === "pending_email_confirmation") {
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
          selectedPlanKey: payload.selectedPlanKey || selectedPlanKey,
          warnings: Array.isArray(payload.warnings)
            ? payload.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [],
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

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          HBX
        </Link>
        <div className={styles.stepper} aria-label="Etapas do cadastro">
          <span data-active="true">Plano</span>
          <span>Conta</span>
          <span>Confirmação</span>
        </div>
      </header>

      <section className={styles.contentGrid}>
        <section className={styles.planArea} aria-labelledby="register-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Teste grátis no HBX Padrão</span>
            <h1 id="register-title">Escolha seu plano e comece agora</h1>
            <p>Compare Lite, Padrão e Melhor. O Padrão começa com 1º mês grátis, sem cobrança no cadastro.</p>
          </div>

          <div className={styles.planToolbar}>
            <div>
              <span className={styles.sectionKicker}>Planos HBX</span>
              <h2>Preço claro, escolha simples.</h2>
            </div>
            <div className={styles.billingToggle} aria-label="Ciclo de cobrança">
              <button
                type="button"
                data-active={billingCycle === "monthly" ? "true" : "false"}
                onClick={() => setBillingCycle("monthly")}
              >
                Mensal
              </button>
              <button
                type="button"
                data-active={billingCycle === "annual" ? "true" : "false"}
                onClick={() => setBillingCycle("annual")}
              >
                Anual <span>10% OFF</span>
              </button>
            </div>
          </div>

          <div className={styles.plansGrid}>
            {SIGNUP_PLANS.map((plan) => {
              const selected = selectedPlanKey === plan.key;
              const annual = billingCycle === "annual";
              const displayedPrice = monthlyEquivalent(plan, billingCycle);
              return (
                <button
                  key={plan.key}
                  type="button"
                  className={styles.planCard}
                  data-selected={selected ? "true" : "false"}
                  data-featured={plan.featured ? "true" : "false"}
                  data-disabled={!plan.available ? "true" : "false"}
                  disabled={!plan.available}
                  onClick={() => {
                    if (plan.available) setSelectedPlanKey(plan.key);
                  }}
                >
                  <span className={styles.badge}>{plan.badge}</span>
                  <div className={styles.planTitle}>
                    <strong>{plan.name}</strong>
                    {plan.trialCopy ? <small>{plan.trialCopy}</small> : null}
                  </div>
                  <div className={styles.priceBlock}>
                    <em>{money(displayedPrice)}</em>
                    <span>{annual ? "/mês no anual" : "/mês"}</span>
                  </div>
                  {annual ? (
                    <p className={styles.billingHint}>Economize 10%. Cobrado anualmente.</p>
                  ) : (
                    <p className={styles.billingHint}>{plan.key === "hbx_padrao" ? "1º mês grátis. Sem cobrança agora." : "Sem cobrança no cadastro."}</p>
                  )}
                  <p className={styles.planDetail}>{plan.detail}</p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <small className={styles.planNote}>{plan.note}</small>
                  <span className={styles.planAction}>{selected ? "Selecionado" : plan.cta}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.trustStrip} aria-label="Segurança do cadastro">
            <span>Ambiente seguro</span>
            <span>Dados criptografados</span>
            <span>Conformidade LGPD</span>
            <span>Sem cobrança no cadastro</span>
          </div>
        </section>

        <aside className={styles.signupPanel}>
          {confirmationPending ? (
            <div className={styles.confirmation}>
              <span className={styles.eyebrow}>Cadastro criado</span>
              <h2>
                {confirmationPending.selectedPlanKey === "hbx_padrao"
                  ? "Seu teste grátis está pronto"
                  : "Confirme seu e-mail para seguir"}
              </h2>
              <p>
                {confirmationPending.selectedPlanKey === "hbx_padrao"
                  ? "Confirme seu e-mail para começar o HBX Padrão com 1º mês grátis e sem cobrança agora."
                  : "Confirme seu e-mail para liberar a próxima etapa. O pagamento acontece apenas no checkout/Financeiro."}
              </p>
              <div className={styles.confirmBadges}>
                {confirmationPending.selectedPlanKey === "hbx_padrao" ? (
                  <>
                    <span>1º mês grátis</span>
                    <span>Sem cobrança agora</span>
                  </>
                ) : (
                  <>
                    <span>Sem cobrança no cadastro</span>
                    <span>Checkout seguro</span>
                  </>
                )}
              </div>
              <div className={styles.summaryBox}>
                <div>
                  <span>Plano selecionado</span>
                  <strong>{planName(confirmationPending.selectedPlanKey)}</strong>
                </div>
                <div>
                  <span>E-mail</span>
                  <strong>{confirmationPending.email}</strong>
                </div>
              </div>
              {confirmationPending.deliveryFailed ? (
                <p className={styles.warningText}>
                  O cadastro foi salvo, mas a entrega falhou neste momento. Reenvie a confirmação antes de tentar entrar.
                </p>
              ) : null}
              {confirmationActionMessage ? <p className={styles.muted}>{confirmationActionMessage}</p> : null}
              <div className={styles.confirmActions}>
                {confirmationPending.canResendConfirmation ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={resendingConfirmation}
                    onClick={() => void resendConfirmation(confirmationPending.email)}
                  >
                    {resendingConfirmation ? "Reenviando..." : "Reenviar e-mail"}
                  </button>
                ) : null}
                <button type="button" className={styles.primaryButton} onClick={() => router.push("/login")}>
                  Ir para login
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className={styles.form}>
              <div className={styles.selectedSummary}>
                <span>Cadastro</span>
                <strong>{selectedPlan.name}</strong>
                <p>
                  {selectedPlanIsTrial
                    ? "Comece grátis hoje. Sem cartão e sem cobrança agora."
                    : "Crie sua conta agora. O pagamento fica para o checkout/Financeiro."}
                </p>
              </div>

              <label>
                <span>Nome da empresa/operação</span>
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Ex: HBX Import"
                  autoComplete="organization"
                  required
                />
              </label>

              <label>
                <span>E-mail</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@exemplo.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label>
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  required
                  autoComplete="new-password"
                />
              </label>

              {error ? <p className={styles.errorBox}>{error}</p> : null}

              {firstAccessInfo ? (
                <div className={styles.infoBox}>
                  <strong>Primeiro acesso</strong>
                  <p>{firstAccessInfo}</p>
                </div>
              ) : null}

              <button disabled={loading} className={styles.primaryButton}>
                {loading
                  ? "Criando..."
                  : selectedPlanKey === "hbx_padrao"
                    ? "Começar grátis hoje"
                    : "Criar conta e continuar"}
              </button>

              <p className={styles.loginLink}>
                Já tem conta? <Link href="/login">Ir para o login</Link>
              </p>
            </form>
          )}
        </aside>
      </section>
    </main>
  );
}
