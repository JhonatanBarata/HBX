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
import { useEffect, useState } from "react";

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";
import { apiFetch, setToken, type ApiError } from "@/lib/api";

type LoginResponse = { access_token?: string; next?: string; requiresCheckout?: boolean };
type LoginErrorPayload = { code?: string; message?: string; forceAvailable?: boolean; activeSession?: { lastSeenAt?: string | null; userAgent?: string | null } };

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

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // "Visual" off: card centraliza + painéis voltam, sem efeitos. Persiste.
  const [plain, setPlain] = useState(false);

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
        setPlain(localStorage.getItem("hbx:login-plain") === "1");
      } catch { /* sem storage */ }
    });
    return () => { alive = false; };
  }, []);

  function toggleVisual() {
    setPlain(p => {
      const next = !p;
      try { localStorage.setItem("hbx:login-plain", next ? "1" : "0"); } catch { /* sem storage */ }
      return next;
    });
  }

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
      <div className="login-visual-toggle">
        <span>Visual</span>
        <button type="button" className={"sw" + (!plain ? " on" : "")} role="switch" aria-checked={!plain}
          aria-label="Ligar ou desligar os efeitos visuais do login" title="Liga/desliga os efeitos do login" onClick={toggleVisual}>
          <i />
        </button>
      </div>

      <div className={"login-console" + (ok && !plain ? " is-leaving" : "") + (plain ? " is-plain" : "")}>
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
            <h1 className="login-intro__title">Seu próximo cliente já está lá fora.</h1>
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
            {conflict && (
              <button className="btn-ghost" type="button" disabled={busy} style={{ minHeight: 40, fontSize: "0.78rem" }} onClick={() => doLogin(true)}>
                Conectar aqui mesmo (desconecta a outra máquina)
              </button>
            )}
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
            <div className="alt">Ainda não tem conta? <Link href="/register" className="link" style={{ textDecoration: "none" }}>Criar Conta</Link></div>
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
