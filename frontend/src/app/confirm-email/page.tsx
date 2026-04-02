"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

type ConfirmEmailResponse = {
  message?: string;
  trialEndsAt?: string | null;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

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
            setError(getErrorMessage(data) ?? "Não foi possível confirmar seu e-mail.");
          }
          return;
        }

        if (!cancelled) {
          const payload = (data as ConfirmEmailResponse | null) ?? null;
          setInfo(
            String(payload?.message || "").trim() ||
              "E-mail confirmado com sucesso. Seu acesso já pode ser liberado no login.",
          );
          setTrialEndsAt(payload?.trialEndsAt ? String(payload.trialEndsAt) : null);
        }
      } catch {
        if (!cancelled) {
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
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm space-y-4">
        <h1 className="text-2xl font-bold">Confirmar e-mail</h1>

        {loading ? <p className="text-sm text-foreground/70">Validando seu link...</p> : null}

        {!loading && error ? (
          <div className="text-sm border border-foreground/10 bg-background p-3 rounded-xl">
            {error}
          </div>
        ) : null}

        {!loading && info ? (
          <div className="text-sm border border-foreground/10 bg-background p-3 rounded-xl">
            <p>{info}</p>
            {trialEndsAt ? (
              <p className="text-xs text-foreground/60 mt-2">
                Trial liberado até {formatDate(trialEndsAt) || trialEndsAt}.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-2 rounded-xl bg-secondary text-foreground hover:opacity-90"
            onClick={() => router.push("/login")}
          >
            Ir para login
          </button>
          <button
            type="button"
            className="w-full py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5"
            onClick={() => router.push("/register")}
          >
            Voltar ao cadastro
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ConfirmEmailPage() {
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
      <ConfirmEmailInner />
    </Suspense>
  );
}
