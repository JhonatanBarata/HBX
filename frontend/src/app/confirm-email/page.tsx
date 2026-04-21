"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getToken } from "../dashboard/_lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  code?: string;
  delivery?: {
    previewUrl?: string | null;
    confirmUrl?: string | null;
  } | null;
};

type ConfirmEmailResponse = {
  message?: string;
  trialEndsAt?: string | null;
};

type ResendConfirmationResponse = {
  message?: string;
  delivery?: {
    previewUrl?: string | null;
    confirmUrl?: string | null;
  } | null;
};

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.error === "string") return payload.error;
  return null;
}

function formatDate(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("pt-BR");
}

function ConfirmEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => {
    const value = searchParams?.get("token");
    return typeof value === "string" ? value.trim() : "";
  }, [searchParams]);
  const emailFromQuery = useMemo(() => {
    const value = searchParams?.get("email");
    return typeof value === "string" ? value.trim() : "";
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [resendPreviewUrl, setResendPreviewUrl] = useState<string | null>(null);
  const [resendConfirmUrl, setResendConfirmUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setResendEmail(emailFromQuery);
  }, [emailFromQuery]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function confirmEmail() {
      if (!token) {
        setError("Link inválido. Verifique o token recebido por e-mail.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/confirm-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          if (!cancelled) {
            const payload = data && typeof data === "object" ? (data as ApiErrorPayload) : null;
            setErrorCode(typeof payload?.code === "string" ? payload.code : null);
            setError(getErrorMessage(data) ?? "Não foi possível confirmar seu e-mail.");
          }
          return;
        }

        if (!cancelled) {
          const payload = (data as ConfirmEmailResponse | null) ?? null;
          setInfo(
            String(payload?.message || "").trim() ||
              "E-mail confirmado com sucesso. Seu acesso já está liberado no login.",
          );
          setErrorCode(null);
          setTrialEndsAt(payload?.trialEndsAt ? String(payload.trialEndsAt) : null);

          // Se já existir sessão (token), redireciona para a área logada.
          try {
            const existingToken = getToken();
            if (existingToken) {
              // sinaliza cancelamento para evitar updates adicionais e navega
              cancelled = true;
              router.replace("/dashboard");
              return;
            }

            // Sem sessão: redireciona para a tela de login preenchendo o e-mail (se disponível)
            cancelled = true;
            const target = emailFromQuery ? `/login?email=${encodeURIComponent(emailFromQuery)}` : "/login";
            router.replace(target);
            return;
          } catch {
            // ignore
          }
        }
      } catch {
        if (!cancelled) {
          setErrorCode(null);
          setError("Falha ao conectar no backend.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void confirmEmail();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResendInfo(null);
    setResendPreviewUrl(null);
    setResendConfirmUrl(null);
    setResendBusy(true);

    try {
      const response = await fetch(`${API_URL}/auth/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setResendInfo(getErrorMessage(data) ?? "Não foi possível reenviar a confirmação agora.");
        return;
      }

      const payload = (data as ResendConfirmationResponse | null) ?? null;
      setResendInfo(
        String(payload?.message || "").trim() ||
          "Se existir uma conta com confirmação pendente, enviaremos um novo link em instantes.",
      );
      setResendPreviewUrl(
        payload?.delivery?.previewUrl && String(payload.delivery.previewUrl).trim()
          ? String(payload.delivery.previewUrl)
          : null,
      );
      setResendConfirmUrl(
        payload?.delivery?.confirmUrl && String(payload.delivery.confirmUrl).trim()
          ? String(payload.delivery.confirmUrl)
          : null,
      );
    } catch {
      setResendInfo("Falha ao conectar no backend.");
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <main className="login-stage" data-login-theme>
      <div className="login-stage__grid" aria-hidden />
      <div className="login-visuals" aria-hidden>
        <div className="login-visuals" aria-hidden>
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
              <div className="page-overline login-card__overline">Confirmar e-mail</div>
            </div>
            <div className="login-card__brandBlock">
              <div className="login-card__brandMark" aria-hidden>
                <span className="login-card__brandMarkCore">HBX</span>
              </div>
              <div className="login-card__themeCopy">
                <p className="login-card__themeLabel">Confirme seu e-mail</p>
              </div>
            </div>
          </header>

        {loading ? <p className="text-sm text-foreground/70">Validando seu link...</p> : null}

        {!loading && error ? (
          <div className="text-sm border bg-background p-4 rounded-xl shadow-sm outline-none ring-0" style={{ borderColor: 'var(--line)' }}>
            {error}
            {errorCode === "EMAIL_CONFIRMATION_EXPIRED" ? (
              <p className="text-xs text-foreground/60 mt-2">
                O link venceu. Informe o e-mail da conta abaixo para gerar um novo envio.
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && info ? (
          <div className="text-sm border bg-background p-4 rounded-xl shadow-sm outline-none ring-0" style={{ borderColor: 'var(--line)' }}>
            <p>{info}</p>
            {trialEndsAt ? (
              <p className="text-xs text-foreground/60 mt-2">
                Trial liberado até {formatDate(trialEndsAt) || trialEndsAt}.
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && error ? (
          <form onSubmit={handleResend} className="space-y-3 border bg-background p-4 rounded-xl outline-none ring-0" style={{ borderColor: 'var(--line)' }}>
            <div>
              <p className="text-sm font-medium">Reenviar confirmação</p>
              <p className="text-xs text-foreground/60 mt-1">
                {errorCode === "EMAIL_CONFIRMATION_EXPIRED"
                  ? "Use o e-mail do cadastro para receber um novo link válido."
                  : "Se a conta ainda estiver pendente, enviaremos um novo link de confirmação."}
              </p>
            </div>

            <div className="login-field">
              <label className="login-label">E-mail</label>
              <input
                type="email"
                className="input mt-1"
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
                placeholder="email@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            {resendInfo ? <p className="text-xs text-foreground/70">{resendInfo}</p> : null}

            {resendConfirmUrl ? (
              <a className="w-full inline-flex items-center justify-center py-2 rounded-xl bg-secondary text-foreground hover:opacity-90" href={resendConfirmUrl}>
                Abrir novo link
              </a>
            ) : null}

            {resendPreviewUrl ? (
              <a
                className="w-full inline-flex items-center justify-center py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5"
                href={resendPreviewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir preview do e-mail
              </a>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary login-button py-3 rounded-xl w-full shadow-md disabled:opacity-50"
              disabled={resendBusy}
            >
              {resendBusy ? "Reenviando..." : "Reenviar confirmação"}
            </button>
          </form>
        ) : null}

        <div className="text-sm text-foreground/70 text-center pt-2">
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              router.push("/login");
            }}
            className="login-link font-medium"
          >
            Ir para o login
          </a>
          <span className="mx-2 text-foreground/60"> - </span>
          <a
            href="/register"
            onClick={(e) => {
              e.preventDefault();
              router.push("/register");
            }}
            className="login-link font-medium"
          >
            Voltar para o cadastro
          </a>
        </div>
        </div>
      </div>
    </main>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="login-stage" data-login-theme>
          <div className="login-stage__grid" aria-hidden />
          <div className="login-visuals" aria-hidden>
            <div className="login-visuals" aria-hidden>
              <div className="login-drop" />
              <div className="login-drop login-drop-bottom" />
              <div className="login-drop login-drop-left" />
              <div className="login-drop login-drop-right" />
            </div>
          </div>
          <div className="login-shell">
            <div className="login-card card max-w-md w-full p-6">
              <p className="text-sm text-foreground/70">Carregando...</p>
            </div>
          </div>
        </main>
      }
    >
      <ConfirmEmailInner />
    </Suspense>
  );
}
