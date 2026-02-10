"use client";

import { useState, useEffect } from "react";
import { setToken } from "../dashboard/_lib/api";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";


export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [preRegistered, setPreRegistered] = useState(false);
  const [checkingUser, setCheckingUser] = useState(false);

  function getErrorMessage(data: any) {
    if (!data) return null;
    // Prefer `message` (more specific) over `error` (generic)
      if (Array.isArray(data.message)) return data.message.join(", ");
      if (typeof data.error === "string") return data.error;
      if (typeof data.message === "string") return data.message;
    return null;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If backend indicates the account needs registration, redirect to register
        if (data?.needsRegistration) {
          try {
            localStorage.setItem('firstAccess', JSON.stringify({ username, message: data?.message ?? 'Preencha seu e‑mail e senha para ativar a conta.' }));
          } catch (e) {}
          router.push('/register');
          return;
        }

        if (res.status === 404) {
          setError('Usuário inexistente');
          return;
        }

        if (res.status === 401) {
          setError('Senha incorreta');
          return;
        }

        const msg = getErrorMessage(data) ?? (data?.error as string) ?? "Não foi possível autenticar. Verifique suas credenciais e tente novamente.";
        setError(msg);
        return;
      }

      const token =
        (typeof data?.access_token === "string" && data.access_token) ||
        (typeof data?.accessToken === "string" && data.accessToken) ||
        (typeof data?.token === "string" && data.token);
      if (!token) {
        setError(getErrorMessage(data) ?? "Login não retornou token");
        return;
      }

      setToken(token);
      router.push("/dashboard");
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  // Check username existence (debounced)
  useEffect(() => {
    let cancelled = false;
    if (!username || username.trim().length === 0) {
      setPreRegistered(false);
      return;
    }
    setCheckingUser(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/users/check-username?username=${encodeURIComponent(username)}`);
        if (!res.ok) {
          setPreRegistered(false);
        } else {
          const data = await res.json().catch(() => null);
          if (!cancelled) setPreRegistered(Boolean(data?.preRegistered));
        }
      } catch (e) {
        if (!cancelled) setPreRegistered(false);
      } finally {
        if (!cancelled) setCheckingUser(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);

  useEffect(() => {
    // small mount animation
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function handleRecoverByEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getErrorMessage(data) ?? "Erro na recuperação");
        return;
      }

      setInfo("Se o e-mail existir, enviamos um link de redefinição.");
      setMode("login");
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className={`container-sm w-full p-6 card transition-all duration-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        <h1 className="text-2xl font-bold mb-6">Login</h1>

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Usuário</label>
                <input
                  className="input mt-1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
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
                {/* 'Criar conta' removido conforme solicitado */}
              </div>

            {info && (
              <div className="msg-info">
                <div className="text-sm">{info}</div>
              </div>
            )}

            {error && (
              <div className="msg-error">
                <div className="text-sm">{error}</div>
              </div>
            )}

            <button
              disabled={loading}
              type={preRegistered ? 'button' : 'submit'}
              onClick={preRegistered ? (() => {
                try { localStorage.setItem('firstAccess', JSON.stringify({ username, message: 'Complete seu registro' })); } catch {}
                router.push('/register');
              }) : undefined}
              className={`btn ${preRegistered ? 'btn-secondary w-full mt-2' : 'btn btn-primary w-full mt-2'}`}
            >
              {loading ? (preRegistered ? 'Aguarde...' : 'Entrando...') : (preRegistered ? 'Registrar' : 'Entrar')}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleRecoverByEmail} className="space-y-4">
            <p className="text-sm text-foreground/80">Digite seu e-mail para receber o link de redefinição.</p>
            <div>
              <label className="text-sm font-medium">E-mail</label>
              <input
                className="input mt-1"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            {info && (
              <div className="msg-info"><div className="text-sm">{info}</div></div>
            )}

            {error && (
              <div className="msg-error"><div className="text-sm">{error}</div></div>
            )}

            <button
              disabled={loading}
              className="btn btn-primary w-full mt-2"
            >
              {loading ? "Enviando..." : "Enviar recuperação"}
            </button>
            <button
              type="button"
              className="btn w-full mt-2"
              onClick={() => setMode("login")}
            >
              Voltar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
