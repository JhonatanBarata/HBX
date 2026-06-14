"use client";

// Porta fiel de docs/TEMAS/*/corporate/Login.html.
// Pontos dinâmicos ligados: submit → POST /auth/login (token + rota next);
// sessão concorrente (SESSION_ALREADY_ACTIVE) oferece "Conectar aqui mesmo"
// → reenvio com forceSession; "Esqueci minha senha" → /reset-password.
// "Manter conectado" e "Falar com vendas" seguem visuais (ver doc do PR).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

type LoginResponse = {
  access_token?: string;
  next?: string;
  requiresCheckout?: boolean;
};

type LoginErrorPayload = {
  code?: string;
  message?: string;
  forceAvailable?: boolean;
  activeSession?: { lastSeenAt?: string | null; userAgent?: string | null };
};

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // aviso de sessão derrubada/expirada (gravado pelo apiFetch no 401)
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const sessionNotice = sessionStorage.getItem("hbx:session-notice");
        if (sessionNotice === "expired") {
          sessionStorage.removeItem("hbx:session-notice");
          setNotice("Sua sessão expirou ou foi conectada em outro dispositivo. Entre novamente.");
        } else if (sessionNotice === "company-removed") {
          sessionStorage.removeItem("hbx:session-notice");
          setNotice("Sua empresa foi removida. Se isso não era esperado, fale com o suporte HBX.");
        }
      } catch { /* sem storage */ }
    });
    return () => { alive = false; };
  }, []);

  async function doLogin(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: email, password, ...(force ? { forceSession: true } : {}) }),
      });
      if (!res?.access_token) {
        throw new Error("Resposta de login sem token.");
      }
      setToken(res.access_token);
      setOk(true);
      setConflict(false);
      router.replace(res.next || "/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      const payload = (apiErr?.payload ?? {}) as LoginErrorPayload;
      setOk(false);
      if (payload?.code === "SESSION_ALREADY_ACTIVE" && payload?.forceAvailable) {
        setConflict(true);
        setError(payload?.message || "Você já está conectado em outra máquina.");
      } else {
        setConflict(false);
        setError(err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente.");
      }
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    doLogin(false);
  }

  return (
    <>
      <AuthThemeControls />
      <div className="login-split">
        <aside className="brand-side">
          <div className="bl">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6"></path></svg>
            <strong>HBX</strong>
          </div>
          <div className="pitch">
            <h1>Sua operação comercial em um só lugar.</h1>
            <p>Leads, vendas, atendimento e automação — conectados do primeiro contato ao fechamento.</p>
            <div className="feat">
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l4-6 3 3 4-7"></path><path d="M3 3v18h18"></path></svg></span>Pipeline de vendas com funil em tempo real</div>
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1-5.2a8.4 8.4 0 1 1 17-3.3Z"></path></svg></span>Atendimento omnichannel: WhatsApp, e-mail e Instagram</div>
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6V3"></path><path d="M7 9h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z"></path><path d="M9.5 13h.01M14.5 13h.01"></path></svg></span>Bot de qualificação com construtor visual</div>
            </div>
          </div>
          <div className="foot">© 2026 HBX System · Termos de uso · Política de privacidade</div>
        </aside>

        <main className="form-side">
          <form className="card" onSubmit={onSubmit}>
            <h2>Entrar no HBX</h2>
            <p className="sub">Acesse sua conta para continuar de onde parou.</p>
            <div className="f">
              <label htmlFor="em">E-mail</label>
              {/* type=text: o backend autentica por username OU e-mail —
                  type=email travaria login por usuário (ex.: henrique_lua) */}
              <input id="em" className="field-dark" type="text" placeholder="seu@email.com.br" required autoComplete="username"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="f">
              <label htmlFor="pw">Senha</label>
              <input id="pw" className="field-dark" type="password" placeholder="••••••••" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="row">
              <label><input type="checkbox" defaultChecked />Manter conectado</label>
              <Link href="/reset-password" className="link" style={{ textDecoration: "none" }}>Esqueci minha senha</Link>
            </div>
            {notice && !error && !ok && (
              <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-warning) 35%, transparent)", background: "color-mix(in srgb, var(--hbx-warning) 8%, transparent)", color: "var(--hbx-warning)" }}>
                {notice}
              </div>
            )}
            <div className={"ok" + (ok ? " show" : "")} id="ok">✓ Autenticado — redirecionando para o Dashboard…</div>
            {error && (
              <div className="ok show" style={conflict
                ? { borderColor: "color-mix(in srgb, var(--hbx-warning) 35%, transparent)", background: "color-mix(in srgb, var(--hbx-warning) 8%, transparent)", color: "var(--hbx-warning)" }
                : { borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
                {error}
              </div>
            )}
            {conflict && (
              <button className="btn-ghost" type="button" disabled={busy} style={{ minHeight: 40, fontSize: "0.78rem" }}
                onClick={() => doLogin(true)}>
                Conectar aqui mesmo (desconecta a outra máquina)
              </button>
            )}
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
            <div className="alt">Ainda não tem conta? <Link href="/register" className="link" style={{ textDecoration: "none" }}>Criar Conta</Link></div>
          </form>
        </main>
      </div>
    </>
  );
}
