"use client";

// Janela 6 — Night Factory.
// Contratos ligados (NightFactoryController, modules/master/night-factory;
// master bypassa o entitlement guard — commercial-plans.service):
//   GET  /status             → status geral, janela, resumo, worker, pipeline
//   POST /run-now | /pause | /resume → controles
//   POST /config             → {enabled, startHour, endHour, ...}
//   GET  /top-opportunities  → melhores oportunidades da noite
//   GET  /daily-report       → relatório do dia (resumo + destaques)
//   GET  /segments           → {items: segment/totalLeads/averageScore}
//   GET  /cities             → {items: city/state/totalLeads/averageScore/recommendedOffer}
//   GET  /recovery-opportunities → {items} (fila de recuperação)
// Fase 2 completa por ordem do dono (12/06/2026: "ligue tudo").

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

import { fmtDataHora } from "./page.client";

type Status = {
  product?: string;
  status?: string;
  config?: { enabled?: boolean; startHour?: number; endHour?: number; maxLeadsPerNight?: number };
  window?: { timezone?: string; startHour?: number; endHour?: number; activeNow?: boolean; nextWindowLabel?: string };
  summary?: {
    totalLeads?: number;
    leadsEnrichedToday?: number;
    premiumOpportunities?: number;
    recoveryOpportunities?: number;
    potentialRevenueEstimate?: number;
  };
  worker?: { running?: boolean; paused?: boolean; lastRunAt?: string | null; lastFinishedAt?: string | null; lastError?: string | null };
  pipeline?: { key: string; label: string; quantity?: number; status?: string }[];
} | null;

type Oportunidade = {
  id?: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  opportunityScore?: number | null;
  phone?: string | null;
};

function extrairItens<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const obj = (res || {}) as { items?: T[] };
  return Array.isArray(obj.items) ? obj.items : [];
}

type Segmento = { segment?: string; totalLeads?: number; averageScore?: number };
type Cidade = { city?: string; state?: string | null; totalLeads?: number; averageScore?: number; recommendedOffer?: string };
type RecoveryItem = { id?: string; recoveryReason?: string; recoveryScore?: number; suggestedFlow?: string; status?: string };

type DailyReport = {
  title?: string;
  greeting?: string;
  summary?: Record<string, number>;
} | null;

