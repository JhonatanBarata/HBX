"use client";

// Formulário de cadastro EMBUTIDO no funil de planos (casca /?ver=planos).
// NÃO é mais uma tela própria: a rota /register só redireciona pra casca
// (register/page.tsx). Aqui mora SÓ o form — o resumo do plano (cards, preço,
// feature) é da casca, fonte única; este arquivo nunca mais duplica plano.
// Fluxo: POST /auth/signup → confirmação de e-mail → CheckoutPanel na mesma cena.

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { CheckoutPanel } from "@/components/hbx/checkout-panel";
import { apiFetch, setToken } from "@/lib/api";

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
  // fluxo produção: sessão restrita ao checkout (empresa em pending_checkout)
  checkout_token?: string | null;
  next?: string | null;
  trialEndsAt?: string | null;
};

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const PLANOS_VALIDOS = new Set(["hbx_lite", "hbx_padrao", "hbx_pro", "hbx_melhor"]);

const PLANO_COPY: Record<string, { formTitle: string; formSub: React.ReactNode; doneSub: string }> = {
  hbx_lite: {
    formTitle: "Criar sua conta",
    formSub: <>Você está ativando o <strong>HBX List</strong>. Cards com telefone, cidade, segmento e site para você esquentar e prospectar.</>,
    doneSub: "Sua conta HBX List está ativa. Acesse e peça sua primeira lista de leads no Radar.",
  },
  hbx_padrao: {
    formTitle: "Comece seu teste de 14 dias",
    formSub: <>Você está ativando o <strong>HBX Lead</strong>. Não cobramos nada por 14 dias — cancele quando quiser.</>,
    doneSub: "Seu teste de 14 dias está ativo. Acesse e veja seus primeiros leads inteligentes.",
  },
  hbx_pro: {
    formTitle: "Criar sua conta",
    formSub: <>Você está ativando o <strong>HBX Full</strong>. Atendimento no painel, Bot IA e prospecção automática na sua operação.</>,
    doneSub: "Sua conta HBX Full está ativa. Configure seu Bot IA e comece a prospectar no automático.",
  },
  hbx_melhor: {
    formTitle: "Falar com especialista",
    formSub: <>Deixe seus dados e um especialista HBX entra em contato pra montar o <strong>Company</strong> com você — Recovery, ERP e implantação.</>,
    doneSub: "Dados recebidos. Um especialista HBX vai falar com você pra montar seu plano.",
  },
};

type RegisterPanelProps = {
  selectedPlanKey?: string | null;
  embedded?: boolean;
};

