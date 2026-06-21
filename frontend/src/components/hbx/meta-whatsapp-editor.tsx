"use client";

// /master → Sistema → "Credenciais" — conexão WhatsApp (Meta) da Cloud API oficial.
// Backend (master, empresa em contexto — whatsapp.controller.ts):
//   GET   /whatsapp/config         → status + número + phoneNumberId + token(preview)
//   PATCH /whatsapp/config         → grava número/phoneNumberId/accessToken
//   POST  /whatsapp/validate       → valida credenciais na Meta
//   POST  /whatsapp/test {to}      → envia mensagem de teste
// Lei 5 (design system): ZERO estilo visual inline — só classes centrais do kit
// (status verde = .badge-win; layout via grid/gap, que não é "visual").

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Config = {
  whatsappNumber?: string | null;
  whatsappPhoneNumberId?: string | null;
  accessTokenConfigured?: boolean;
  accessTokenPreview?: string | null;
  status?: string | null;
  connected?: boolean;
  displayNumber?: string | null;
  statusError?: string | null;
};

export function MetaWhatsAppEditor() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [form, setForm] = useState({ number: "", phoneNumberId: "", token: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  const carregar = useCallback(() => {
    apiFetch<Config>("/whatsapp/config")
      .then(res => {
        setCfg(res || null);
        setForm({ number: res?.whatsappNumber || "", phoneNumberId: res?.whatsappPhoneNumberId || "", token: "" });
      })
      .catch(() => setMsg("Falha ao carregar a config (precisa ser master e ter empresa em contexto)."));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (busy) return;
    setBusy("save"); setMsg(null);
    try {
      const body: Record<string, unknown> = {
        whatsappNumber: form.number.trim(),
        whatsappPhoneNumberId: form.phoneNumberId.trim(),
      };
      if (form.token.trim()) body.whatsappAccessToken = form.token.trim();
      const res = await apiFetch<Config>("/whatsapp/config", { method: "PATCH", body: JSON.stringify(body) });
      setCfg(res || null);
      setForm(f => ({ ...f, token: "" }));
      setMsg("✓ Configuração salva. Agora clique em Validar para conectar na Meta.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(null); }
  }

  async function validar() {
    if (busy) return;
    setBusy("validate"); setMsg(null);
    try {
      const res = await apiFetch<Config>("/whatsapp/validate", { method: "POST", body: JSON.stringify({}) });
      setCfg(res || null);
      setMsg(res?.connected ? "✓ Credenciais válidas — WhatsApp Meta conectado." : "Credenciais não validaram. Veja o erro abaixo.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao validar."); }
    finally { setBusy(null); }
  }

  async function testar() {
    if (busy || !testTo.trim()) return;
    setBusy("test"); setMsg(null);
    try {
      await apiFetch("/whatsapp/test", { method: "POST", body: JSON.stringify({ to: testTo.trim() }) });
      setMsg(`✓ Mensagem de teste enfileirada para ${testTo.trim()}.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao enviar teste."); }
    finally { setBusy(null); }
  }

  const connected = Boolean(cfg?.connected);
  const statusErrored = String(cfg?.status || "").toUpperCase().includes("ERROR");

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>WhatsApp (Meta) — conexão oficial</h2>
        <div className="meta">
          {connected
            ? <span className="badge-win">✓ Conectado{cfg?.displayNumber ? ` — ${cfg.displayNumber}` : ""}</span>
            : <span className={"tag" + (statusErrored ? " red" : " warn")}>{cfg?.status || "não conectado"}</span>}
        </div>
      </div>
      <div className="tbl-wrap">
        {msg && <div className="meta">{msg}</div>}
        {cfg?.statusError && <div className="meta">Erro Meta: {cfg.statusError}</div>}
        <div style={{ display: "grid", gap: 10, maxWidth: 460 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="field-label">Número do WhatsApp</label>
            <input className="field-dark" value={form.number} placeholder="+55 11 99999-9999"
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="field-label">Phone Number ID (Meta)</label>
            <input className="field-dark" value={form.phoneNumberId} placeholder="ID do número na Cloud API"
              onChange={e => setForm(f => ({ ...f, phoneNumberId: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="field-label">Access Token{cfg?.accessTokenConfigured ? ` — salvo: ${cfg.accessTokenPreview}` : ""}</label>
            <input className="field-dark" type="password" autoComplete="new-password"
              placeholder={cfg?.accessTokenConfigured ? "deixe em branco para manter o atual" : "cole o token permanente (System User)"}
              value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-teal" disabled={busy != null} onClick={salvar}>{busy === "save" ? "Salvando…" : "Salvar"}</button>
            <button className="btn-ghost" disabled={busy != null} onClick={validar}>{busy === "validate" ? "Validando…" : "Validar credenciais"}</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <label className="field-label">Testar envio para</label>
              <input className="field-dark" value={testTo} placeholder="+55 11 99999-9999" onChange={e => setTestTo(e.target.value)} />
            </div>
            <button className="btn-ghost" disabled={busy != null || !testTo.trim()} onClick={testar}>{busy === "test" ? "Enviando…" : "Enviar teste"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
