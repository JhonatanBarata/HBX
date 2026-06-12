"use client";

// Trabalhe Conosco (trilha Produtos & Comissão) — candidatura pública aberta.
// POST /gerencial/trabalhe-conosco/public com o companySlug da env
// NEXT_PUBLIC_HIRING_COMPANY_SLUG (configurável por ambiente; ?c= sobrepõe).
// Currículo v1 = LINK (Drive/LinkedIn); upload de documentos acontece no
// onboarding oficial após a aprovação (fluxo com anexos já existente).

import Link from "next/link";
import { useState } from "react";

import { apiFetch } from "@/lib/api";

const SLUG_ENV = process.env.NEXT_PUBLIC_HIRING_COMPANY_SLUG || "";

function slugAtivo() {
  try {
    const q = new URLSearchParams(window.location.search).get("c");
    return (q || SLUG_ENV).trim();
  } catch {
    return SLUG_ENV.trim();
  }
}

export function TrabalheConoscoClient() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", experience: "", resumeUrl: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok?: boolean; message?: string }>("/gerencial/trabalhe-conosco/public", {
        method: "POST",
        body: JSON.stringify({ companySlug: slugAtivo(), ...form }),
      });
      setDone(res?.message || "Candidatura recebida!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const campo = (label: string, key: keyof typeof form, props: Record<string, unknown> = {}) => (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.8 }}>{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "inherit", fontFamily: "inherit", fontSize: "0.9rem" }}
        {...props}
      />
    </div>
  );

  return (
    <div className="mkt">
      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">HBX</span>
            <span><strong>HBX System</strong><small>Leads, esteira mobile e recovery</small></span>
          </div>
          <nav className="nav">
            <Link href="/">Início</Link>
            <Link href="/planos">Planos</Link>
            <Link href="/login" className="enter">Entrar</Link>
          </nav>
        </header>

        <section className="section split" style={{ paddingTop: 28 }}>
          <div className="head">
            <span className="eyebrow">Trabalhe Conosco</span>
            <h2>Venda com a esteira na mão.</h2>
            <p>
              Aqui você não cata lead no escuro: a esteira entrega o contato pronto, com WhatsApp
              verificado, prioridade e a primeira mensagem sugerida. Sua comissão é combinada na
              entrada e acompanhada DENTRO do sistema — valor da venda, percentual e data de
              pagamento, tudo visível no seu card. Vendeu, viu, recebeu.
            </p>
            <div className="chips" style={{ marginTop: 14 }}>
              <span className="chip">Leads prontos na esteira</span>
              <span className="chip">Comissão transparente, D+3 úteis</span>
              <span className="chip">Trabalho 100% pelo celular</span>
            </div>
          </div>

          <div>
            {done ? (
              <article className="acard" style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Candidatura enviada ✓</h2>
                <p style={{ margin: 0 }}>{done}</p>
                <Link href="/" className="cta cta-success" style={{ textDecoration: "none", textAlign: "center" }}>Voltar ao início</Link>
              </article>
            ) : (
              <form onSubmit={onSubmit} className="acard" style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Candidate-se em 1 minuto</h2>
                {campo("Nome *", "name", { required: true, maxLength: 160, placeholder: "Seu nome" })}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {campo("WhatsApp *", "phone", { required: true, maxLength: 30, placeholder: "(11) 9 9999-9999", type: "tel" })}
                  {campo("Cidade", "city", { maxLength: 120, placeholder: "Onde você atua" })}
                </div>
                {campo("E-mail", "email", { type: "email", maxLength: 160, placeholder: "para o convite de acesso" })}
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.8 }}>Experiência com vendas</label>
                  <textarea
                    value={form.experience}
                    onChange={e => setForm(f => ({ ...f, experience: e.target.value }))}
                    rows={3} maxLength={1000} placeholder="Conte rapidinho o que você já vendeu e como"
                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "inherit", fontFamily: "inherit", fontSize: "0.9rem", resize: "vertical" }}
                  />
                </div>
                {campo("Link do currículo", "resumeUrl", { maxLength: 500, placeholder: "Drive, LinkedIn ou site (opcional)" })}
                {error && <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: "#ff9aa9" }}>{error}</p>}
                <button className="cta cta-success" type="submit" disabled={busy}>
                  {busy ? "Enviando…" : "Enviar candidatura"}
                </button>
                <p style={{ margin: 0, fontSize: "0.68rem", opacity: 0.7 }}>
                  Analisamos toda candidatura e respondemos pelo WhatsApp. Documentos só são pedidos na etapa de contratação.
                </p>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