export function RegisterPanel({ selectedPlanKey, embedded = false }: RegisterPanelProps) {
  const router = useRouter();
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [whats, setWhats] = useState("");
  const [doc, setDoc] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignupResponse | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const selectedPlan = selectedPlanKey && PLANOS_VALIDOS.has(selectedPlanKey) ? selectedPlanKey : "hbx_padrao";
  const isTrial = selectedPlan === "hbx_padrao";
  const copy = PLANO_COPY[selectedPlan] || PLANO_COPY.hbx_padrao;
  // Checkout na casca: List/Full cobram na hora; Lead salva o cartão e NÃO cobra
  // (Plano B — trial com cartão, 1ª cobrança só no X+14, o backend adia). Company
  // não tem self-checkout (falar com especialista).
  const needsCheckout = selectedPlan !== "hbx_melhor";
  // checkout_token = sessão de escopo restrito gerada no signup (produção).
  // access_token = sessão completa (mock/local que auto-confirma o e-mail).
  // Qualquer um dos dois habilita o CheckoutPanel na mesma cena.
  const showCheckout = Boolean(done?.access_token || done?.checkout_token) && needsCheckout;

  const handleGoogleCredential = useCallback(async (response: { credential: string }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<SignupResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken: response.credential, selectedPlanKey: selectedPlan }),
      });
      if (res?.access_token) setToken(res.access_token);
      else if (res?.checkout_token) setToken(res.checkout_token);
      setDone(res || { ok: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com Google. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }, [busy, selectedPlan]);

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
    setBusy(true);
    setError(null);
    try {
      // Entrada trial-first (ordem do dono 12/06/2026): plano Lead com 14
      // dias grátis já ativando na confirmação do e-mail — o telefone é
      // obrigatório no backend para liberar o trial.
      const res = await apiFetch<SignupResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          companyName: empresa,
          email,
          name: nome,
          password: senha,
          acceptedTerms: true,
          selectedPlanKey: selectedPlan,
          trialModuleSelection: "vendas",
          trialContactName: nome,
          trialContactPhone: whats,
          trialTaxDocument: doc,
        }),
      });
      // Sessão na mão: dev/mock devolve access_token (e-mail auto-confirmado);
      // produção devolve checkout_token (sessão restrita a /financeiro).
      // Em ambos os casos, o CheckoutPanel pode chamar a API autenticado.
      if (res?.access_token && selectedPlan !== "hbx_melhor") {
        setToken(res.access_token);
      } else if (res?.checkout_token && selectedPlan !== "hbx_melhor") {
        setToken(res.checkout_token);
      }
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
    router.replace(done.next || "/dashboard");
  }

  async function reenviar() {
    setResendMsg(null);
    try {
      await apiFetch("/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email: done?.email || email }),
      });
      setResendMsg("✓ Novo link enviado — verifique sua caixa de entrada.");
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "Não foi possível reenviar.");
    }
  }

  const eyeBtn = (on: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} aria-label={on ? "Ocultar senha" : "Mostrar senha"}
      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem" }}>
      {on ? "🙈" : "👁"}
    </button>
  );

  const formContent = (
    <main className={"reg-form" + (embedded ? " reg-form--embedded" : "")}>
      {done ? (
        showCheckout ? (
          <>
            {done.checkout_token && !done.access_token && (
              <div className="ok show" style={{ marginBottom: 8 }}>
                Confirmação enviada para {done.email || email}. Finalize o pagamento agora — você confirma depois.
                {done.previewUrl && (
                  <a className="link" href={done.previewUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, fontSize: "0.72rem" }}>
                    Ver e-mail (teste) ↗
                  </a>
                )}
              </div>
            )}
            <CheckoutPanel
              planKey={selectedPlan}
              phone={whats}
              email={email}
              taxDoc={doc}
              name={nome}
              trialEndsAt={done.trialEndsAt}
              onSuccess={() => router.replace(done.next || "/dashboard")}
            />
          </>
        ) : (
        <div className="card">
          <h2>{done.access_token ? "Tudo pronto ✓" : selectedPlan === "hbx_melhor" ? "Recebido ✓" : "Conta criada ✓"}</h2>
          <p className="sub">
            {done.access_token
              ? copy.doneSub
              : selectedPlan === "hbx_melhor"
                ? copy.doneSub
                : (isTrial
                  ? "Falta um passo: confirme seu e-mail para ativar o teste grátis."
                  : "Falta um passo: confirme seu e-mail para ativar sua conta.")}
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
              <button className="btn-ghost" type="button" onClick={reenviar} style={{ minHeight: 40, fontSize: "0.78rem" }}>
                Reenviar confirmação
              </button>
              <Link href="/login" className="btn-teal" style={{ minHeight: 44, fontSize: "0.84rem", textDecoration: "none" }}>
                Ir para o login
              </Link>
            </React.Fragment>
          )}
        </div>
        )
      ) : (
        <form className="card" onSubmit={onSubmit}>
          <h2>{copy.formTitle}</h2>
          <p className="sub">{copy.formSub}</p>
          {GOOGLE_CLIENT_ID && selectedPlan !== "hbx_melhor" && (
            <>
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
            <label htmlFor="wa">WhatsApp</label>
            <input id="wa" className="field-dark" type="tel" placeholder="(11)99999-9999" required maxLength={14} autoComplete="tel"
              value={whats} onChange={e => setWhats(formatWhatsapp(e.target.value))} />
          </div>
          <div className="f">
            <label htmlFor="doc">CPF ou CNPJ</label>
            <input id="doc" className="field-dark" placeholder={isTrial ? "Ativa o teste grátis — sem cobrança" : "CPF ou CNPJ"} required maxLength={20}
              value={doc} onChange={e => setDoc(e.target.value)} />
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
            {busy ? "Enviando…" : selectedPlan === "hbx_melhor" ? "Falar com especialista" : isTrial ? "Começar teste grátis" : "Criar conta"}
          </button>
          <p style={{ margin: "2px 0 0", fontSize: "0.62rem", lineHeight: 1.5, color: "var(--text-muted)", textAlign: "center" }}>
            Ao criar a conta, você concorda com os Termos de uso e a Política de privacidade do HBX.
          </p>
          <div className="alt">Já tem conta? <Link href="/login" className="link" style={{ textDecoration: "none" }}>Entrar</Link></div>
          {!embedded && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
              {["Dados protegidos 24/7 com criptografia", "Conformidade LGPD", "Infraestrutura segura e estável"].map(t => (
                <div key={t} style={{ padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.62rem", fontWeight: 700, lineHeight: 1.4, color: "var(--text-muted)", textAlign: "center" }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </main>
  );

  return formContent;
}
