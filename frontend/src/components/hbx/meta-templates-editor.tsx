"use client";

// /master → Sistema → Credenciais → WhatsApp (Meta) Templates (Cloud API).
// Backend (hbx-recovery.controller.ts):
//   GET    /hbx-recovery/meta-templates[?refresh=true] → { templates, counters, lastSyncAt, syncError }
//   POST   /hbx-recovery/meta-templates/sync           → puxa da Meta
//   PATCH  /hbx-recovery/meta-templates/activation     → { name, language, active }
//   POST   /hbx-recovery/meta-templates/create         → { name, category, language, bodyText, footerText, activateInHbx }
//   DELETE /hbx-recovery/meta-templates                → { name, language }
// Lei 5 (design system): ZERO estilo visual inline — só classes centrais (layout via grid/gap).

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Tpl = { id: string | null; name: string; language: string; category: string; status: string; bodyText: string; hbxActive: boolean };
type Counters = { total: number; approved: number; pending: number; rejected: number; hbxActive: number; eligible: number };
type ListResp = { templates?: Tpl[]; counters?: Counters; lastSyncAt?: string | null; syncError?: string | null };

const NOVO = { name: "", category: "UTILITY", language: "pt_BR", bodyText: "", footerText: "" };

export function MetaTemplatesEditor() {
  const [data, setData] = useState<ListResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState(NOVO);

  const carregar = useCallback((refresh?: boolean) => {
    apiFetch<ListResp>(`/hbx-recovery/meta-templates${refresh ? "?refresh=true" : ""}`)
      .then(res => { setData(res || null); if (res?.syncError) setMsg(`Sync: ${res.syncError}`); })
      .catch(() => setMsg("Falha ao carregar templates."));
  }, []);

  useEffect(() => { carregar(false); }, [carregar]);

  async function sincronizar() {
    if (busy) return; setBusy("sync"); setMsg(null);
    try {
      const res = await apiFetch<ListResp>("/hbx-recovery/meta-templates/sync", { method: "POST", body: JSON.stringify({}) });
      setData(res || null);
      setMsg(res?.syncError ? `Sync: ${res.syncError}` : "✓ Sincronizado com a Meta.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao sincronizar."); }
    finally { setBusy(null); }
  }

  async function alternar(t: Tpl) {
    if (busy) return; setBusy(`act:${t.name}:${t.language}`); setMsg(null);
    try {
      await apiFetch("/hbx-recovery/meta-templates/activation", { method: "PATCH", body: JSON.stringify({ name: t.name, language: t.language, active: !t.hbxActive }) });
      carregar(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao alterar."); }
    finally { setBusy(null); }
  }

  async function criar() {
    if (busy || !novo.name.trim() || !novo.bodyText.trim()) return;
    setBusy("create"); setMsg(null);
    try {
      await apiFetch("/hbx-recovery/meta-templates/create", { method: "POST", body: JSON.stringify({
        name: novo.name.trim(), category: novo.category, language: novo.language.trim() || "pt_BR",
        bodyText: novo.bodyText, footerText: novo.footerText.trim() || undefined, activateInHbx: true,
      }) });
      setNovo(NOVO); setNovoOpen(false);
      setMsg("✓ Template enviado para aprovação na Meta.");
      carregar(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao criar template."); }
    finally { setBusy(null); }
  }

  const c = data?.counters;
  const tpls = data?.templates || [];
  const statusTag = (s: string) => {
    const up = String(s || "").toUpperCase();
    if (up === "APPROVED") return "tag teal";
    if (["REJECTED", "PAUSED", "DISABLED"].includes(up)) return "tag red";
    return "tag warn";
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>WhatsApp (Meta) — templates</h2>
        <div className="meta">
          <button className="btn-ghost" disabled={busy != null} onClick={() => sincronizar()}>{busy === "sync" ? "Sincronizando…" : "Sincronizar"}</button>
          <button className="btn-teal" disabled={busy != null} onClick={() => setNovoOpen(o => !o)}>{novoOpen ? "Fechar" : "Novo template"}</button>
        </div>
      </div>
      <div className="tbl-wrap">
        {c && <div className="meta">{c.total} templates · {c.approved} aprovados · {c.hbxActive} ativos no HBX{data?.lastSyncAt ? ` · sync ${new Date(data.lastSyncAt).toLocaleString("pt-BR")}` : ""}</div>}
        {msg && <div className="meta">{msg}</div>}

        {novoOpen && (
          <div style={{ display: "grid", gap: 8, maxWidth: 540 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 180 }}>
                <label className="field-label">Nome (minúsculo, sem espaços)</label>
                <input className="field-dark" value={novo.name} onChange={e => setNovo(n => ({ ...n, name: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <label className="field-label">Categoria</label>
                <select className="field-dark" value={novo.category} onChange={e => setNovo(n => ({ ...n, category: e.target.value }))}>
                  <option value="UTILITY">Utilidade</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">Autenticação</option>
                </select>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <label className="field-label">Idioma</label>
                <input className="field-dark" value={novo.language} onChange={e => setNovo(n => ({ ...n, language: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label className="field-label">Corpo (use {"{{1}}"}, {"{{2}}"}… para variáveis)</label>
              <textarea className="field-dark" rows={3} value={novo.bodyText} onChange={e => setNovo(n => ({ ...n, bodyText: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label className="field-label">Rodapé (opcional)</label>
              <input className="field-dark" value={novo.footerText} onChange={e => setNovo(n => ({ ...n, footerText: e.target.value }))} />
            </div>
            <div>
              <button className="btn-teal" disabled={busy != null || !novo.name.trim() || !novo.bodyText.trim()} onClick={criar}>{busy === "create" ? "Enviando…" : "Criar e enviar para a Meta"}</button>
            </div>
          </div>
        )}

        <table className="tbl">
          <thead><tr><th>Template</th><th>Idioma</th><th>Status</th><th>Categoria</th><th>Ativo no HBX</th></tr></thead>
          <tbody>
            {data === null && <tr><td colSpan={5} className="meta">Carregando…</td></tr>}
            {data !== null && tpls.length === 0 && <tr><td colSpan={5} className="meta">Nenhum template. Clique em Sincronizar (puxa da Meta) ou Novo template.</td></tr>}
            {tpls.map(t => (
              <tr key={`${t.name}:${t.language}`}>
                <td>{t.name}</td>
                <td>{t.language}</td>
                <td><span className={statusTag(t.status)}>{t.status}</span></td>
                <td>{t.category}</td>
                <td>
                  <button className="btn-ghost" disabled={busy != null} onClick={() => alternar(t)}>
                    {busy === `act:${t.name}:${t.language}` ? "…" : t.hbxActive ? "ON" : "OFF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