export function JanelaNightFactory() {
  const [status, setStatus] = useState<Status>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acaoBusy, setAcaoBusy] = useState<string | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [tops, setTops] = useState<Oportunidade[] | null>(null);
  const [configForm, setConfigForm] = useState({ startHour: "", endHour: "", maxLeadsPerNight: "" });
  const [configBusy, setConfigBusy] = useState(false);

  // fase 2: relatório do dia + rankings + fila de recovery
  const [daily, setDaily] = useState<DailyReport>(null);
  const [segmentos, setSegmentos] = useState<Segmento[] | null>(null);
  const [cidades, setCidades] = useState<Cidade[] | null>(null);
  const [recovery, setRecovery] = useState<RecoveryItem[] | null>(null);

  const carregar = useCallback(() => {
    apiFetch<Status>("/modules/master/night-factory/status")
      .then(res => {
        setStatus(res);
        setLoadError(null);
        setConfigForm({
          startHour: String(res?.config?.startHour ?? ""),
          endHour: String(res?.config?.endHour ?? ""),
          maxLeadsPerNight: String(res?.config?.maxLeadsPerNight ?? ""),
        });
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Falha ao carregar o status."));
    apiFetch<unknown>("/modules/master/night-factory/top-opportunities")
      .then(res => setTops(extrairItens<Oportunidade>(res)))
      .catch(() => setTops([]));
    apiFetch<DailyReport>("/modules/master/night-factory/daily-report")
      .then(res => setDaily(res))
      .catch(() => setDaily(null));
    apiFetch<unknown>("/modules/master/night-factory/segments")
      .then(res => setSegmentos(extrairItens<Segmento>(res)))
      .catch(() => setSegmentos([]));
    apiFetch<unknown>("/modules/master/night-factory/cities")
      .then(res => setCidades(extrairItens<Cidade>(res)))
      .catch(() => setCidades([]));
    apiFetch<unknown>("/modules/master/night-factory/recovery-opportunities")
      .then(res => setRecovery(extrairItens<RecoveryItem>(res)))
      .catch(() => setRecovery([]));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function acionar(rota: "run-now" | "pause" | "resume") {
    if (acaoBusy) return;
    setAcaoBusy(rota);
    setAcaoMsg(null);
    try {
      await apiFetch(`/modules/master/night-factory/${rota}`, { method: "POST", body: JSON.stringify({}) });
      setAcaoMsg(`✓ ${rota === "run-now" ? "Rodada disparada" : rota === "pause" ? "Pausada" : "Retomada"}.`);
      carregar();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha na ação.");
    } finally {
      setAcaoBusy(null);
    }
  }

  async function salvarConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (configBusy) return;
    setConfigBusy(true);
    setAcaoMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (configForm.startHour !== "") body.startHour = Number(configForm.startHour);
      if (configForm.endHour !== "") body.endHour = Number(configForm.endHour);
      if (configForm.maxLeadsPerNight !== "") body.maxLeadsPerNight = Number(configForm.maxLeadsPerNight);
      await apiFetch("/modules/master/night-factory/config", { method: "POST", body: JSON.stringify(body) });
      setAcaoMsg("✓ Configuração salva.");
      carregar();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao salvar a configuração.");
    } finally {
      setConfigBusy(false);
    }
  }

  const s = status?.summary;
  const pausada = Boolean(status?.worker?.paused);

  return (
    <React.Fragment>
      {loadError && <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
      {!status && !loadError && <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Carregando…</div>}

      {status && (
        <React.Fragment>
          <div className="kpis">
            {[
              { label: "Status", value: status.status || "—" },
              { label: "Leads na base", value: String(s?.totalLeads ?? 0) },
              { label: "Enriquecidos hoje", value: String(s?.leadsEnrichedToday ?? 0) },
              { label: "Oportunidades premium", value: String(s?.premiumOpportunities ?? 0) },
              { label: "Recovery", value: String(s?.recoveryOpportunities ?? 0) },
            ].map(k => (
              <div className="kpi" key={k.label}>
                <div>
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ fontSize: "1.1rem" }}>{k.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, alignItems: "start" }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Top oportunidades da noite</h2>
                <div className="meta"><button className="btn-ghost" onClick={carregar}>Atualizar</button></div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Empresa</th><th>Cidade</th><th>Segmento</th><th>Score</th></tr></thead>
                  <tbody>
                    {tops === null && <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                    {tops !== null && tops.length === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Sem oportunidades calculadas ainda.</td></tr>
                    )}
                    {(tops || []).map((o, i) => (
                      <tr key={o.id || i} style={{ cursor: "default" }}>
                        <td>
                          <div className="co">
                            <strong>{o.name || "—"}</strong>
                            <span className="sub2">{o.phone || "—"}</span>
                          </div>
                        </td>
                        <td>{o.city ? `${o.city}${o.state ? `/${o.state}` : ""}` : "—"}</td>
                        <td>{o.segment || "—"}</td>
                        <td>{o.opportunityScore ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div style={{ display: "grid", gap: 14 }}>
              <section className="panel">
                <div className="panel-head"><h2>Controles</h2></div>
                <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10 }}>
                  {acaoMsg && (
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: acaoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)", lineHeight: 1.5 }}>{acaoMsg}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-teal" disabled={acaoBusy != null} onClick={() => acionar("run-now")}>
                      {acaoBusy === "run-now" ? "Disparando…" : "Rodar agora"}
                    </button>
                    {pausada ? (
                      <button className="btn-ghost" disabled={acaoBusy != null} onClick={() => acionar("resume")}>
                        {acaoBusy === "resume" ? "…" : "Retomar"}
                      </button>
                    ) : (
                      <button className="btn-ghost" disabled={acaoBusy != null} onClick={() => acionar("pause")}>
                        {acaoBusy === "pause" ? "…" : "Pausar"}
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    <span>Janela: {status.window?.startHour ?? "—"}h–{status.window?.endHour ?? "—"}h ({status.window?.timezone || "America/Sao_Paulo"}) {status.window?.activeNow ? "— ativa agora" : ""}</span>
                    <span>Próxima janela: {status.window?.nextWindowLabel || "—"}</span>
                    <span>Última rodada: {fmtDataHora(status.worker?.lastRunAt)}</span>
                    {status.worker?.lastError && <span style={{ color: "var(--hbx-danger)" }}>Último erro: {status.worker.lastError}</span>}
                  </div>
                  <form onSubmit={salvarConfig} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", borderTop: "1px solid var(--border-hairline)", paddingTop: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--text-muted)" }}>Início (h)</label>
                      <input className="field-dark" type="number" min={0} max={23} style={{ width: 80 }} value={configForm.startHour}
                        onChange={e => setConfigForm(f => ({ ...f, startHour: e.target.value }))} />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--text-muted)" }}>Fim (h)</label>
                      <input className="field-dark" type="number" min={0} max={23} style={{ width: 80 }} value={configForm.endHour}
                        onChange={e => setConfigForm(f => ({ ...f, endHour: e.target.value }))} />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--text-muted)" }}>Máx/noite</label>
                      <input className="field-dark" type="number" min={1} style={{ width: 100 }} value={configForm.maxLeadsPerNight}
                        onChange={e => setConfigForm(f => ({ ...f, maxLeadsPerNight: e.target.value }))} />
                    </div>
                    <button className="btn-ghost" type="submit" disabled={configBusy}>{configBusy ? "Salvando…" : "Salvar config"}</button>
                  </form>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head"><h2>Pipeline</h2></div>
                <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8 }}>
                  {(status.pipeline || []).map(p => (
                    <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem" }}>
                      <span style={{ fontWeight: 600 }}>{p.label}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{p.quantity ?? 0}</span>
                      <span className={String(p.status) === "ok" || String(p.status) === "rodando" ? "tag teal" : "tag"}>{p.status || "—"}</span>
                    </div>
                  ))}
                  {(status.pipeline || []).length === 0 && (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Pipeline ainda sem dados.</span>
                  )}
                </div>
              </section>

              {daily?.summary && (
                <section className="panel">
                  <div className="panel-head"><h2>{daily.title || "Relatório do dia"}</h2></div>
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, fontSize: "0.74rem" }}>
                    {daily.greeting && <span style={{ fontWeight: 700 }}>{daily.greeting}</span>}
                    {Object.entries(daily.summary).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "var(--text-muted)" }}>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "start" }}>
            <section className="panel">
              <div className="panel-head"><h2>Top segmentos</h2></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Segmento</th><th>Leads</th><th>Score médio</th></tr></thead>
                  <tbody>
                    {segmentos === null && <tr><td colSpan={3} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                    {segmentos !== null && segmentos.length === 0 && (
                      <tr><td colSpan={3} style={{ color: "var(--text-muted)" }}>Sem dados ainda.</td></tr>
                    )}
                    {(segmentos || []).slice(0, 10).map((s, i) => (
                      <tr key={i} style={{ cursor: "default" }}>
                        <td><strong>{s.segment || "—"}</strong></td>
                        <td>{s.totalLeads ?? 0}</td>
                        <td>{s.averageScore ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Top cidades</h2></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Cidade</th><th>Leads</th><th>Score</th><th>Oferta sugerida</th></tr></thead>
                  <tbody>
                    {cidades === null && <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                    {cidades !== null && cidades.length === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Sem dados ainda.</td></tr>
                    )}
                    {(cidades || []).slice(0, 10).map((cid, i) => (
                      <tr key={i} style={{ cursor: "default" }}>
                        <td><strong>{cid.city || "—"}{cid.state ? `/${cid.state}` : ""}</strong></td>
                        <td>{cid.totalLeads ?? 0}</td>
                        <td>{cid.averageScore ?? "—"}</td>
                        <td style={{ fontSize: "0.66rem" }}>{cid.recommendedOffer || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Fila de recovery</h2></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Motivo</th><th>Score</th><th>Fluxo</th><th>Status</th></tr></thead>
                  <tbody>
                    {recovery === null && <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>}
                    {recovery !== null && recovery.length === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Fila vazia.</td></tr>
                    )}
                    {(recovery || []).slice(0, 10).map((r, i) => (
                      <tr key={r.id || i} style={{ cursor: "default" }}>
                        <td style={{ whiteSpace: "normal", maxWidth: 200, fontSize: "0.7rem" }}>{r.recoveryReason || "—"}</td>
                        <td>{r.recoveryScore ?? "—"}</td>
                        <td style={{ fontSize: "0.66rem" }}>{r.suggestedFlow || "—"}</td>
                        <td><span className="tag">{r.status || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
