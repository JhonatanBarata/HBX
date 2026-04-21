"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const PUBLIC_SIGNUP_ENTITY_TYPE = "PF" as const;
const PUBLIC_SIGNUP_TRIAL_MODULE = "vendas" as const;

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
  trialModuleSelection?: "vendas";
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
  trialModuleSelection: "vendas" | null;
  warnings: string[];
  previewUrl: string | null;
  confirmUrl: string | null;
};

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstAccessInfo, setFirstAccessInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState<ConfirmationPendingState | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [confirmationActionMessage, setConfirmationActionMessage] = useState<string | null>(null);

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
    setMounted(true);
    return () => setMounted(false);
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
              message:
                String(payload?.message || "").trim() ||
                current.message,
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
      const bodyPayload: {
        entityType: "PF";
        companyName: string;
        name: string;
        trialModuleSelection: "vendas";
        username?: string;
        email: string;
        password: string;
      } = {
        entityType: PUBLIC_SIGNUP_ENTITY_TYPE,
        companyName: normalizedCompanyName,
        name: normalizedCompanyName,
        trialModuleSelection: PUBLIC_SIGNUP_TRIAL_MODULE,
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
            "Cadastro criado. Confirme seu e-mail para liberar o trial.",
          canResendConfirmation: Boolean(payload.canResendConfirmation),
          deliveryFailed: Boolean(payload.delivery?.failed),
          entityType:
            payload.entityType === "PF" || payload.entityType === "PJ"
              ? payload.entityType
              : PUBLIC_SIGNUP_ENTITY_TYPE,
          companyName: payload.companyName ? String(payload.companyName) : null,
          trialModuleSelection:
            payload.trialModuleSelection === "vendas"
              ? payload.trialModuleSelection
              : PUBLIC_SIGNUP_TRIAL_MODULE,
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
    <main className="login-stage" data-login-theme>
      <div className="login-stage__grid" aria-hidden />
      <div className="login-visuals" aria-hidden>
        <div className={`login-visuals`} aria-hidden>
          <div className="login-drop" />
          <div className="login-drop login-drop-bottom" />
          <div className="login-drop login-drop-left" />
          <div className="login-drop login-drop-right" />
        </div>
      </div>

      <div className="login-shell">
        <div
          className={`login-card card transition-all duration-300 max-w-md w-full p-6 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <div className="login-card__chrome" aria-hidden />

          <header className="login-card__header">
            <div className="login-card__themeRow">
              <div className="page-overline login-card__overline">Criar conta HBX</div>
            </div>
            <div className="login-card__brandBlock">
              <div className="login-card__brandMark" aria-hidden>
                <span className="login-card__brandMarkCore">HBX</span>
              </div>
              <div className="login-card__themeCopy">
                <p className="login-card__themeLabel">Registre-se e experimente o HBX</p>
              </div>
            </div>
          </header>

          {confirmationPending ? (
            <div className="space-y-4">
              <div className="border border-foreground/10 bg-background p-4 rounded-xl shadow-sm">
                <p className="text-sm font-semibold">Confirmação pendente</p>
                <p className="text-sm text-foreground/80 mt-2">Cadastro criado com sucesso.</p>
                <p className="text-sm text-foreground/80 mt-2">Confirme seu e-mail para liberar o trial.</p>
                {confirmationPending.deliveryFailed ? (
                  <p className="text-xs text-amber-700 mt-3">
                    O cadastro foi salvo, mas a entrega falhou neste momento. Reenvie a confirmação antes de tentar entrar.
                  </p>
                ) : null}
                {confirmationActionMessage ? (
                  <p className="text-xs text-foreground/70 mt-3">{confirmationActionMessage}</p>
                ) : null}
              </div>

              <div className="flex w-full flex-col sm:flex-row items-center sm:justify-between gap-3 text-sm">
                {confirmationPending.canResendConfirmation ? (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (!resendingConfirmation) void resendConfirmation(confirmationPending.email);
                    }}
                    className="login-link font-medium"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {resendingConfirmation ? "Reenviando..." : "Reenviar e-mail"}
                  </a>
                ) : null}

                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/login");
                  }}
                  className="login-link font-medium sm:ml-3"
                >
                  Ir para o login
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="login-field">
                  <label className="login-label">Nome da empresa/operação</label>
                  <input
                    className="input mt-1"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Ex: HBX Import"
                    autoComplete="organization"
                    required
                  />
                  <p className="text-xs text-foreground/60 mt-1">
                    Esse nome identifica sua área de trabalho no HBX.
                  </p>
                </div>

                <div className="login-field">
                  <label className="login-label">E-mail</label>
                  <input
                    className="input mt-1"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="email@exemplo.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="login-field">
                  <label className="login-label">Senha</label>
                  <input
                    type="password"
                    className="input mt-1"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    required
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-foreground/60 mt-1">Mínimo de 8 caracteres.</p>
                </div>

                {error ? <p className="text-sm border border-foreground/10 bg-background p-2 rounded-xl">{error}</p> : null}

                {firstAccessInfo ? (
                  <div className="border-l-4 border-primary/80 bg-primary/5 p-3 rounded-md">
                    <p className="text-sm font-semibold">Primeiro acesso</p>
                    <p className="text-sm text-foreground/80 mt-1">{firstAccessInfo}</p>
                    <p className="text-xs text-foreground/60 mt-2">Preencha os dados da conta para ativar o acesso e continuar.</p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  disabled={loading}
                  className="btn btn-primary login-button py-3 rounded-xl w-full shadow-md disabled:opacity-50"
                >
                  {loading ? "Criando..." : "Criar conta"}
                </button>

                <div className="text-sm text-foreground/70 text-center">
                  Já tem conta?{" "}
                  <a className="login-link font-medium ml-1" href="/login">
                    Ir para o login
                  </a>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
