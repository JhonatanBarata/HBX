"use client";

// Confirmação de e-mail (link do e-mail: /confirm-email?token=...).
// POST /auth/confirm-email — pode auto-logar (access_token + next).
// Link expirado → reenvio via POST /auth/resend-confirmation.
// Sem template dedicado no handoff — moldura reusa o Login (doc do PR).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthSplit } from "@/components/hbx/auth-split";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

type ConfirmResponse = {
  ok?: boolean;
  message?: string;
  access_token?: string | null;
  next?: string;
  loginNext?: string;
};

type ConfirmErrorPayload = { code?: string; message?: string };

export function ConfirmEmailClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Confirmando seu e-mail…" : "Link de confirmação inválido.");
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    (async () => {
      try {
        const res = await apiFetch<ConfirmResponse>("/auth/confirm-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        setMessage(res?.message || "E-mail confirmado com sucesso.");
        setState("ok");
        if (res?.access_token) {
          setToken(res.access_token);
          const dest = res.next || "/dashboard";
          setTimeout(() => router.replace(dest), 1800);
        } else {
          const dest = res?.loginNext || "/login";
          setTimeout(() => router.replace(dest), 1800);
        }
      } catch (err) {
        const apiErr = err as ApiError;
        const payload = (apiErr?.payload ?? {}) as ConfirmErrorPayload;
        setState("error");
        setMessage(apiErr?.message || "Não foi possível confirmar o e-mail.");
        setExpired(payload?.code === "EMAIL_CONFIRMATION_EXPIRED");
      }
    })();
  }, [token, router]);

  async function resend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResendMsg(null);
    try {
      await apiFetch("/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResendMsg("Novo link enviado — verifique sua caixa de entrada.");
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "Não foi possível reenviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSplit>
      <div className="card">
        <h2>Confirmar e-mail</h2>
        <p className="sub">Validando o link de confirmação da sua conta.</p>
        {state === "ok" && <div className="ok show">✓ {message}</div>}
        {state === "loading" && <div className="ok show" style={{ borderColor: "var(--border-hairline)", background: "var(--hbx-surface-soft)", color: "var(--text-body)" }}>{message}</div>}
        {state === "error" && (
          <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
            {message}
          </div>
        )}
        {state === "ok" && <div className="alt">Redirecionando…</div>}
        {state === "error" && expired && (
          <form onSubmit={resend} style={{ display: "grid", gap: 16 }}>
            <div className="f">
              <label htmlFor="em">E-mail da conta</label>
              <input id="em" className="field-dark" type="email" placeholder="seu@email.com.br" required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {resendMsg && <div className="ok show">{resendMsg}</div>}
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
              {busy ? "Enviando…" : "Reenviar confirmação"}
            </button>
          </form>
        )}
        {state === "error" && (
          <div className="alt"><Link href="/login" className="link" style={{ textDecoration: "none" }}>Voltar para o login</Link></div>
        )}
      </div>
    </AuthSplit>
  );
}
