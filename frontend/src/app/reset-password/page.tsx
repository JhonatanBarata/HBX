"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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
    if (password.length < 4) {
      setError("Senha inválida - use pelo menos 4 caracteres.");
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Redefinir senha</h1>
        <p className="text-sm text-foreground/70 mb-6">Crie uma nova senha para sua conta.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nova senha</label>
            <input
              type="password"
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="****"
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-foreground/60 mt-1">Mínimo de 4 caracteres.</p>
          </div>

          <div>
            <label className="text-sm font-medium">Confirmar nova senha</label>
            <input
              type="password"
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
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

          <button
            disabled={loading}
            className="w-full py-2 rounded-xl bg-primary text-background hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>

          <a className="block text-center text-sm underline text-foreground/70" href="/login">
            Voltar para o login
          </a>
        </form>
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
