"use client";

// Janela 2 — Integrações por empresa (padrão TagPlus; TOTVS só com
// autorização da marca — até lá a UI fala "ERP").
// Contratos ligados (ModulesController, modules/master/company/:id):
//   GET   /integrations?provider=        → conexões da empresa
//   POST  /integrations                  → criar {provider, instanceName, baseUrl?, appKey?, secret?, isActive?}
//   PATCH /integrations/:connectionId    → editar (mesmos campos)
//   POST  /integrations/:connectionId/test → testar conexão
//   POST  /integrations/:connectionId/sync → disparar sync
// Providers aceitos pelo backend: AUVO | TAGPLUS (INTEGRATION_PROVIDER_IDS).

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora, type MasterCompany } from "./page.client";

type Conexao = {
  id: string;
  provider?: string | null;
  instanceName?: string | null;
  baseUrl?: string | null;
  isActive?: boolean;
  status?: string | null;
  lastTestAt?: string | null;
  lastTestStatus?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const PROVIDERS = [
  { value: "TAGPLUS", label: "TagPlus" },
  { value: "AUVO", label: "Auvo" },
];

const FORM_VAZIO = { id: "", provider: "TAGPLUS", instanceName: "", baseUrl: "", appKey: "", secret: "", isActive: true };

function extrairConexoes(res: unknown): Conexao[] {
  if (Array.isArray(res)) return res as Conexao[];
  const obj = (res || {}) as { connections?: Conexao[]; items?: Conexao[] };
  if (Array.isArray(obj.connections)) return obj.connections;
  if (Array.isArray(obj.items)) return obj.items;
  return [];
}

export function JanelaIntegracoes({ companies }: { companies: MasterCompany[] | null }) {
  const [companyId, setCompanyId] = useState("");
  const [conexoes, setConexoes] = useState<Conexao[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [acaoBusy, setAcaoBusy] = useState<string | null>(null); // `${id}:${acao}`
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  // sem setState síncrono aqui: o effect só dispara o fetch; resets visuais
  // acontecem no onChange do select de empresa
  const carregar = useCallback((id: string) => {
    if (!id) return;
    apiFetch<unknown>(`/modules/master/company/${id}/integrations`)
      .then(res => setConexoes(extrairConexoes(res)))
      .catch((err: unknown) => {
        setConexoes([]);
        setLoadError(err instanceof Error ? err.message : "Falha ao listar as integrações.");
      });
  }, []);

  useEffect(() => { carregar(companyId); }, [companyId, carregar]);

  function trocarEmpresa(id: string) {
    setCompanyId(id);
    setConexoes(null);
    setLoadError(null);
    setAcaoMsg(null);
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !companyId) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        instanceName: form.instanceName.trim(),
        isActive: form.isActive,
      };
      if (form.baseUrl.trim()) body.baseUrl = form.baseUrl.trim();
      if (form.appKey.trim()) body.appKey = form.appKey.trim();
      if (form.secret.trim()) body.secret = form.secret.trim();
      if (form.id) {
        await apiFetch(`/modules/master/company/${companyId}/integrations/${encodeURIComponent(form.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/modules/master/company/${companyId}/integrations`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setModalOpen(false);
      setForm(FORM_VAZIO);
      carregar(companyId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao salvar a integração.");
    } finally {
      setBusy(false);
    }
  }

  async function acao(conn: Conexao, tipo: "test" | "sync") {
    const chave = `${conn.id}:${tipo}`;
    if (acaoBusy || !companyId) return;
    setAcaoBusy(chave);
    setAcaoMsg(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/integrations/${encodeURIComponent(conn.id)}/${tipo}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAcaoMsg(`✓ ${tipo === "test" ? "Teste disparado" : "Sync disparado"} (${conn.instanceName || conn.provider}).`);
      carregar(companyId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : `Falha no ${tipo}.`);
    } finally {
      setAcaoBusy(null);
    }
  }

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Integrações ERP por empresa</h2>
          <div className="meta">
            {companyId && (
              <button className="btn-teal" onClick={() => { setForm(FORM_VAZIO); setMsg(null); setModalOpen(true); }}>+ Nova conexão</button>
            )}
          </div>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Empresa</label>
            <select className="field-dark" style={{ minWidth: 220 }} value={companyId} onChange={e => trocarEmpresa(e.target.value)}>
              <option value="">Escolha…</option>
              {(companies || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {acaoMsg && (
          <div style={{ padding: "0 16px 10px", fontSize: "0.72rem", fontWeight: 700, color: acaoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{acaoMsg}</div>
        )}
        {loadError && <div style={{ padding: "0 16px 12px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
        {companyId && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Conexão</th><th>Provider</th><th>Status</th><th>Último teste</th><th>Último sync</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {conexoes === null && !loadError && (
                  <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
                )}
                {conexoes !== null && conexoes.length === 0 && (
                  <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Sem conexões para esta empresa.</td></tr>
                )}
                {(conexoes || []).map(conn => (
                  <tr key={conn.id} style={{ cursor: "default" }}>
                    <td>
                      <div className="co">
                        <strong>{conn.instanceName || "—"}</strong>
                        <span className="sub2">{conn.baseUrl || conn.id}</span>
                      </div>
                    </td>
                    <td>{conn.provider || "—"}</td>
                    <td>
                      <span className={conn.isActive === false ? "tag red" : "tag teal"}>
                        {conn.isActive === false ? "inativa" : conn.status || "ativa"}
                      </span>
                    </td>
                    <td>{conn.lastTestAt ? `${fmtDataHora(conn.lastTestAt)}${conn.lastTestStatus ? ` (${conn.lastTestStatus})` : ""}` : "—"}</td>
                    <td>{conn.lastSyncAt ? `${fmtDataHora(conn.lastSyncAt)}${conn.lastSyncStatus ? ` (${conn.lastSyncStatus})` : ""}` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px" }}
                          disabled={acaoBusy != null} onClick={() => acao(conn, "test")}>
                          {acaoBusy === `${conn.id}:test` ? "…" : "Testar"}
                        </button>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px" }}
                          disabled={acaoBusy != null} onClick={() => acao(conn, "sync")}>
                          {acaoBusy === `${conn.id}:sync` ? "…" : "Sync"}
                        </button>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px" }}
                          onClick={() => {
                            setForm({
                              id: conn.id,
                              provider: String(conn.provider || "TAGPLUS"),
                              instanceName: String(conn.instanceName || ""),
                              baseUrl: String(conn.baseUrl || ""),
                              appKey: "",
                              secret: "",
                              isActive: conn.isActive !== false,
                            });
                            setMsg(null);
                            setModalOpen(true);
                          }}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!companyId && (
          <div style={{ padding: "0 16px 16px", fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Escolha uma empresa para ver e gerir as conexões ERP dela.
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 45, background: "var(--hbx-overlay)", display: "grid", placeItems: "center", padding: 24 }}>
          <form className="hbx-modal" onSubmit={salvar}
            style={{ width: "min(440px, 100%)", display: "grid", gap: 12, padding: 24, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {form.id ? "Editar conexão" : "Nova conexão ERP"}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setModalOpen(false)}>✕</span>
            </h3>
            {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Provider</label>
                <select className="field-dark" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}>
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", fontWeight: 600, alignSelf: "end", paddingBottom: 8 }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Ativa
              </label>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome da instância *</label>
              <input className="field-dark" required minLength={2} maxLength={120} value={form.instanceName}
                onChange={e => setForm(f => ({ ...f, instanceName: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Base URL</label>
              <input className="field-dark" maxLength={500} placeholder="https://…" value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>App key</label>
                <input className="field-dark" maxLength={4000} value={form.appKey}
                  placeholder={form.id ? "manter atual" : ""}
                  onChange={e => setForm(f => ({ ...f, appKey: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Secret</label>
                <input className="field-dark" type="password" maxLength={4000} value={form.secret}
                  placeholder={form.id ? "manter atual" : ""}
                  onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
              </div>
            </div>
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 42 }}>
              {busy ? "Salvando…" : form.id ? "Salvar alterações" : "Criar conexão"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
