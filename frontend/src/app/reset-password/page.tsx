"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.error === "string") return payload.error;
  return null;
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(() => {
    const value = searchParams?.get("token");
    return typeof value === "string" ? value : "";
  }, [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!token) {
      setError("Link inválido. Solicite uma nova recuperação.");
      return;
    }
    if (password.length < 8) {
      setError("Senha inválida. Use pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data) ?? "Não foi possível redefinir a senha.");
        return;
      }

      setInfo("Senha redefinida com sucesso. Você já pode fazer login.");
      setTimeout(() => router.push("/login"), 800);
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  const inlineMainStyle: React.CSSProperties & Record<string, string> = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    background: "linear-gradient(180deg, #f4f7fb 0%, #ebf0f7 100%)",
    // Override login accent to HBX blue (primary) and a darker variant
    "--login-accent": "#26428C",
    "--login-accent-alt": "#0B1F48",
  };

  const inlineCardStyle: React.CSSProperties = {
    maxWidth: "520px",
    width: "100%",
    padding: "1.25rem",
    borderRadius: "18px",
    background: "#ffffff",
    boxShadow: "0 18px 42px -24px rgba(15,23,42,0.28)",
    border: "1px solid rgba(15,23,42,0.06)",
  };

  const inlineInputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: "0.25rem",
    padding: "0.5rem",
    borderRadius: "12px",
    border: "1px solid rgba(15,23,42,0.06)",
    background: "#ffffff",
  };

  const inlineButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.6rem",
    borderRadius: "12px",
    background: "linear-gradient(145deg, #26428C, #0B1F48)",
    color: "#ffffff",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 12px 28px -12px rgba(38,66,140,0.36)",
    transition: "transform 160ms ease, box-shadow 160ms ease",
  };

  return (
    <main className="login-stage" style={inlineMainStyle}>
      <div className="login-stage__grid" aria-hidden />
      <div className="login-visuals" aria-hidden />

      <div className="login-shell">
        <div className={`login-card card transition-all duration-300 opacity-100 translate-y-0`} style={inlineCardStyle}>
          <div className="login-card__chrome" aria-hidden />

          <header className="login-card__header">
            <div className="login-card__brandBlock">
              <div className="login-card__brandMark" aria-hidden>
                <span className="login-card__brandMarkCore">HBX</span>
              </div>
              <div className="login-card__themeCopy">
                <p className="login-card__themeLabel">Acesso seguro HBX</p>
                <p className="login-card__themeHint">Crie uma nova senha para sua conta.</p>
              </div>
            </div>

            <h1 className="login-card__title">Redefinir senha</h1>
          </header>

          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nova senha</label>
                <input
                  type="password"
                  className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
                  style={inlineInputStyle}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="****"
                  required
                  autoComplete="new-password"
                />
                <p className="text-xs text-foreground/60 mt-1">Mínimo de 8 caracteres.</p>
              </div>

              <div>
                <label className="text-sm font-medium">Confirmar nova senha</label>
                <input
                  type="password"
                  className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
                  style={inlineInputStyle}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="****"
                  required
                  autoComplete="new-password"
                />
              </div>

              {info ? (
                <p className="text-sm border border-foreground/10 bg-background p-2 rounded-xl">{info}</p>
              ) : null}
              {error ? (
                <p className="text-sm border border-foreground/10 bg-background p-2 rounded-xl">{error}</p>
              ) : null}

              <button disabled={loading} style={inlineButtonStyle}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>

              <a className="block text-center text-sm underline text-foreground/70" href="/login">
                Voltar para o login
              </a>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm">
            <p className="text-sm text-foreground/70">Carregando...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
