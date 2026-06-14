"use client";

// Criar conta (/register) — ordem do dono 12/06/2026: o "Falar com vendas"
// do login vira "Criar Conta" e aponta para cá. Campos da referência do
// dono (Empresa, E-mail, Como deseja ser chamado?, Senha, Confirmar),
// reconstruídos no PADRÃO novo (moldura do Login) — visual antigo não volta.
// Fluxo: POST /auth/signup → pendência de confirmação de e-mail → /confirm-email.

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { AuthSplit } from "@/components/hbx/auth-split";
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

const PLANOS_VALIDOS = new Set(["hbx_lite", "hbx_padrao", "hbx_melhor"]);

export function RegisterClient() {
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
          selectedPlanKey: planFromLink || "hbx_padrao",
          trialModuleSelection: "vendas",
          trialContactName: nome,
          trialContactPhone: whats,
          trialTaxDocument: doc,
        }),
      });
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

  return (
    <AuthSplit>
      {done ? (
        <div className="card">
          <h2>{done.access_token ? "Tudo pronto ✓" : "Conta criada ✓"}</h2>
          <p className="sub">
            {done.access_token
              ? "Seu teste grátis de 14 dias está ativo. Bora ver a esteira encontrar seus primeiros leads."
              : "Falta um passo: confirme seu e-mail para ativar o teste grátis."}
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
      ) : (
        <form className="card" onSubmit={onSubmit}>
          <h2>Teste grátis por 14 dias</h2>
          <p className="sub">Você vai testar o <strong>HBX Lead Plus</strong> por 14 dias, sem cartão de crédito. Crie sua conta e veja a esteira encontrar seus primeiros leads ainda hoje.</p>
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
            <input id="doc" className="field-dark" placeholder="Ativa o teste grátis — sem cobrança" required maxLength={20}
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
            {busy ? "Criando…" : "Criar Conta"}
          </button>
          <p style={{ margin: "2px 0 0", fontSize: "0.62rem", lineHeight: 1.5, color: "var(--text-muted)", textAlign: "center" }}>
            Ao criar a conta, você concorda com os Termos de uso e a Política de privacidade do HBX.
          </p>
          <div className="alt">Já tem conta? <Link href="/login" className="link" style={{ textDecoration: "none" }}>Entrar</Link></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
            {["Dados protegidos 24/7 com criptografia", "Conformidade LGPD", "Infraestrutura segura e estável"].map(t => (
              <div key={t} style={{ padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.62rem", fontWeight: 700, lineHeight: 1.4, color: "var(--text-muted)", textAlign: "center" }}>
                {t}
              </div>
            ))}
          </div>
        </form>
      )}
    </AuthSplit>
  );
}
