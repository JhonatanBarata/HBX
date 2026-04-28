"use client";

import { useEffect, useMemo, useState } from "react";
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
  price: string;
  detail: string;
  cta: string;
  available: boolean;
  featured?: boolean;
  features: string[];
  note: string;
};

const SIGNUP_PLANS: SignupPlan[] = [
  {
    key: "hbx_lite",
    name: "HBX Lite",
    badge: "Mais barato",
    price: "R$ 29,90/mês",
    detail: "Entrada barata para operação de vendas.",
    cta: "Contratar",
    available: true,
    features: ["Vendas", "Webscraping free/HBX/cache", "Google: 0 buscas/dia", "Sem Atendimento Chat", "Sem Bot"],
    note: "Selecionar não cobra. O acesso é liberado depois do pagamento no Financeiro.",
  },
  {
    key: "hbx_padrao",
    name: "HBX Padrão",
    badge: "Mais escolhido",
    price: "R$ 79,90/mês",
    detail: "Trial gratuito de 30 dias.",
    cta: "Contratar",
    available: true,
    featured: true,
    features: ["30 dias grátis", "Não precisa de cartão", "Vendas", "Atendimento Chat", "Google: 2 buscas/dia"],
    note: "Trial gratuito de 30 dias. Não precisa de cartão. Não haverá cobrança automática.",
  },
  {
    key: "hbx_melhor",
    name: "HBX Melhor",
    badge: "Bot incluso",
    price: "R$ 109,90/mês",
    detail: "Pacote completo com Bot Inteligente.",
    cta: "Contratar",
    available: true,
    features: ["Vendas", "Atendimento Chat", "Bot Inteligente após pagamento", "Google: 6 buscas/dia"],
    note: "Para usar o BOT Inteligente, finalize o pagamento primeiro.",
  },
];

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

  async function handleRegister(event: React.FormEvent) {
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
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>HBX Comercial</span>
          <h1>Escolha o plano antes de criar sua conta.</h1>
          <p>
            A seleção do plano define seu onboarding. Trial e pagamento ficam separados:
            selecionar plano nunca gera cobrança automática.
          </p>
          <div className={styles.flow} aria-label="Fluxo comercial">
            {["Escolha o plano", "Crie sua conta", "Trial ou pagamento", "Acesso liberado"].map((item, index) => (
              <div key={item}>
                <strong>{index + 1}</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className={styles.promisePanel}>
          <span>Regra de cobrança</span>
          <strong>Sem cobrança ao selecionar</strong>
          <p>PIX ou cartão aparecem somente no Financeiro/checkout. Plano pago libera acesso depois da confirmação.</p>
        </aside>
      </section>

      <section className={styles.contentGrid}>
        <div className={styles.planArea}>
          <div className={styles.sectionHeader}>
            <span>1. Escolha o plano</span>
            <h2>Compare antes do cadastro</h2>
          </div>
          <div className={styles.plansGrid}>
            {SIGNUP_PLANS.map((plan) => {
              const selected = selectedPlanKey === plan.key;
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
                  <strong>{plan.name}</strong>
                  <em>{plan.price}</em>
                  <p>{plan.detail}</p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <small>{plan.note}</small>
                  <span className={styles.planAction}>{selected ? "Selecionado" : plan.cta}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className={styles.signupPanel}>
          {confirmationPending ? (
            <div className={styles.confirmation}>
              <span className={styles.eyebrow}>Confirmação pendente</span>
              <h2>Cadastro criado</h2>
              <p>{confirmationPending.message}</p>
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
                <span>2. Crie sua conta</span>
                <strong>{selectedPlan.name}</strong>
                <p>{selectedPlan.note}</p>
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
                    ? "Criar conta e começar trial"
                    : "Criar conta e seguir para checkout"}
              </button>

              <p className={styles.loginLink}>
                Já tem conta? <a href="/login">Ir para o login</a>
              </p>
            </form>
          )}
        </aside>
      </section>
    </main>
  );
}
