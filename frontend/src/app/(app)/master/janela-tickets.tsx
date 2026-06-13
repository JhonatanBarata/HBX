"use client";

// Janela 5 — Tickets (tabelas hbx_support_ticket/hbx_job).
// Ligada em GET /modules/master/tickets (espelho de LEITURA com JWT +
// MasterGuard criado no E7 da fila — PLAN12062026001). A escrita/dispatch
// continua exclusiva do canal M2M do Ops Control (owner/tickets +
// x-owner-secret) — aqui é triagem visual do dono.

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora } from "./page.client";

type TicketJob = { id: string; type?: string | null; status?: string | null; title?: string | null };

type Ticket = {
  id: string;
  ticketCode?: string | null;
  companyId?: number | null;
  source?: string | null;
  origin?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  title?: string | null;
  description?: string | null;
  lastCustomerMessage?: string | null;
  codexDispatchStatus?: string | null;
  githubPrNumber?: number | null;
  githubBranch?: string | null;
  createdAt?: string | null;
  jobs?: TicketJob[];
};

// OWNER_TICKET_STATUSES do ticket.service
const STATUS_OPCOES = [
  { value: "", label: "Todos" },
  { value: "new", label: "Novos" },
  { value: "triage", label: "Triagem" },
  { value: "waiting_codex", label: "Aguardando Codex" },
  { value: "in_progress", label: "Em andamento" },
  { value: "done", label: "Concluídos" },
];

function statusTag(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "done") return "tag teal";
  if (s === "in_progress" || s === "waiting_codex") return "tag warn";
  if (s === "new") return "tag red";
  return "tag";
}

export function JanelaTickets() {
  const [status, setStatus] = useState("");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const carregar = useCallback((st: string) => {
    const q = new URLSearchParams();
    if (st) q.set("status", st);
    q.set("take", "100");
    apiFetch<{ ok?: boolean; tickets?: Ticket[] }>(`/modules/master/tickets?${q.toString()}`)
      .then(res => {
        setTickets(Array.isArray(res?.tickets) ? res.tickets : []);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setTickets([]);
        setLoadError(err instanceof Error ? err.message : "Falha ao listar os tickets.");
      });
  }, []);

  useEffect(() => { carregar(status); }, [status, carregar]);

  function trocarStatus(st: string) {
    setStatus(st);
    setTickets(null);
    setSelId(null);
    setLoadError(null);
  }

  const sel = (tickets || []).find(t => t.id === selId) || null;

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Tickets de suporte</h2>
          <div className="meta">
            {tickets ? `${tickets.length} ticket(s)` : ""}
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
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Ticket</th><th>Status</th><th>Prioridade</th><th>Cliente</th><th>Origem</th><th>Dispatch</th><th>Criado</th></tr>
            </thead>
            <tbody>
              {tickets === null && !loadError && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
              )}
              {tickets !== null && tickets.length === 0 && !loadError && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Nenhum ticket {status ? "neste status" : "registrado ainda"}.</td></tr>
              )}
              {(tickets || []).map(t => (
                <tr key={t.id} className={t.id === selId ? "sel" : ""} onClick={() => setSelId(t.id === selId ? null : t.id)}>
                  <td>
                    <div className="co">
                      <strong>{t.title || "—"}</strong>
                      <span className="sub2">{t.ticketCode || t.id}</span>
                    </div>
                  </td>
                  <td><span className={statusTag(t.status)}>{t.status || "—"}</span></td>
                  <td>{t.priority || "—"}</td>
                  <td>{t.customerName || t.customerPhone || "—"}</td>
                  <td>{t.origin || t.source || "—"}</td>
                  <td>{t.codexDispatchStatus || "—"}</td>
                  <td>{fmtDataHora(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 16px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
          Leitura espelhada do canal do Ops Control — criação e dispatch continuam máquina-a-máquina (x-owner-secret).
        </div>
      </section>

      {sel && (
        <section className="panel">
          <div className="panel-head">
            <h2>{sel.title || sel.ticketCode || "Ticket"}</h2>
            <div className="meta"><span className={statusTag(sel.status)}>{sel.status || "—"}</span></div>
          </div>
          <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10, fontSize: "0.74rem" }}>
            {sel.description && (
              <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-line" }}>{sel.description}</p>
            )}
            {sel.lastCustomerMessage && (
              <div style={{ padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                <strong style={{ display: "block", fontSize: "0.64rem", color: "var(--text-muted)", marginBottom: 4 }}>Última mensagem do cliente</strong>
                {sel.lastCustomerMessage}
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["Categoria", sel.category],
                ["Empresa (id)", sel.companyId != null ? `#${sel.companyId}` : null],
                ["Cliente", sel.customerName],
                ["Telefone", sel.customerPhone],
                ["Branch", sel.githubBranch],
                ["PR", sel.githubPrNumber != null ? `#${sel.githubPrNumber}` : null],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value || "—"}</span>
                </div>
              ))}
            </div>
            {(sel.jobs || []).length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <strong style={{ fontSize: "0.72rem" }}>Jobs</strong>
                {(sel.jobs || []).map(j => (
                  <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem" }}>
                    <span>{j.title || j.type || j.id}</span>
                    <span className={statusTag(j.status)} style={{ marginLeft: "auto" }}>{j.status || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </React.Fragment>
  );
}
