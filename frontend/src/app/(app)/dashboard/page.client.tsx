"use client";

// Dashboard (template docs/TEMAS/*/corporate/Dashboard.html) ligado nos
// contratos QUE EXISTEM (repasse total de 12/06/2026):
//   - GET /vendas/board → cards no funil, tarefas de hoje, atividade recente
//   - GET /webscraping/radar/leads?limit=1 → leads na base
//   - GET /inbox/conversations?take=50 → atendimentos em aberto
//   - GET /vendas/report?period=7d → taxa de conversão, top segmentos, funil
//   - GET /vendas/seller-audit → top vendedores (Admin)
// "Receita (6 meses)" do template virou "Top segmentos (7 dias)" — não há
// série mensal de receita no backend (registrado no doc do PR).

import React, { useEffect, useState } from "react";

import { Av, KpiRow, Sidebar, Topbar, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type TimelineEvent = { id?: string; eventType?: string; description?: string | null; note?: string | null; createdAt?: string | null };

type BoardLead = {
  id: string;
  name: string | null;
  nextAction: string | null;
  returnAt: string | null;
  statusLabel?: string;
  timeline?: TimelineEvent[];
};

type Board = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: { today: BoardLead[]; overdue: BoardLead[]; scheduled: BoardLead[]; closed: BoardLead[] };
} | null;

type Report = {
  metrics?: { taxaConversao: number; taxaResposta: number; cardsRecebidos: number; cardsChamados: number; respostas: number; interessados: number };
  rankings?: { segments: { label: string; count: number }[] };
} | null;

type Audit = { rows?: { id: number; name: string; metrics: { closedCards: number; workRate: number } }[] } | null;

const EVENT_LABEL: Record<string, string> = {
  contact_made: "Contato realizado",
  result_recorded: "Resultado registrado",
  return_scheduled: "Retorno agendado",
  lead_closed: "Card fechado",
  reply_received: "Resposta recebida",
  inbound_reply: "Resposta recebida",
  created: "Card criado",
  imported: "Card importado",
};

const EVENT_COLOR: Record<string, string> = {
  lead_closed: "#2EE6A8",
  reply_received: "#16C7A4",
  inbound_reply: "#16C7A4",
  return_scheduled: "#4CC2FF",
  contact_made: "#F5B23C",
};

