"use client";

// Seção "E-mail" de /configuracoes (PR12062026005) — módulo de e-mail POR
// EMPRESA, porta da janela E-mails do Master para o contrato company-email:
//   GET  /company-email                        → settings + sender + anexos
//   PUT  /company-email/settings               → SMTP/remetente/ativar/disparos
//   GET  /company-email/templates              → templates da empresa
//   POST /company-email/templates              → "+" criar template
//   PUT  /company-email/templates/:kind        → salvar
//   DELETE /company-email/templates/:kind      → remover (só os seus)
//   POST /company-email/templates/:kind/restore→ restaurar (só os padrão/HBX)
//   POST /company-email/templates/:kind/test   → teste pelo SMTP da empresa
//   POST|DELETE /company-email/attachment      → PPTX (FormData)
//   POST|DELETE /company-email/business-card   → cartão/assinatura (FormData)
//   POST /company-email/send                   → envio avulso
// Regra do dono: cada empresa usa o PRÓPRIO SMTP; só o HBX admin compartilha
// o transporte do Master (sender.mode = hbx_shared — campos SMTP nem aparecem).

import React, { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type VariableDef = { key: string; token: string; label: string; group: string; description: string };

type Template = {
  kind: string;
  label: string;
  subject: string;
  text: string;
  html?: string | null;
  isSeeded: boolean;
  updatedAt?: string | null;
  variables?: string[];
  variableDefinitions?: VariableDef[];
  requiredVariable?: string | null;
};

type EmailState = {
  enabled: boolean;
  hbxShared: boolean;
  smtp?: { host?: string | null; port?: number | null; secure?: boolean; user?: string | null; hasPass?: boolean } | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  sender?: { mode?: string; ready?: boolean; from?: string | null; missing?: string[] };
  formState?: { testEmail?: string | null; sampleName?: string | null; sampleCompany?: string | null } | null;
  dispatch?: { welcomeTemplateKind?: string | null; onboardingTemplateKind?: string | null };
  attachment?: { originalName?: string | null; size?: number | null } | null;
  businessCard?: { originalName?: string | null } | null;
} | null;

const GROUP_LABEL: Record<string, string> = {
  contato: "Contato",
  vendedor: "Vendedor",
  card: "Card",
  links: "Links",
  sistema: "Sistema",
};

function fmtBytes(size?: number | null) {
  const n = Number(size || 0);
  if (!n) return "";
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function CompanyEmailSection() {
  const [estado, setEstado] = useState<EmailState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [smtpForm, setSmtpForm] = useState({ host: "", port: "", user: "", pass: "", fromName: "", fromEmail: "", replyTo: "" });
  const [teste, setTeste] = useState({ to: "", sampleName: "", sampleCompany: "" });
  const [disparos, setDisparos] = useState({ welcome: "", onboarding: "" });

  const carregar = useCallback(() => {
    return apiFetch<EmailState>("/company-email")
      .then(res => {
        setEstado(res);
        setLoadError(null);
        setSmtpForm({
          host: res?.smtp?.host || "",
          port: res?.smtp?.port ? String(res.smtp.port) : "",
          user: res?.smtp?.user || "",
          pass: "",
          fromName: res?.fromName || "",
          fromEmail: res?.fromEmail || "",
          replyTo: res?.replyTo || "",
        });
        // hidrata teste/disparos do servidor (mantém o que o usuário digitou)
        setTeste(t => ({
          to: t.to || res?.formState?.testEmail || "",
          sampleName: t.sampleName || res?.formState?.sampleName || "",
          sampleCompany: t.sampleCompany || res?.formState?.sampleCompany || "",
        }));
        setDisparos({
          welcome: res?.dispatch?.welcomeTemplateKind || "",
          onboarding: res?.dispatch?.onboardingTemplateKind || "",
        });
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Falha ao carregar o módulo de e-mail."));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function putSettings(body: Record<string, unknown>, okMsg: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/company-email/settings", { method: "PUT", body: JSON.stringify(body) });
      setMsg(`✓ ${okMsg}`);
      await carregar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function alternarAtivo() {
    putSettings({ enabled: !estado?.enabled }, estado?.enabled ? "Módulo de e-mail desativado." : "Módulo de e-mail ativado.");
  }

  function salvarSmtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    putSettings({
      smtpHost: smtpForm.host,
      smtpPort: smtpForm.port ? Number(smtpForm.port) : null,
      smtpUser: smtpForm.user,
      ...(smtpForm.pass.trim() ? { smtpPass: smtpForm.pass } : {}),
      fromName: smtpForm.fromName,
      fromEmail: smtpForm.fromEmail,
      replyTo: smtpForm.replyTo,
    }, "Configuração de envio salva.");
  }

  // ------------------------- templates -------------------------
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [kind, setKind] = useState("");
  const [tplForm, setTplForm] = useState({ subject: "", text: "" });
  const [tplDirty, setTplDirty] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoLabel, setNovoLabel] = useState("");
  const [removerArm, setRemoverArm] = useState(false);
  const [restoreArm, setRestoreArm] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const carregarTemplates = useCallback((selecionar?: string) => {
    return apiFetch<{ templates?: Template[] }>("/company-email/templates")
      .then(res => {
        const list = Array.isArray(res?.templates) ? res.templates : [];
        setTemplates(list);
        const alvo = selecionar || kind;
        const t = list.find(x => x.kind === alvo) || list[0] || null;
        if (t) {
          setKind(t.kind);
          setTplForm({ subject: t.subject || "", text: t.text || "" });
          setTplDirty(false);
        } else {
          setKind("");
          setTplForm({ subject: "", text: "" });
        }
      })
      .catch(() => setTemplates([]));
  }, [kind]);

  useEffect(() => {
    if (estado?.enabled && templates === null) carregarTemplates();
  }, [estado?.enabled, templates, carregarTemplates]);

  const atual = (templates || []).find(t => t.kind === kind) || null;

  function selecionarTemplate(novoKind: string) {
    const t = (templates || []).find(x => x.kind === novoKind);
    setKind(novoKind);
    setTplMsg(null);
    setRemoverArm(false);
    setRestoreArm(false);
    if (t) {
      setTplForm({ subject: t.subject || "", text: t.text || "" });
      setTplDirty(false);
    }
  }

  function inserirVariavel(token: string) {
    const el = textRef.current;
    if (!el) {
      setTplForm(f => ({ ...f, text: `${f.text}${token}` }));
      setTplDirty(true);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setTplForm(f => ({ ...f, text: next }));
    setTplDirty(true);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function salvarTemplate() {
    if (!kind || tplBusy) return;
    setTplBusy(true);
    setTplMsg(null);
    try {
      await apiFetch(`/company-email/templates/${encodeURIComponent(kind)}`, {
        method: "PUT",
        body: JSON.stringify({ subject: tplForm.subject, text: tplForm.text }),
      });
      setTplMsg("✓ Template salvo.");
      await carregarTemplates(kind);
    } catch (err) {
      setTplMsg(err instanceof Error ? err.message : "Não foi possível salvar o template.");
    } finally {
      setTplBusy(false);
    }
  }

  async function criarTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tplBusy) return;
    setTplBusy(true);
    setTplMsg(null);
    try {
      const res = await apiFetch<{ template?: Template }>("/company-email/templates", {
        method: "POST",
        body: JSON.stringify({ label: novoLabel }),
      });
      setNovoOpen(false);
      setNovoLabel("");
      setTplMsg("✓ Template criado — escreva o conteúdo e salve.");
      await carregarTemplates(res?.template?.kind);
    } catch (err) {
      setTplMsg(err instanceof Error ? err.message : "Não foi possível criar o template.");
    } finally {
      setTplBusy(false);
    }
  }

  async function removerTemplate() {
    if (!kind || tplBusy) return;
    setTplBusy(true);
    setTplMsg(null);
    try {
      await apiFetch(`/company-email/templates/${encodeURIComponent(kind)}`, { method: "DELETE" });
      setTplMsg("✓ Template removido.");
      setKind("");
      await carregarTemplates();
    } catch (err) {
      setTplMsg(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setTplBusy(false);
      setRemoverArm(false);
    }
  }

  async function restaurarTemplate() {
    if (!kind || tplBusy) return;
    setTplBusy(true);
    setTplMsg(null);
    try {
      await apiFetch(`/company-email/templates/${encodeURIComponent(kind)}/restore`, { method: "POST", body: JSON.stringify({}) });
      setTplMsg("✓ Template restaurado ao padrão.");
      await carregarTemplates(kind);
    } catch (err) {
      setTplMsg(err instanceof Error ? err.message : "Não foi possível restaurar.");
    } finally {
      setTplBusy(false);
      setRestoreArm(false);
    }
  }

  // ------------------------- teste -------------------------
  const [testeBusy, setTesteBusy] = useState(false);
  const [testeMsg, setTesteMsg] = useState<string | null>(null);

  async function enviarTeste() {
    if (!kind || testeBusy) return;
    setTesteBusy(true);
    setTesteMsg(null);
    try {
      if (tplDirty) await salvarTemplate();
      const res = await apiFetch<{ ok?: boolean; delivery?: { errorMessage?: string | null } }>(
        `/company-email/templates/${encodeURIComponent(kind)}/test`,
        { method: "POST", body: JSON.stringify(teste) },
      );
      setTesteMsg(res?.ok ? `✓ Teste enviado para ${teste.to}.` : res?.delivery?.errorMessage || "O envio de teste falhou.");
      apiFetch("/company-email/settings", {
        method: "PUT",
        body: JSON.stringify({ testEmail: teste.to, sampleName: teste.sampleName, sampleCompany: teste.sampleCompany }),
      }).catch(() => { /* formState é conveniência */ });
    } catch (err) {
      setTesteMsg(err instanceof Error ? err.message : "O envio de teste falhou.");
    } finally {
      setTesteBusy(false);
    }
  }

  // ------------------------- anexos -------------------------
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function uploadAsset(tipo: "attachment" | "business-card", file: File | null | undefined) {
    if (!file || uploadBusy) return;
    setUploadBusy(tipo);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch(`/company-email/${tipo}`, { method: "POST", body: fd });
      setUploadMsg(`✓ ${tipo === "attachment" ? "Apresentação anexada." : "Cartão atualizado."}`);
      await carregar();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setUploadBusy(null);
    }
  }

  async function removerAsset(tipo: "attachment" | "business-card") {
    if (uploadBusy) return;
    setUploadBusy(tipo);
    setUploadMsg(null);
    try {
      await apiFetch(`/company-email/${tipo}`, { method: "DELETE" });
      setUploadMsg("✓ Removido.");
      await carregar();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setUploadBusy(null);
    }
  }

  // ------------------------- envio avulso -------------------------
  const [envio, setEnvio] = useState({ recipientName: "", recipientEmail: "" });
  const [envioBusy, setEnvioBusy] = useState(false);
  const [envioMsg, setEnvioMsg] = useState<string | null>(null);

  async function enviarAvulso(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind || envioBusy) return;
    setEnvioBusy(true);
    setEnvioMsg(null);
    try {
      if (tplDirty) await salvarTemplate();
      const res = await apiFetch<{ ok?: boolean; delivery?: { errorMessage?: string | null } }>("/company-email/send", {
        method: "POST",
        body: JSON.stringify({ templateKind: kind, ...envio }),
      });
      setEnvioMsg(res?.ok ? `✓ E-mail enviado para ${envio.recipientEmail}.` : res?.delivery?.errorMessage || "O envio falhou.");
      if (res?.ok) setEnvio({ recipientName: "", recipientEmail: "" });
    } catch (err) {
      setEnvioMsg(err instanceof Error ? err.message : "O envio falhou.");
    } finally {
      setEnvioBusy(false);
    }
  }

  const pronto = Boolean(estado?.sender?.ready);
  const ativo = Boolean(estado?.enabled);
  const lbl = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" } as const;

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Módulo de e-mail</h2>
          <div className="meta">
            {msg && <span style={{ fontWeight: 700, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{msg}</span>}
            <span className={"tag" + (ativo && pronto ? " teal" : " warn")}>
              {!ativo ? "Desativado" : pronto ? "Pronto para enviar" : "Falta configurar"}
            </span>
            <button className={"sw" + (ativo ? " on" : "")} role="switch" aria-checked={ativo} onClick={alternarAtivo} disabled={busy}><i></i></button>
          </div>
        </div>
        {loadError && <div style={{ padding: "12px 16px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
        {!loadError && (
          <div style={{ padding: 18, display: "grid", gap: 14 }}>
            <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
              Com o módulo ativo e o envio configurado, os disparos de e-mail do cadastro (boas-vindas e onboarding)
              e o envio avulso ficam disponíveis — sempre pelo remetente da SUA empresa.
            </p>
            {estado?.hbxShared ? (
              <div style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--hbx-brand) 30%, transparent)", background: "var(--hbx-brand-soft)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                Esta empresa usa o <b>transporte de e-mail da plataforma HBX</b>{estado?.sender?.from ? <> — remetente <b>{estado.sender.from}</b></> : null}. Não há SMTP para configurar aqui.
              </div>
            ) : (
              <form onSubmit={salvarSmtp} style={{ display: "grid", gap: 12 }}>
                <div className="frow">
                  <div className="f"><label>Servidor SMTP *</label><input className="field-dark" placeholder="smtp.seudominio.com.br" value={smtpForm.host} onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))} /></div>
                  <div className="f"><label>Porta *</label><input className="field-dark" type="number" min={1} max={65535} placeholder="587" value={smtpForm.port} onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))} /></div>
                  <div className="f"><label>Usuário *</label><input className="field-dark" placeholder="contato@suaempresa.com.br" value={smtpForm.user} onChange={e => setSmtpForm(f => ({ ...f, user: e.target.value }))} /></div>
                  <div className="f"><label>Senha {estado?.smtp?.hasPass ? "(guardada — preencha só para trocar)" : "*"}</label><input className="field-dark" type="password" placeholder={estado?.smtp?.hasPass ? "••••••••" : ""} value={smtpForm.pass} onChange={e => setSmtpForm(f => ({ ...f, pass: e.target.value }))} autoComplete="new-password" /></div>
                  <div className="f"><label>Nome do remetente</label><input className="field-dark" placeholder="Sua Empresa" value={smtpForm.fromName} onChange={e => setSmtpForm(f => ({ ...f, fromName: e.target.value }))} /></div>
                  <div className="f"><label>E-mail do remetente *</label><input className="field-dark" type="email" placeholder="contato@suaempresa.com.br" value={smtpForm.fromEmail} onChange={e => setSmtpForm(f => ({ ...f, fromEmail: e.target.value }))} /></div>
                  <div className="f"><label>Responder para</label><input className="field-dark" type="email" placeholder="opcional" value={smtpForm.replyTo} onChange={e => setSmtpForm(f => ({ ...f, replyTo: e.target.value }))} /></div>
                </div>
                {!pronto && (estado?.sender?.missing?.length || 0) > 0 && (
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--hbx-warning)" }}>
                    Falta: {(estado?.sender?.missing || []).join(", ")}.
                  </div>
                )}
                <div><button className="btn-teal" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar configuração de envio"}</button></div>
              </form>
            )}
          </div>
        )}
      </section>

      {ativo && (
        <section className="panel">
          <div className="panel-head">
            <h2>Templates</h2>
            <div className="meta">
              {tplMsg && <span style={{ fontWeight: 700, color: tplMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{tplMsg}</span>}
              <select className="select-dark" value={kind} onChange={e => selecionarTemplate(e.target.value)} aria-label="Template">
                {(templates || []).length === 0 && <option value="">Sem templates</option>}
                {(templates || []).map(t => <option key={t.kind} value={t.kind}>{t.label}{t.isSeeded ? " · padrão" : ""}</option>)}
              </select>
              <button className="btn-teal" onClick={() => { setNovoOpen(true); setNovoLabel(""); }} title="Incluir template"><I d={ICONS.plus} size={13} /> Novo</button>
            </div>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            {atual ? (
              <React.Fragment>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={lbl}>Variáveis (clique para inserir):</span>
                  {(atual.variableDefinitions || []).map(v => (
                    <button key={v.key} className="btn-ghost" style={{ minHeight: 24, padding: "0 8px", fontSize: "0.62rem", fontFamily: "var(--font-mono)" }}
                      title={`${GROUP_LABEL[v.group] || v.group} — ${v.description}`} onClick={() => inserirVariavel(v.token)}>
                      {v.token}
                    </button>
                  ))}
                </div>
                {atual.requiredVariable && (
                  <span style={{ fontSize: "0.66rem", color: "var(--hbx-warning)", fontWeight: 700 }}>Este template precisa conter {atual.requiredVariable}.</span>
                )}
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Assunto</label>
                  <input className="field-dark" maxLength={180} value={tplForm.subject}
                    onChange={e => { setTplForm(f => ({ ...f, subject: e.target.value })); setTplDirty(true); }} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Corpo</label>
                  <textarea ref={textRef} className="field-dark" rows={12} maxLength={12000} value={tplForm.text}
                    style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.74rem", lineHeight: 1.55, padding: "10px 12px" }}
                    onChange={e => { setTplForm(f => ({ ...f, text: e.target.value })); setTplDirty(true); }} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-teal" onClick={salvarTemplate} disabled={tplBusy || !tplDirty}>{tplBusy ? "Salvando…" : "Salvar template"}</button>
                  {atual.isSeeded ? (
                    restoreArm ? (
                      <button className="btn-ghost" style={{ color: "var(--hbx-danger)" }} onClick={restaurarTemplate} disabled={tplBusy}>Confirmar restauração</button>
                    ) : (
                      <button className="btn-ghost" onClick={() => setRestoreArm(true)} disabled={tplBusy}>Restaurar padrão</button>
                    )
                  ) : (
                    removerArm ? (
                      <button className="btn-ghost" style={{ color: "var(--hbx-danger)" }} onClick={removerTemplate} disabled={tplBusy}>Confirmar remoção</button>
                    ) : (
                      <button className="btn-ghost" onClick={() => setRemoverArm(true)} disabled={tplBusy}>Remover template</button>
                    )
                  )}
                </div>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: "0.78rem" }}>Envio de teste</strong>
                  {testeMsg && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: testeMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{testeMsg}</span>}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8 }}>
                    <input className="field-dark" type="email" placeholder="email de teste" value={teste.to} onChange={e => setTeste(t => ({ ...t, to: e.target.value }))} />
                    <input className="field-dark" placeholder="nome exemplo" value={teste.sampleName} onChange={e => setTeste(t => ({ ...t, sampleName: e.target.value }))} />
                    <input className="field-dark" placeholder="empresa exemplo" value={teste.sampleCompany} onChange={e => setTeste(t => ({ ...t, sampleCompany: e.target.value }))} />
                    <button className="btn-ghost" onClick={enviarTeste} disabled={testeBusy || !teste.to || !pronto}
                      title={pronto ? "Enviar teste" : "Configure o envio primeiro"}>
                      {testeBusy ? "Enviando…" : "Testar"}
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ) : (
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {templates === null ? "Carregando…" : "Nenhum template ainda — crie o primeiro no botão “Novo”."}
              </span>
            )}
          </div>
        </section>
      )}

      {ativo && (
        <section className="panel">
          <div className="panel-head"><h2>Disparos do cadastro</h2></div>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
              Template usado em cada disparo MANUAL do cadastro de acesso. Boas-vindas exige as variáveis {"{acesso}"} e {"{senha}"}.
            </p>
            <div className="frow">
              <div className="f">
                <label>Boas-vindas do vendedor (na liberação)</label>
                <select className="field-dark" value={disparos.welcome} onChange={e => setDisparos(d => ({ ...d, welcome: e.target.value }))}>
                  <option value="">— sem template (disparo desligado)</option>
                  {(templates || []).map(t => <option key={t.kind} value={t.kind}>{t.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label>Onboarding (solicitar documentos)</label>
                <select className="field-dark" value={disparos.onboarding} onChange={e => setDisparos(d => ({ ...d, onboarding: e.target.value }))}>
                  <option value="">— sem template (disparo desligado)</option>
                  {(templates || []).map(t => <option key={t.kind} value={t.kind}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <button className="btn-teal" disabled={busy}
                onClick={() => putSettings({ welcomeTemplateKind: disparos.welcome || null, onboardingTemplateKind: disparos.onboarding || null }, "Disparos do cadastro salvos.")}>
                Salvar disparos
              </button>
            </div>
          </div>
        </section>
      )}

      {ativo && (
        <section className="panel">
          <div className="panel-head">
            <h2>Anexos do e-mail</h2>
            <div className="meta">
              {uploadMsg && <span style={{ fontWeight: 700, color: uploadMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{uploadMsg}</span>}
            </div>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <I d={ICONS.clip} size={15} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ fontSize: "0.76rem" }}>Apresentação (PPTX)</strong>
                <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                  {estado?.attachment?.originalName ? `${estado.attachment.originalName} ${fmtBytes(estado.attachment.size)}` : "Nenhum arquivo — anexada no envio avulso quando existir."}
                </div>
              </div>
              <label className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                {uploadBusy === "attachment" ? "Enviando…" : "Escolher arquivo"}
                <input type="file" accept=".pptx" style={{ display: "none" }} disabled={uploadBusy !== null}
                  onChange={e => { uploadAsset("attachment", e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {estado?.attachment && (
                <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem", color: "var(--hbx-danger)" }} disabled={uploadBusy !== null} onClick={() => removerAsset("attachment")}>Remover</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <I d={ICONS.smile} size={15} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ fontSize: "0.76rem" }}>Cartão de visitas (assinatura)</strong>
                <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                  {estado?.businessCard?.originalName || "Nenhuma imagem — quando existir, entra como assinatura dos e-mails."}
                </div>
              </div>
              <label className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                {uploadBusy === "business-card" ? "Enviando…" : "Escolher imagem"}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={uploadBusy !== null}
                  onChange={e => { uploadAsset("business-card", e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {estado?.businessCard && (
                <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem", color: "var(--hbx-danger)" }} disabled={uploadBusy !== null} onClick={() => removerAsset("business-card")}>Remover</button>
              )}
            </div>
          </div>
        </section>
      )}

      {ativo && (
        <section className="panel">
          <div className="panel-head"><h2>Envio avulso</h2></div>
          <form onSubmit={enviarAvulso} style={{ padding: 18, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Envia o template selecionado acima ({atual?.label || "—"}) para um contato, com apresentação e cartão quando existirem.
            </p>
            {envioMsg && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: envioMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{envioMsg}</span>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
              <input className="field-dark" required maxLength={120} placeholder="Nome do contato" value={envio.recipientName}
                onChange={e => setEnvio(v => ({ ...v, recipientName: e.target.value }))} />
              <input className="field-dark" required type="email" maxLength={180} placeholder="email@contato.com.br" value={envio.recipientEmail}
                onChange={e => setEnvio(v => ({ ...v, recipientEmail: e.target.value }))} />
              <button className="btn-teal" type="submit" disabled={envioBusy || !kind || !pronto}
                title={pronto ? "Enviar" : "Configure o envio primeiro"}>
                {envioBusy ? "Enviando…" : "Enviar →"}
              </button>
            </div>
          </form>
        </section>
      )}

      {novoOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setNovoOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 46, display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={criarTemplate}
            style={{ width: "min(380px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Novo template
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setNovoOpen(false)}>✕</span>
            </h3>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome do template *</label>
              <input className="field-dark" required minLength={3} maxLength={120} placeholder='Ex.: "Apresentação da empresa"'
                value={novoLabel} onChange={e => setNovoLabel(e.target.value)} />
            </div>
            <button className="btn-teal" type="submit" disabled={tplBusy} style={{ minHeight: 40 }}>
              {tplBusy ? "Criando…" : "Criar template"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
