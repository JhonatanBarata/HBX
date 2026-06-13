"use client";

// Tela Webscraping (template docs/TEMAS/*/corporate/Webscraping.html) ligada
// no motor Radar real:
//   - Executar coleta → POST /webscraping/radar/search-runs (+ polling)
//   - Tabela/paginação → GET /webscraping/radar/leads
//   - Contexto → GET /webscraping/radar/leads/:id
//   - Adicionar ao CRM → POST /webscraping/radar/leads/:id/send-to-vendas
// Adaptações registradas no doc do PR: selects visuais viraram controles
// reais nos filtros ligados; "Tamanho da empresa" segue visual (sem filtro
// no backend); campos sem dado no Radar mostram "—".
// Resultado negativo do Radar nunca é descartado (MOTOR.md).

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS, Sidebar, Topbar } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type RadarLead = {
  id: string;
  name: string;
  phone: string;
  ddd: string;
  address: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  website: string | null;
  email: string | null;
  emailStatus: string;
  businessCategory: string | null;
  opportunityScore: number;
  status: string;
  source: string | null;
  sourceEngine: string | null;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
  recommendedChannel: string | null;
  whatsappStatus?: string;
};

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: {
    available?: boolean;
    message?: string;
    page?: number;
    limit?: number;
    availableFilters?: {
      states?: { value: string; label: string; count: number }[];
      segments?: { value: string; label: string; count: number }[];
      citiesByState?: Record<string, { value: string; label: string; count: number }[]>;
    };
    enrichmentSummary?: {
      cardsAnalyzed: number;
      whatsappVerified: number;
      emailConfirmedOrProbable: number;
      noWebsite: number;
      highPriority: number;
      discardedOrBlocked: number;
      readyToCall: number;
    };
  };
};

type RunResponse = {
  id?: string;
  runId?: string;
  status?: string;
  message?: string;
  foundCount?: number;
  errorMessage?: string | null;
  meta?: { progress?: number; terminal?: boolean; operationalMessage?: string };
} | null;

type RadarLeadEvent = { id: string; eventType: string; note: string | null; statusFrom?: string | null; statusTo?: string | null; createdAt: string | null };
type LeadDetail = { item: RadarLead; events?: RadarLeadEvent[] } | null;

const ST_LABEL: Record<string, string> = {
  available: "Novo",
  in_attendance: "Em atendimento",
  sent_to_vendas: "Enviado a Vendas",
  imported: "No CRM",
  negative: "Negativado",
  discarded: "Descartado",
};

const ST_CLS: Record<string, string> = {
  available: "tag",
  in_attendance: "tag teal",
  sent_to_vendas: "tag teal",
  imported: "tag teal",
  negative: "tag warn",
  discarded: "tag warn",
};

// Histórico da empresa: o endpoint /webscraping/radar/leads/:id já devolve
// `events` (criação, importação, negativação, contato…); aqui só humanizamos.
const RADAR_EVENT_LABEL: Record<string, string> = {
  created: "Card descoberto",
  imported: "Importado ao CRM",
  sent_to_vendas: "Enviado a Vendas",
  distributed: "Distribuído ao vendedor",
  enriched: "Enriquecido pelo motor",
  radar_enrichment_imported: "Enriquecido pelo Radar",
  contacted: "Contato realizado",
  denied: "Negativado",
  complaint: "Reclamação",
  no_answer: "Sem resposta",
  hidden: "Ocultado da base",
  reused: "Card reaproveitado",
  origin_registered: "Origem registrada",
};

function radarEventLabel(t?: string) {
  const key = String(t || "").toLowerCase();
  return RADAR_EVENT_LABEL[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Evento";
}

const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "error"]);

function statusLabel(status: string) {
  return ST_LABEL[status] || status || "—";
}

