"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import PlanSelectionExperience, { type PlanSelectionCard } from "@/components/PlanSelectionExperience";
import { useRouter } from "next/navigation";
import { useHbxTheme } from "@/components/ThemeProvider";
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

type SignupPlan = PlanSelectionCard & {
  key: CommercialPlanKey;
};

const SIGNUP_PLANS: SignupPlan[] = [
  {
    key: "hbx_lite",
    name: "Lite",
    badge: "Essencial",
    monthlyPrice: 29.9,
    detail: "Ideal para quem está começando e precisa do essencial.",
    cta: "Escolher Lite",
    available: true,
    features: ["Vendas organizadas", "Motores gratuitos/cache", "Gestão simples"],
  },
  {
    key: "hbx_padrao",
    name: "Padrão",
    badge: "Mais escolhido",
    monthlyPrice: 79.9,
    promoPrice: 0,
    promoLabel: "Após 1ºmês 79,90",
    detail: "Tudo que você precisa para crescer com segurança.",
    cta: "Começar grátis hoje",
    available: true,
    featured: true,
    features: ["Tudo do plano Lite", "Vendas + Atendimento", "2 buscas Google/dia", "Suporte prioritário"],
    note: "1º mês grátis",
    trialCopy: "1º mês grátis",
  },
  {
    key: "hbx_melhor",
    name: "Max",
    badge: "Mais completo",
    monthlyPrice: 109.9,
    detail: "Máximo desempenho e controle para grandes operações.",
    cta: "Escolher Max",
    available: true,
    features: ["Tudo do plano Padrão", "Buscas ilimitadas", "Relatórios avançados", "Suporte dedicado"],
  },
];

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

function planName(planKey?: CommercialPlanKey | null) {
  return SIGNUP_PLANS.find((plan) => plan.key === planKey)?.name || "Padrão";
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
  const billingCycle: BillingCycle = "monthly";
  const [companyName, setCompanyName] = useState("");
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
  const [entryTransition, setEntryTransition] = useState(false);

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
    setConfirmationPending(null);
    setConfirmationActionMessage(null);

    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

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
    <main
      className={`login-stage ${styles.registerStage}`}
      data-login-theme={selection.themeId}
      data-login-mode={selection.mode}
      data-login-ready="true"
      data-login-state="idle"
      data-login-video="off"
    >
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
        </div>
      </div>

      <div
        className={`login-console ${styles.registerConsole}`}
        data-entry-transition={entryTransition ? "from-login" : "ready"}
      >
        <aside className="login-side login-side--left" aria-label="Planos">
          <div className={`login-side__panel ${styles.registerPlansPanel}`}>
            <div className={styles.plansHeader}>
              <div>
                <h1>Escolha o plano ideal para o seu negócio</h1>
                <p>Soluções completas para empresas de todos os tamanhos.</p>
              </div>
            </div>
            <PlanSelectionExperience
              plans={SIGNUP_PLANS}
              selectedPlanKey={selectedPlanKey}
              billingCycle={billingCycle}
              mode="signup"
              onSelect={(planKey) => setSelectedPlanKey(planKey)}
            />
          </div>
        </aside>

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
                    {confirmationPending.selectedPlanKey === "hbx_padrao"
                      ? "Teste grátis pronto"
                      : "E-mail confirmado?"}
                  </h1>
                  <p className="login-card__copy login-card__copy--compact">
                    {confirmationPending.selectedPlanKey === "hbx_padrao"
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
                      {loading
                        ? "Criando..."
                        : selectedPlanKey === "hbx_padrao"
                          ? "Começar 1º mês grátis"
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
      </div>
    </main>
  );
}
