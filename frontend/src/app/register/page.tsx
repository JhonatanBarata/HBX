"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../dashboard/_lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstAccessInfo, setFirstAccessInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

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

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const signupRes = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const signupData: unknown = await signupRes.json().catch(() => null);

      if (!signupRes.ok) {
        setError(getErrorMessage(signupData) ?? "Erro no registro.");
        return;
      }

      const payload = (signupData as Record<string, unknown> | null) ?? null;
      const token =
        (typeof payload?.access_token === "string" && payload.access_token) ||
        (typeof payload?.accessToken === "string" && payload.accessToken) ||
        (typeof payload?.token === "string" && payload.token);

      if (!token) {
        setError(getErrorMessage(signupData) ?? "Registro não retornou token.");
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div
        className={`max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm transition-all duration-300 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <h1 className="text-2xl font-bold mb-6">Registro</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Usuário</label>
            <input
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="meuusuario"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-sm font-medium">E-mail</label>
            <input
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@exemplo.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Senha</label>
            <input
              type="password"
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="min. 4 caracteres"
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-foreground/60 mt-1">Mínimo de 4 caracteres.</p>
          </div>

          {error ? (
            <p className="text-sm border border-foreground/10 bg-background p-2 rounded-xl">{error}</p>
          ) : null}

          {firstAccessInfo ? (
            <div className="border-l-4 border-primary/80 bg-primary/5 p-3 rounded-md">
              <p className="text-sm font-semibold">Primeiro acesso</p>
              <p className="text-sm text-foreground/80 mt-1">{firstAccessInfo}</p>
              <p className="text-xs text-foreground/60 mt-2">
                Preencha seu e-mail e senha para ativar a conta e continuar.
              </p>
            </div>
          ) : null}

          <button
            disabled={loading}
            className="w-full py-2 rounded-xl bg-secondary text-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className="text-sm text-foreground/70 mt-4">
          Já tem conta?{" "}
          <a className="underline" href="/login">
            Login
          </a>
        </p>
      </div>
    </main>
  );
}