function eventLabel(t?: string) {
  const key = String(t || "").toLowerCase();
  return EVENT_LABEL[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Evento";
}

function fmtHora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function DashboardClient() {
  const user = useCurrentUser();
  const [tasks, setTasks] = useState<boolean[]>([]);
  const [board, setBoard] = useState<Board>(null);
  const [radarTotal, setRadarTotal] = useState<number | null>(null);
  const [convCount, setConvCount] = useState<number | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [audit, setAudit] = useState<Audit>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<Board>("/vendas/board")
      .then(res => { if (alive) { setBoard(res); setLoadError(null); } })
      .catch((err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : "Falha ao carregar o painel."); });
    apiFetch<{ total?: number }>("/webscraping/radar/leads?page=1&limit=1")
      .then(res => { if (alive) setRadarTotal(Number(res?.total ?? 0)); })
      .catch(() => { /* sem base */ });
    apiFetch<Array<unknown>>("/inbox/conversations?take=50")
      .then(res => { if (alive) setConvCount(Array.isArray(res) ? res.length : 0); })
      .catch(() => { /* inbox indisponível */ });
    apiFetch<Report>("/vendas/report?period=7d")
      .then(res => { if (alive) setReport(res); })
      .catch(() => { /* relatório indisponível */ });
    apiFetch<Audit>("/vendas/seller-audit")
      .then(res => { if (alive) setAudit(res); })
      .catch(() => { /* só Admin vê */ });
    return () => { alive = false; };
  }, []);

  const summary = board?.summary;
  const hoje = board?.blocks?.today || [];
  const todosCards = [
    ...(board?.blocks?.overdue || []),
    ...hoje,
    ...(board?.blocks?.scheduled || []),
    ...(board?.blocks?.closed || []),
  ];
  const atividade = todosCards
    .flatMap(card => (card.timeline || []).map(ev => ({ card, ev })))
    .filter(x => x.ev?.createdAt)
    .sort((a, b) => String(b.ev.createdAt).localeCompare(String(a.ev.createdAt)))
    .slice(0, 5);

  const segments = report?.rankings?.segments || [];
  const maxSeg = Math.max(1, ...segments.map(s => s.count));
  const m = report?.metrics;
  const funil = m ? [
    { label: "Cards recebidos", value: m.cardsRecebidos, c: "#4CC2FF" },
    { label: "Chamados", value: m.cardsChamados, c: "#16C7A4" },
    { label: "Respostas", value: m.respostas, c: "#2EE6A8" },
    { label: "Interessados", value: m.interessados, c: "#F5B23C" },
  ] : [];
  const maxFunil = Math.max(1, ...funil.map(f => f.value));
  const vendedores = (audit?.rows || []).slice(0, 3);
  const tarefas = hoje.slice(0, 3);

  return (
    <div className="app">
      <Sidebar active="dash" />
      <div className="main">
        <Topbar title="Dashboard" crumbs={<React.Fragment>Home &rsaquo; <b>Dashboard</b></React.Fragment>} />
        <div className="work" style={{ flex: 1 }}>
          {loadError && (user as { isSystemMaster?: boolean } | null)?.isSystemMaster ? (
            <section className="panel">
              <div style={{ padding: 18, display: "grid", gap: 8 }}>
                <strong style={{ fontSize: "0.86rem" }}>Você está logado como MASTER</strong>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  A conta master não tem empresa vinculada, e este painel mostra a operação de UMA empresa —
                  por isso as chamadas retornam erro ({loadError}). Para operar o dia a dia, entre com a conta
                  Admin da empresa (ex.: jhonatan@hbxsystem.com.br). A tela do master é a próxima janela do padrão.
                </span>
              </div>
            </section>
          ) : loadError ? (
            <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>
          ) : null}
          <KpiRow items={[
            { icon: "money", label: "Cards no funil", value: summary ? String(summary.total) : "—", delta: "—" },
            { icon: "users", label: "Leads na base (Radar)", value: radarTotal != null ? radarTotal.toLocaleString("pt-BR") : "—", delta: "—" },
            { icon: "atend", label: "Atendimentos em aberto", value: convCount != null ? String(convCount) : "—", delta: "—" },
            { icon: "check", label: "Taxa de conversão (7d)", value: m ? `${(m.taxaConversao * 100).toFixed(1).replace(".", ",")}%` : "—", delta: "—" },
          ]} />

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Top segmentos (7 dias)</h2>
                <div className="meta">
                  <span className="link">Ver relatório</span>
                </div>
              </div>
              <div style={{ padding: "10px 18px 16px" }}>
                {segments.length === 0 && (
                  <p style={{ margin: "12px 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem dados no período — trabalhe cards para o ranking aparecer.</p>
                )}
                {segments.length > 0 && (
                  <div className="bars">
                    {segments.map(s => (
                      <div className="b" key={s.label}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{s.count}</span>
                        <div className="bar" style={{ height: Math.max(8, Math.round((s.count / maxSeg) * 118)) }}></div>
                        <span className="lbl" style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Funil de conversão (7 dias)</h2></div>
              <div style={{ padding: "14px 18px 18px" }}>
                {funil.length === 0 && (
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem dados no período.</p>
                )}
                {funil.length > 0 && (
                  <React.Fragment>
                    <div style={{ display: "grid", gap: 4, justifyItems: "center", padding: "4px 0 10px" }}>
                      {funil.map(f => (
                        <div key={f.label} style={{ width: Math.max(36, Math.round((f.value / maxFunil) * 190)), height: 24, background: f.c, borderRadius: 4, opacity: 0.92 }}></div>
                      ))}
                    </div>
                    <div className="fleg">
                      {funil.map(f => (
                        <div className="row" key={f.label}><span className="swatch" style={{ background: f.c }}></span>{f.label}<span style={{ marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.64rem" }}>{f.value}</span></div>
                      ))}
                    </div>
                  </React.Fragment>
                )}
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 14 }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Atividade recente</h2>
                <div className="meta"><span className="link">Ver tudo</span></div>
              </div>
              <div className="activity" style={{ padding: "4px 18px 10px" }}>
                {atividade.length === 0 && (
                  <p style={{ margin: "12px 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem eventos ainda — a atividade nasce do trabalho nos cards.</p>
                )}
                {atividade.map(({ card, ev }, i) => (
                  <div className="it" key={ev.id || i}>
                    <span className="dot" style={{ background: EVENT_COLOR[String(ev.eventType || "").toLowerCase()] || "#4CC2FF" }}></span>
                    <div>
                      <div className="t">{eventLabel(ev.eventType)} — {card.name || "card"}</div>
                      <div className="d">{ev.note || ev.description || card.statusLabel || ""}</div>
                    </div>
                    <time>{fmtHora(ev.createdAt)}</time>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Tarefas de hoje</h2></div>
              <div style={{ padding: "8px 18px 14px" }}>
                {tarefas.length === 0 && (
                  <p style={{ margin: "10px 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Nenhum retorno para hoje.</p>
                )}
                {tarefas.map((t, i) => (
                  <label className="task" key={t.id}>
                    <input type="checkbox" checked={Boolean(tasks[i])} onChange={() => setTasks(ts => { const next = [...ts]; next[i] = !next[i]; return next; })} />
                    <span>
                      <span className="t" style={{ textDecoration: tasks[i] ? "line-through" : "none", opacity: tasks[i] ? 0.6 : 1 }}>{t.nextAction || "Retorno agendado"}</span>
                      <span className="d">{t.name || "—"}</span>
                    </span>
                  </label>
                ))}
                <span className="link">Ver todas no Vendas</span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Top vendedores</h2></div>
              <div style={{ padding: "10px 18px 16px", display: "grid", gap: 13 }}>
                {vendedores.length === 0 && (
                  <p style={{ margin: "10px 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Auditoria visível para Admin/Master.</p>
                )}
                {vendedores.map(v => (
                  <div key={v.id} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Av name={v.name} size={22} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{v.name}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 700 }}>{v.metrics.closedCards} fechados</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--hbx-surface-raised)" }}>
                      <div style={{ width: `${Math.min(100, Math.round((v.metrics.workRate || 0) * 100))}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--hbx-brand), var(--hbx-brand-strong))" }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
