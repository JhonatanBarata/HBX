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

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { Av, KpiRow, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isCompanySeller } from "@/lib/roles";

type TimelineEvent = { id?: string; eventType?: string; title?: string | null; description?: string | null; note?: string | null; createdAt?: string | null };

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

// /vendas/seller-audit aninha a identidade do vendedor em `seller` (o id/name
// ficam em row.seller, não na raiz da row — só `metrics` é raiz). Tipar errado
// fazia o nome/avatar virem undefined em "Top vendedores".
type Audit = { rows?: { seller: { id: number; name: string }; metrics: { closedCards: number; workRate: number } }[] } | null;

// GET /vendas/commission/summary → no scope "seller" o backend devolve só os
// cards do próprio vendedor (totais já em BRL). Alimenta o KPI "Comissão" e só
// é exibido quando userKind === "seller".
type Commission = {
  ok?: boolean;
  totals?: { payableAmount: number; duePayableAmount: number; duePayableCount: number; pendingAmount: number; paidAmount: number; nextDueAt?: string | null };
} | null;

const EVENT_LABEL: Record<string, string> = {
  contact_made: "Contato realizado",
  result_recorded: "Resultado registrado",
  return_scheduled: "Retorno agendado",
  lead_closed: "Card fechado",
  reply_received: "Resposta recebida",
  inbound_reply: "Resposta recebida",
  created: "Card criado",
  lead_created: "Card criado",
  imported: "Card importado",
  origin_registered: "Origem registrada",
  radar_enrichment_imported: "Enriquecido pelo Radar",
  lead_enrichment_used: "Enriquecimento aplicado",
  lead_reused: "Card reaproveitado",
};

const EVENT_COLOR: Record<string, string> = {
  lead_closed: "var(--hbx-brand-strong)",
  reply_received: "var(--hbx-brand)",
  inbound_reply: "var(--hbx-brand)",
  return_scheduled: "var(--hbx-info)",
  contact_made: "var(--hbx-warning)",
};

function eventLabel(t?: string) {
  const key = String(t || "").toLowerCase();
  return EVENT_LABEL[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Evento";
}

// Rótulo da atividade: tipo conhecido → título humano do backend (eventos do
// motor trazem `title`, ex. "Numero sem WhatsApp no motor") → humanização do
// tipo. Sem isso, tipos crus apareciam como "Generic", "Lead Created" etc.
// Defesa universal: NUNCA renderizar payload cru na tela. Se a descrição/nota
// vier JSON-like (ex.: bug do radar_enrichment_imported que vazava o paredão),
// some — cai no fallback (statusLabel). Garante que "nada tenha isso" mesmo se
// algum evento futuro escorregar um stringify pra um campo de texto.
function cleanDesc(s?: string | null) {
  const t = String(s || "").trim();
  if (!t) return "";
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) return "";
  return t;
}

function activityLabel(ev: TimelineEvent) {
  const key = String(ev.eventType || "").toLowerCase();
  return EVENT_LABEL[key] || (ev.title || "").trim() || eventLabel(ev.eventType);
}

