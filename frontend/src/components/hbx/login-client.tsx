"use client";

// LoginClient — SÓ o card de autenticação (W1/PR10072026, ordem do dono 10/07:
// 1 login só, dentro da landing). O login cinematográfico (/login com robô,
// painéis laterais, "mundo" ?lado=, toggle Visual + hbx:login-plain) morreu —
// este componente vive embutido na landing (public-entry.tsx, camada
// .f1-login-layer). Auth intacto: POST /auth/login, sessão concorrente,
// confirmação de e-mail, Google.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { MobileAppLoginCard } from "@/components/hbx/mobile-app-login-card";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

type LoginResponse = { access_token?: string; next?: string; requiresCheckout?: boolean };
type LoginResume = { step?: string; planKey?: string | null; email?: string | null; resendAvailableAt?: string | null };
type LoginErrorPayload = { code?: string; message?: string; forceAvailable?: boolean; email?: string | null; needsEmailConfirmation?: boolean; activeSession?: { lastSeenAt?: string | null; userAgent?: string | null }; next?: string; resume?: LoginResume; confirmationPollToken?: string | null };

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
type GisApi = { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void };
type WinG = typeof window & { google?: { accounts?: { id?: GisApi } } };

export function LoginClient({ onCriarConta }: { onCriarConta?: () => void } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  // Destino de retomada devolvido pelo backend quando a conta ainda não foi confirmada.
  const [resumeHref, setResumeHref] = useState<string>("/?criar&resume=1");
  const [manterConectado, setManterConectado] = useState(true); // checkbox "Manter conectado" (default = marcado)
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const loginInFlightRef = useRef(false);

  const handleGoogleCredential = useCallback(async (response: { credential: string }) => {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<LoginResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken: response.credential }),
      });
      if (!res?.access_token) throw new Error("Resposta sem token.");
      setToken(res.access_token);
      setOk(true);
      setConflict(false);
      const destination = res.next || "/dashboard";
      // Deixa o "✓ Autenticado" respirar antes de entrar no app.
      window.setTimeout(() => router.replace(destination), 750);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com Google. Tente novamente.");
      loginInFlightRef.current = false;
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const sessionNotice = sessionStorage.getItem("hbx:session-notice");
        if (sessionNotice === "expired") {
          sessionStorage.removeItem("hbx:session-notice");
          setNotice("Sua sessão expirou ou foi substituída por um novo login. Entre novamente.");
        } else if (sessionNotice === "company-removed") {
          sessionStorage.removeItem("hbx:session-notice");
          setNotice("Sua empresa foi removida. Se isso não era esperado, fale com o suporte HBX.");
        }
      } catch { /* sem storage */ }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    let scriptTag: HTMLScriptElement | null = null;
    function initGoogle() {
      if (!(window as WinG).google?.accounts?.id || !googleBtnRef.current) return;
      const buttonWidth = Math.round(Math.min(400, Math.max(220, googleBtnRef.current.getBoundingClientRect().width || 320)));
      (window as WinG).google!.accounts!.id!.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      (window as WinG).google!.accounts!.id!.renderButton(googleBtnRef.current, { theme: "outline", size: "large", width: buttonWidth, text: "continue_with", locale: "pt-BR" });
    }
    if ((window as WinG).google?.accounts?.id) {
      initGoogle();
    } else {
      scriptTag = document.createElement("script");
      scriptTag.src = "https://accounts.google.com/gsi/client";
      scriptTag.async = true;
      scriptTag.defer = true;
      scriptTag.onload = initGoogle;
      document.head.appendChild(scriptTag);
    }
    return () => { if (scriptTag) scriptTag.remove(); };
  }, [handleGoogleCredential]);

  async function doLogin(force: boolean) {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: email, password, ...(force ? { forceSession: true } : {}) }),
      });
      if (!res?.access_token) throw new Error("Resposta de login sem token.");
      setToken(res.access_token, manterConectado);
      setOk(true);
      setConflict(false);
      const destination = res.next || "/dashboard";
      window.setTimeout(() => router.replace(destination), 750);
    } catch (err) {
      const apiErr = err as ApiError;
      const payload = (apiErr?.payload ?? {}) as LoginErrorPayload;
      setOk(false);
      if (payload?.code === "SESSION_ALREADY_ACTIVE" && payload?.forceAvailable) {
        setConflict(true);
        setError(payload?.message || "Já existe uma sessão ativa para este usuário.");
      } else if (payload?.code === "EMAIL_CONFIRMATION_REQUIRED" || payload?.needsEmailConfirmation) {
        // Login não é mais beco (F4): cadastro não confirmado vira "continue seu
        // cadastro" — reenvio + volta pro funil NO PASSO EXATO, em vez da string
        // morta (anexo2). O token/plano vêm no payload (só após a senha provar
        // posse) → guardamos a dica pra retomada reidratar a tela de espera.
        setConflict(false);
        setError(null);
        setConfirmPending(payload?.email || email);
        if (payload?.next) setResumeHref(payload.next);
        if (payload?.confirmationPollToken) {
          try {
            sessionStorage.setItem("hbx:onboarding-poll", payload.confirmationPollToken);
            sessionStorage.setItem("hbx:onboarding-email", String(payload.resume?.email || payload.email || email || ""));
          } catch { /* sem storage */ }
        }
      } else {
        setConflict(false);
        setError(err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente.");
      }
      loginInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function reenviarConfirmacao() {
    setConfirmMsg(null);
    try {
      await apiFetch("/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email: confirmPending }),
      });
      setConfirmMsg("✓ Novo link enviado — confirme pelo seu e-mail e volte para entrar.");
    } catch (err) {
      setConfirmMsg(err instanceof Error ? err.message : "Não foi possível reenviar agora.");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    doLogin(false);
  }

  return (
    <div className="hbx-scene login-console--embedded">
      <main className="login-shell">
        <div className="login-intro">
          <h1 className="login-intro__title">Sua Esteira de Leads até Vendas</h1>
        </div>
        <form className="card" onSubmit={onSubmit}>
          <div className="bl"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--login-accent, var(--hbx-brand))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg><strong>HBX</strong></div>
          <h2>Entrar no HBX</h2>
          <p className="sub">Acesse sua conta com segurança e continue de onde parou.</p>
          <div className="f">
            <label htmlFor="em">E-mail</label>
            {/* type=text: o backend autentica por username OU e-mail */}
            <input id="em" className="field-dark" type="text" placeholder="seu@email.com.br" required autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="pw">Senha</label>
            <input id="pw" className="field-dark" type="password" placeholder="••••••••" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="row">
            <label><input type="checkbox" checked={manterConectado} onChange={e => setManterConectado(e.target.checked)} />Manter conectado</label>
            <Link href="/reset-password" className="link" style={{ textDecoration: "none" }}>Esqueci minha senha</Link>
          </div>
          {notice && !error && !ok && (<div className="ok show warn">{notice}</div>)}
          <div className={"ok" + (ok ? " show" : "")} id="ok">✓ Autenticado — redirecionando para o Dashboard…</div>
          {error && (<div className={"ok show " + (conflict ? "warn" : "bad")}>{error}</div>)}
          {confirmPending && (
            <div className="ok show warn" style={{ display: "grid", gap: 8, textAlign: "left" }}>
              <span>Falta confirmar seu e-mail (<b>{confirmPending}</b>) pra entrar. Já enviamos um link — confirme e volte aqui.</span>
              {confirmMsg && <span>{confirmMsg}</span>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" className="btn-ghost" onClick={reenviarConfirmacao} style={{ minHeight: 38, fontSize: "var(--fz-l3)" }}>Reenviar confirmação</button>
                <Link href={resumeHref} className="btn-ghost" style={{ minHeight: 38, fontSize: "var(--fz-l3)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Continuar cadastro</Link>
              </div>
            </div>
          )}
          {conflict && (
            <button className="btn-ghost" type="button" disabled={busy} style={{ minHeight: 40, fontSize: "var(--fz-l2)" }} onClick={() => doLogin(true)}>
              Conectar aqui mesmo (encerra a sessão ativa)
            </button>
          )}
          <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "var(--fz-n3)" }}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="login-or"><span>ou</span></div>
              <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center" }} />
            </>
          )}
          <div className="alt">Ainda não tem conta? {onCriarConta
            ? <button type="button" className="link" onClick={onCriarConta}>Criar Conta</button>
            : <Link href="/?criar" className="link" style={{ textDecoration: "none" }}>Criar Conta</Link>}</div>
        </form>
        <MobileAppLoginCard />
      </main>
    </div>
  );
}
