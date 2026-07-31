"use client";

// Seção "Meta Ads (Leads)" de /configuracoes — ARQ11 Sprint 2 item 3
// (docs/PLANEJAMENTOS/ARQ11-INGESTAO-EXTERNA-LEADS/ingestao-externa-leads-sprint2.md).
// Só ADMIN da empresa (backend: MetaLeadAdsService.requireCompanyAdmin). Contratos:
//   GET    /integrations/meta/connections                       → { connections: [...] }
//   POST   /integrations/meta/connections                       → upsert por pageId
//   DELETE /integrations/meta/connections/:id                   → remove
//   POST   /integrations/meta/connections/:id/subscribe-webhook → { subscribed, error? }
// accessToken é write-only (nunca volta); só tokenPreview/hasToken voltam.

import React, { useCallback, useEffect, useState } from "react";

import { ConfirmDialog, I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Conexao = {
  id: string;
  companyId?: number;
  pageId: string;
  pageName?: string | null;
  defaultAssignedUserId?: number | null;
  status?: "active" | "paused" | string | null;
  hasToken?: boolean;
  tokenPreview?: string | null;
  lastEventAt?: string | null;
  lastLeadAt?: string | null;
  lastError?: string | null;
  webhookSubscribedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean };

const FORM_VAZIO = { id: "", pageId: "", pageName: "", accessToken: "", defaultAssignedUserId: "", status: "active" as "active" | "paused" };

function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function extrairConexoes(res: unknown): Conexao[] {
  if (Array.isArray(res)) return res as Conexao[];
  const obj = (res || {}) as { connections?: Conexao[] };
  return Array.isArray(obj.connections) ? obj.connections : [];
}

export function MetaLeadAdsSection() {
  const [conexoes, setConexoes] = useState<Conexao[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, setTeam] = useState<CompanyUser[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [acaoBusy, setAcaoBusy] = useState<string | null>(null); // `${id}:${acao}`
  const [acaoMsg, setAcaoMsg] = useState<Record<string, string>>({});
  const [excluirAlvo, setExcluirAlvo] = useState<Conexao | null>(null);

  const carregar = useCallback(() => {
    return apiFetch<unknown>("/integrations/meta/connections")
      .then(res => { setConexoes(extrairConexoes(res)); setLoadError(null); })
      .catch((err: unknown) => {
        setConexoes([]);
        setLoadError(err instanceof Error ? err.message : "Falha ao listar as conexões do Meta.");
      });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    apiFetch<CompanyUser[]>("/users/company")
      .then(res => setTeam(Array.isArray(res) ? res : []))
      .catch(() => { /* select de responsável fica sem opções — não bloqueia a tela */ });
  }, []);

  function abrirNova() {
    setForm(FORM_VAZIO);
    setMsg(null);
    setModalOpen(true);
  }

  function abrirEdicao(conn: Conexao) {
    setForm({
      id: conn.id,
      pageId: conn.pageId,
      pageName: conn.pageName || "",
      accessToken: "",
      defaultAssignedUserId: conn.defaultAssignedUserId ? String(conn.defaultAssignedUserId) : "",
      status: conn.status === "paused" ? "paused" : "active",
    });
    setMsg(null);
    setModalOpen(true);
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        pageId: form.pageId.trim(),
        pageName: form.pageName.trim() || undefined,
        status: form.status,
        defaultAssignedUserId: form.defaultAssignedUserId ? Number(form.defaultAssignedUserId) : undefined,
      };
      if (form.accessToken.trim()) body.accessToken = form.accessToken.trim();
      await apiFetch("/integrations/meta/connections", { method: "POST", body: JSON.stringify(body) });
      setModalOpen(false);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao salvar a conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function alternarStatus(conn: Conexao) {
    const chave = `${conn.id}:status`;
    if (acaoBusy) return;
    setAcaoBusy(chave);
    setAcaoMsg(m => ({ ...m, [conn.id]: "" }));
    try {
      const novo = conn.status === "paused" ? "active" : "paused";
      await apiFetch("/integrations/meta/connections", {
        method: "POST",
        body: JSON.stringify({ pageId: conn.pageId, status: novo }),
      });
      setAcaoMsg(m => ({ ...m, [conn.id]: novo === "paused" ? "✓ Conexão pausada." : "✓ Conexão reativada." }));
      await carregar();
    } catch (err) {
      setAcaoMsg(m => ({ ...m, [conn.id]: err instanceof Error ? err.message : "Falha ao trocar o status." }));
    } finally {
      setAcaoBusy(null);
    }
  }

  async function assinarWebhook(conn: Conexao) {
    const chave = `${conn.id}:webhook`;
    if (acaoBusy) return;
    setAcaoBusy(chave);
    setAcaoMsg(m => ({ ...m, [conn.id]: "" }));
    try {
      const res = await apiFetch<{ subscribed: boolean; error?: string }>(
        `/integrations/meta/connections/${encodeURIComponent(conn.id)}/subscribe-webhook`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setAcaoMsg(m => ({ ...m, [conn.id]: res?.subscribed ? "✓ Webhook assinado." : (res?.error || "Não foi possível assinar o webhook.") }));
      await carregar();
    } catch (err) {
      setAcaoMsg(m => ({ ...m, [conn.id]: err instanceof Error ? err.message : "Falha ao assinar o webhook." }));
    } finally {
      setAcaoBusy(null);
    }
  }

  async function excluir() {
    if (!excluirAlvo || acaoBusy) return;
    const conn = excluirAlvo;
    setAcaoBusy(`${conn.id}:excluir`);
    try {
      await apiFetch(`/integrations/meta/connections/${encodeURIComponent(conn.id)}`, { method: "DELETE" });
      setExcluirAlvo(null);
      await carregar();
    } catch (err) {
      setAcaoMsg(m => ({ ...m, [conn.id]: err instanceof Error ? err.message : "Falha ao excluir a conexão." }));
      setExcluirAlvo(null);
    } finally {
      setAcaoBusy(null);
    }
  }

  function nomeResponsavel(id?: number | null) {
    if (!id) return "—";
    const u = team.find(t => t.id === id);
    return u ? (u.name || u.username || u.email || `#${id}`) : `#${id}`;
  }

  const lbl = { fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" } as const;

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Meta Ads (Leads)</h2>
          <div className="meta">
            <button className="btn-teal" onClick={abrirNova}><I d={ICONS.plus} size={13} /> Nova conexão</button>
          </div>
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <p style={{ margin: "12px 0", fontSize: "var(--fz-m1)", lineHeight: 1.55, color: "var(--text-muted)" }}>
            Conecte uma página do Facebook/Instagram para receber leads de anúncios direto na esteira, com
            aviso ao responsável em minutos.
          </p>
        </div>
        {loadError && <div style={{ padding: "0 18px 14px", fontSize: "var(--fz-l3)", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
        {!loadError && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Página</th><th>Status</th><th>Webhook</th><th>Responsável</th><th>Último evento</th><th>Último lead</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {conexoes === null && (
                  <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
                )}
                {conexoes !== null && conexoes.length === 0 && (
                  <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Nenhuma conexão ainda — clique em “Nova conexão”.</td></tr>
                )}
                {(conexoes || []).map(conn => (
                  <React.Fragment key={conn.id}>
                    <tr style={{ cursor: "default" }}>
                      <td>
                        <div className="co">
                          <strong>{conn.pageName || "—"}</strong>
                          <span className="sub2">{conn.pageId}{conn.hasToken ? ` · token ${conn.tokenPreview || "configurado"}` : " · sem token"}</span>
                        </div>
                      </td>
                      <td>
                        <span className={conn.status === "paused" ? "tag warn" : "tag teal"}>
                          {conn.status === "paused" ? "pausada" : "ativa"}
                        </span>
                      </td>
                      <td>
                        <span className={conn.webhookSubscribedAt ? "tag teal" : "tag"}>
                          {conn.webhookSubscribedAt ? `assinado ${fmtDataHora(conn.webhookSubscribedAt)}` : "não assinado"}
                        </span>
                      </td>
                      <td>{nomeResponsavel(conn.defaultAssignedUserId)}</td>
                      <td>{fmtDataHora(conn.lastEventAt)}</td>
                      <td>{fmtDataHora(conn.lastLeadAt)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }}
                            disabled={acaoBusy != null} onClick={() => assinarWebhook(conn)}>
                            {acaoBusy === `${conn.id}:webhook` ? "…" : "Assinar webhook"}
                          </button>
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }}
                            disabled={acaoBusy != null} onClick={() => alternarStatus(conn)}>
                            {acaoBusy === `${conn.id}:status` ? "…" : conn.status === "paused" ? "Reativar" : "Pausar"}
                          </button>
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }}
                            disabled={acaoBusy != null} onClick={() => abrirEdicao(conn)}>Editar</button>
                          <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px", color: "var(--hbx-danger)" }}
                            disabled={acaoBusy != null} onClick={() => setExcluirAlvo(conn)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                    {(conn.lastError || acaoMsg[conn.id]) && (
                      <tr>
                        <td colSpan={7} style={{ paddingTop: 0 }}>
                          {conn.lastError && (
                            <div style={{ fontSize: "var(--hbx-font-min)", fontWeight: 600, color: "var(--hbx-danger)" }}>Último erro: {conn.lastError}</div>
                          )}
                          {acaoMsg[conn.id] && (
                            <div style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700, color: acaoMsg[conn.id].startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>
                              {acaoMsg[conn.id]}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <form className="hbx-modal" onSubmit={salvar}
            style={{ width: "min(460px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {form.id ? "Editar conexão" : "Nova conexão Meta"}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setModalOpen(false)}>✕</span>
            </h3>
            {msg && <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{msg}</div>}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Page ID *</label>
              <input className="field-dark" required minLength={1} maxLength={80} value={form.pageId}
                disabled={Boolean(form.id)}
                placeholder="ID da página do Facebook"
                onChange={e => setForm(f => ({ ...f, pageId: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome da página</label>
              <input className="field-dark" maxLength={200} value={form.pageName}
                onChange={e => setForm(f => ({ ...f, pageName: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Token de acesso da página {form.id ? "(mantém o atual se em branco)" : "*"}</label>
              <input className="field-dark" type="password" maxLength={4000} value={form.accessToken}
                required={!form.id}
                placeholder="EAAG…"
                onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Responsável padrão</label>
                <select className="select-dark" value={form.defaultAssignedUserId}
                  onChange={e => setForm(f => ({ ...f, defaultAssignedUserId: e.target.value }))}>
                  <option value="">— sem responsável fixo —</option>
                  {team.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.username || u.email}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Status</label>
                <select className="select-dark" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as "active" | "paused" }))}>
                  <option value="active">Ativa</option>
                  <option value="paused">Pausada</option>
                </select>
              </div>
            </div>
            <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 42 }}>
              {busy ? "Salvando…" : form.id ? "Salvar alterações" : "Criar conexão"}
            </button>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={excluirAlvo != null}
        title="Excluir conexão"
        message={<>Excluir a conexão com <b>{excluirAlvo?.pageName || excluirAlvo?.pageId}</b>? Os leads que já chegaram continuam na esteira; novos eventos dessa página param de entrar.</>}
        confirmLabel="Excluir conexão"
        danger
        busy={acaoBusy === `${excluirAlvo?.id}:excluir`}
        onConfirm={excluir}
        onCancel={() => setExcluirAlvo(null)}
      />
    </React.Fragment>
  );
}
