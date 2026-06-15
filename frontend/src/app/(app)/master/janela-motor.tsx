"use client";

// Janela 3 — Motor Radar master.
// Contratos ligados (MasterWebscrapingController, modules/master/webscraping):
//   GET    /database-audit            → resumo, motores, fábrica, diagnósticos
//   GET    /database-cards            → cards do banco (filtros city/segment/status/companyId/page/limit)
//   DELETE /database-cards/batch      → exclusão definitiva {leadIds}
//   GET    /enrichment-cost/summary   → custo por empresa (companyId obrigatório)
//   POST   /engines/:id/pause|resume|drain|stop → controles por motor (fase 2)
//   POST   /elastic/force-night | /elastic/cancel-forced → turbo forçado (fase 2)
//   GET    /export-targets + POST /export-cards {leadIds, companyId|userId}
//          → exportar cards selecionados para uma empresa/vendedor (fase 2)
// Fase 2 completa por ordem do dono (12/06/2026: "ligue tudo").

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useTabIndex } from "@/lib/use-tab-param";

import { fmtDataHora, type MasterCompany } from "./page.client";

type Audit = {
  generatedAt?: string;
  summary?: Record<string, number>;
  engines?: {
    id: string;
    status?: string | null;
    lastHealthStatus?: string | null;
    lastError?: string | null;
    manualPaused?: boolean;
    cardsLast10Min?: number;
    cardsToday?: number;
    duplicatesToday?: number;
    rejectedToday?: number;
    currentMeaning?: string | null;
  }[];
  factory?: {
    enabled?: boolean;
    status?: string | null;
    currentCity?: string | null;
    currentSegment?: string | null;
    lastError?: string | null;
    reasonStopped?: string | null;
    nextRunAt?: string | null;
    lastWorkedAt?: string | null;
  };
  clientProtection?: { message?: string | null; reservedEngines?: number };
  diagnostics?: string[];
} | null;

type DbCard = {
  id: string;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  status?: string | null;
  opportunityScore?: number | null;
  createdAt?: string | null;
};

type DbCards = {
  items?: DbCard[];
  total?: number;
  meta?: { available?: boolean; message?: string | null };
} | null;

type Custo = {
  ledgerCount?: number;
  paidLedgerCount?: number;
  cacheHitCount?: number;
  estimatedCostBrl?: number;
  estimatedCostUsd?: number;
  budgetUsageRatio?: number;
  status?: string;
  byProvider?: Record<string, { count: number; paidCount: number; cacheHitCount: number; estimatedCostBrl: number }>;
} | null;

const SUBTABS = ["Auditoria", "Cards no banco", "Custo de enriquecimento", "Distribuição", "Campanhas"];

// fase 3: painel de distribuição automática por tenant (empresa operacional
// do MASTER) — GET/PUT/run modules/master/webscraping/radar-auto-distribution
type DistSeller = {
  id?: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  cities?: { city?: string; state?: string; availableCards?: number }[];
  availableCards?: number;
  currentStock?: number;
  deliveredToday?: number;
  sellerDailyLimit?: number;
  isMapped?: boolean;
};

type DistPanel = {
  ok?: boolean;
  rule?: { status?: string; targetStockPerSeller?: number; dailyLimitPerSeller?: number } | null;
  sellers?: DistSeller[];
} | null;

// fase 3: mass-data control — GET/POST modules/master/webscraping/mass-data
type MassData = {
  generatedAt?: string;
  turbo?: { active?: boolean; endsAt?: string | null; startLabel?: string; endLabel?: string };
  summary?: Record<string, number>;
  autonomousStrategy?: { mode?: string; selectedState?: string | null; selectedCity?: string | null; selectedSegment?: string | null; reason?: string };
  production?: { id: string; name?: string; city?: string | null; state?: string | null; source?: string | null; dbStatus?: string; createdAt?: string }[];
  diagnostics?: { queueStatus?: string; databaseStatus?: string; engineHealthStatus?: string; messages?: string[] };
  status?: { operationalMessage?: string; currentMode?: string; critical?: boolean };
} | null;

