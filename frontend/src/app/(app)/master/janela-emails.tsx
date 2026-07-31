"use client";

// Janela 4 — E-mails (editor de templates do master).
// Contratos ligados (MasterEmailController, master/email):
//   GET  /master/email/templates          → todos os kinds + variáveis
//   PUT  /master/email/templates/:kind    → salvar {subject, text}
//   POST /master/email/templates/:kind/restore → volta ao padrão
//   POST /master/email/templates/:kind/test    → envio de teste {to, sampleName, sampleCompany}
//   GET  /master/email                    → remetente/anexo/cartão/formState
//   POST|DELETE /master/email/attachment      → PPTX da apresentação (FormData)
//   POST|DELETE /master/email/business-card   → imagem da assinatura (FormData)
//   POST /master/email/send                → envio avulso da apresentação
//     (o backend renderiza {nome}/{email} e exige o PPTX carregado)
//   PUT  /master/email/settings            → formState (e-mail de teste etc.)
// É aqui que o dono edita o rascunho de vendedor (seller_welcome /
// seller_onboarding_request). Fase 2 completa (ordem do dono 12/06/2026).

import React, { useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type VariableDef = { key: string; token: string; label: string; group?: string; description?: string };

type Template = {
  kind: string;
  label?: string;
  isSystem?: boolean;
  subject: string;
  text: string;
  html?: string | null;
  variables?: string[];
  variableDefinitions?: VariableDef[];
  requiredVariable?: string | null;
  usesSignature?: boolean;
  usesAttachment?: boolean;
};

// rótulo de campo reutilizado (Lei 2 — visual repetido vira um único ponto)
const lbl = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" } as const;

type EmailState = {
  sender?: { from?: string | null; replyTo?: string | null; ready?: boolean; mode?: string; missing?: string[] };
  attachment?: { originalName?: string | null; size?: number | null } | null;
  businessCard?: { originalName?: string | null; mimeType?: string | null } | null;
  formState?: { testEmail?: string | null; sampleName?: string | null; sampleCompany?: string | null } | null;
} | null;

const KIND_LABEL: Record<string, string> = {
  normal: "Apresentação",
  password_reset: "Recuperação de senha",
  email_confirmation: "Confirmação de e-mail",
  seller_welcome: "Boas-vindas do vendedor",
  seller_onboarding_request: "Onboarding do vendedor",
};

export function JanelaEmails() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estado, setEstado] = useState<EmailState>(null);

  const [kind, setKind] = useState<string>("normal");
  const [form, setForm] = useState({ subject: "", text: "" });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [restoreArm, setRestoreArm] = useState(false);
  const [removerArm, setRemoverArm] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoLabel, setNovoLabel] = useState("");
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const [teste, setTeste] = useState({ to: "", sampleName: "", sampleCompany: "" });
  const [testeBusy, setTesteBusy] = useState(false);
  const [testeMsg, setTesteMsg] = useState<string | null>(null);

  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // envio avulso da apresentação (POST /master/email/send) — usa o assunto/
  // texto ATUAIS do editor do template "normal"; o backend renderiza as
  // variáveis e anexa o PPTX + cartão
  const [envioForm, setEnvioForm] = useState({ recipientName: "", recipientEmail: "" });
  const [envioBusy, setEnvioBusy] = useState(false);
  const [envioMsg, setEnvioMsg] = useState<string | null>(null);

  // settings persistidos (PUT /master/email/settings)
  const [settingsBusy, setSettingsBusy] = useState(false);

  function aplicarTemplate(lista: Template[], k: string) {
    const t = lista.find(x => x.kind === k);
    if (t) {
      setForm({ subject: t.subject || "", text: t.text || "" });
      setDirty(false);
    }
  }

  useEffect(() => {
    let alive = true;
    apiFetch<{ templates?: Template[] }>("/master/email/templates")
      .then(res => {
        if (!alive) return;
        const lista = Array.isArray(res?.templates) ? res.templates : [];
        setTemplates(lista);
        setLoadError(null);
        aplicarTemplate(lista, "normal");
      })
      .catch((err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : "Falha ao carregar os templates."); });
    apiFetch<EmailState>("/master/email")
      .then(res => {
        if (!alive) return;
        setEstado(res);
        setTeste(t => ({
          ...t,
          to: String(res?.formState?.testEmail || ""),
          sampleName: String(res?.formState?.sampleName || ""),
          sampleCompany: String(res?.formState?.sampleCompany || ""),
        }));
      })
      .catch(() => { /* estado do remetente é informativo */ });
    return () => { alive = false; };
  }, []);

  function trocarKind(k: string) {
    if (dirty && !window.confirm("Há alterações não salvas neste template. Trocar mesmo assim?")) return;
    setKind(k);
    setMsg(null);
    setTesteMsg(null);
    setRestoreArm(false);
    setRemoverArm(false);
    if (templates) aplicarTemplate(templates, k);
  }

  async function recarregarTemplates(selKind?: string) {
    const res = await apiFetch<{ templates?: Template[] }>("/master/email/templates");
    const lista = Array.isArray(res?.templates) ? res.templates : [];
    setTemplates(lista);
    const alvo = (selKind && lista.find(t => t.kind === selKind) && selKind)
      || (lista.find(t => t.kind === kind) && kind)
      || lista[0]?.kind
      || "normal";
    setKind(alvo);
    aplicarTemplate(lista, alvo);
  }

  const atual = templates?.find(t => t.kind === kind) || null;

  function inserirVariavel(token: string) {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.text.length;
    const end = el.selectionEnd ?? form.text.length;
    const next = form.text.slice(0, start) + token + form.text.slice(end);
    setForm(f => ({ ...f, text: next }));
    setDirty(true);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function salvar() {
    if (busy || !atual) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; template?: Template }>(`/master/email/templates/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ subject: form.subject, text: form.text }),
      });
      setMsg("✓ Template salvo.");
      setDirty(false);
      if (res?.template && templates) {
        setTemplates(templates.map(t => (t.kind === kind ? { ...t, ...res.template } : t)));
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao salvar o template.");
    } finally {
      setBusy(false);
    }
  }

  async function restaurar() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; template?: Template }>(`/master/email/templates/${kind}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res?.template) {
        setForm({ subject: res.template.subject || "", text: res.template.text || "" });
        if (templates) setTemplates(templates.map(t => (t.kind === kind ? { ...t, ...res.template } : t)));
      }
      setDirty(false);
      setMsg("✓ Template restaurado ao padrão.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
      setRestoreArm(false);
    }
  }

  async function criarTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ template?: Template }>("/master/email/templates", {
        method: "POST",
        body: JSON.stringify({ label: novoLabel }),
      });
      setNovoOpen(false);
      setNovoLabel("");
      await recarregarTemplates(res?.template?.kind);
      setMsg("✓ Template criado — escreva o conteúdo e salve.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao criar o template.");
    } finally {
      setBusy(false);
    }
  }

  async function removerTemplate() {
    if (busy || !atual || atual.isSystem) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/master/email/templates/${encodeURIComponent(kind)}`, { method: "DELETE" });
      await recarregarTemplates("normal");
      setMsg("✓ Template removido.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao remover o template.");
    } finally {
      setBusy(false);
      setRemoverArm(false);
    }
  }

  async function enviarTeste(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (testeBusy) return;
    setTesteBusy(true);
    setTesteMsg(null);
    try {
      if (dirty) await salvar(); // teste dispara o template salvo — salva antes
      await apiFetch(`/master/email/templates/${kind}/test`, {
        method: "POST",
        body: JSON.stringify({
          to: teste.to.trim(),
          ...(teste.sampleName.trim() ? { sampleName: teste.sampleName.trim() } : {}),
          ...(teste.sampleCompany.trim() ? { sampleCompany: teste.sampleCompany.trim() } : {}),
        }),
      });
      setTesteMsg(`✓ Teste enviado para ${teste.to.trim()}.`);
    } catch (err) {
      setTesteMsg(err instanceof Error ? err.message : "Falha ao enviar o teste.");
    } finally {
      setTesteBusy(false);
    }
  }

  async function enviarApresentacao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envioBusy) return;
    setEnvioBusy(true);
    setEnvioMsg(null);
    try {
      if (dirty) await salvar(); // o envio usa o template salvo + edição atual
      const normal = templates?.find(t => t.kind === "normal");
      await apiFetch("/master/email/send", {
        method: "POST",
        body: JSON.stringify({
          recipientName: envioForm.recipientName.trim(),
          recipientEmail: envioForm.recipientEmail.trim(),
          subject: (kind === "normal" ? form.subject : normal?.subject) || "Apresentação HBX System",
          text: (kind === "normal" ? form.text : normal?.text) || "",
        }),
      });
      setEnvioMsg(`✓ Apresentação enviada para ${envioForm.recipientEmail.trim()}.`);
      // guarda o último destinatário no formState do master
      apiFetch("/master/email/settings", {
        method: "PUT",
        body: JSON.stringify({ recipientName: envioForm.recipientName.trim(), recipientEmail: envioForm.recipientEmail.trim() }),
      }).catch((err: unknown) => {
        // persistência do form é conveniência — não trava o envio (que já foi
        // feito), mas o dono precisa saber que o destinatário NÃO foi memorizado
        // pra próxima vez (achado C8/CORRECOES.md: catch mudo escondia isso).
        console.warn("Falha ao memorizar destinatário da apresentação:", err);
        setEnvioMsg(`✓ Apresentação enviada para ${envioForm.recipientEmail.trim()}, mas não consegui memorizar o destinatário para a próxima vez.`);
      });
      setEnvioForm({ recipientName: "", recipientEmail: "" });
    } catch (err) {
      setEnvioMsg(err instanceof Error ? err.message : "Falha ao enviar a apresentação.");
    } finally {
      setEnvioBusy(false);
    }
  }

  async function salvarSettingsTeste() {
    if (settingsBusy) return;
    setSettingsBusy(true);
    try {
      await apiFetch("/master/email/settings", {
        method: "PUT",
        body: JSON.stringify({
          testEmail: teste.to.trim() || null,
          sampleName: teste.sampleName.trim() || null,
          sampleCompany: teste.sampleCompany.trim() || null,
        }),
      });
      setTesteMsg("✓ Dados de teste salvos como padrão.");
    } catch (err) {
      setTesteMsg(err instanceof Error ? err.message : "Falha ao salvar os dados de teste.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function upload(tipo: "attachment" | "business-card", file: File | null) {
    if (!file || uploadBusy) return;
    setUploadBusy(tipo);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch(`/master/email/${tipo}`, { method: "POST", body: fd });
      const res = await apiFetch<EmailState>("/master/email");
      setEstado(res);
      setUploadMsg("✓ Arquivo atualizado.");
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setUploadBusy(null);
    }
  }

  async function removerArquivo(tipo: "attachment" | "business-card") {
    if (uploadBusy) return;
    setUploadBusy(tipo);
    setUploadMsg(null);
    try {
      await apiFetch(`/master/email/${tipo}`, { method: "DELETE" });
      const res = await apiFetch<EmailState>("/master/email");
      setEstado(res);
      setUploadMsg("✓ Arquivo removido.");
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setUploadBusy(null);
    }
  }

  return (
    <React.Fragment>
      {loadError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {(templates || []).map(t => (
          <button key={t.kind} className="btn-ghost" onClick={() => trocarKind(t.kind)}
            style={t.kind === kind ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
            {t.label || KIND_LABEL[t.kind] || t.kind}
          </button>
        ))}
        <button className="btn-teal" disabled={busy} onClick={() => { setNovoOpen(true); setNovoLabel(""); }} title="Criar template">
          <I d={ICONS.plus} size={13} /> Novo
        </button>
        {atual && atual.isSystem === false && (
          removerArm ? (
            <button className="btn-ghost btn-danger" disabled={busy} onClick={removerTemplate} title="Confirmar remoção">
              <I d={ICONS.minus} size={13} /> Confirmar remoção
            </button>
          ) : (
            <button className="btn-ghost btn-danger" disabled={busy} onClick={() => setRemoverArm(true)}
              title={`Remover "${atual.label || KIND_LABEL[atual.kind] || atual.kind}"`}>
              <I d={ICONS.minus} size={13} /> Remover
            </button>
          )
        )}
        {!templates && !loadError && <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Carregando templates…</span>}
      </div>

      {atual && (
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, alignItems: "start" }}>
          <section className="panel">
            <div className="panel-head">
              <h2>{atual.label || KIND_LABEL[atual.kind] || atual.kind}</h2>
              <div className="meta">
                {atual.isSystem !== false && (
                  restoreArm ? (
                    <button className="btn-ghost btn-danger" disabled={busy} onClick={restaurar}>Confirmar restauração</button>
                  ) : (
                    <button className="btn-ghost" disabled={busy} onClick={() => setRestoreArm(true)}>Restaurar padrão</button>
                  )
                )}
                <button className="btn-teal" disabled={busy || !dirty} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
              </div>
            </div>
            <div style={{ padding: "12px 16px 16px", display: "grid", gap: 12 }}>
              {msg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{msg}</div>
              )}
              {atual.requiredVariable && (
                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>
                  Este template precisa conter <b style={{ fontFamily: "var(--font-mono)" }}>{atual.requiredVariable}</b>.
                </span>
              )}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Assunto</label>
                <input className="field-dark" maxLength={180} value={form.subject}
                  onChange={e => { setForm(f => ({ ...f, subject: e.target.value })); setDirty(true); }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Texto</label>
                <textarea ref={textRef} className="field-dark" rows={14} maxLength={12000} value={form.text}
                  style={{ padding: "10px 12px", lineHeight: 1.55, resize: "vertical", minHeight: 260 }}
                  onChange={e => { setForm(f => ({ ...f, text: e.target.value })); setDirty(true); }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(atual.variableDefinitions || []).map(v => (
                  <button key={v.key} className="btn-ghost" title={v.description || v.label}
                    style={{ minHeight: 24, fontSize: "var(--hbx-font-min)", padding: "0 8px", fontFamily: "var(--font-mono)" }}
                    onClick={() => inserirVariavel(v.token)}>
                    {v.token}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Clique numa variável para inserir no texto, na posição do cursor.</span>
            </div>
          </section>

          <div style={{ display: "grid", gap: 14 }}>
            <section className="panel">
              <div className="panel-head"><h2>Enviar apresentação a um contato</h2></div>
              <form onSubmit={enviarApresentacao} style={{ padding: "12px 16px 16px", display: "grid", gap: 10 }}>
                {envioMsg && (
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: envioMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)", lineHeight: 1.5 }}>{envioMsg}</div>
                )}
                {!estado?.attachment && (
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--hbx-warning)", fontWeight: 700 }}>
                    Carregue o PPTX da apresentação abaixo antes de enviar (o backend exige o anexo).
                  </span>
                )}
                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Usa o template “Apresentação” (com suas edições) — as variáveis {"{nome}"}/{"{email}"} são preenchidas com o contato.
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={lbl}>Nome do contato *</label>
                    <input className="field-dark" required maxLength={120} value={envioForm.recipientName}
                      onChange={e => setEnvioForm(f => ({ ...f, recipientName: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={lbl}>E-mail *</label>
                    <input className="field-dark" type="email" required maxLength={180} value={envioForm.recipientEmail}
                      onChange={e => setEnvioForm(f => ({ ...f, recipientEmail: e.target.value }))} />
                  </div>
                </div>
                <button className="btn-teal" type="submit" disabled={envioBusy || !estado?.attachment}>
                  {envioBusy ? "Enviando…" : "Enviar apresentação"}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Enviar teste</h2></div>
              <form onSubmit={enviarTeste} style={{ padding: "12px 16px 16px", display: "grid", gap: 10 }}>
                {testeMsg && (
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: testeMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)", lineHeight: 1.5 }}>{testeMsg}</div>
                )}
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>E-mail de teste *</label>
                  <input className="field-dark" type="email" required maxLength={180} value={teste.to}
                    onChange={e => setTeste(t => ({ ...t, to: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={lbl}>Nome</label>
                    <input className="field-dark" maxLength={120} value={teste.sampleName}
                      onChange={e => setTeste(t => ({ ...t, sampleName: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={lbl}>Empresa</label>
                    <input className="field-dark" maxLength={180} value={teste.sampleCompany}
                      onChange={e => setTeste(t => ({ ...t, sampleCompany: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-teal" type="submit" disabled={testeBusy} style={{ flex: 1 }}>
                    {testeBusy ? "Enviando…" : dirty ? "Salvar e enviar teste" : "Enviar teste"}
                  </button>
                  <button className="btn-ghost" type="button" disabled={settingsBusy} onClick={salvarSettingsTeste} title="Guardar e-mail/amostras como padrão">
                    {settingsBusy ? "…" : "Salvar padrão"}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Remetente e anexos</h2></div>
              <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10, fontSize: "0.74rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>Remetente</span>
                  <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{estado?.sender?.from || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>Status</span>
                  <span className={estado?.sender?.ready ? "tag teal" : "tag warn"}>
                    {estado?.sender?.ready ? "pronto" : `pendente${estado?.sender?.missing?.length ? `: ${estado.sender.missing.join(", ")}` : ""}`}
                  </span>
                </div>
                {uploadMsg && (
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: uploadMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{uploadMsg}</div>
                )}
                <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 10, display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: "0.72rem" }}>Apresentação (.pptx)</strong>
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{estado?.attachment?.originalName || "Nenhum anexo."}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label className="btn-ghost" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)", cursor: "pointer" }}>
                      {uploadBusy === "attachment" ? "Enviando…" : "Enviar PPTX"}
                      <input type="file" accept=".pptx" style={{ display: "none" }} disabled={uploadBusy != null}
                        onChange={e => { upload("attachment", e.target.files?.[0] || null); e.target.value = ""; }} />
                    </label>
                    {estado?.attachment && (
                      <button className="btn-ghost btn-danger" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)" }} disabled={uploadBusy != null}
                        onClick={() => removerArquivo("attachment")}>Remover</button>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 10, display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: "0.72rem" }}>Cartão de visitas (assinatura)</strong>
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{estado?.businessCard?.originalName || "Nenhuma imagem."}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label className="btn-ghost" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)", cursor: "pointer" }}>
                      {uploadBusy === "business-card" ? "Enviando…" : "Enviar imagem"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={uploadBusy != null}
                        onChange={e => { upload("business-card", e.target.files?.[0] || null); e.target.value = ""; }} />
                    </label>
                    {estado?.businessCard && (
                      <button className="btn-ghost btn-danger" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)" }} disabled={uploadBusy != null}
                        onClick={() => removerArquivo("business-card")}>Remover</button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {novoOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setNovoOpen(false); }}>
          <form className="hbx-modal" onSubmit={criarTemplate} style={{ width: "min(380px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Novo template
              <span style={{ cursor: "pointer" }} onClick={() => setNovoOpen(false)}>✕</span>
            </h3>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome do template *</label>
              <input className="field-dark" required minLength={3} maxLength={120}
                value={novoLabel} onChange={e => setNovoLabel(e.target.value)} />
            </div>
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 40 }}>
              {busy ? "Criando…" : "Criar template"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
