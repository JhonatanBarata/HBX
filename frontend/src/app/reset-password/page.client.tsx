"use client";

// Tela de recuperação/redefinição de senha (sem template dedicado no
// handoff — moldura reusa o Login, ver doc do PR).
// Sem token: pede e-mail → POST /auth/recover-password.
// Com ?token=: pede nova senha → POST /auth/reset-password.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { AuthSplit } from "@/components/hbx/auth-split";
import { apiFetch } from "@/lib/api";

type RecoverResponse = { ok?: boolean; message?: string; previewLink?: string };

export function ResetPasswordClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await apiFetch<RecoverResponse>("/auth/recover-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setOkMsg(res?.message || "Se o e-mail existir, enviaremos um link de redefinição.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o link. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setOkMsg("✓ Senha redefinida — entre com a nova senha.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSplit>
      {token ? (
        <form className="card" onSubmit={resetPassword}>
          <h2>Definir nova senha</h2>
          <p className="sub">Crie uma nova senha para a sua conta.</p>
          <div className="f">
            <label htmlFor="pw">Nova senha</label>
            <input id="pw" className="field-dark" type="password" placeholder="••••••••" required minLength={8}
              autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={done} />
          </div>
          {okMsg && <div className="ok show">{okMsg}</div>}
          {error && (
            <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
              {error}
            </div>
          )}
          {done ? (
            <Link href="/login" className="btn-teal" style={{ minHeight: 44, fontSize: "var(--fz-n3)", textDecoration: "none" }}>Ir para o login</Link>
          ) : (
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "var(--fz-n3)" }}>
              {busy ? "Salvando…" : "Redefinir senha"}
            </button>
          )}
          <div className="alt"><Link href="/login" className="link" style={{ textDecoration: "none" }}>Voltar para o login</Link></div>
        </form>
      ) : (
        <form className="card" onSubmit={requestLink}>
          <h2>Recuperar senha</h2>
          <p className="sub">Enviaremos um link de redefinição para o seu e-mail.</p>
          <div className="f">
            <label htmlFor="em">E-mail</label>
            <input id="em" className="field-dark" type="email" placeholder="seu@email.com.br" required
              autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {okMsg && <div className="ok show">{okMsg}</div>}
          {error && (
            <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
              {error}
            </div>
          )}
          <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "var(--fz-n3)" }}>
            {busy ? "Enviando…" : "Enviar link"}
          </button>
          <div className="alt"><Link href="/login" className="link" style={{ textDecoration: "none" }}>Voltar para o login</Link></div>
        </form>
      )}
    </AuthSplit>
  );
}