function fmtBRL(v?: number | null) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function JanelaMotor({ companies }: { companies: MasterCompany[] | null }) {
  const [sub, setSub] = useTabIndex("motor", 0);

  // auditoria
  const [audit, setAudit] = useState<Audit>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);

  // cards no banco
  const [filtro, setFiltro] = useState({ companyId: "", city: "", segment: "", status: "" });
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<DbCards>(null);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [delArm, setDelArm] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  // custo
  const [custoCompanyId, setCustoCompanyId] = useState("");
  const [custoDias, setCustoDias] = useState("30");
  const [custo, setCusto] = useState<Custo>(null);
  const [custoError, setCustoError] = useState<string | null>(null);

  // controles por motor + turbo forçado (fase 2)
  const [engBusy, setEngBusy] = useState<string | null>(null); // `${id}:${acao}`
  const [engMsg, setEngMsg] = useState<string | null>(null);

  // exportar cards selecionados (fase 2)
  type ExportTarget = { id: number; name?: string | null; username?: string | null; email?: string | null; companyId?: number | null; company?: { id?: number; name?: string | null } | null };
  const [exportTargets, setExportTargets] = useState<ExportTarget[] | null>(null);
  const [exportUserId, setExportUserId] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  // fetchs puros (sem setState síncrono) — chamáveis de effect; os botões
  // usam os wrappers atualizar*/buscarCards, que controlam o busy
  const carregarAudit = useCallback(() => {
    return apiFetch<Audit>("/modules/master/webscraping/database-audit")
      .then(res => { setAudit(res); setAuditError(null); })
      .catch((err: unknown) => setAuditError(err instanceof Error ? err.message : "Falha ao carregar a auditoria."));
  }, []);

  useEffect(() => { carregarAudit(); }, [carregarAudit]);

  function atualizarAudit() {
    setAuditBusy(true);
    carregarAudit().finally(() => setAuditBusy(false));
  }

  const carregarCards = useCallback((p: number) => {
    const q = new URLSearchParams();
    q.set("page", String(p));
    q.set("limit", "50");
    if (filtro.companyId) q.set("companyId", filtro.companyId);
    if (filtro.city.trim()) q.set("city", filtro.city.trim());
    if (filtro.segment.trim()) q.set("segment", filtro.segment.trim());
    if (filtro.status.trim()) q.set("status", filtro.status.trim());
    return apiFetch<DbCards>(`/modules/master/webscraping/database-cards?${q.toString()}`)
      .then(res => { setCards(res); setCardsError(null); setSel({}); setDelArm(false); })
      .catch((err: unknown) => setCardsError(err instanceof Error ? err.message : "Falha ao listar os cards."));
  }, [filtro]);

  useEffect(() => {
    if (sub === 1 && cards === null) carregarCards(1);
  }, [sub, cards, carregarCards]);

  function buscarCards(p: number) {
    setCardsBusy(true);
    setDelMsg(null);
    carregarCards(p).finally(() => setCardsBusy(false));
  }

  // POST engines/:id/{pause|resume|drain|stop} — o backend devolve o mass
  // data control; aqui recarregamos a auditoria para refletir o estado
  async function acaoMotor(id: string, acao: "pause" | "resume" | "drain" | "stop") {
    const chave = `${id}:${acao}`;
    if (engBusy) return;
    setEngBusy(chave);
    setEngMsg(null);
    try {
      const body = acao === "pause" ? { minutes: 30 } : acao === "drain" ? { seconds: 60 } : {};
      await apiFetch(`/modules/master/webscraping/engines/${encodeURIComponent(id)}/${acao}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEngMsg(`✓ ${id}: ${acao === "pause" ? "pausado por 30 min" : acao === "resume" ? "retomado" : acao === "drain" ? "drenando (60s)" : "parado"}.`);
      await carregarAudit();
    } catch (err) {
      setEngMsg(err instanceof Error ? err.message : `Falha em ${acao}.`);
    } finally {
      setEngBusy(null);
    }
  }

  async function turboForcado(ligar: boolean) {
    if (engBusy) return;
    setEngBusy(ligar ? "turbo:on" : "turbo:off");
    setEngMsg(null);
    try {
      await apiFetch(`/modules/master/webscraping/elastic/${ligar ? "force-night" : "cancel-forced"}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setEngMsg(ligar ? "✓ Fábrica noturna forçada agora." : "✓ Forçada cancelada — volta à janela normal.");
      await carregarAudit();
    } catch (err) {
      setEngMsg(err instanceof Error ? err.message : "Falha no turbo.");
    } finally {
      setEngBusy(null);
    }
  }

  function carregarExportTargets() {
    if (exportTargets !== null) return;
    apiFetch<{ targets?: unknown[] } | unknown[]>("/modules/master/webscraping/export-targets")
      .then(res => {
        const lista = Array.isArray(res) ? res : Array.isArray((res as { targets?: unknown[] })?.targets) ? (res as { targets: ExportTarget[] }).targets : [];
        setExportTargets(lista as ExportTarget[]);
      })
      .catch(() => setExportTargets([]));
  }

  async function exportarSelecionados() {
    const leadIds = Object.keys(sel).filter(id => sel[id]);
    if (!leadIds.length || !exportUserId || exportBusy) return;
    setExportBusy(true);
    setDelMsg(null);
    try {
      const alvo = (exportTargets || []).find(t => String(t.id) === exportUserId);
      await apiFetch("/modules/master/webscraping/export-cards", {
        method: "POST",
        body: JSON.stringify({
          leadIds,
          userId: Number(exportUserId),
          ...(alvo?.companyId ? { companyId: Number(alvo.companyId) } : {}),
        }),
      });
      setDelMsg(`✓ ${leadIds.length} card(s) exportado(s) para ${alvo?.name || alvo?.email || `usuário ${exportUserId}`}.`);
      carregarCards(page);
    } catch (err) {
      setDelMsg(err instanceof Error ? err.message : "Falha ao exportar os cards.");
    } finally {
      setExportBusy(false);
    }
  }

  async function excluirSelecionados() {
    const leadIds = Object.keys(sel).filter(id => sel[id]);
    if (!leadIds.length || delBusy) return;
    setDelBusy(true);
    setDelMsg(null);
    try {
      await apiFetch("/modules/master/webscraping/database-cards/batch", {
        method: "DELETE",
        body: JSON.stringify({ leadIds }),
      });
      setDelMsg(`✓ ${leadIds.length} card(s) excluído(s) do banco.`);
      carregarCards(page);
    } catch (err) {
      setDelMsg(err instanceof Error ? err.message : "Falha ao excluir os cards.");
    } finally {
      setDelBusy(false);
      setDelArm(false);
    }
  }

  // Distribuição (fase 3)
  const [dist, setDist] = useState<DistPanel>(null);
  const [distError, setDistError] = useState<string | null>(null);
  const [distForm, setDistForm] = useState({ status: "", targetStock: "", dailyLimit: "" });
  const [distBusy, setDistBusy] = useState(false);
  const [distMsg, setDistMsg] = useState<string | null>(null);

  const carregarDist = useCallback(() => {
    return apiFetch<DistPanel>("/modules/master/webscraping/radar-auto-distribution")
      .then(res => {
        setDist(res);
        setDistError(null);
        setDistForm({
          status: String(res?.rule?.status || "draft"),
          targetStock: res?.rule?.targetStockPerSeller != null ? String(res.rule.targetStockPerSeller) : "",
          dailyLimit: res?.rule?.dailyLimitPerSeller != null ? String(res.rule.dailyLimitPerSeller) : "",
        });
      })
      .catch((err: unknown) => {
        setDist({ sellers: [] });
        setDistError(err instanceof Error ? err.message : "Painel de distribuição indisponível.");
      });
  }, []);

  useEffect(() => { if (sub === 3 && dist === null) carregarDist(); }, [sub, dist, carregarDist]);

  async function salvarDist() {
    if (distBusy) return;
    setDistBusy(true);
    setDistMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (distForm.status) body.status = distForm.status;
      if (distForm.targetStock !== "") body.targetStockPerSeller = Math.max(1, Number(distForm.targetStock) || 1);
      if (distForm.dailyLimit !== "") body.dailyLimitPerSeller = Math.max(0, Number(distForm.dailyLimit) || 0);
      await apiFetch("/modules/master/webscraping/radar-auto-distribution", { method: "PUT", body: JSON.stringify(body) });
      setDistMsg("✓ Regra de distribuição salva.");
      await carregarDist();
    } catch (err) {
      setDistMsg(err instanceof Error ? err.message : "Falha ao salvar a regra.");
    } finally {
      setDistBusy(false);
    }
  }

  // edição visual de territórios (cidades por vendedor) — o PUT recebe o
  // array COMPLETO de territories; mandamos todos para não apagar os demais
  const [terrEdit, setTerrEdit] = useState<{ userId: number; nome: string; cities: { city: string; state: string }[] } | null>(null);
  const [terrBusy, setTerrBusy] = useState(false);
  const [terrMsg, setTerrMsg] = useState<string | null>(null);

  function abrirTerritorios(s: DistSeller) {
    setTerrMsg(null);
    setTerrEdit({
      userId: Number(s.id || 0),
      nome: s.name || s.username || s.email || `#${s.id}`,
      cities: (s.cities || []).map(c => ({ city: String(c.city || ""), state: String(c.state || "") })),
    });
  }

  async function salvarTerritorios(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (terrBusy || !terrEdit) return;
    setTerrBusy(true);
    setTerrMsg(null);
    try {
      const territories = (dist?.sellers || []).map(s => {
        const userId = Number(s.id || 0);
        const cities = userId === terrEdit.userId
          ? terrEdit.cities.filter(c => c.city.trim()).map(c => ({ city: c.city.trim(), state: c.state.trim().toUpperCase() }))
          : (s.cities || []).map(c => ({ city: String(c.city || ""), state: String(c.state || "") })).filter(c => c.city);
        return { userId, cities };
      });
      await apiFetch("/modules/master/webscraping/radar-auto-distribution", {
        method: "PUT",
        body: JSON.stringify({ territories }),
      });
      setTerrEdit(null);
      setDistMsg(`✓ Territórios de ${terrEdit.nome} salvos.`);
      await carregarDist();
    } catch (err) {
      setTerrMsg(err instanceof Error ? err.message : "Falha ao salvar os territórios.");
    } finally {
      setTerrBusy(false);
    }
  }

  async function rodarDist() {
    if (distBusy) return;
    setDistBusy(true);
    setDistMsg(null);
    try {
      await apiFetch("/modules/master/webscraping/radar-auto-distribution/run", { method: "POST", body: JSON.stringify({}) });
      setDistMsg("✓ Distribuição disparada.");
      await carregarDist();
    } catch (err) {
      setDistMsg(err instanceof Error ? err.message : "Falha ao rodar a distribuição.");
    } finally {
      setDistBusy(false);
    }
  }

  // Campanhas / mass-data (fase 3)
  const [mass, setMass] = useState<MassData>(null);
  const [massError, setMassError] = useState<string | null>(null);
  const [campForm, setCampForm] = useState({ state: "", city: "", segment: "", targetType: "pj", targetTotal: "" });
  const [campBusy, setCampBusy] = useState(false);
  const [campMsg, setCampMsg] = useState<string | null>(null);
  const [campId, setCampId] = useState<string | null>(null);

  const carregarMass = useCallback(() => {
    return apiFetch<MassData>("/modules/master/webscraping/mass-data")
      .then(res => { setMass(res); setMassError(null); })
      .catch((err: unknown) => {
        setMass({});
        setMassError(err instanceof Error ? err.message : "Mass-data indisponível.");
      });
  }, []);

  useEffect(() => { if (sub === 4 && mass === null) carregarMass(); }, [sub, mass, carregarMass]);

  async function criarCampanha(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (campBusy) return;
    setCampBusy(true);
    setCampMsg(null);
    try {
      const res = await apiFetch<{ id?: string; campaignId?: string; ok?: boolean; message?: string }>(
        "/modules/master/webscraping/mass-data",
        {
          method: "POST",
          body: JSON.stringify({
            state: campForm.state.trim().toUpperCase(),
            ...(campForm.city.trim() ? { city: campForm.city.trim() } : {}),
            ...(campForm.segment.trim() ? { segment: campForm.segment.trim() } : {}),
            targetType: campForm.targetType,
            ...(campForm.targetTotal !== "" ? { targetTotal: Math.max(0, Number(campForm.targetTotal) || 0) } : {}),
          }),
        },
      );
      const novoId = String(res?.campaignId || res?.id || "");
      setCampId(novoId || null);
      setCampMsg(`✓ Campanha criada${novoId ? ` (${novoId})` : ""}. ${res?.message || ""}`.trim());
      await carregarMass();
    } catch (err) {
      setCampMsg(err instanceof Error ? err.message : "Falha ao criar a campanha.");
    } finally {
      setCampBusy(false);
    }
  }

  async function acaoCampanha(acao: "pause" | "resume" | "cancel") {
    if (campBusy || !campId) return;
    setCampBusy(true);
    setCampMsg(null);
    try {
      await apiFetch(`/modules/master/webscraping/mass-data/${encodeURIComponent(campId)}/${acao}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCampMsg(`✓ Campanha ${campId}: ${acao === "pause" ? "pausada" : acao === "resume" ? "retomada" : "cancelada"}.`);
      await carregarMass();
    } catch (err) {
      setCampMsg(err instanceof Error ? err.message : `Falha em ${acao}.`);
    } finally {
      setCampBusy(false);
    }
  }

  function carregarCusto() {
    if (!custoCompanyId) {
      setCustoError("Escolha uma empresa para ver o custo.");
      return;
    }
    setCusto(null);
    setCustoError(null);
    apiFetch<Custo>(`/modules/master/webscraping/enrichment-cost/summary?companyId=${custoCompanyId}&days=${custoDias}`)
      .then(res => setCusto(res))
      .catch((err: unknown) => setCustoError(err instanceof Error ? err.message : "Falha ao carregar o custo."));
  }

  const s = audit?.summary || {};
  const selCount = Object.values(sel).filter(Boolean).length;
  const itens = cards?.items || [];

  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {SUBTABS.map((t, i) => (
          <button key={t} className="btn-ghost" onClick={() => { setSub(i); if (i === 1) carregarExportTargets(); }}
            style={i === sub ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
            {t}
          </button>
        ))}
        {sub === 0 && (
          <button className="btn-ghost" style={{ marginLeft: "auto" }} onClick={atualizarAudit} disabled={auditBusy}>
            {auditBusy ? "Atualizando…" : "Atualizar"}
          </button>
        )}
      </div>

      {sub === 0 && (
        <React.Fragment>
          {auditError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{auditError}</div>}
          {!audit && !auditError && <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Carregando auditoria…</div>}
          {audit && (
            <React.Fragment>
              <div className="kpis">
                {[
                  { label: "Cards no banco", value: s.totalCards },
                  { label: "Cards hoje", value: s.cardsToday },
                  { label: "Últimos 10 min", value: s.cardsLast10Min },
                  { label: "Enviados ao Vendas", value: s.sentToVendas },
                  { label: "Negativados", value: s.negatives },
                  { label: "Motores online", value: `${s.motoresOnline ?? 0}/${s.motoresRegistrados ?? 0}` },
                ].map(k => (
                  <div className="kpi" key={k.label}>
                    <div>
                      <div className="kpi-label">{k.label}</div>
                      <div className="kpi-value">{k.value != null ? String(k.value) : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, alignItems: "start" }}>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Motores</h2>
                    <div className="meta">{fmtDataHora(audit.generatedAt)}</div>
                  </div>
                  {engMsg && (
                    <div style={{ padding: "10px 16px 0", fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: engMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{engMsg}</div>
                  )}
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr><th>Motor</th><th>Status</th><th>Hoje</th><th>10 min</th><th>Dup</th><th>Rej</th><th>Significado</th><th>Controles</th></tr>
                      </thead>
                      <tbody>
                        {(audit.engines || []).length === 0 && (
                          <tr><td colSpan={8} style={{ color: "var(--text-muted)" }}>Nenhum motor registrado.</td></tr>
                        )}
                        {(audit.engines || []).map(eng => (
                          <tr key={eng.id} style={{ cursor: "default" }}>
                            <td><strong>{eng.id}</strong></td>
                            <td>
                              <span className={eng.lastError ? "tag red" : eng.manualPaused ? "tag warn" : "tag teal"}>
                                {eng.manualPaused ? "pausado" : eng.status || "—"}
                              </span>
                            </td>
                            <td>{eng.cardsToday ?? 0}</td>
                            <td>{eng.cardsLast10Min ?? 0}</td>
                            <td>{eng.duplicatesToday ?? 0}</td>
                            <td>{eng.rejectedToday ?? 0}</td>
                            <td style={{ whiteSpace: "normal", maxWidth: 220, fontSize: "0.68rem", color: "var(--text-muted)" }}>{eng.currentMeaning || eng.lastError || "—"}</td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {eng.manualPaused ? (
                                  <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px" }} disabled={engBusy != null}
                                    onClick={() => acaoMotor(eng.id, "resume")} title="Retomar o motor">
                                    {engBusy === `${eng.id}:resume` ? "…" : "Retomar"}
                                  </button>
                                ) : (
                                  <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px" }} disabled={engBusy != null}
                                    onClick={() => acaoMotor(eng.id, "pause")} title="Pausar por 30 minutos">
                                    {engBusy === `${eng.id}:pause` ? "…" : "Pausar 30m"}
                                  </button>
                                )}
                                <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px" }} disabled={engBusy != null}
                                  onClick={() => acaoMotor(eng.id, "drain")} title="Drenar: termina o trabalho atual e libera (60s)">
                                  {engBusy === `${eng.id}:drain` ? "…" : "Drenar"}
                                </button>
                                <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem", padding: "0 7px", color: "var(--hbx-danger)" }} disabled={engBusy != null}
                                  onClick={() => acaoMotor(eng.id, "stop")} title="Parar o motor">
                                  {engBusy === `${eng.id}:stop` ? "…" : "Parar"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div style={{ display: "grid", gap: 14 }}>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Fábrica</h2>
                      <div className="meta">
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={engBusy != null}
                          onClick={() => turboForcado(true)} title="Força a fábrica noturna a rodar agora">
                          {engBusy === "turbo:on" ? "…" : "Forçar agora"}
                        </button>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={engBusy != null}
                          onClick={() => turboForcado(false)} title="Cancela a rodada forçada">
                          {engBusy === "turbo:off" ? "…" : "Cancelar forçada"}
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, fontSize: "0.74rem" }}>
                      {[
                        ["Status", audit.factory?.status],
                        ["Ligada", audit.factory?.enabled ? "sim" : "não"],
                        ["Cidade atual", audit.factory?.currentCity],
                        ["Segmento atual", audit.factory?.currentSegment],
                        ["Próxima missão", audit.factory?.nextRunAt ? fmtDataHora(audit.factory.nextRunAt) : null],
                        ["Último trabalho", audit.factory?.lastWorkedAt ? fmtDataHora(audit.factory.lastWorkedAt) : null],
                        ["Parada por", audit.factory?.reasonStopped],
                        ["Último erro", audit.factory?.lastError],
                      ].map(([label, value]) => (
                        <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ color: "var(--text-muted)" }}>{label}</span>
                          <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head"><h2>Diagnóstico</h2></div>
                    <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8 }}>
                      {(audit.diagnostics || []).map((d, i) => (
                        <span key={i} style={{ fontSize: "0.7rem", lineHeight: 1.5, color: "var(--text-body)" }}>• {d}</span>
                      ))}
                      {audit.clientProtection?.message && (
                        <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{audit.clientProtection.message}</span>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {sub === 1 && (
        <React.Fragment>
          <section className="panel">
            <div className="panel-head">
              <h2>Cards no banco do Radar</h2>
              <div className="meta">{cards?.total != null ? `${cards.total} no filtro` : ""}</div>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Empresa</label>
                <select className="field-dark" style={{ minWidth: 180 }} value={filtro.companyId}
                  onChange={e => setFiltro(f => ({ ...f, companyId: e.target.value }))}>
                  <option value="">Banco geral (todas)</option>
                  {(companies || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Cidade</label>
                <input className="field-dark" style={{ width: 150 }} value={filtro.city} onChange={e => setFiltro(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Segmento</label>
                <input className="field-dark" style={{ width: 150 }} value={filtro.segment} onChange={e => setFiltro(f => ({ ...f, segment: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Status</label>
                <input className="field-dark" style={{ width: 130 }} placeholder="ex.: negative" value={filtro.status} onChange={e => setFiltro(f => ({ ...f, status: e.target.value }))} />
              </div>
              <button className="btn-teal" disabled={cardsBusy} onClick={() => { setPage(1); buscarCards(1); }}>
                {cardsBusy ? "Buscando…" : "Buscar"}
              </button>
              {selCount > 0 && (
                <React.Fragment>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Exportar para</label>
                    <select className="field-dark" style={{ minWidth: 200 }} value={exportUserId} onChange={e => setExportUserId(e.target.value)}>
                      <option value="">Escolha o destino…</option>
                      {(exportTargets || []).map(t => (
                        <option key={t.id} value={String(t.id)}>
                          {(t.company?.name ? `${t.company.name} · ` : "") + (t.name || t.username || t.email || `Usuário ${t.id}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-teal" disabled={exportBusy || !exportUserId} onClick={exportarSelecionados}>
                    {exportBusy ? "Exportando…" : `Exportar ${selCount}`}
                  </button>
                  {delArm ? (
                    <button className="btn-ghost" style={{ borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }} disabled={delBusy} onClick={excluirSelecionados}>
                      {delBusy ? "Excluindo…" : `Confirmar exclusão de ${selCount}`}
                    </button>
                  ) : (
                    <button className="btn-ghost" style={{ color: "var(--hbx-danger)" }} onClick={() => setDelArm(true)}>
                      Excluir selecionados ({selCount})
                    </button>
                  )}
                </React.Fragment>
              )}
            </div>
            {delMsg && (
              <div style={{ padding: "0 16px 10px", fontSize: "0.72rem", fontWeight: 700, color: delMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{delMsg}</div>
            )}
            {cardsError && <div style={{ padding: "0 16px 12px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{cardsError}</div>}
            {cards?.meta?.available === false && (
              <div style={{ padding: "0 16px 12px", fontSize: "0.72rem", color: "var(--text-muted)" }}>{cards.meta.message || "Banco do Radar indisponível neste ambiente."}</div>
            )}
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>
                      <input type="checkbox" aria-label="Selecionar página"
                        checked={itens.length > 0 && itens.every(i => sel[i.id])}
                        onChange={e => {
                          const on = e.target.checked;
                          setSel(prev => {
                            const next = { ...prev };
                            for (const i of itens) next[i.id] = on;
                            return next;
                          });
                        }} />
                    </th>
                    <th>Empresa</th><th>Cidade</th><th>Segmento</th><th>Status</th><th>Score</th><th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {!cardsBusy && itens.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Nada no filtro.</td></tr>
                  )}
                  {itens.map(card => (
                    <tr key={card.id} style={{ cursor: "default" }}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Selecionar ${card.name || card.id}`} checked={Boolean(sel[card.id])}
                          onChange={e => setSel(prev => ({ ...prev, [card.id]: e.target.checked }))} />
                      </td>
                      <td>
                        <div className="co">
                          <strong>{card.name || "—"}</strong>
                          <span className="sub2">{card.phone || "—"}</span>
                        </div>
                      </td>
                      <td>{card.city ? `${card.city}${card.state ? `/${card.state}` : ""}` : "—"}</td>
                      <td>{card.segment || "—"}</td>
                      <td>{card.status || "—"}</td>
                      <td>{card.opportunityScore ?? "—"}</td>
                      <td>{fmtDataHora(card.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn-ghost" disabled={cardsBusy || page <= 1}
                onClick={() => { const p = page - 1; setPage(p); buscarCards(p); }}>‹ Anterior</button>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>página {page}</span>
              <button className="btn-ghost" disabled={cardsBusy || itens.length < 50}
                onClick={() => { const p = page + 1; setPage(p); buscarCards(p); }}>Próxima ›</button>
            </div>
          </section>
        </React.Fragment>
      )}

      {sub === 2 && (
        <section className="panel">
          <div className="panel-head"><h2>Custo de enriquecimento por empresa</h2></div>
          <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Empresa</label>
              <select className="field-dark" style={{ minWidth: 200 }} value={custoCompanyId} onChange={e => setCustoCompanyId(e.target.value)}>
                <option value="">Escolha…</option>
                {(companies || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Período</label>
              <select className="field-dark" value={custoDias} onChange={e => setCustoDias(e.target.value)}>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
              </select>
            </div>
            <button className="btn-teal" onClick={carregarCusto}>Consultar</button>
          </div>
          {custoError && <div style={{ padding: "0 16px 12px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{custoError}</div>}
          {custo && (
            <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
              <div className="kpis">
                {[
                  { label: "Custo estimado", value: fmtBRL(custo.estimatedCostBrl) },
                  { label: "Chamadas (ledger)", value: String(custo.ledgerCount ?? 0) },
                  { label: "Pagas", value: String(custo.paidLedgerCount ?? 0) },
                  { label: "Cache hits", value: String(custo.cacheHitCount ?? 0) },
                  { label: "Uso do budget", value: `${Math.round((custo.budgetUsageRatio ?? 0) * 100)}%` },
                ].map(k => (
                  <div className="kpi" key={k.label}>
                    <div>
                      <div className="kpi-label">{k.label}</div>
                      <div className="kpi-value" style={{ fontSize: "1.1rem" }}>{k.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <table className="tbl">
                <thead><tr><th>Provedor</th><th>Chamadas</th><th>Pagas</th><th>Cache</th><th>Custo</th></tr></thead>
                <tbody>
                  {Object.entries(custo.byProvider || {}).length === 0 && (
                    <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Sem lançamentos no período.</td></tr>
                  )}
                  {Object.entries(custo.byProvider || {}).map(([prov, row]) => (
                    <tr key={prov} style={{ cursor: "default" }}>
                      <td><strong>{prov}</strong></td>
                      <td>{row.count}</td>
                      <td>{row.paidCount}</td>
                      <td>{row.cacheHitCount}</td>
                      <td>{fmtBRL(row.estimatedCostBrl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {sub === 3 && (
        <React.Fragment>
          {distError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{distError}</div>}
          <section className="panel">
            <div className="panel-head">
              <h2>Distribuição automática (tenant HBX)</h2>
              <div className="meta">
                <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} onClick={carregarDist} disabled={distBusy}>Atualizar</button>
                <button className="btn-teal" style={{ minHeight: 28, fontSize: "0.66rem" }} onClick={rodarDist} disabled={distBusy}>
                  {distBusy ? "…" : "Distribuir agora"}
                </button>
              </div>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              {distMsg && (
                <div style={{ width: "100%", fontSize: "0.72rem", fontWeight: 700, color: distMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{distMsg}</div>
              )}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Status da regra</label>
                <select className="field-dark" value={distForm.status} onChange={e => setDistForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                  <option value="paused">Pausada</option>
                </select>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Estoque alvo/vendedor</label>
                <input className="field-dark" type="number" min={1} max={500} style={{ width: 130 }} value={distForm.targetStock}
                  onChange={e => setDistForm(f => ({ ...f, targetStock: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Limite diário/vendedor</label>
                <input className="field-dark" type="number" min={0} max={500} style={{ width: 130 }} value={distForm.dailyLimit}
                  onChange={e => setDistForm(f => ({ ...f, dailyLimit: e.target.value }))} />
              </div>
              <button className="btn-ghost" onClick={salvarDist} disabled={distBusy}>{distBusy ? "Salvando…" : "Salvar regra"}</button>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Vendedor</th><th>Territórios</th><th>Cards disponíveis</th><th>Estoque atual</th><th>Entregue hoje</th><th>Limite diário</th><th></th></tr>
                </thead>
                <tbody>
                  {dist === null && <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                  {dist !== null && (dist.sellers || []).length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Sem vendedores ativos no tenant operacional.</td></tr>
                  )}
                  {(dist?.sellers || []).map((s, i) => (
                    <tr key={s.id || i} style={{ cursor: "default" }}>
                      <td><strong>{s.name || s.username || s.email || `#${s.id}`}</strong></td>
                      <td style={{ whiteSpace: "normal", maxWidth: 260, fontSize: "0.68rem" }}>
                        {(s.cities || []).length
                          ? (s.cities || []).map(c => `${c.city || "?"}${c.state ? `/${c.state}` : ""}`).join(", ")
                          : <span className="tag warn">sem território</span>}
                      </td>
                      <td>{s.availableCards ?? "—"}</td>
                      <td>{s.currentStock ?? "—"}</td>
                      <td>{s.deliveredToday ?? "—"}</td>
                      <td>{s.sellerDailyLimit ?? "—"}</td>
                      <td>
                        <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} onClick={() => abrirTerritorios(s)}>
                          Editar territórios
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 16px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
              A regra ativa entrega cards das cidades mapeadas até o estoque alvo, respeitando o limite diário por vendedor.
            </div>
          </section>

          {terrEdit && (
            <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setTerrEdit(null); }}>
              <form className="hbx-modal" onSubmit={salvarTerritorios}
                style={{ width: "min(440px, 100%)", maxHeight: "85vh", overflowY: "auto", display: "grid", gap: 12, padding: 24 }}>
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Territórios — {terrEdit.nome}
                  <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setTerrEdit(null)}>✕</span>
                </h3>
                {terrMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{terrMsg}</div>}
                <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Cidades que a distribuição automática pode entregar a este vendedor.
                </span>
                {terrEdit.cities.length === 0 && (
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Sem cidades — adicione a primeira.</span>
                )}
                {terrEdit.cities.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px auto", gap: 6 }}>
                    <input className="field-dark" style={{ minHeight: 34 }} placeholder="Cidade" maxLength={80} value={c.city}
                      onChange={e => setTerrEdit(t => t && ({ ...t, cities: t.cities.map((x, j) => j === i ? { ...x, city: e.target.value } : x) }))} />
                    <input className="field-dark" style={{ minHeight: 34 }} placeholder="UF" maxLength={2} value={c.state}
                      onChange={e => setTerrEdit(t => t && ({ ...t, cities: t.cities.map((x, j) => j === i ? { ...x, state: e.target.value } : x) }))} />
                    <button type="button" className="icon-ghost" aria-label="Remover cidade"
                      onClick={() => setTerrEdit(t => t && ({ ...t, cities: t.cities.filter((_, j) => j !== i) }))}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost" style={{ width: "fit-content", minHeight: 28, fontSize: "0.66rem" }}
                  onClick={() => setTerrEdit(t => t && ({ ...t, cities: [...t.cities, { city: "", state: "" }] }))}>
                  + Adicionar cidade
                </button>
                <button className="btn-teal" type="submit" disabled={terrBusy} style={{ minHeight: 42 }}>
                  {terrBusy ? "Salvando…" : "Salvar territórios"}
                </button>
              </form>
            </div>
          )}
        </React.Fragment>
      )}

      {sub === 4 && (
        <React.Fragment>
          {massError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{massError}</div>}
          {mass && (
            <React.Fragment>
              <div className="kpis">
                {[
                  { label: "Cards hoje", value: mass.summary?.cardsToday },
                  { label: "Cards/min (média)", value: mass.summary?.cardsPerMinuteAvg },
                  { label: "Fila ativa", value: mass.summary?.activeQueue },
                  { label: "Erros 24h", value: mass.summary?.errors24h },
                  { label: "Motores online", value: mass.summary?.onlineEngines != null ? `${mass.summary.onlineEngines}/${mass.summary?.totalEngines ?? "?"}` : undefined },
                ].map(k => (
                  <div className="kpi" key={k.label}>
                    <div>
                      <div className="kpi-label">{k.label}</div>
                      <div className="kpi-value" style={{ fontSize: "1.1rem" }}>{k.value != null ? String(k.value) : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14, alignItems: "start" }}>
                <section className="panel">
                  <div className="panel-head"><h2>Nova campanha em massa</h2></div>
                  <form onSubmit={criarCampanha} style={{ padding: "12px 16px 16px", display: "grid", gap: 10 }}>
                    {campMsg && (
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: campMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{campMsg}</div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>UF *</label>
                        <input className="field-dark" required maxLength={2} placeholder="SP" value={campForm.state}
                          onChange={e => setCampForm(f => ({ ...f, state: e.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Cidade</label>
                        <input className="field-dark" maxLength={80} value={campForm.city}
                          onChange={e => setCampForm(f => ({ ...f, city: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Segmento</label>
                        <input className="field-dark" maxLength={80} value={campForm.segment}
                          onChange={e => setCampForm(f => ({ ...f, segment: e.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Tipo</label>
                        <select className="field-dark" value={campForm.targetType} onChange={e => setCampForm(f => ({ ...f, targetType: e.target.value }))}>
                          <option value="pj">PJ</option>
                          <option value="pf">PF</option>
                          <option value="both">Ambos</option>
                        </select>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Meta (cards)</label>
                        <input className="field-dark" type="number" min={0} value={campForm.targetTotal}
                          onChange={e => setCampForm(f => ({ ...f, targetTotal: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn-teal" type="submit" disabled={campBusy} style={{ minHeight: 40 }}>
                      {campBusy ? "Criando…" : "Criar campanha"}
                    </button>
                    {campId && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Campanha {campId}:</span>
                        <button type="button" className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={campBusy} onClick={() => acaoCampanha("pause")}>Pausar</button>
                        <button type="button" className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} disabled={campBusy} onClick={() => acaoCampanha("resume")}>Retomar</button>
                        <button type="button" className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", color: "var(--hbx-danger)" }} disabled={campBusy} onClick={() => acaoCampanha("cancel")}>Cancelar</button>
                      </div>
                    )}
                  </form>
                </section>

                <div style={{ display: "grid", gap: 14 }}>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Estado operacional</h2>
                      <div className="meta"><button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem" }} onClick={carregarMass}>Atualizar</button></div>
                    </div>
                    <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, fontSize: "0.74rem" }}>
                      <span style={{ fontWeight: 700, color: mass.status?.critical ? "var(--hbx-danger)" : "var(--text-body)" }}>
                        {mass.status?.operationalMessage || "—"}
                      </span>
                      {[
                        ["Modo atual", mass.status?.currentMode],
                        ["Turbo", mass.turbo?.active ? `ATIVO até ${mass.turbo?.endLabel || "?"}` : `janela ${mass.turbo?.startLabel || "?"}–${mass.turbo?.endLabel || "?"}`],
                        ["Estratégia autônoma", mass.autonomousStrategy ? `${mass.autonomousStrategy.selectedState || "BR"} · ${mass.autonomousStrategy.selectedSegment || "geral"} (${mass.autonomousStrategy.reason || "—"})` : null],
                        ["Fila / banco / motores", mass.diagnostics ? `${mass.diagnostics.queueStatus || "?"} / ${mass.diagnostics.databaseStatus || "?"} / ${mass.diagnostics.engineHealthStatus || "?"}` : null],
                      ].map(([label, value]) => (
                        <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ color: "var(--text-muted)" }}>{label}</span>
                          <span style={{ fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
                        </div>
                      ))}
                      {(mass.diagnostics?.messages || []).map((m, i) => (
                        <span key={i} style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5 }}>• {m}</span>
                      ))}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head"><h2>Produção recente</h2></div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr><th>Card</th><th>Cidade</th><th>Origem</th><th>Status</th></tr></thead>
                        <tbody>
                          {(mass.production || []).length === 0 && (
                            <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Sem produção recente.</td></tr>
                          )}
                          {(mass.production || []).slice(0, 8).map(p => (
                            <tr key={p.id} style={{ cursor: "default" }}>
                              <td><strong>{p.name || "—"}</strong></td>
                              <td>{p.city ? `${p.city}${p.state ? `/${p.state}` : ""}` : "—"}</td>
                              <td>{p.source || "—"}</td>
                              <td><span className={p.dbStatus === "saved" ? "tag teal" : p.dbStatus === "error" ? "tag red" : "tag"}>{p.dbStatus || "—"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
