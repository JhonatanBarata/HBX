"use client";

// Formulário canônico de cadastro — card embutido na landing (W5/PR10072026:
// mesma porta única do login; /register virou redirect pra /?criar preservando
// a query). MODELO CRÉDITO É A VIA ÚNICA (W3, dono 10/07): o funil de plano/
// trial/checkout morreu — cadastro leve (empresa, nome, e-mail, senha, telefone
// obrigatório, CPF opcional, termos) → confirmação de e-mail/WhatsApp →
// créditos de boas-vindas. Sem cartão, sem seleção de plano. `onEntrar` troca
// pro card de login SEM navegar (alternância dentro da landing).

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, setToken } from "@/lib/api";
import { fetchCreditStorefront } from "@/lib/credits-storefront";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
type GisApi = { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void };
type WinG = typeof window & { google?: { accounts?: { id?: GisApi } } };

type SignupResponse = {
  ok?: boolean;
  pendingEmailConfirmation?: boolean;
  message?: string;
  email?: string | null;
  previewUrl?: string | null;
  confirmUrl?: string | null;
  deliveryFailed?: boolean;
  // fluxo local/mock confirma na hora e devolve sessão completa
  access_token?: string | null;
  next?: string | null;
  // F4 (19/06): token de acompanhamento — habilita a RETOMADA do funil no reload.
  confirmationPollToken?: string | null;
};

// F4 (19/06): continuidade do funil. A VERDADE do passo é o backend (resume);
// o sessionStorage é só uma DICA pra reidratar rápido (fail-safe se sumir).
const ONBOARDING_POLL_KEY = "hbx:onboarding-poll";
const ONBOARDING_EMAIL_KEY = "hbx:onboarding-email";
function clearOnboardingHint() {
  try {
    sessionStorage.removeItem(ONBOARDING_POLL_KEY);
    sessionStorage.removeItem(ONBOARDING_EMAIL_KEY);
  } catch { /* sem storage */ }
}

// Resposta do endpoint /auth/onboarding/whatsapp/start
type WaStartResponse = {
  ok?: boolean;
  challengeToken?: string | null;
  phone?: string | null;
  sentVia?: string | null;
  liveDispatch?: string | null;
  previewCode?: string | null;
  message?: string | null;
  alreadyConfirmed?: boolean;
};