function statusCls(status: string) {
  return ST_CLS[status] || "tag";
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR") + ", " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WebscrapingClient() {
  const router = useRouter();

  // filtros
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [filterKey, setFilterKey] = useState("");
  const [appliedFilterKey, setAppliedFilterKey] = useState("");

  // tabela
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // contexto
  const [sel, setSel] = useState<RadarLead | null>(null);
  const [detail, setDetail] = useState<LeadDetail>(null);
  const [crmMsg, setCrmMsg] = useState<string | null>(null);
  const [crmBusy, setCrmBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // coleta
  const [run, setRun] = useState<RunResponse>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLeads = useCallback((opts?: { page?: number }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    // 8 linhas/página por padrão (pedido do dono, 11/06/2026: a tela inteira
    // cabe sem rolagem); agora ajustável pelo seletor "Linhas por página".
    params.set("limit", String(pageSize));
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (uf) params.set("state", uf);
    if (appliedFilterKey) params.set("filterKey", appliedFilterKey);
    return apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`)
      .then(res => {
        setData(res);
        setLoadError(null);
        const first = res?.items?.[0] || null;
        setSel(prev => (prev && res?.items?.some(i => i.id === prev.id) ? prev : first));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar a base do Radar.");
        setData(null);
        setSel(null);
      });
  }, [segment, city, uf, appliedFilterKey, pageSize]);

  // carga inicial + retoma coleta ativa
  useEffect(() => {
    loadLeads({ page: 1 });
    apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
      .then(res => { if (res && (res.id || res.runId)) setRun(res); })
      .catch(() => { /* sem coleta ativa */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trocar Segmento/Cidade/Estado, a busca aplicada ou o tamanho da página
  // RECARREGA a base. Antes só "Buscar empresa" e a paginação disparavam o
  // reload — escolher um segmento no datalist não fazia nada. Debounce de 300ms
  // evita uma consulta por tecla; o 1º render é pulado (a carga inicial já roda
  // no efeito acima).
  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) { filtersTouched.current = true; return; }
    const handle = setTimeout(() => { setPage(1); loadLeads({ page: 1 }); }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, city, uf, appliedFilterKey, pageSize]);

  // contexto do lead selecionado (detalhe só é exibido se o id ainda bate)
  useEffect(() => {
    if (!sel?.id) return;
    let alive = true;
    apiFetch<LeadDetail>(`/webscraping/radar/leads/${encodeURIComponent(sel.id)}`)
      .then(res => { if (alive) setDetail(res); })
      .catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [sel?.id]);

  function selecionar(row: RadarLead) {
    setSel(row);
    setCrmMsg(null);
  }

  // polling da coleta ativa
  useEffect(() => {
    const runId = run?.id || run?.runId;
    const status = String(run?.status || "");
    if (!runId || TERMINAL_RUN.has(status)) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
        setRun(res);
        const st = String(res?.status || "");
        if (TERMINAL_RUN.has(st) || res?.meta?.terminal) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          loadLeads({ page: 1 });
          setPage(1);
        }
      } catch {
        // mantém o último estado conhecido; próxima volta tenta de novo
      }
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [run, loadLeads]);

  async function executarColeta() {
    if (runBusy) return;
    setRunBusy(true);
    setRunMsg(null);
    try {
      const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        body: JSON.stringify({ city, state: uf || undefined, segment }),
      });
      setRun(res);
      if (res?.message) setRunMsg(res.message);
    } catch (err) {
      setRunMsg(err instanceof Error ? err.message : "Não foi possível iniciar a coleta.");
    } finally {
      setRunBusy(false);
    }
  }

  const [exportBusy, setExportBusy] = useState(false);

  // Exporta a BASE atual (leitura pura, até 2000 linhas) em CSV — não usa
  // POST /webscraping/export porque aquele endpoint dispara uma busca nova
  // (gasta quota do motor); ver doc do PR.
  async function exportarCsv() {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "2000");
      if (segment) params.set("segment", segment);
      if (city) params.set("city", city);
      if (uf) params.set("state", uf);
      if (appliedFilterKey) params.set("filterKey", appliedFilterKey);
      const res = await apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`);
      const rows = res?.items || [];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Nome", "Segmento", "Cidade", "UF", "Telefone", "E-mail", "Site", "Score", "Status", "Canal recomendado"];
      const csv = [
        header.join(";"),
        ...rows.map(r => [r.name, r.segment, r.city, r.state, r.phone, r.email, r.website, r.opportunityScore, statusLabel(r.status), r.recommendedChannel].map(esc).join(";")),
      ].join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "radar-base.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // sem dados/erro de rede — botão volta ao normal
    } finally {
      setExportBusy(false);
    }
  }

  function aplicarBusca() {
    // Aplica o termo digitado; o efeito de filtros recarrega a base.
    setAppliedFilterKey(filterKey);
  }

  function limparFiltros() {
    setSegment("");
    setCity("");
    setUf("");
    setFilterKey("");
    setAppliedFilterKey("");
    // o efeito de filtros recarrega a base quando algum filtro de fato mudou.
  }

  function irParaPagina(p: number) {
    if (p < 1) return;
    setPage(p);
    loadLeads({ page: p });
  }

  async function adicionarAoCrm() {
    if (!sel?.id || crmBusy) return;
    setCrmBusy(true);
    setCrmMsg(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(sel.id)}/send-to-vendas`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCrmMsg("✓ Card enviado para Vendas.");
      loadLeads({ page });
    } catch (err) {
      setCrmMsg(err instanceof Error ? err.message : "Não foi possível enviar para Vendas.");
    } finally {
      setCrmBusy(false);
    }
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const limit = data?.meta?.limit || pageSize;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const summary = data?.meta?.enrichmentSummary;
  const filters = data?.meta?.availableFilters;
  const segOptions = filters?.segments || [];
  const ufOptions = filters?.states || [];
  const cityOptions = uf && filters?.citiesByState?.[uf]
    ? filters.citiesByState[uf]
    : Object.values(filters?.citiesByState || {}).flat();

  const runActive = Boolean((run?.id || run?.runId) && !TERMINAL_RUN.has(String(run?.status || "")));
  const runProgress = run?.meta?.progress;
  const pctEmail = summary && summary.cardsAnalyzed > 0
    ? Math.round((summary.emailConfirmedOrProbable / summary.cardsAnalyzed) * 1000) / 10
    : null;
  const pctEnriquecimento = summary && summary.cardsAnalyzed > 0
    ? Math.round((summary.readyToCall / summary.cardsAnalyzed) * 1000) / 10
    : null;

  const d = detail?.item && detail.item.id === sel?.id ? detail.item : sel;
  const histEvents = detail?.item && detail.item.id === sel?.id ? (detail.events || []) : [];

  return (
    <div className="app">
      <Sidebar active="scrape" />
      <div className="main">
        <Topbar title="Radar" crumbs={<React.Fragment>Home &rsaquo; <b>Radar</b></React.Fragment>} />
        <div className="content">
          <div className="work">
            <section className="panel">
              <div className="filters">
                <div className="f">
                  <label>Segmento</label>
                  <input className="field-dark" list="segmentos" placeholder="Todos os segmentos" style={{ minWidth: 150 }}
                    value={segment} onChange={e => setSegment(e.target.value)} />
                  <datalist id="segmentos">
                    {segOptions.map(o => <option key={o.value} value={o.value}>{`${o.label} (${o.count})`}</option>)}
                  </datalist>
                </div>
                <div className="f">
                  <label>Cidade</label>
                  <input className="field-dark" list="cidades" placeholder="Todas as cidades" style={{ minWidth: 150 }}
                    value={city} onChange={e => setCity(e.target.value)} />
                  <datalist id="cidades">
                    {cityOptions.map(o => <option key={o.value} value={o.value}>{`${o.label} (${o.count})`}</option>)}
                  </datalist>
                </div>
                <div className="f">
                  <label>Estado</label>
                  <select className="select-dark" value={uf} onChange={e => setUf(e.target.value)}>
                    <option value="">Todos os estados</option>
                    {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="f" style={{ flex: 1, minWidth: 180 }}>
                  <label>Buscar empresa ou domínio</label>
                  <input className="field-dark" placeholder="Ex.: hbx.com.br" value={filterKey}
                    onChange={e => setFilterKey(e.target.value)} onKeyDown={e => e.key === "Enter" && aplicarBusca()} onBlur={aplicarBusca} />
                </div>
                <button className="btn-teal" style={{ minHeight: 38 }} onClick={executarColeta} disabled={runBusy || runActive}>
                  {runActive ? "Coletando…" : runBusy ? "Iniciando…" : "▶ Executar coleta"}
                </button>
              </div>
              {(runMsg || run?.errorMessage) && (
                <div style={{ padding: "0 16px 12px", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  {runMsg || run?.errorMessage}
                </div>
              )}
            </section>

            <section className="panel stats-strip">
              <div className="cell">
                <span className="lbl">{runActive ? "Coleta em andamento" : "Última coleta"}</span>
                <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>
                  {runActive
                    ? `${run?.foundCount ?? 0} encontrados${runProgress != null ? ` · ${runProgress}%` : ""}`
                    : run ? statusRunLabel(String(run?.status || "")) : "—"}
                </span>
                {runActive
                  ? <span className="tag warn" style={{ marginTop: 2 }}>● Em execução</span>
                  : run && TERMINAL_RUN.has(String(run?.status || ""))
                    ? <span className="tag teal" style={{ marginTop: 2 }}>✓ Concluída</span>
                    : <span className="tag" style={{ marginTop: 2 }}>Sem coleta ativa</span>}
              </div>
              <div className="cell"><span className="lbl">Leads na base</span><span className="big">{total.toLocaleString("pt-BR")}</span><span className="d"><small>resultado dos filtros atuais</small></span></div>
              <div className="cell"><span className="lbl">E-mails validados</span><span className="big">{summary ? summary.emailConfirmedOrProbable.toLocaleString("pt-BR") : "—"}</span><span className="d"><small>{pctEmail != null ? `${String(pctEmail).replace(".", ",")}% do total` : ""}</small></span></div>
              <div className="cell"><span className="lbl">WhatsApp verificados</span><span className="big">{summary ? summary.whatsappVerified.toLocaleString("pt-BR") : "—"}</span><span className="d"><small>confirmados pelo motor</small></span></div>
              <div className="cell"><span className="lbl">Taxa de enriquecimento</span><span className="big">{pctEnriquecimento != null ? `${String(pctEnriquecimento).replace(".", ",")}%` : "—"}</span><span className="d"><small>prontos para contato</small></span></div>
              <div className="cell" style={{ minWidth: 170 }}>
                <span className="lbl">Fonte de pesquisa</span>
                <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>Radar HBX</span>
                <span className="lbl" style={{ fontFamily: "var(--font-mono)" }}>{fmtDateTime(items[0]?.lastSeenAt)}</span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>{total.toLocaleString("pt-BR")} resultados encontrados</h2>
                <div className="meta">
                  <button className="btn-ghost" onClick={exportarCsv} disabled={exportBusy}><I d={ICONS.doc} size={13} /> {exportBusy ? "Exportando…" : "Exportar ▾"}</button>
                  <button className="icon-ghost" onClick={limparFiltros} title="Limpar filtros" aria-label="Limpar filtros"><I d={ICONS.filter} size={15} /></button>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th aria-hidden="true"></th>
                      <th>Empresa</th><th>Segmento</th><th>Cidade</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Site</th><th>Score</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr style={{ cursor: "default" }}>
                        <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)", padding: "26px 12px" }}>
                          {loadError
                            ? loadError
                            : data?.meta?.available === false
                              ? data?.meta?.message || "Banco do Radar indisponível neste ambiente."
                              : "Nenhum resultado para os filtros atuais — execute uma coleta."}
                        </td>
                      </tr>
                    )}
                    {items.map((row) => (
                      <tr key={row.id} className={sel?.id === row.id ? "sel" : ""} onClick={() => selecionar(row)}>
                        <td><input type="checkbox" checked={sel?.id === row.id} readOnly style={{ accentColor: "var(--hbx-brand)" }} /></td>
                        <td><div className="co"><strong>{row.name || "—"}</strong><span className={statusCls(row.status)} style={{ fontSize: "0.56rem", padding: "1px 8px" }}>{statusLabel(row.status)}</span></div></td>
                        <td>{row.segment || "—"}</td>
                        <td>{row.city ? `${row.city}${row.state ? ", " + row.state : ""}` : "—"}</td>
                        <td><div className="co"><strong style={{ fontWeight: 600 }}>{row.businessCategory || "—"}</strong><span className="sub2">{row.recommendedChannel ? `canal: ${row.recommendedChannel}` : ""}</span></div></td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{row.phone || "—"}</td>
                        <td>{row.email || "—"} {row.email && row.emailStatus === "confirmed" ? <span style={{ color: "var(--hbx-brand-strong)" }}>✓</span> : row.email && row.emailStatus === "probable" ? <span style={{ color: "var(--hbx-warning)" }}>⚠</span> : null}</td>
                        <td>{row.website
                          ? <a href={row.website.startsWith("http") ? row.website : `https://${row.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{row.website.replace(/^https?:\/\//, "")} ↗</a>
                          : "—"}</td>
                        <td><span className={"score-ring " + (row.opportunityScore >= 75 ? "hi" : "mid")}>{row.opportunityScore}</span></td>
                        <td><span className={statusCls(row.status)}>{statusLabel(row.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                Linhas por página: <select className="select-dark" style={{ minWidth: 0, minHeight: 30, padding: "0 10px" }} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                  {[8, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ marginLeft: "auto" }}>
                  {total > 0
                    ? `${((page - 1) * limit + 1).toLocaleString("pt-BR")}–${Math.min(page * limit, total).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`
                    : "0 de 0"}
                </span>
                <button className="pg" onClick={() => irParaPagina(page - 1)} disabled={page <= 1}>‹</button>
                {[page - 1, page, page + 1].filter(p => p >= 1 && p <= lastPage).map(p => (
                  <button key={p} className={"pg" + (p === page ? " on" : "")} onClick={() => irParaPagina(p)}>{p}</button>
                ))}
                {page + 1 < lastPage && <span>…</span>}
                {page + 1 < lastPage && <button className="pg" onClick={() => irParaPagina(lastPage)}>{lastPage}</button>}
                <button className="pg" onClick={() => irParaPagina(page + 1)} disabled={page >= lastPage}>›</button>
              </div>
            </section>
          </div>

          <aside className="ctx">
            <h3>{d?.name || "Selecione um resultado"} <span className="x" role="button" tabIndex={0} title="Fechar" onClick={() => { setSel(null); setDetail(null); setShowHistory(false); }}>✕</span></h3>
            <div>
              <h3 style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8 }}>Sobre a empresa</h3>
              <div className="kv">
                <div className="row"><span className="k">Segmento</span><span className="v">{d?.segment || "—"}</span></div>
                <div className="row"><span className="k">Categoria</span><span className="v">{d?.businessCategory || "—"}</span></div>
                <div className="row"><span className="k">Endereço</span><span className="v" style={{ fontSize: "0.68rem" }}>{d?.address || "—"}</span></div>
                <div className="row"><span className="k">Cidade / UF</span><span className="v">{d?.city ? `${d.city}${d.state ? ", " + d.state : ""}` : "—"}</span></div>
                <div className="row"><span className="k">Site</span><span className="v">{d?.website
                  ? <a href={d.website.startsWith("http") ? d.website : `https://${d.website}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--hbx-info)" }}>{d.website.replace(/^https?:\/\//, "")} ↗</a>
                  : "—"}</span></div>
              </div>
            </div>
            <div className="sep"></div>
            <div>
              <h3 style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8 }}>Contato</h3>
              <div className="kv" style={{ marginTop: 10 }}>
                <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.mail} size={13} /> E-mail</span><span className="v" style={{ fontWeight: 600, fontSize: "0.68rem" }}>{d?.email || "—"} {d?.email && d?.emailStatus === "confirmed" ? <span style={{ color: "var(--hbx-brand-strong)" }}>✓</span> : null}</span></div>
                <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.phone} size={13} /> Telefone</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{d?.phone || "—"}</span></div>
                <div className="row"><span className="k">Canal recomendado</span><span className="v">{d?.recommendedChannel || "—"}</span></div>
              </div>
            </div>
            <div className="sep"></div>
            <div>
              <h3 style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8 }}>Origem dos dados</h3>
              <div className="kv">
                <div className="row"><span className="k">Fonte</span><span className="v">{d?.sourceEngine || d?.source || "—"}</span></div>
                <div className="row"><span className="k">Coleta em</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{fmtDateTime(d?.lastSeenAt || d?.firstSeenAt)}</span></div>
                <div className="row"><span className="k">Palavra-chave</span><span className="v">{d?.segment || "—"}</span></div>
                <div className="row"><span className="k">Localização</span><span className="v">{d?.city ? `${d.city}, Brasil` : "—"}</span></div>
              </div>
            </div>
            <div className="sep"></div>
            <div style={{ display: "grid", gap: 8 }}>
              <h3>Ações</h3>
              {crmMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: crmMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{crmMsg}</div>
              )}
              <button className="btn-teal" onClick={adicionarAoCrm} disabled={!sel?.id || crmBusy}>
                <I d={ICONS.plus} size={14} /> {crmBusy ? "Enviando…" : "Adicionar ao CRM"}
              </button>
              <button className="btn-ghost" onClick={() => router.push("/vendas")} disabled={!sel?.id}><I d={ICONS.send} size={13} /> Criar abordagem</button>
              <button className="btn-ghost" onClick={() => setShowHistory(v => !v)} disabled={!sel?.id}><I d={ICONS.clock} size={13} /> {showHistory ? "Ocultar histórico" : "Ver histórico da empresa"}</button>
            </div>
            {showHistory && (
              <React.Fragment>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 8 }}>
                  <h3>Histórico da empresa</h3>
                  <div className="kv">
                    {histEvents.length === 0 ? (
                      <div className="row"><span className="k">Sem eventos registrados para este card.</span></div>
                    ) : histEvents.map(ev => (
                      <div className="row" key={ev.id}>
                        <span className="k">{radarEventLabel(ev.eventType)}{ev.note ? ` · ${ev.note}` : ""}</span>
                        <span className="v">{fmtDateTime(ev.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function statusRunLabel(status: string) {
  const map: Record<string, string> = {
    completed: "Concluída",
    completed_insufficient_results: "Concluída (resultados insuficientes)",
    canceled: "Cancelada",
    failed: "Falhou",
    error: "Erro",
    queued: "Na fila",
    running: "Em execução",
    sleeping: "Pausada",
    paused: "Pausada",
  };
  return map[status] || status || "—";
}
