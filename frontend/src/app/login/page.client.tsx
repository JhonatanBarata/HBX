"use client";

// Login — DOIS modos no mesmo DOM, alternados pelo toggle "Visual" (topo-direito):
//  • Visual ON  (padrão): card à ESQUERDA + cena/robô que transmuxa (cinematográfico).
//  • Visual OFF (.is-plain): card CENTRALIZADO + painéis "Soluções integradas" e
//    "Confiança e tecnologia" voltam, EMERGINDO de dentro; sem robô/efeitos.
// A troca anima via grid-template-columns (screens.css). Escolha persiste
// (hbx:login-plain). Auth intacto (POST /auth/login, sessão concorrente, etc.).
//
// >>> TROCAR FOTOS: substituir os arquivos em frontend/public/ com os mesmos
//     nomes — robo-blue/purple/magenta/crimson/amber.png. A ordem/tempo do
//     transmux e a cor que cicla ficam em screens.css + skeleton.css.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";
import { SceneMenu } from "@/components/hbx/hbx-scene";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

type LoginResponse = { access_token?: string; next?: string; requiresCheckout?: boolean };
type LoginResume = { step?: string; planKey?: string | null; email?: string | null; resendAvailableAt?: string | null };
type LoginErrorPayload = { code?: string; message?: string; forceAvailable?: boolean; email?: string | null; needsEmailConfirmation?: boolean; activeSession?: { lastSeenAt?: string | null; userAgent?: string | null }; next?: string; resume?: LoginResume; confirmationPollToken?: string | null };