export function RegisterPanel({ onEntrar }: { onEntrar?: () => void } = {}) {
  const router = useRouter();
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignupResponse | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [prefillActive, setPrefillActive] = useState(false);

  // F6 — Confirmação por WhatsApp (3 estados: idle → phone → code)
  const [waStep, setWaStep] = useState<"idle" | "phone" | "code">("idle");
  const [waPhone, setWaPhone] = useState("");
  const [waCode, setWaCode] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waMsg, setWaMsg] = useState<string | null>(null);
  const [waChallengeToken, setWaChallengeToken] = useState<string | null>(null);
  const [waPreviewCode, setWaPreviewCode] = useState<string | null>(null);

  // Créditos de boas-vindas (vitrine pública) — só alimenta a copy do número.
  const [welcomeCredits, setWelcomeCredits] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchCreditStorefront().then((sf) => {
      if (!alive) return;
      setWelcomeCredits(sf.welcomeCredits);
    });
    return () => { alive = false; };
  }, []);

  // Telefone obrigatório (base do dedup anti-farra + confirmação por WhatsApp),
  // CPF opcional.
  const [freeTelefone, setFreeTelefone] = useState("");
  const [freeCpf, setFreeCpf] = useState("");

  // Guarda a dica de retomada (token + e-mail) só quando o cadastro ficou
  // PENDENTE (sem sessão plena). Sessão plena já limpa a dica.
  function persistOnboardingHint(res: SignupResponse | null) {
    if (!res?.confirmationPollToken || res?.access_token) return;
    try {
      sessionStorage.setItem(ONBOARDING_POLL_KEY, res.confirmationPollToken);
      sessionStorage.setItem(ONBOARDING_EMAIL_KEY, String(res.email || email || ""));
    } catch { /* sem storage */ }
  }

  // F4 (19/06): RETOMADA. Reload/relogin com ?resume=1 + token guardado → o
  // backend diz em que passo a pessoa está e reidratamos a cena (sem perder o
  // lugar). awaiting_email → tela de espera; confirmado → entra pelo login.
  useEffect(() => {
    if (done) return;
    let poll: string | null = null;
    try { poll = sessionStorage.getItem(ONBOARDING_POLL_KEY); } catch { /* sem storage */ }
    const wantsResume = new URLSearchParams(window.location.search).get("resume") === "1";
    if (!poll || !wantsResume) return;
    let alive = true;
    apiFetch<{ step?: string; email?: string | null; resendAvailableAt?: string | null }>(
      "/auth/onboarding/resume",
      { method: "POST", body: JSON.stringify({ pollToken: poll }) },
    )
      .then((r) => {
        if (!alive || !r) return;
        if (r.step === "awaiting_email") {
          setDone({
            ok: true,
            pendingEmailConfirmation: true,
            email: r.email || null,
            message: `Reabrimos seu cadastro — confirme o e-mail enviado para ${r.email || "seu endereço"} pra continuar.`,
          });
          if (r.resendAvailableAt) {
            const ms = new Date(r.resendAvailableAt).getTime() - Date.now();
            if (ms > 0) setResendCooldown(Math.ceil(ms / 1000));
          }
        } else {
          // identidade confirmada → entra pelo login.
          clearOnboardingHint();
          router.replace("/login");
        }
      })
      .catch(() => { /* token expirado/inválido: segue o form normal */ });
    return () => { alive = false; };
  }, [done, router]);

  // Prefill do fechamento: o link de contratação traz ?hbxLead=<token assinado>
  // (leadId.exp.assinatura HMAC; zero PII crua na URL). Buscamos o que o vendedor
  // confirmou no fechamento pra pré-preencher o cadastro (CPF só vem se o token for
  // válido). Só preenche campo VAZIO — nunca atropela o que a pessoa já digitou.
  useEffect(() => {
    let hbxLead: string | null = null;
    try { hbxLead = new URLSearchParams(window.location.search).get("hbxLead"); } catch { /* sem url */ }
    if (!hbxLead) return;
    let alive = true;
    apiFetch<{ hasPrefill?: boolean; companyNameSuggested?: string | null; name?: string | null; email?: string | null; phone?: string | null; cpf?: string | null }>(
      `/vendas/handoff/${encodeURIComponent(hbxLead)}/prefill`,
    )
      .then((r) => {
        if (!alive || !r?.hasPrefill) return;
        if (r.companyNameSuggested) setEmpresa((v) => v || String(r.companyNameSuggested));
        if (r.name) setNome((v) => v || String(r.name));
        if (r.email) setEmail((v) => v || String(r.email));
        if (r.phone) setFreeTelefone((v) => v || String(r.phone));
        // CPF volta ao prefill SO via link com token assinado (backend gateia); link
        // antigo/adulterado nao traz cpf. Campo continua editavel.
        if (r.cpf) setFreeCpf((v) => v || String(r.cpf).replace(/\D/g, ""));
        setPrefillActive(true);
      })
      .catch(() => { /* lead sem prefill/expirado: segue o cadastro normal */ });
    return () => { alive = false; };
  }, []);

  const handleGoogleCredential = useCallback(async (response: { credential: string }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<SignupResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken: response.credential }),
      });
      if (res?.access_token) { setToken(res.access_token); clearOnboardingHint(); }
      persistOnboardingHint(res);
      setDone(res || { ok: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com Google. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    let scriptTag: HTMLScriptElement | null = null;
    function initGoogle() {
      if (!(window as WinG).google?.accounts?.id || !googleBtnRef.current) return;
      (window as WinG).google!.accounts!.id!.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      (window as WinG).google!.accounts!.id!.renderButton(googleBtnRef.current, { theme: "outline", size: "large", width: "100%", text: "signup_with", locale: "pt-BR" });
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (senha !== confirma) {
      setError("As senhas não conferem.");
      return;
    }
    if (!freeTelefone.trim()) {
      setError("Informe seu telefone com DDD — usamos ele para confirmar sua conta e liberar seus créditos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Cadastro do modelo crédito: direto, sem plano — o backend EXIGE o
      // telefone (base do dedup anti-farra dos welcomeCredits).
      const res = await apiFetch<SignupResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          companyName: empresa,
          email,
          name: nome,
          password: senha,
          acceptedTerms: true,
          trialContactName: nome,
          trialContactPhone: freeTelefone,
          trialTaxDocument: freeCpf || undefined,
        }),
      });
      if (res?.access_token) {
        setToken(res.access_token);
        clearOnboardingHint();
      }
      persistOnboardingHint(res);
      setDone(res || { ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível criar a conta. Tente novamente.";
      // O backend chama o e-mail de "identificador" (ele vira o login).
      // Traduzimos para o usuário saber exatamente O QUE está duplicado.
      if (/identificador já cadastrado|conta com este e-?mail/i.test(msg)) {
        setError(`O e-mail ${email} já tem conta no HBX — ele é o seu login. Entre com ele ou recupere a senha.`);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function entrarAgora() {
    if (!done?.access_token) return;
    setToken(done.access_token);
    clearOnboardingHint();
    router.replace(done.next || "/dashboard");
  }

  async function reenviar() {
    if (resendCooldown > 0) return;
    setResendMsg(null);
    try {
      await apiFetch("/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email: done?.email || email }),
      });
      setResendMsg("✓ Novo link enviado — verifique sua caixa de entrada.");
      setResendCooldown(60);
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "Não foi possível reenviar.");
    }
  }

  // Cooldown do reenvio: contagem regressiva pra não martelar o e-mail (F5).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // F6 — envia o código de confirmação via WhatsApp
  async function waSendCode() {
    if (waBusy) return;
    setWaBusy(true);
    setWaError(null);
    setWaMsg(null);
    try {
      const pollToken =
        done?.confirmationPollToken ||
        (() => { try { return sessionStorage.getItem(ONBOARDING_POLL_KEY); } catch { return null; } })();
      const res = await apiFetch<WaStartResponse>("/auth/onboarding/whatsapp/start", {
        method: "POST",
        body: JSON.stringify({ pollToken, phone: waPhone }),
      });
      if (res?.alreadyConfirmed) {
        setWaMsg(res.message || "Identidade já confirmada — entre pelo login.");
        return;
      }
      if (res?.challengeToken) {
        setWaChallengeToken(res.challengeToken);
        setWaPreviewCode(res.previewCode || null);
        setWaMsg(res.message || null);
        setWaStep("code");
      } else {
        setWaError(res?.message || "Não foi possível enviar o código. Tente novamente.");
      }
    } catch (err) {
      setWaError(err instanceof Error ? err.message : "Não foi possível enviar o código. Tente novamente.");
    } finally {
      setWaBusy(false);
    }
  }

  // F6 — confirma o código digitado
  async function waConfirmCode() {
    if (waBusy || !waChallengeToken) return;
    setWaBusy(true);
    setWaError(null);
    try {
      const res = await apiFetch<SignupResponse>("/auth/onboarding/whatsapp/confirm", {
        method: "POST",
        body: JSON.stringify({ challengeToken: waChallengeToken, code: waCode }),
      });
      if (res?.access_token) {
        setToken(res.access_token);
        clearOnboardingHint();
        router.replace(res.next || "/dashboard");
        return;
      }
      setDone(res || { ok: true });
    } catch (err) {
      setWaError(err instanceof Error ? err.message : "Código inválido. Tente novamente.");
    } finally {
      setWaBusy(false);
    }
  }

  const eyeBtn = (on: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} aria-label={on ? "Ocultar senha" : "Mostrar senha"}
      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem" }}>
      {on ? "🙈" : "👁"}
    </button>
  );

  return (
    <div className="reg-form">
      {done ? (
        <div className="card">
          <h2>
            {done.access_token ? "Tudo pronto ✓" : "Falta pouco — confirme sua conta"}
          </h2>
          <p className="sub">
            {done.access_token
              ? (welcomeCredits > 0 ? `Sua conta está ativa com ${welcomeCredits} créditos grátis.` : "Sua conta está ativa.")
              : (welcomeCredits > 0
                ? `Confirme seu email e telefone para liberar seus ${welcomeCredits} créditos.`
                : "Confirme seu email e telefone para liberar seus créditos.")}
          </p>
          <div className="ok show">{done.message || `Enviamos um link de confirmação para ${done.email || email}.`}</div>
          {resendMsg && <div className="ok show">{resendMsg}</div>}
          {done.previewUrl && (
            <a className="link" href={done.previewUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", fontSize: "0.72rem" }}>
              Abrir e-mail de confirmação (ambiente de teste) ↗
            </a>
          )}
          {done.access_token ? (
            <button className="btn-teal" type="button" onClick={entrarAgora} style={{ minHeight: 44, fontSize: "0.84rem" }}>
              Encontrar meus primeiros leads →
            </button>
          ) : (
            <React.Fragment>
              <button className="btn-ghost" type="button" onClick={reenviar} disabled={resendCooldown > 0} style={{ minHeight: 40, fontSize: "0.78rem" }}>
                {resendCooldown > 0 ? `Reenviar confirmação em ${resendCooldown}s` : "Reenviar confirmação"}
              </button>
              <Link href="/login" className="btn-teal" style={{ minHeight: 44, fontSize: "0.84rem", textDecoration: "none" }}>
                Ir para o login
              </Link>
              {/* F6 — Confirmação por WhatsApp (telefone já veio do cadastro —
                  pré-preenche pra não digitar de novo) */}
              {waStep === "idle" && (
                <button className="btn-ghost" type="button" onClick={() => { setWaStep("phone"); setWaError(null); setWaMsg(null); if (freeTelefone) setWaPhone(freeTelefone); }} style={{ minHeight: 40, fontSize: "0.78rem" }}>
                  Confirmar pelo WhatsApp
                </button>
              )}
              {waStep === "phone" && (
                <React.Fragment>
                  <div className="f">
                    <label htmlFor="wa-phone">WhatsApp com DDD</label>
                    <input
                      id="wa-phone"
                      className="field-dark"
                      type="tel"
                      placeholder="WhatsApp com DDD"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      disabled={waBusy}
                    />
                  </div>
                  <button className="btn-teal" type="button" onClick={waSendCode} disabled={waBusy || !waPhone.trim()} style={{ minHeight: 40, fontSize: "0.78rem" }}>
                    {waBusy ? "Enviando…" : "Enviar código"}
                  </button>
                </React.Fragment>
              )}
              {waStep === "code" && (
                <React.Fragment>
                  {waPreviewCode && (
                    <div className="ok show">
                      Código (ambiente de teste): <b>{waPreviewCode}</b>
                    </div>
                  )}
                  {waMsg && !waPreviewCode && <div className="ok show">{waMsg}</div>}
                  <div className="f">
                    <label htmlFor="wa-code">Código de 6 dígitos</label>
                    <input
                      id="wa-code"
                      className="field-dark"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="______"
                      value={waCode}
                      onChange={e => setWaCode(e.target.value.replace(/\D/g, ""))}
                      disabled={waBusy}
                    />
                  </div>
                  <button className="btn-teal" type="button" onClick={waConfirmCode} disabled={waBusy || waCode.length < 6} style={{ minHeight: 40, fontSize: "0.78rem" }}>
                    {waBusy ? "Confirmando…" : "Confirmar código"}
                  </button>
                </React.Fragment>
              )}
              {waError && <div className="ok show bad">{waError}</div>}
              {waMsg && waStep !== "code" && <div className="ok show">{waMsg}</div>}
            </React.Fragment>
          )}
        </div>
      ) : (
        <form className="card" onSubmit={onSubmit}>
          <h2>Criar sua conta grátis</h2>
          <p className="sub">
            {welcomeCredits > 0
              ? <>Confirme email e telefone e ganhe <strong>{welcomeCredits} créditos</strong> grátis. 1 crédito = 1 lead entregue e validado. A busca é grátis. Sem cartão.</>
              : <>Confirme email e telefone e ganhe seus créditos grátis. 1 crédito = 1 lead entregue e validado. A busca é grátis. Sem cartão.</>}
          </p>
          {GOOGLE_CLIENT_ID && (
            <>
              {prefillActive && (
                <p className="sub" style={{ margin: "0 0 4px", fontWeight: 700, textAlign: "center" }}>
                  Tem Gmail? Ative em 1 clique — seus dados já vêm preenchidos.
                </p>
              )}
              <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center" }} />
              <div className="login-or"><span>ou preencha abaixo</span></div>
            </>
          )}
          <div className="f">
            <label htmlFor="emp">Empresa</label>
            <input id="emp" className="field-dark" placeholder="Nome da sua empresa" required maxLength={120}
              value={empresa} onChange={e => setEmpresa(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="em">E-mail</label>
            <input id="em" className="field-dark" type="email" placeholder="Digite seu e-mail" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="nm">Como deseja ser chamado?</label>
            <input id="nm" className="field-dark" placeholder="Nome que aparecerá no atendimento" required maxLength={120}
              value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="free-tel">WhatsApp com DDD</label>
            <input id="free-tel" className="field-dark" type="tel" placeholder="WhatsApp com DDD" required autoComplete="tel"
              value={freeTelefone} onChange={e => setFreeTelefone(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="pw">Senha</label>
            <div style={{ position: "relative" }}>
              <input id="pw" className="field-dark" type={verSenha ? "text" : "password"} placeholder="Crie uma senha segura (mín. 8)"
                required minLength={8} autoComplete="new-password" style={{ width: "100%", paddingRight: 38 }}
                value={senha} onChange={e => setSenha(e.target.value)} />
              {eyeBtn(verSenha, () => setVerSenha(v => !v))}
            </div>
          </div>
          <div className="f">
            <label htmlFor="pw2">Confirmar senha</label>
            <input id="pw2" className="field-dark" type={verSenha ? "text" : "password"} placeholder="Confirme sua senha"
              required minLength={8} autoComplete="new-password"
              value={confirma} onChange={e => setConfirma(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="free-cpf">CPF (opcional)</label>
            <input id="free-cpf" className="field-dark" inputMode="numeric" placeholder="Só números, se quiser informar" maxLength={14}
              value={freeCpf} onChange={e => setFreeCpf(e.target.value.replace(/\D/g, ""))} />
          </div>
          {error && (
            <div className="ok show" style={{ borderColor: "color-mix(in srgb, var(--hbx-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 8%, transparent)", color: "var(--hbx-danger)" }}>
              {error}
            </div>
          )}
          {error && error.includes("já tem conta") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Link href="/login" className="btn-ghost" style={{ minHeight: 38, fontSize: "0.74rem", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Entrar com este e-mail</Link>
              <Link href="/reset-password" className="btn-ghost" style={{ minHeight: 38, fontSize: "0.74rem", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Recuperar senha</Link>
            </div>
          )}
          <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 44, fontSize: "0.84rem" }}>
            {busy ? "Enviando…" : "Criar conta grátis"}
          </button>
          <p style={{ margin: "2px 0 0", fontSize: "0.62rem", lineHeight: 1.5, color: "var(--text-muted)", textAlign: "center" }}>
            Ao criar a conta, você concorda com os Termos de uso e a Política de privacidade do HBX.
          </p>
          <div className="alt">Já tem conta? {onEntrar
            ? <button type="button" className="link" onClick={onEntrar}>Entrar</button>
            : <Link href="/?entrar" className="link" style={{ textDecoration: "none" }}>Entrar</Link>}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
            {["Dados protegidos 24/7 com criptografia", "Conformidade LGPD", "Infraestrutura segura e estável"].map(t => (
              <div key={t} style={{ padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.62rem", fontWeight: 700, lineHeight: 1.4, color: "var(--text-muted)", textAlign: "center" }}>
                {t}
              </div>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
