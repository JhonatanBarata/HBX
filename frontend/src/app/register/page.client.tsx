"use client";

// Criar conta (/register) — ordem do dono 12/06/2026: o "Falar com vendas"
// do login vira "Criar Conta" e aponta para cá. Campos da referência do
// dono (Empresa, E-mail, Como deseja ser chamado?, Senha, Confirmar),
// reconstruídos no PADRÃO novo (moldura do Login) — visual antigo não volta.
// Fluxo: POST /auth/signup → pendência de confirmação de e-mail → /confirm-email.

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { CheckoutPanel } from "@/components/hbx/checkout-panel";
import { HbxScene } from "@/components/hbx/hbx-scene";
import { apiFetch, setToken } from "@/lib/api";

type SignupResponse = {
  ok?: boolean;
  pendingEmailConfirmation?: boolean;
  message?: string;
  email?: string | null;
  previewUrl?: string | null;
  confirmUrl?: string | null;
  deliveryFailed?: boolean;
  // fluxo local/mock confirma na hora e pode devolver sessão + trial
  access_token?: string | null;
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

// Resumo do plano escolhido (coluna esquerda) — espelha o /planos. Copy minha.
const SNOW = ["M12 2v20", "M3.34 7l17.32 10", "M20.66 7L3.34 17", "M2 12h20"];
const TARGET = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"];
const BOLT = ["M13 2 4 14h7l-1 8 10-12h-9l1-8Z"];
const CUBE = ["M12 2 21 7v10l-9 5-9-5V7l9-5Z", "M3.3 7.2 12 12l8.7-4.8", "M12 12v10"];
const CHECK = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.4 12l2.4 2.4 4.8-5"];
const BARS = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
const SPARK = ["M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z"];
const PLAN_INFO: Record<string, { accent: string; tag: string; feats: string[]; ic: string[]; score?: string }> = {
  hbx_lite: { accent: "List", tag: "Você pede, o Radar entrega. Cards crus pra você esquentar e prospectar.", feats: ["Telefone, cidade, segmento e site", "Redes sociais quando encontradas", "880 leads por mês"], ic: SNOW },
  hbx_padrao: { accent: "Lead", tag: "Leads inteligentes: você já sabe quem ligar e o que dizer.", feats: ["WhatsApp verificado pela HBX", "Score, motivo e canal recomendado", "Mensagem pronta por segmento", "2.200 leads por mês"], ic: TARGET, score: "Score e motivo em cada lead" },
  hbx_pro: { accent: "Full", tag: "Atendimento no painel e Bot IA prospectando por você.", feats: ["Tudo do Lead", "Atendimento interno pelo painel", "Bot IA + prospecção pós-resposta", "3.500 leads por mês"], ic: BOLT },
  hbx_melhor: { accent: "Company", tag: "Tudo do Full + Recovery e integração com o seu ERP, montado pela HBX.", feats: ["Recovery de inadimplentes", "Cobrança integrada ao seu ERP", "Implantação feita pela HBX"], ic: CUBE },
};

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

function Ic({ paths }: { paths: string[] }) {
  return <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>{paths.map((d, i) => <path key={i} d={d} />)}</svg>;
}

type RegisterPanelProps = {
  selectedPlanKey?: string | null;
  embedded?: boolean;
};

export function RegisterPanel({ selectedPlanKey, embedded = false }: RegisterPanelProps) {
  const router = useRouter();
  // link de contratação do vendedor (/register?plan=X&hbxLead=...): o plano
  // do link entra no cadastro; o hbxLead fica na URL para rastreio.
  const [planFromLink] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("plan") || "";
      return PLANOS_VALIDOS.has(p) ? p : null;
    } catch { return null; }
  });
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

  const selectedPlan = selectedPlanKey && PLANOS_VALIDOS.has(selectedPlanKey) ? selectedPlanKey : planFromLink || "hbx_padrao";
  const isTrial = selectedPlan === "hbx_padrao";
  const info = PLAN_INFO[selectedPlan] || PLAN_INFO.hbx_padrao;
  const copy = PLANO_COPY[selectedPlan] || PLANO_COPY.hbx_padrao;
  // Checkout na casca: List/Full cobram na hora; Lead salva o cartão e NÃO cobra
  // (Plano B — trial com cartão, 1ª cobrança só no X+14, o backend adia). Company
  // não tem self-checkout (falar com especialista).
  const needsCheckout = selectedPlan !== "hbx_melhor";
  const showCheckout = Boolean(done?.access_token) && needsCheckout;

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
      // Sessão na mão (dev/mock confirma na hora) + plano com checkout → já autentica
      // pra o passo de pagamento na casca poder chamar /financeiro logado.
      if (res?.access_token && selectedPlan !== "hbx_melhor") setToken(res.access_token);
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

  const planAside = (
    <aside className="reg-plan">
          {isTrial && <span className="reg-plan__badge"><Ic paths={SPARK} />14 dias grátis</span>}
          <span className="reg-plan__ic"><Ic paths={info.ic} /></span>
          <strong className="reg-plan__name">HBX <span className="site-accent">{info.accent}</span></strong>
          <p className="reg-plan__tag">{info.tag}</p>
          {info.score && <span className="reg-plan__score"><Ic paths={BARS} />{info.score}</span>}
          <ul className="reg-plan__feats">
            {info.feats.map((f) => <li key={f}><Ic paths={CHECK} />{f}</li>)}
          </ul>
          {isTrial && <span className="reg-plan__note">Não cobramos nada por 14 dias. Cancele quando quiser.</span>}
    </aside>
  );

  const formContent = (
    <main className={"reg-form" + (embedded ? " reg-form--embedded" : "")}>
      {done ? (
        showCheckout ? (
          <CheckoutPanel
            planKey={selectedPlan}
            phone={whats}
            email={email}
            taxDoc={doc}
            name={nome}
            trialEndsAt={done.trialEndsAt}
            onSuccess={() => router.replace(done.next || "/dashboard")}
          />
        ) : (
        <div className="card">
          <h2>{done.access_token ? "Tudo pronto ✓" : selectedPlan === "hbx_melhor" ? "Recebido ✓" : "Conta criada ✓"}</h2>
          <p className="sub">
            {done.access_token
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

  if (embedded) return formContent;

  return (
    <HbxScene active="planos" plain>
      <div className="scene-register">
        {planAside}
        {formContent}
      </div>
    </HbxScene>
  );
}

export function RegisterClient() {
  return <RegisterPanel />;
}
