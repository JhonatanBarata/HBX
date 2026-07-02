"use client";

// Tela Relatórios (template docs/TEMAS/*/corporate/Relatorios.html) ligada
// nos contratos reais:
//   - GET /vendas/report?period=today|7d|30d → métricas, rankings, recomendação
//   - GET /vendas/seller-audit?period= → desempenho real por vendedor
//   - GET /vendas/report/export.pdf → download real (Exportar PDF)
// Adaptações por dado real (doc do PR): períodos do template viraram os
// períodos reais do contrato; "Receita por mês" virou "Top segmentos";
// funil usa Recebidos→Chamados→Respostas→Interessados; colunas da tabela
// de vendedores viraram os campos reais da auditoria. "Ver detalhes" (e o
// clique na linha) expande os campos extras que /vendas/seller-audit já
// devolve (situação, operação do dia, último contato, top segmento/cidade,
// entregues/limite). "Exportar CSV" segue visual (sem endpoint).

import React, { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, KpiRow, useCurrentUser, useEntitlements } from "@/components/hbx/shell";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

type Ranking = { label: string; count: number };

// ── WORM-18 — "Acompanhe sua equipe" (6 widgets, pro dono/admin) ─────────────
// SO LEITURA: agrega VendasLead + conversas do Webwhats no banco + distribuicao.
// Gate real no backend (/relatorios/*): vendedor = 403; Gerente (ADMIN sem
// billing) recebe R$ zerado (canViewValues=false).
type EquipeDashboard = {
  funnelRevenue: {
    stages: { stage: string; count: number }[];
    won: { count: number; value: number | null };
    lost: { count: number; value: number | null };
    canViewValues: boolean;
  };
  unansweredChats: {
    thresholdHours: number;
    total: number;
    rows: { userId: number | null; seller: string; count: number; waitingHours: number }[];
  };
  sellerFunnel: {
    rows: { userId: number; seller: string; delivered: number; worked: number; converted: number }[];
  };
  firstResponse: {
    rows: { userId: number | null; seller: string; samples: number; avgMinutes: number }[];
  };
  freshLeads: { opened: number; usedIn48h: number; stillWaiting: number; missed: number; ratePct: number };
  botFunnel: { touched: number; handedToHuman: number; converted: number };
} | null;

function brl(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function humanMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

type ReportResponse = {
  ok?: boolean;
  metrics?: {
    cardsRecebidos: number;
    cardsChamados: number;
    respostas: number;
    retornos: number;
    interessados: number;
    recusas: number;
    bloqueios: number;
    descartados: number;
    taxaResposta: number;
    taxaConversao: number;
    melhorSegmento: string;
    melhorCidade: string;
    melhorCanal: string;
  };
  rankings?: {
    segments: Ranking[];
    cities: Ranking[];
    channels: Ranking[];
    discardReasons: Ranking[];
  };
  recommendation?: string;
} | null;

type SellerAuditRow = {
  // identidade vem aninhada em `seller` no /vendas/seller-audit (não na raiz)
  seller: { id: number; name: string; botAccessEnabled?: boolean };
  metrics: {
    activeCards: number;
    receivedCards: number;
    workedCards: number;
    returnCards: number;
    closedCards: number;
    interestedCards: number;
    responseCards: number;
    deliveredToday: number;
    dailyLimit: number;
    workRate: number;
  };
  // campos extras reais do contrato, revelados no "Ver detalhes"
  status?: { label?: string | null } | null;
  operation?: { label?: string | null; reason?: string | null } | null;
  topCity?: string | null;
  topSegment?: string | null;
  lastActivityAt?: string | null;
};

type SellerAuditResponse = { rows?: SellerAuditRow[] } | null;

const PERIODOS: { label: string; value: string }[] = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
];

const FUNIL_CORES = ["var(--hbx-info)", "var(--hbx-brand)", "var(--hbx-brand-strong)", "var(--hbx-warning)"];
const CANAL_CORES = ["var(--hbx-accent)", "var(--hbx-brand)", "var(--hbx-info)", "var(--hbx-danger)", "var(--hbx-secondary)"];

