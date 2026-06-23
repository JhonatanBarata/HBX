"use client";

// Janela "Quem está online" — painel master de presença.
// Backend já pronto: GET /admin/active-sessions (JWT + MasterGuard) →
// counters {onlineNow, activeLast15Min, activeToday} + sessions[].
// Presença é barata: lastSeenAt é estrangulado a 1 escrita/min por usuário
// (jwt.strategy.ts) e só roda em produção; aqui só lemos, com auto-refresh leve.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora } from "./page.client";

type SessionRow = {
  userId: number;
  userName: string;
  email?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  sessionId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  online: boolean;
  idleMinutes: number;
  userAgent?: string | null;
  ipFingerprint?: string | null;
  modules?: { key: string; name: string }[];
};

type ActiveSessions = {
  generatedAt: string;
  counters: { onlineNow: number; activeLast15Min: number; activeToday: number };
  sessions: SessionRow[];
} | null;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  owner: "Dono",
  seller: "Vendedor",
  manager: "Gerente",
  platform_infra: "Infra",
  system_master: "Master",
};

function roleLabel(role?: string | null, isMaster?: boolean) {
  if (isMaster) return "Master";
  const r = String(role || "").toLowerCase();
  return ROLE_LABEL[r] || (role ? String(role) : "—");
}

function presenca(s: SessionRow) {
  if (s.online) return { cls: "tag teal", label: "online agora" };
  const m = Math.max(0, s.idleMinutes);
  if (m < 60) return { cls: "tag", label: `há ${m} min` };
  const h = Math.floor(m / 60);
  if (h < 24) return { cls: "tag", label: `há ${h}h` };
  return { cls: "tag", label: `há ${Math.floor(h / 24)}d` };
}

const REFRESH_MS = 30000;

export function JanelaOnline() {
  const [data, setData] = useState<ActiveSessions>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // carregar() não mexe em estado de forma síncrona (só dentro do then/catch),
  // pra poder rodar dentro de efeito/intervalo sem o lint reclamar de cascading
  // render. O flag de loading vive no clique manual (atualizar).
  const carregar = useCallback(() => {
    return apiFetch<ActiveSessions>("/admin/active-sessions")
      .then(res => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar as sessões.");
      });
  }, []);

  const atualizar = useCallback(() => {
    setLoading(true);
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh leve (30s) só enquanto a janela está aberta e o auto ligado.
  useEffect(() => {
    if (!auto) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(() => { carregar(); }, REFRESH_MS);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [auto, carregar]);

  const counters = data?.counters;
  const sessions = data?.sessions || [];

  const cardStyle: React.CSSProperties = {
    flex: "1 1 160px",
    display: "grid",
    gap: 4,
    padding: "14px 16px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-hairline)",
    background: "var(--surface-2, transparent)",
  };

  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={cardStyle}>
          <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Online agora</span>
          <strong style={{ fontSize: "1.6rem", color: "var(--hbx-brand-strong)" }}>{counters ? counters.onlineNow : "—"}</strong>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>ativos nos últimos 5 min</span>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ativos (15 min)</span>
          <strong style={{ fontSize: "1.6rem" }}>{counters ? counters.activeLast15Min : "—"}</strong>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>movimento recente</span>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ativos hoje</span>
          <strong style={{ fontSize: "1.6rem" }}>{counters ? counters.activeToday : "—"}</strong>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>desde a meia-noite</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Sessões ({sessions.length})</h2>
          <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {error && <span style={{ fontWeight: 700, color: "var(--hbx-warning)" }}>{error}</span>}
            {data?.generatedAt && (
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                atualizado {fmtDataHora(data.generatedAt)}
              </span>
            )}
            <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "0.66rem", color: "var(--text-muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
              auto (30s)
            </label>
            <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={loading} onClick={atualizar}>
              {loading ? "…" : "Atualizar"}
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Empresa</th>
                <th>Função</th>
                <th>Situação</th>
                <th>Última atividade</th>
                <th>Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {data === null && <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
              {data !== null && sessions.length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--text-muted)" }}>Nenhuma sessão ativa.</td></tr>
              )}
              {sessions.map(s => {
                const p = presenca(s);
                return (
                  <tr key={s.sessionId} style={{ cursor: "default" }}>
                    <td>
                      <div className="co">
                        <strong>{s.userName}</strong>
                        <span className="sub2">{s.email || "—"}</span>
                      </div>
                    </td>
                    <td>{s.isSystemMaster ? "—" : (s.companyName || "—")}</td>
                    <td>{roleLabel(s.role, s.isSystemMaster)}</td>
                    <td><span className={p.cls}>{p.label}</span></td>
                    <td>{fmtDataHora(s.lastSeenAt)}</td>
                    <td style={{ fontSize: "0.66rem", color: "var(--text-muted)", whiteSpace: "normal", maxWidth: 220 }}>{s.userAgent || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </React.Fragment>
  );
}
