"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  needsRegistration?: boolean;
};

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const payload = data as ApiErrorPayload;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [playingWelcome, setPlayingWelcome] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [preRegistered, setPreRegistered] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        if (
          data &&
          typeof data === "object" &&
          Boolean((data as ApiErrorPayload).needsRegistration)
        ) {
          try {
            localStorage.setItem(
              "firstAccess",
              JSON.stringify({
                username,
                message: getErrorMessage(data) ?? "Complete seu cadastro.",
              })
            );
          } catch {
            // ignore localStorage errors
          }
          router.push("/register");
          return;
        }

        if (res.status === 404) {
          setError("Usuário inexistente");
          return;
        }

        if (res.status === 401) {
          setError(getErrorMessage(data) ?? "Senha incorreta");
          return;
        }

        setError(
          getErrorMessage(data) ??
            "Não foi possível autenticar. Verifique suas credenciais e tente novamente."
        );
        return;
      }

      const payload = (data as Record<string, unknown> | null) ?? null;
      const token =
        (typeof payload?.access_token === "string" && payload.access_token) ||
        (typeof payload?.accessToken === "string" && payload.accessToken) ||
        (typeof payload?.token === "string" && payload.token);

      if (!token) {
        setError(getErrorMessage(data) ?? "Login não retornou token.");
        return;
      }

      setToken(token);
        setToken(token);
        // play welcome implode animation before navigating
        try {
          setPlayingWelcome(true);
          // allow animation to run then navigate
          await new Promise((res) => setTimeout(res, 2300));
        } finally {
          router.push("/dashboard");
        }
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
        setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const normalized = username.trim();

    if (!normalized) {
      setPreRegistered(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/users/check-username?username=${encodeURIComponent(normalized)}`
        );
        if (!res.ok) {
          if (!cancelled) setPreRegistered(false);
          return;
        }

        const data: unknown = await res.json().catch(() => null);
        if (!cancelled && data && typeof data === "object") {
          setPreRegistered(Boolean((data as { preRegistered?: boolean }).preRegistered));
        }
      } catch {
        if (!cancelled) setPreRegistered(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [username]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function handleRecoverByEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data) ?? "Erro na recuperação.");
        return;
      }

      setInfo("Se o e-mail existir, enviaremos um link de redefinição.");
      setMode("login");
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="login-visuals" aria-hidden>
        <div className={`login-visuals ${playingWelcome ? "play" : ""}`} aria-hidden>
          <div className="login-drop" />
          <div className="login-drop login-drop-bottom" />
          <div className="login-drop login-drop-left" />
          <div className="login-drop login-drop-right" />
          <span className="login-meteor" style={{ left: "12%", animationDelay: "120ms" }} />
          <span className="login-meteor" style={{ left: "28%", animationDelay: "420ms" }} />
          <span className="login-meteor" style={{ left: "68%", animationDelay: "220ms" }} />
          <span className="login-meteor" style={{ left: "84%", animationDelay: "640ms" }} />
          {Array.from({ length: 60 }).map((_, i) => (
            <i key={i} className="login-confetti__piece" style={{ ['--i' as any]: i }} />
          ))}
        </div>
      </div>

      <div
          className={`container-sm login-card w-full p-6 card transition-all duration-200 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          } ${playingWelcome ? "is-exploding" : ""}`}
      >
        <h1 className="text-2xl font-bold mb-6">Login</h1>

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Usuário</label>
              <input
                className="input mt-1"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="meuusuario"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Senha</label>
              <input
                type="password"
                className="input mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="1234"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm underline text-foreground/70"
                onClick={() => setMode("forgot")}
              >
                Esqueci minha senha
              </button>
            </div>

            {info ? (
              <div className="msg-info">
                <div className="text-sm">{info}</div>
              </div>
            ) : null}

            {error ? (
              <div className="msg-error">
                <div className="text-sm">{error}</div>
              </div>
            ) : null}

            <button
              disabled={loading}
              type={preRegistered ? "button" : "submit"}
              onClick={
                preRegistered
                  ? () => {
                      try {
                        localStorage.setItem(
                          "firstAccess",
                          JSON.stringify({
                            username,
                            message: "Complete seu registro",
                          })
                        );
                      } catch {
                        // ignore localStorage errors
                      }
                      router.push("/register");
                    }
                  : undefined
              }
              className={`btn ${preRegistered ? "btn-secondary w-full mt-2" : "btn btn-primary w-full mt-2"}`}
            >
              {loading
                ? preRegistered
                  ? "Aguarde..."
                  : "Entrando..."
                : preRegistered
                  ? "Registrar"
                  : "Entrar"}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleRecoverByEmail} className="space-y-4">
            <p className="text-sm text-foreground/80">
              Digite seu e-mail para receber o link de redefinição.
            </p>
            <div>
              <label className="text-sm font-medium">E-mail</label>
              <input
                className="input mt-1"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="email@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            {info ? (
              <div className="msg-info">
                <div className="text-sm">{info}</div>
              </div>
            ) : null}

            {error ? (
              <div className="msg-error">
                <div className="text-sm">{error}</div>
              </div>
            ) : null}

              <button disabled={loading} className="btn btn-primary w-full mt-2">
              {loading ? "Enviando..." : "Enviar recuperação"}
            </button>
            <button type="button" className="btn w-full mt-2" onClick={() => setMode("login")}>
              Voltar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