function fmtHora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtMoney(v?: number | null) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DashboardClient() {
  const user = useCurrentUser();
  const [board, setBoard] = useState<Board>(null);
  const [radarTotal, setRadarTotal] = useState<number | null>(null);
  const [convCount, setConvCount] = useState<number | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [audit, setAudit] = useState<Audit>(null);
  const [commission, setCommission] = useState<Commission>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isSeller = isCompanySeller(user);

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
    apiFetch<Commission>("/vendas/commission/summary")
      .then(res => { if (alive) setCommission(res); })
      .catch(() => { /* sem acesso à comissão pela política da equipe */ });
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
  const ct = commission?.totals;
  const funil = m ? [
    { label: "Cards recebidos", value: m.cardsRecebidos, c: "var(--hbx-info)" },
    { label: "Chamados", value: m.cardsChamados, c: "var(--hbx-brand)" },
    { label: "Respostas", value: m.respostas, c: "var(--hbx-brand-strong)" },
    { label: "Interessados", value: m.interessados, c: "var(--hbx-warning)" },
  ] : [];
  const maxFunil = Math.max(1, ...funil.map(f => f.value));
  const vendedores = (audit?.rows || [])
    .slice()
    .sort((a, b) => (b.metrics.closedCards - a.metrics.closedCards) || (b.metrics.workRate - a.metrics.workRate))
    .slice(0, 3);
  const tarefas = hoje.slice(0, 3);

  return (
    <div className="work" style={{ flex: 1 }}>
          {loadError && (user as { isSystemMaster?: boolean } | null)?.isSystemMaster ? (
            <section className="panel">
              <div style={{ padding: 18, display: "grid", gap: 8 }}>
                <strong style={{ fontSize: "0.86rem" }}>Você está logado como MASTER</strong>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  A conta master não tem empresa vinculada, e este painel mostra a operação de UMA empresa —
                  por isso as chamadas retornam erro ({loadError}). Para operar o dia a dia, entre com a conta
                  Admin da empresa (ex.: jhonatan@hbxsystem.com.br). A sua casa é o painel Master.
                </span>
                <a className="btn-teal" href="/master" style={{ width: "fit-content", textDecoration: "none" }}>Ir para o /master</a>
              </div>
            </section>
          ) : loadError ? (
            <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>
          ) : null}
          <KpiRow items={[
            { icon: "money", label: "Cards no funil", value: summary ? String(summary.total) : "—", href: "/vendas" },
            // Vendedor vê a comissão dele (ordem do dono); demais perfis veem a base do Radar.
            isSeller
              ? {
                  icon: "money",
                  label: "Comissão a receber",
                  value: ct ? fmtMoney(ct.payableAmount) : "—",
                  sub: ct && ct.duePayableAmount > 0
                    ? `${fmtMoney(ct.duePayableAmount)} liberada`
                    : ct && ct.paidAmount > 0
                      ? `${fmtMoney(ct.paidAmount)} já paga`
                      : "a receber",
                  href: "/gerencial",
                  onClick: () => { try { sessionStorage.setItem("hbx:gerencial-aba", "Comissões"); } catch { /* sem storage */ } },
                }
              : { icon: "users", label: "Leads na base (Radar)", value: radarTotal != null ? radarTotal.toLocaleString("pt-BR") : "—", href: "/leads" },
            { icon: "atend", label: "Atendimentos em aberto", value: convCount != null ? String(convCount) : "—", href: "/atendimento" },
            { icon: "check", label: "Taxa de conversão (7d)", value: m ? `${(m.taxaConversao * 100).toFixed(1).replace(".", ",")}%` : "—", href: "/relatorios" },
          ]} />

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Top segmentos (7 dias)</h2>
                <div className="meta">
                  <Link className="link" href="/relatorios">Ver relatório</Link>
                </div>
              </div>
              <div style={{ padding: "10px 18px 16px" }}>
                {segments.length === 0 && (
                  <p className="muted-note">Sem dados no período — trabalhe cards para o ranking aparecer.</p>
                )}
                {segments.length > 0 && (
                  <div className="bars">
                    {segments.map((s, i) => (
                      <div className="b" key={s.label} title={`${s.label}: ${s.count}`}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{s.count}</span>
                        <div className="bar" style={{ height: Math.max(8, Math.round((s.count / maxSeg) * 118)), animationDelay: `${i * 70}ms` }}></div>
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
                  <p className="muted-note">Sem dados no período.</p>
                )}
                {funil.length > 0 && (
                  <React.Fragment>
                    <div style={{ display: "grid", gap: 7, justifyItems: "center", padding: "4px 0 12px" }}>
                      {funil.map((f, i) => (
                        <div key={f.label} className="funnel-bar" style={{ width: Math.max(36, Math.round((f.value / maxFunil) * 190)), animationDelay: `${i * 80}ms`, ["--fc"]: f.c } as React.CSSProperties}></div>
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
                <div className="meta"><Link className="link" href="/vendas">Ver tudo</Link></div>
              </div>
              <div className="activity" style={{ padding: "4px 18px 10px" }}>
                {atividade.length === 0 && (
                  <p className="muted-note">Sem eventos ainda — a atividade nasce do trabalho nos cards.</p>
                )}
                {atividade.map(({ card, ev }, i) => (
                  <Link className="it" href="/vendas" key={ev.id || i}>
                    <span className="dot" style={{ background: EVENT_COLOR[String(ev.eventType || "").toLowerCase()] || "var(--hbx-info)" }}></span>
                    <div>
                      <div className="t">{activityLabel(ev)} — {card.name || "card"}</div>
                      <div className="d">{cleanDesc(ev.note) || cleanDesc(ev.description) || card.statusLabel || ""}</div>
                    </div>
                    <time>{fmtHora(ev.createdAt)}</time>
                  </Link>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Tarefas de hoje</h2></div>
              <div style={{ padding: "8px 18px 14px" }}>
                {tarefas.length === 0 && (
                  <p className="muted-note">Nenhum retorno para hoje.</p>
                )}
                {tarefas.map((t, i) => (
                  <div className="task" key={t.id ?? i}>
                    <span>
                      <Link className="t" href="/vendas">{t.nextAction || "Retorno agendado"}</Link>
                      <span className="d">{t.name || "—"}</span>
                    </span>
                  </div>
                ))}
                <Link className="link" href="/vendas">Ver todas no Vendas</Link>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>{isSeller ? "Meu desempenho" : "Top vendedores"}</h2>
                <div className="meta">
                  <Link className="link" href="/gerencial" onClick={() => { try { sessionStorage.setItem("hbx:gerencial-aba", "Comissões"); } catch { /* sem storage */ } }}>Comissões</Link>
                </div>
              </div>
              <div style={{ padding: "10px 18px 16px", display: "grid", gap: 13 }}>
                {vendedores.length === 0 && (
                  <p className="muted-note">{isSeller ? "Trabalhe e feche cards para ver seu desempenho aqui." : "Sem dados de vendedores no período ainda."}</p>
                )}
                {vendedores.map((v, i) => (
                  <div key={v.seller.id} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Av name={v.seller.name} size={22} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{v.seller.name}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 700 }}>{v.metrics.closedCards} fechados</span>
                    </div>
                    <div className="meter">
                      <div className="meter-fill" style={{ width: `${Math.min(100, Math.round((v.metrics.workRate || 0) * 100))}%`, animationDelay: `${i * 90}ms` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
  );
}