function pct(value: number) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Planos com tier 'list' (hbx_lite) não têm exportação de PDF (canExportConversionPdf=false
// no catálogo de planos). Todos os outros tiers têm. Quando o plano ainda não carregou
// (loaded=false) escondemos o botão para evitar flash de recurso proibido (fail-closed).
function canExportPdf(planKey: string | null, loaded: boolean): boolean {
  if (!loaded) return false;
  // null = sem plano definido → projeta Lead Plus → pode exportar
  if (planKey === null) return true;
  return planKey !== "hbx_lite";
}

export function RelatoriosClient() {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const isMaster = Boolean((user as { isSystemMaster?: boolean } | null)?.isSystemMaster);
  // WORM-18: "Acompanhe sua equipe" e pro dono/admin. Vendedor nao ve (o backend
  // ja barra com 403; aqui evitamos disparar a chamada e mostrar a secao).
  const isSeller = (user as { userKind?: string | null } | null)?.userKind === "seller";
  const podeVerEquipe = Boolean(user) && !isSeller;
  const [equipe, setEquipe] = useState<EquipeDashboard>(null);
  const [equipeErr, setEquipeErr] = useState<string | null>(null);
  // master bypass: sempre pode exportar (backend bypassa entitlements para isSystemMaster)
  const podeExportarPdf = isMaster || canExportPdf(ent.planKey, ent.loaded);
  const [per, setPer] = useState("7d");
  const [report, setReport] = useState<ReportResponse>(null);
  const [audit, setAudit] = useState<SellerAuditResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [openSellers, setOpenSellers] = useState<Set<number>>(() => new Set());
  // bot access por vendedor: chave = sellerId, valor = estado local (optimistic)
  const [botAccessMap, setBotAccessMap] = useState<Record<number, boolean>>({});
  const [botAccessBusy, setBotAccessBusy] = useState<Record<number, boolean>>({});
  const [botAccessMsg, setBotAccessMsg] = useState<string | null>(null);

  const load = useCallback((period: string) => {
    return Promise.all([
      apiFetch<ReportResponse>(`/vendas/report?period=${encodeURIComponent(period)}`)
        .then(rep => ({ rep, err: null as string | null }))
        .catch((err: unknown) => {
          const e = err as Error & { status?: number };
          const msg = e?.status === 402
            ? "Relatório completo requer plano com inteligência (Lead Plus)."
            : e?.message || "Falha ao carregar o relatório.";
          return { rep: null, err: `${msg}${e?.status ? ` (HTTP ${e.status})` : ""}` };
        }),
      apiFetch<SellerAuditResponse>(`/vendas/seller-audit?period=${encodeURIComponent(period)}`).catch(() => null),
    ]).then(([r, aud]) => {
      setReport(r.rep);
      setLoadError(r.err);
      setAudit(aud);
      // inicializa o mapa de bot-access com o estado atual do backend
      if (aud?.rows) {
        const map: Record<number, boolean> = {};
        for (const row of aud.rows) {
          map[row.seller.id] = Boolean(row.seller.botAccessEnabled);
        }
        setBotAccessMap(map);
      }
    });
  }, []);

  useEffect(() => { load(per); }, [load, per]);

  // WORM-18: dashboard da equipe (6 widgets em 1 chamada). So dispara pra admin.
  // A secao so renderiza com podeVerEquipe; nao precisamos limpar o estado
  // sincronamente aqui (evita cascading render — react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!podeVerEquipe) return;
    let alive = true;
    apiFetch<EquipeDashboard>(`/relatorios/dashboard?period=${encodeURIComponent(per)}`)
      .then(data => { if (alive) { setEquipe(data); setEquipeErr(null); } })
      .catch((err: unknown) => {
        if (!alive) return;
        const e = err as Error & { status?: number };
        setEquipe(null);
        setEquipeErr(e?.status === 403 ? null : (e?.message || "Não foi possível carregar os relatórios da equipe."));
      });
    return () => { alive = false; };
  }, [podeVerEquipe, per]);

  async function exportarPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(`${getApiBase()}/vendas/report/export.pdf?period=${encodeURIComponent(per)}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Exportar PDF faz parte do HBX Lead Plus ou superior.");
        }
        throw new Error("Não foi possível gerar o PDF. Tente novamente em instantes.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-vendas-${per}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Não foi possível gerar o PDF. Tente novamente em instantes.");
    } finally {
      setPdfBusy(false);
    }
  }

  // CSV gerado client-side com os dados reais já carregados (não há
  // endpoint de CSV no contrato — só PDF; registrado no doc do PR)
  function exportarCsv() {
    const met = report?.metrics;
    if (!met) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas: string[] = [];
    const periodo = PERIODOS.find(p => p.value === per)?.label || per;
    linhas.push(["Relatório de Vendas HBX", periodo].map(esc).join(";"));
    linhas.push("");
    linhas.push(["Métrica", "Valor"].map(esc).join(";"));
    linhas.push(["Cards recebidos", met.cardsRecebidos].map(esc).join(";"));
    linhas.push(["Chamados", met.cardsChamados].map(esc).join(";"));
    linhas.push(["Respostas", met.respostas].map(esc).join(";"));
    linhas.push(["Retornos", met.retornos].map(esc).join(";"));
    linhas.push(["Interessados", met.interessados].map(esc).join(";"));
    linhas.push(["Recusas", met.recusas].map(esc).join(";"));
    linhas.push(["Taxa de resposta", pct(met.taxaResposta)].map(esc).join(";"));
    linhas.push(["Taxa de conversão", pct(met.taxaConversao)].map(esc).join(";"));
    linhas.push("");
    linhas.push(["Top segmentos", "Cards"].map(esc).join(";"));
    (report?.rankings?.segments || []).forEach(s => linhas.push([s.label, s.count].map(esc).join(";")));
    linhas.push("");
    linhas.push(["Canais", "Cards"].map(esc).join(";"));
    (report?.rankings?.channels || []).forEach(c => linhas.push([c.label, c.count].map(esc).join(";")));
    if ((audit?.rows || []).length > 0) {
      linhas.push("");
      linhas.push(["Vendedor", "Recebidos", "Trabalhados", "Fechados", "Aproveitamento"].map(esc).join(";"));
      (audit?.rows || []).forEach(v => linhas.push([v.seller.name, v.metrics.receivedCards, v.metrics.workedCards, v.metrics.closedCards, `${Math.round((v.metrics.workRate || 0) * 100)}%`].map(esc).join(";")));
    }
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-vendas-${per}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleBotAccess(sellerId: number, value: boolean) {
    if (botAccessBusy[sellerId]) return;
    setBotAccessBusy(prev => ({ ...prev, [sellerId]: true }));
    setBotAccessMsg(null);
    // optimistic
    setBotAccessMap(prev => ({ ...prev, [sellerId]: value }));
    try {
      await apiFetch(`/vendas/seller-audit/${encodeURIComponent(sellerId)}/governance`, {
        method: "PATCH",
        body: JSON.stringify({ botAccess: value }),
      });
      setBotAccessMsg(value ? "✓ Bot liberado para o vendedor." : "✓ Acesso ao bot removido.");
    } catch (err) {
      // reverte se falhar
      setBotAccessMap(prev => ({ ...prev, [sellerId]: !value }));
      setBotAccessMsg(err instanceof Error ? err.message : "Não foi possível atualizar o acesso ao bot.");
    } finally {
      setBotAccessBusy(prev => ({ ...prev, [sellerId]: false }));
    }
  }

  async function liberarTodos() {
    const ids = (audit?.rows || []).map(r => r.seller.id);
    if (ids.length === 0) return;
    setBotAccessMsg(null);
    // dispara todos em paralelo
    await Promise.all(ids.map(id => toggleBotAccess(id, true)));
    setBotAccessMsg("✓ Bot liberado para todos os vendedores.");
  }

  const m = report?.metrics;
  const segments = report?.rankings?.segments || [];
  const channels = report?.rankings?.channels || [];
  const maxSeg = Math.max(1, ...segments.map(s => s.count));
  const maxCh = Math.max(1, ...channels.map(c => c.count));

  const funil = m ? [
    { label: "Cards recebidos", value: m.cardsRecebidos },
    { label: "Chamados", value: m.cardsChamados },
    { label: "Respostas", value: m.respostas },
    { label: "Interessados", value: m.interessados },
  ] : [];
  const maxFunil = Math.max(1, ...funil.map(f => f.value));

  const sellers = audit?.rows || [];
  const allSellersOpen = sellers.length > 0 && sellers.every(s => openSellers.has(s.seller.id));
  const toggleSeller = (id: number) => setOpenSellers(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllSellers = () => {
    if (sellers.length === 0) return;
    setOpenSellers(allSellersOpen ? new Set() : new Set(sellers.map(s => s.seller.id)));
  };

  return (
    <div className="work" style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {PERIODOS.map(p => (
              <button key={p.value} className="btn-ghost" onClick={() => setPer(p.value)}
                style={p.value === per ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
                {p.label}
              </button>
            ))}
            {pdfError && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{pdfError}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
              {podeExportarPdf && (
                <button className="btn-ghost" onClick={exportarPdf} disabled={pdfBusy}><I d={ICONS.doc} size={13} /> {pdfBusy ? "Exportando…" : "Exportar PDF"}</button>
              )}
              <button className="btn-teal" onClick={exportarCsv} disabled={!report?.metrics}><I d={ICONS.doc} size={13} /> Exportar CSV</button>
            </div>
          </div>

          {podeVerEquipe && (
            <EquipeSection data={equipe} err={equipeErr} periodoLabel={PERIODOS.find(p => p.value === per)?.label || per} />
          )}

          {loadError && !report && (
            <section className="panel">
              <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
                <strong style={{ fontSize: "0.86rem", color: isMaster ? "var(--text-strong)" : "var(--hbx-danger)" }}>
                  {isMaster ? "Você está logado como MASTER" : "O relatório não carregou"}
                </strong>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {isMaster
                    ? `A conta master não tem empresa vinculada, e este relatório é da operação de UMA empresa — por isso a chamada falha (${loadError}). Entre com a conta Admin da empresa (ex.: jhonatan@hbxsystem.com.br).`
                    : loadError}
                </span>
                <button className="btn-ghost" onClick={() => load(per)}>Tentar novamente</button>
              </div>
            </section>
          )}

          <KpiRow items={[
            { icon: "users", label: "Cards recebidos", value: m ? String(m.cardsRecebidos) : "—", delta: "—" },
            { icon: "atend", label: "Chamados", value: m ? String(m.cardsChamados) : "—", delta: "—" },
            { icon: "msg", label: "Taxa de resposta", value: m ? pct(m.taxaResposta) : "—", delta: "—" },
            { icon: "check", label: "Taxa de conversão", value: m ? pct(m.taxaConversao) : "—", delta: "—" },
          ]} />

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Top segmentos</h2>
                <div className="meta"><span>{PERIODOS.find(p => p.value === per)?.label}</span></div>
              </div>
              <div style={{ padding: "10px 18px 16px" }}>
                {segments.length === 0 && (
                  <p style={{ margin: "12px 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem dados no período — trabalhe alguns cards para o ranking aparecer.</p>
                )}
                {segments.length > 0 && (
                  <div className="bars" style={{ height: 180 }}>
                    {segments.map(s => (
                      <div className="b" key={s.label}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{s.count}</span>
                        <div className="bar" style={{ height: Math.max(8, Math.round((s.count / maxSeg) * 140)) }}></div>
                        <span className="lbl" style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Leads por canal</h2></div>
              <div style={{ padding: "16px 18px 18px" }}>
                {channels.length === 0 && (
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem dados de canal no período.</p>
                )}
                <div className="hbar">
                  {channels.map((c, i) => (
                    <div className="r" key={c.label}>
                      <span className="lab" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                      <span className="track"><span className="fill" style={{ width: `${Math.round((c.count / maxCh) * 100)}%`, background: CANAL_CORES[i % CANAL_CORES.length], display: "block" }}></span></span>
                      <span className="num">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 14 }}>
            <section className="panel">
              <div className="panel-head"><h2>Funil de conversão</h2></div>
              <div style={{ padding: "14px 18px 18px" }}>
                {funil.length === 0 && (
                  <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem dados no período.</p>
                )}
                {funil.length > 0 && (
                  <React.Fragment>
                    <div style={{ display: "grid", gap: 4, justifyItems: "center", padding: "4px 0 10px" }}>
                      {funil.map((f, i) => (
                        <div key={f.label} style={{ width: Math.max(36, Math.round((f.value / maxFunil) * 190)), height: 24, background: FUNIL_CORES[i], borderRadius: 4, opacity: 0.92 }}></div>
                      ))}
                    </div>
                    <div className="fleg">
                      {funil.map((f, i) => (
                        <div className="row" key={f.label}>
                          <span className="swatch" style={{ background: FUNIL_CORES[i] }}></span>{f.label}
                          <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.64rem" }}>
                            {f.value} ({maxFunil > 0 ? Math.round((f.value / maxFunil) * 100) : 0}%)
                          </span>
                        </div>
                      ))}
                    </div>
                    {report?.recommendation && (
                      <p style={{ margin: "12px 0 0", fontSize: "0.7rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{report.recommendation}</p>
                    )}
                  </React.Fragment>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Desempenho por vendedor</h2>
                <div className="meta">
                  {sellers.length > 0 && (
                    <button className="btn-ghost" style={{ fontSize: "0.68rem", padding: "4px 10px" }}
                      onClick={liberarTodos}
                      title="Libera o bot para todos os vendedores da equipe de uma vez">
                      Liberar bot p/ todos
                    </button>
                  )}
                  {botAccessMsg && <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--hbx-brand-strong)" }}>{botAccessMsg}</span>}
                  <span className="link" role="button" tabIndex={0} aria-expanded={allSellersOpen}
                    aria-disabled={sellers.length === 0} onClick={toggleAllSellers}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAllSellers(); } }}>
                    {allSellersOpen ? "Ocultar detalhes" : "Ver detalhes"}
                  </span>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Vendedor</th><th>Recebidos</th><th>Trabalhados</th><th>Fechados</th><th>Aproveitamento</th></tr>
                  </thead>
                  <tbody>
                    {sellers.length === 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>
                          Sem auditoria de vendedores no período (visível para Admin/Master).
                        </td>
                      </tr>
                    )}
                    {sellers.map(v => {
                      const open = openSellers.has(v.seller.id);
                      return (
                        <React.Fragment key={v.seller.id}>
                          <tr onClick={() => toggleSeller(v.seller.id)} aria-expanded={open} title="Ver detalhes do vendedor">
                            <td>
                              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                                <span aria-hidden style={{ display: "inline-block", width: 12, fontSize: "0.7rem", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                                <Av name={v.seller.name} size={26} /><strong>{v.seller.name}</strong>
                              </div>
                            </td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.receivedCards}</td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.workedCards}</td>
                            <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.closedCards}</td>
                            <td style={{ minWidth: 140 }}>
                              <div style={{ height: 7, borderRadius: 999, background: "var(--hbx-surface-raised)" }}>
                                <div style={{ width: `${Math.min(100, Math.round((v.metrics.workRate || 0) * 100))}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--hbx-brand), var(--hbx-brand-strong))" }}></div>
                              </div>
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={5} style={{ padding: "0 12px 12px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, padding: "8px 0 2px" }}>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Situação</span><strong>{v.status?.label || "—"}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Operação hoje</span><strong>{v.operation?.label || "—"}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Último contato</span><strong>{fmtWhen(v.lastActivityAt)}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Cards ativos</span><strong>{v.metrics.activeCards}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Em retorno</span><strong>{v.metrics.returnCards}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Interessados</span><strong>{v.metrics.interestedCards}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Respostas</span><strong>{v.metrics.responseCards}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Entregues hoje</span><strong>{v.metrics.deliveredToday}/{v.metrics.dailyLimit || "—"}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Top segmento</span><strong>{v.topSegment || "—"}</strong></div>
                                  <div style={{ display: "grid", gap: 2 }}><span className="sub2">Top cidade</span><strong>{v.topCity || "—"}</strong></div>
                                </div>
                                {v.operation?.reason && (
                                  <p className="sub2" style={{ margin: "6px 0 0" }}>Observação: {v.operation.reason}</p>
                                )}
                                <div className="setting" style={{ marginTop: 8 }}>
                                  <div style={{ flex: 1 }}>
                                    <strong>Liberar bot para este vendedor</strong>
                                    <div className="sub2">Quando ligado, o vendedor pode usar o bot. Default: opt-in explícito.</div>
                                  </div>
                                  <button
                                    className={"sw" + (botAccessMap[v.seller.id] ? " on" : "")}
                                    role="switch"
                                    aria-checked={Boolean(botAccessMap[v.seller.id])}
                                    aria-label={`Liberar bot para ${v.seller.name}`}
                                    disabled={Boolean(botAccessBusy[v.seller.id])}
                                    onClick={() => toggleBotAccess(v.seller.id, !botAccessMap[v.seller.id])}
                                  ><i></i></button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
  );
}

