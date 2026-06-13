"use client";

// Janela 7 — Notificações de pagamento (master/payment-notifications).
// LIGADA via E8 da fila (PLAN12062026001): o POST /mercadopago-approved
// (webhook M2M com secret) agora grava histórico best-effort na tabela
// MasterPaymentNotificationLog, e esta janela lê
// GET /master/payment-notifications/history (JWT + MasterGuard) com
// filtros por status e empresa.

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora } from "./page.client";

type NotificationRow = {
  id: string;
  companyId?: number;
  companyName?: string | null;
  target?: string;
  text?: string;
  status?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
};

type HistoryResponse = {
  ok?: boolean;
  notifications?: NotificationRow[];
  message?: string | null;
} | null;

const STATUS_OPCOES = [
  { value: "", label: "Todos" },
  { value: "sent", label: "Enviados" },
  { value: "failed", label: "Falharam" },
];

export function JanelaPagamentos() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState<HistoryResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const carregar = useCallback((st: string) => {
    const q = new URLSearchParams();
    if (st) q.set("status", st);
    q.set("take", "200");
    apiFetch<HistoryResponse>(`/master/payment-notifications/history?${q.toString()}`)
      .then(res => { setData(res); setLoadError(null); })
      .catch((err: unknown) => {
        setData({ ok: false, notifications: [] });
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o histórico.");
      });
  }, []);

  useEffect(() => { carregar(status); }, [status, carregar]);

  function trocarStatus(st: string) {
    setStatus(st);
    setData(null);
    setSelId(null);
    setLoadError(null);
  }

  const linhas = data?.notifications || [];
  const sel = linhas.find(n => n.id === selId) || null;

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Notificações de pagamento (WhatsApp)</h2>
          <div className="meta">
            {data?.notifications ? `${linhas.length} disparo(s)` : ""}
            <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} onClick={() => carregar(status)}>Atualizar</button>
          </div>
        </div>
        <div style={{ padding: "12px 16px 4px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_OPCOES.map(o => (
            <button key={o.value} className="btn-ghost" onClick={() => trocarStatus(o.value)}
              style={{ minHeight: 28, fontSize: "0.66rem", ...(o.value === status ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}) }}>
              {o.label}
            </button>
          ))}
        </div>
        {loadError && <div style={{ padding: "8px 16px 12px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
        {data?.ok === false && data?.message && (
          <div style={{ padding: "8px 16px 12px", fontSize: "0.72rem", color: "var(--text-muted)" }}>{data.message}</div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Empresa</th><th>Destinatário</th><th>Status</th><th>Mensagem</th><th>Disparado em</th></tr>
            </thead>
            <tbody>
              {data === null && !loadError && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
              )}
              {data !== null && linhas.length === 0 && !loadError && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>
                  Nenhum disparo registrado ainda — o histórico nasce nos próximos avisos de pagamento aprovado.
                </td></tr>
              )}
              {linhas.map(n => (
                <tr key={n.id} className={n.id === selId ? "sel" : ""} onClick={() => setSelId(n.id === selId ? null : n.id)}>
                  <td>
                    <div className="co">
                      <strong>{n.companyName || "—"}</strong>
                      <span className="sub2">#{n.companyId}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{n.target || "—"}</td>
                  <td><span className={n.status === "sent" ? "tag teal" : "tag red"}>{n.status === "sent" ? "enviado" : "falhou"}</span></td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{(n.text || "").slice(0, 60)}{(n.text || "").length > 60 ? "…" : ""}</td>
                  <td>{fmtDataHora(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 16px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
          O disparo continua máquina-a-máquina (webhook Mercado Pago → WhatsApp via Webwhats). Esta janela é o histórico.
        </div>
      </section>

      {sel && (
        <section className="panel">
          <div className="panel-head">
            <h2>Disparo {sel.status === "sent" ? "enviado" : "com falha"}</h2>
            <div className="meta">{fmtDataHora(sel.createdAt)}</div>
          </div>
          <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10, fontSize: "0.74rem" }}>
            <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-line", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>{sel.text || "—"}</p>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["Empresa", sel.companyName ? `${sel.companyName} (#${sel.companyId})` : `#${sel.companyId}`],
                ["Destinatário", sel.target],
                ["ID no provedor", sel.providerMessageId],
                ["Erro", sel.errorMessage],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </React.Fragment>
  );
}
