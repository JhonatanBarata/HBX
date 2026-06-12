"use client";

// Tela Relatórios (template docs/TEMAS/*/corporate/Relatorios.html) ligada
// nos contratos reais:
//   - GET /vendas/report?period=today|7d|30d → métricas, rankings, recomendação
//   - GET /vendas/seller-audit?period= → desempenho real por vendedor
//   - GET /vendas/report/export.pdf → download real (Exportar PDF)
// Adaptações por dado real (doc do PR): períodos do template viraram os
// períodos reais do contrato; "Receita por mês" virou "Top segmentos";
// funil usa Recebidos→Chamados→Respostas→Interessados; colunas da tabela
// de vendedores viraram os campos reais da auditoria. "Exportar CSV" segue
// visual (sem endpoint).

import React, { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, KpiRow, Sidebar, Topbar, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

type Ranking = { label: string; count: number };

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
  id: number;
  name: string;
  metrics: {
    activeCards: number;
    receivedCards: number;
    workedCards: number;
    returnCards: number;
    closedCards: number;
    workRate: number;
  };
};

type SellerAuditResponse = { rows?: SellerAuditRow[] } | null;

const PERIODOS: { label: string; value: string }[] = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
];

const FUNIL_CORES = ["#4CC2FF", "#16C7A4", "#2EE6A8", "#F5B23C"];
const CANAL_CORES = ["#22C77D", "#16C7A4", "#4CC2FF", "#F0566B", "#9B7BFF"];

function pct(value: number) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

export function RelatoriosClient() {
  const user = useCurrentUser();
  const isMaster = Boolean((user as { isSystemMaster?: boolean } | null)?.isSystemMaster);
  const [per, setPer] = useState("7d");
  const [report, setReport] = useState<ReportResponse>(null);
  const [audit, setAudit] = useState<SellerAuditResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
    });
  }, []);

  useEffect(() => { load(per); }, [load, per]);

  async function exportarPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(`${getApiBase()}/vendas/report/export.pdf?period=${encodeURIComponent(per)}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error(`Não foi possível exportar (HTTP ${res.status}).`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-vendas-${per}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Falha ao exportar o PDF.");
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
      (audit?.rows || []).forEach(v => linhas.push([v.name, v.metrics.receivedCards, v.metrics.workedCards, v.metrics.closedCards, `${Math.round((v.metrics.workRate || 0) * 100)}%`].map(esc).join(";")));
    }
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-vendas-${per}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="app">
      <Sidebar active="relat" />
      <div className="main">
        <Topbar title="Relatórios" crumbs={<React.Fragment>Home &rsaquo; <b>Relatórios</b></React.Fragment>} />
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
              <button className="btn-ghost" onClick={exportarPdf} disabled={pdfBusy}><I d={ICONS.doc} size={13} /> {pdfBusy ? "Exportando…" : "Exportar PDF"}</button>
              <button className="btn-teal" onClick={exportarCsv} disabled={!report?.metrics}><I d={ICONS.doc} size={13} /> Exportar CSV</button>
            </div>
          </div>

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
                <div className="meta"><span className="link">Ver detalhes</span></div>
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
                    {sellers.map(v => (
                      <tr key={v.id} style={{ cursor: "default" }}>
                        <td><div style={{ display: "flex", gap: 9, alignItems: "center" }}><Av name={v.name} size={26} /><strong>{v.name}</strong></div></td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.receivedCards}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.workedCards}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{v.metrics.closedCards}</td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ height: 7, borderRadius: 999, background: "var(--hbx-surface-raised)" }}>
                            <div style={{ width: `${Math.min(100, Math.round((v.metrics.workRate || 0) * 100))}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--hbx-brand), var(--hbx-brand-strong))" }}></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