// ── WORM-18 — "Acompanhe sua equipe" (6 widgets) ────────────────────────────
// Todo visual sai de classe/token central (5 Leis): .panel/.panel-head/.hbar/
// .kpi + variaveis --hbx-*. Inline style so p/ layout (grid/gap/width/height).
function EquipeSection({ data, err, periodoLabel }: { data: EquipeDashboard; err: string | null; periodoLabel: string }) {
  if (err) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Acompanhe sua equipe</h2></div>
        <div style={{ padding: 18 }}>
          <span style={{ fontSize: "0.74rem", color: "var(--hbx-danger)", fontWeight: 700 }}>{err}</span>
        </div>
      </section>
    );
  }

  const fr = data?.funnelRevenue;
  const uc = data?.unansweredChats;
  const sf = data?.sellerFunnel;
  const rt = data?.firstResponse;
  const fl = data?.freshLeads;
  const bot = data?.botFunnel;

  const maxStage = Math.max(1, ...(fr?.stages || []).map(s => s.count));
  const maxDeliver = Math.max(1, ...(sf?.rows || []).map(r => r.delivered || 0));
  const botMax = Math.max(1, bot?.touched || 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Acompanhe sua equipe</h2>
        <div className="meta"><span>{periodoLabel}</span></div>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        {/* 💰 Widget 1 — Funil em R$ por etapa */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head"><h2>💰 Funil por etapa</h2></div>
            <div style={{ padding: "12px 16px 16px" }}>
              {(!fr || fr.stages.length === 0) && (
                <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)" }}>Sem cards no período.</p>
              )}
              {fr && fr.stages.length > 0 && (
                <div className="bars" style={{ height: 170 }}>
                  {fr.stages.map(s => (
                    <div className="b" key={s.stage}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-muted)" }}>{s.count}</span>
                      <div className="bar" style={{ height: Math.max(8, Math.round((s.count / maxStage) * 130)) }}></div>
                      <span className="lbl">{s.stage}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div className="kpi">
              <span className="kpi-icon"><I d={ICONS.check} size={16} /></span>
              <div>
                <div className="kpi-label">Ganho no período</div>
                <div className="kpi-value">{fr ? brl(fr.won.value) : "—"}</div>
                <div className="kpi-foot"><span className="kpi-delta">{fr ? `${fr.won.count} venda(s)` : "—"}</span></div>
                {fr && !fr.canViewValues && (
                  <div className="kpi-foot"><span className="kpi-delta"><small>valores só para o dono</small></span></div>
                )}
              </div>
            </div>
            <div className="kpi">
              <span className="kpi-icon"><I d={ICONS.x} size={16} /></span>
              <div>
                <div className="kpi-label">Perdidos (encerrados)</div>
                <div className="kpi-value">{fr ? String(fr.lost.count) : "—"}</div>
                <div className="kpi-foot"><span className="kpi-delta down">cards fechados sem venda</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* 🔕 Widget 2 — Chats sem resposta >2h + ⏱️ Widget 4 — tempo 1ª resposta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head">
              <h2>🔕 Chats sem resposta &gt;2h</h2>
              <div className="meta"><span>{uc ? `${uc.total} no total` : "—"}</span></div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Vendedor</th><th>Chats</th><th>Espera</th></tr></thead>
                <tbody>
                  {(!uc || uc.rows.length === 0) && (
                    <tr style={{ cursor: "default" }}><td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "18px 12px" }}>Ninguém deixando lead esperando. 👏</td></tr>
                  )}
                  {uc?.rows.map(r => (
                    <tr key={String(r.userId ?? r.seller)} style={{ cursor: "default" }}>
                      <td>{r.seller}</td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--hbx-danger)", fontWeight: 700 }}>{r.count}</td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{humanMinutes(r.waitingHours * 60)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head"><h2>⏱️ Tempo médio 1ª resposta</h2></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Vendedor</th><th>Média</th><th>Amostras</th></tr></thead>
                <tbody>
                  {(!rt || rt.rows.length === 0) && (
                    <tr style={{ cursor: "default" }}><td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "18px 12px" }}>Sem respostas humanas no período.</td></tr>
                  )}
                  {rt?.rows.map(r => (
                    <tr key={String(r.userId ?? r.seller)} style={{ cursor: "default" }}>
                      <td>{r.seller}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{humanMinutes(r.avgMinutes)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{r.samples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 📈 Widget 3 — Entregues × trabalhados × convertidos por vendedor */}
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-head"><h2>📈 Leads entregues × trabalhados × convertidos</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Vendedor</th><th>Entregues</th><th>Trabalhados</th><th>Convertidos</th><th style={{ minWidth: 120 }}>Volume</th></tr></thead>
              <tbody>
                {(!sf || sf.rows.length === 0) && (
                  <tr style={{ cursor: "default" }}><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "18px 12px" }}>Sem distribuição no período.</td></tr>
                )}
                {sf?.rows.map(r => (
                  <tr key={r.userId} style={{ cursor: "default" }}>
                    <td>{r.seller}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.delivered}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.worked}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--hbx-brand-strong)", fontWeight: 700 }}>{r.converted}</td>
                    <td>
                      <span style={{ display: "block", height: 7, borderRadius: 999, background: "var(--hbx-surface-raised)" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.round(((r.delivered || 0) / maxDeliver) * 100)}%`, background: "linear-gradient(90deg, var(--hbx-brand), var(--hbx-brand-strong))" }}></span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🐣 Widget 5 — Recém-abertas aproveitadas + 🤖 Widget 6 — IA */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head"><h2>🐣 Recém-abertas aproveitadas (&lt;48h)</h2></div>
            <div style={{ padding: "14px 16px 16px", display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 2 }}>
                  <span className="kpi-value">{fl ? `${fl.ratePct}%` : "—"}</span>
                  <span className="kpi-label">aproveitamento</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span className="kpi-value">{fl ? `${fl.usedIn48h}/${fl.opened}` : "—"}</span>
                  <span className="kpi-label">contatadas em &lt;48h</span>
                </div>
              </div>
              <div className="hbar">
                <div className="r">
                  <span className="lab">Ainda na janela</span>
                  <span className="track"><span className="fill" style={{ display: "block", width: fl && fl.opened ? `${Math.round((fl.stillWaiting / fl.opened) * 100)}%` : "0%", background: "var(--hbx-warning)" }}></span></span>
                  <span className="num">{fl?.stillWaiting ?? "—"}</span>
                </div>
                <div className="r">
                  <span className="lab">Perdidas (&gt;48h)</span>
                  <span className="track"><span className="fill" style={{ display: "block", width: fl && fl.opened ? `${Math.round((fl.missed / fl.opened) * 100)}%` : "0%", background: "var(--hbx-danger)" }}></span></span>
                  <span className="num">{fl?.missed ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head"><h2>🤖 IA: tocou × devolveu × converteu</h2></div>
            <div style={{ padding: "14px 16px 16px" }}>
              <div className="fleg">
                <div className="row">
                  <span className="swatch" style={{ background: "var(--hbx-info)" }}></span>Conversas tocadas pela IA
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 700 }}>{bot?.touched ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="swatch" style={{ background: "var(--hbx-warning)" }}></span>Devolvidas pro humano
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{bot ? `${bot.handedToHuman} (${botMax ? Math.round((bot.handedToHuman / botMax) * 100) : 0}%)` : "—"}</span>
                </div>
                <div className="row">
                  <span className="swatch" style={{ background: "var(--hbx-brand-strong)" }}></span>Viraram venda
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 700, color: "var(--hbx-brand-strong)" }}>{bot ? `${bot.converted} (${botMax ? Math.round((bot.converted / botMax) * 100) : 0}%)` : "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