type SideIconName = "headset" | "recovery" | "website" | "shield" | "building" | "pulse";
const SIDE_ICON: Record<SideIconName, string[]> = {
  headset: ["M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2", "M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z", "M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z"],
  recovery: ["M20 12a8 8 0 0 1-13.5 5.8", "M4 12A8 8 0 0 1 17.5 6.2", "M17.5 2.8v3.4h-3.4", "M6.5 21.2v-3.4h3.4"],
  website: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 12h17", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
  shield: ["M12 21s7-3.4 7-9.4V5.8L12 3 5 5.8v5.8c0 6 7 9.4 7 9.4Z", "m9.2 12 1.9 1.9 4-4.2"],
  building: ["M4.5 20.5h15", "M6 20.5V7l6-2.5 6 2.5v13.5", "M9 10h.1M12 10h.1M15 10h.1M9 14h.1M12 14h.1M15 14h.1"],
  pulse: ["M3 13h4l2.2-5.5L14 18l2.5-5H21"],
};
function SideIcon({ name, size = 17 }: { name: SideIconName; size?: number }) {
  return (
    <svg className="hbx-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {SIDE_ICON[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
const SOLUTIONS: { icon: SideIconName; title: string; desc: string }[] = [
  { icon: "headset", title: "Atendimento", desc: "Suporte rápido e humanizado sempre que precisar." },
  { icon: "recovery", title: "Recovery", desc: "Recuperação de dados ágil e segura." },
  { icon: "website", title: "Website", desc: "Acesse informações e novidades online." },
];
const TRUST: { icon: SideIconName; title: string; desc: string }[] = [
  { icon: "shield", title: "Modo seguro ativo", desc: "Seus dados protegidos 24/7 com criptografia." },
  { icon: "building", title: "Multiempresa", desc: "Gerencie múltiplas empresas em um único ambiente." },
  { icon: "pulse", title: "Tempo real", desc: "Informações sempre atualizadas para decisões." },
];

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
type GisApi = { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void };
type WinG = typeof window & { google?: { accounts?: { id?: GisApi } } };
type Lado = "corporativo" | "autonomo";

export function LoginClient() {
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
  // F4 (19/06): destino de RETOMADA devolvido pelo backend (/?ver=planos&resume=1).
  const [resumeHref, setResumeHref] = useState<string>("/?ver=planos&resume=1");
  const [plain, setPlain] = useState(false);
  const [lado, setLado] = useState<Lado>("corporativo"); // login entra no MUNDO escolhido (default: empresa)
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
      if (plain) router.replace(res.next || "/dashboard");
      else window.setTimeout(() => router.replace(res.next || "/dashboard"), 750);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com Google. Tente novamente.");
      loginInFlightRef.current = false;
      setBusy(false);
    }
  }, [plain, router]);

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
        setPlain(localStorage.getItem("hbx:login-plain") === "1");
        const l = new URLSearchParams(window.location.search).get("lado");
        if (l === "corporativo" || l === "autonomo") setLado(l);
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

  function toggleVisual() {
    setPlain(p => {
      const next = !p;
      try { localStorage.setItem("hbx:login-plain", next ? "1" : "0"); } catch { /* sem storage */ }
      return next;
    });
  }

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
      setToken(res.access_token);
      setOk(true);
      setConflict(false);
      // Visual on = saída cinematográfica (fade); Visual off = entra direto.
      if (plain) router.replace(res.next || "/dashboard");
      else window.setTimeout(() => router.replace(res.next || "/dashboard"), 750);
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
            sessionStorage.setItem("hbx:onboarding-plan", payload.resume?.planKey || "hbx_padrao");
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
    <>
      <AuthThemeControls />
      <div className="login-visual-toggle">
        <span>Visual</span>
        <button type="button" className={"sw" + (!plain ? " on" : "")} role="switch" aria-checked={!plain}
          aria-label="Ligar ou desligar os efeitos visuais do login" title="Liga/desliga os efeitos do login" onClick={toggleVisual}>
          <i />
        </button>
      </div>

      <SceneMenu active="entrar" mode="world" />

      <div className={"hbx-scene login-console world world--" + lado + (ok && !plain ? " is-leaving" : "") + (plain ? " is-plain" : "")}>
        <div className="login-art" aria-hidden>
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
        </div>
        <div className="login-fog" aria-hidden />

        <aside className="login-side login-side--left" aria-label="Soluções integradas">
          <div className="login-side__panel">
            <div className="login-side__header">Soluções integradas</div>
            {SOLUTIONS.map(it => (
              <article key={it.title} className="login-microcard">
                <span className="ic"><SideIcon name={it.icon} /></span>
                <span className="tx"><strong>{it.title}</strong><span>{it.desc}</span></span>
                <span className="login-dot" aria-hidden />
              </article>
            ))}
            <div className="login-side__footer"><span>Todos os serviços operacionais</span><SideIcon name="shield" size={16} /></div>
          </div>
        </aside>

        <main className="login-shell">
          <div className="login-intro">
            <h1 className="login-intro__title">Sua Esteira de Leads até Vendas</h1>
            <p className="login-intro__sub">Radar encontra, vendas trabalha, WhatsApp fecha. Tudo num fluxo só.</p>
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
              <label><input type="checkbox" defaultChecked />Manter conectado</label>
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
                  <button type="button" className="btn-ghost" onClick={reenviarConfirmacao} style={{ minHeight: 38, fontSize: "0.74rem" }}>Reenviar confirmação</button>
                  <Link href={resumeHref} className="btn-ghost" style={{ minHeight: 38, fontSize: "0.74rem", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Continuar cadastro</Link>
                </div>
              </div>
            )}
            {conflict && (
              <button className="btn-ghost" type="button" disabled={busy} style={{ minHeight: 40, fontSize: "0.78rem" }} onClick={() => doLogin(true)}>
                Conectar aqui mesmo (encerra a sessão ativa)
              </button>
            )}
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
            {GOOGLE_CLIENT_ID && (
              <>
                <div className="login-or"><span>ou</span></div>
                <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center" }} />
              </>
            )}
            <div className="alt">Ainda não tem conta? <Link href="/?ver=planos" className="link" style={{ textDecoration: "none" }}>Criar Conta</Link></div>
          </form>
        </main>

        <aside className="login-side login-side--right" aria-label="Confiança e tecnologia">
          <div className="login-side__panel">
            <div className="login-side__header">Confiança e tecnologia</div>
            {TRUST.map(it => (
              <article key={it.title} className="login-microcard">
                <span className="ic"><SideIcon name={it.icon} /></span>
                <span className="tx"><strong>{it.title}</strong><span>{it.desc}</span></span>
                <span className="login-dot" aria-hidden />
              </article>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
