"use client";

// Janela Self-Checkout (F2 — PR18062026). O organograma de planos editável pelo
// master, em 4 guias: PLANOS (nome/observação/pausa) · PREÇOS E CICLO · MÓDULOS ·
// ACENTOS. Fonte ÚNICA: a "caixa editável" do catálogo (PlanModuleConfig). O que
// for salvo aqui REFLETE na vitrine pública (/?ver=planos) e no billing — o
// backend hidrata o overlay do catálogo a cada PUT (escada front ↔ backend).
//   GET /modules/master/plan/:planKey/modules → { items, planInfo, planMeta }
//   PUT /modules/master/plan/:planKey/modules → { modules, planInfo }
// (planInfo carrega numéricos + title/observation/status no mesmo JSON.)
// Lei 5 (design system): cor/visual só via classe central (screens.css .sc-*).

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useTabParam } from "@/lib/use-tab-param";

const PLANOS = [
  { key: "hbx_lite", label: "HBX List" },
  { key: "hbx_padrao", label: "HBX Lead Plus" },
  { key: "hbx_pro", label: "HBX Pro" },
  { key: "hbx_melhor", label: "Implantação" },
];

const GUIAS = ["Planos", "Preços e ciclo", "Módulos", "Acentos", "Política"] as const;

type ModItem = { key: string; name: string; enabled: boolean };
type PlanInfo = {
  monthlyPrice: number; includedUsers: number; extraUserMonthly: number;
  trialDays: number; deepSearchesPerDay: number; enrichmentsPerDay: number; cardsPerMonth: number;
};
type PlanMeta = { title: string; observation: string; status: "available" | "paused" };

type Form = {
  title: string; observation: string; status: "available" | "paused";
  price: string; trial: string; seats: string; extra: string;
  deep: string; enrich: string; cards: string;
};

const str = (n: number | null | undefined) => (n != null ? String(n) : "");
const num = (s: string) => Number(String(s).replace(",", ".").trim());

function toForm(info: PlanInfo | null, meta: PlanMeta | null): Form {
  return {
    title: meta?.title || "",
    observation: meta?.observation || "",
    status: meta?.status === "paused" ? "paused" : "available",
    price: str(info?.monthlyPrice),
    trial: str(info?.trialDays),
    seats: str(info?.includedUsers),
    extra: str(info?.extraUserMonthly),
    deep: str(info?.deepSearchesPerDay),
    enrich: str(info?.enrichmentsPerDay),
    cards: str(info?.cardsPerMonth),
  };
}

export function JanelaSelfCheckout() {
  const [plano, setPlano] = useState("hbx_lite");
  const [guia, setGuia] = useTabParam<(typeof GUIAS)[number]>("guia", "Planos", GUIAS);
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [form, setForm] = useState<Form>(toForm(null, null));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Política comercial GLOBAL (desconto anual + indicação) — migrada do Sistema.
  // Assento extra NÃO entra aqui: é por-plano na guia Acentos (fonte única).
  const [pol, setPol] = useState({ annual: "", refActive: false, refPercent: "", refMode: "ONCE" });
  const [polBusy, setPolBusy] = useState(false);
  const [polMsg, setPolMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ annualPlanDiscountPercent?: number; referralDiscountActive?: boolean; referralDiscountPercent?: number; referralDiscountMode?: string }>(
      "/modules/master/global-integrations",
    )
      .then(res => setPol({
        annual: res?.annualPlanDiscountPercent != null ? String(res.annualPlanDiscountPercent) : "",
        refActive: Boolean(res?.referralDiscountActive),
        refPercent: res?.referralDiscountPercent != null ? String(res.referralDiscountPercent) : "",
        refMode: String(res?.referralDiscountMode || "ONCE"),
      }))
      .catch(() => undefined);
  }, []);

  async function salvarPolitica() {
    if (polBusy) return;
    setPolBusy(true);
    setPolMsg(null);
    try {
      const body: Record<string, unknown> = { referralDiscountActive: pol.refActive, referralDiscountMode: pol.refMode };
      if (pol.annual !== "") body.annualPlanDiscountPercent = Number(String(pol.annual).replace(",", ".")) || 0;
      if (pol.refPercent !== "") body.referralDiscountPercent = Number(String(pol.refPercent).replace(",", ".")) || 0;
      await apiFetch("/modules/master/billing-policy", { method: "PUT", body: JSON.stringify(body) });
      setPolMsg("✓ Política salva. Desconto anual reflete na vitrine e no billing.");
    } catch (e) {
      setPolMsg(e instanceof Error ? e.message : "Falha ao salvar a política.");
    } finally {
      setPolBusy(false);
    }
  }

  const carregar = useCallback((planKey: string) => {
    // setState só no callback assíncrono (regra react-hooks/set-state-in-effect).
    apiFetch<{ items?: ModItem[]; planInfo?: PlanInfo; planMeta?: PlanMeta }>(
      `/modules/master/plan/${encodeURIComponent(planKey)}/modules`,
    )
      .then(res => {
        setItems(Array.isArray(res?.items) ? res.items : []);
        setForm(toForm(res?.planInfo || null, res?.planMeta || null));
        setMsg(null);
      })
      .catch(() => { setItems([]); setForm(toForm(null, null)); setMsg("Falha ao carregar o plano."); });
  }, []);

  useEffect(() => { carregar(plano); }, [plano, carregar]);

  function alternarModulo(key: string) {
    setItems(prev => (prev || []).map(it => it.key === key ? { ...it, enabled: !it.enabled } : it));
  }

  // Sem assento padrão (<= 0) não há assento extra (regra do dono): zera e tranca.
  const semAssentoBase = !(num(form.seats) > 0);
  function setSeats(v: string) {
    setForm(f => (num(v) > 0 ? { ...f, seats: v } : { ...f, seats: v, extra: "" }));
  }

  async function salvar() {
    if (busy || !items) return;
    setBusy(true);
    setMsg(null);
    try {
      const modules: Record<string, boolean> = {};
      for (const it of items) modules[it.key] = it.enabled;
      const planInfo = {
        title: form.title.trim(),
        observation: form.observation,
        status: form.status,
        monthlyPrice: form.price,
        trialDays: form.trial,
        includedUsers: form.seats,
        extraUserMonthly: semAssentoBase ? "0" : form.extra,
        deepSearchesPerDay: form.deep,
        enrichmentsPerDay: form.enrich,
        cardsPerMonth: form.cards,
      };
      const res = await apiFetch<{ planInfo?: PlanInfo; planMeta?: PlanMeta }>(
        `/modules/master/plan/${encodeURIComponent(plano)}/modules`,
        { method: "PUT", body: JSON.stringify({ modules, planInfo }) },
      );
      if (res?.planInfo || res?.planMeta) setForm(toForm(res?.planInfo || null, res?.planMeta || null));
      setMsg("✓ Plano salvo. Reflete na vitrine (/?ver=planos) e no billing para todas as empresas deste plano.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const pausado = form.status === "paused";
  const annualPct = pol.annual !== "" ? num(pol.annual) : 20;
  const precoAnual = num(form.price) > 0 ? (num(form.price) * 12 * (1 - annualPct / 100)) : 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Self-Checkout — organograma de planos</h2>
        {guia !== "Política" && (
          <div className="meta">
            <select className="field-dark" value={plano} onChange={e => setPlano(e.target.value)} aria-label="Plano">
              {PLANOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button className="btn-teal" disabled={busy || !items} onClick={salvar}>{busy ? "Salvando…" : "Salvar plano"}</button>
          </div>
        )}
      </div>

      <div className="sc-intro">
        <span className="sc-note">
          Editar aqui vale ao vivo para todas as empresas deste plano (sem post-it). A exceção por empresa fica no detalhe da empresa.
        </span>
        {msg && <div className={"sc-msg " + (msg.startsWith("✓") ? "is-ok" : "is-warn")}>{msg}</div>}
      </div>

      <div className="tabs sc-tabs">
        {GUIAS.map(g => (
          <button key={g} className={"tab" + (guia === g ? " active" : "")} onClick={() => setGuia(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="sc-body">
        {items === null && guia !== "Política" && <span className="sc-loading">Carregando…</span>}

        {items !== null && guia === "Planos" && (
          <React.Fragment>
            <div className="sc-field">
              <label className="field-label">Nome do plano</label>
              <input className="field-dark" maxLength={60} value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Nome exibido na vitrine" />
            </div>
            <div className="sc-field">
              <label className="field-label">Observação (descrição na vitrine)</label>
              <textarea className="field-dark sc-textarea" rows={3} maxLength={400} value={form.observation}
                onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
                placeholder="Texto que aparece no card do plano" />
            </div>
            <div className="sc-field sc-field--sep">
              <label className="field-label">Disponibilidade</label>
              <label className="sc-check">
                <input type="checkbox" checked={pausado}
                  onChange={e => setForm(f => ({ ...f, status: e.target.checked ? "paused" : "available" }))} />
                Pausar este plano
              </label>
              <span className={"sc-hint" + (pausado ? " is-warn" : "")}>
                {pausado
                  ? "Pausado: o card fica embaçado e inclicável na vitrine, e o checkout é barrado até reativar."
                  : "Ativo: o plano aparece normalmente e pode ser contratado."}
              </span>
            </div>
          </React.Fragment>
        )}

        {items !== null && guia === "Preços e ciclo" && (
          <React.Fragment>
            <div className="sc-field">
              <label className="field-label">Parcela mensal (R$/mês)</label>
              <input className="field-dark" inputMode="decimal" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
              <span className="sc-hint">
                Preço 0 → empresa fica em pending_checkout (sem cobrança, aguarda contato comercial).
              </span>
            </div>
            <div className="sc-field sc-field--sep">
              <label className="field-label">Ciclo anual</label>
              <span className="sc-note">
                Desconto anual global de {pol.annual || "—"}% (editável na guia <b className="sc-anual-val">Política</b>).
                {precoAnual > 0 && <> No anual: <b className="sc-anual-val">{precoAnual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/ano</b>.</>}
              </span>
            </div>
          </React.Fragment>
        )}

        {items !== null && guia === "Módulos" && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Módulo</th><th>Nome</th><th>Padrão</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={3} className="sc-loading">Sem módulos.</td></tr>}
                {items.map(it => (
                  <tr key={it.key}>
                    <td>{it.key}</td>
                    <td>{it.name}</td>
                    <td>
                      <button className={"btn-ghost sc-mod-btn" + (it.enabled ? " is-on" : "")} disabled={busy}
                        onClick={() => alternarModulo(it.key)}>
                        {it.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items !== null && guia === "Acentos" && (
          <React.Fragment>
            <div className="sc-field">
              <label className="field-label">Assentos inclusos no plano</label>
              <input className="field-dark" inputMode="numeric" value={form.seats}
                onChange={e => setSeats(e.target.value)} placeholder="0" />
            </div>
            <div className="sc-field">
              <label className="field-label">Valor do assento extra (R$/mês)</label>
              <input className="field-dark" inputMode="decimal" value={semAssentoBase ? "" : form.extra}
                disabled={semAssentoBase} placeholder={semAssentoBase ? "sem assento base" : "0,00"}
                onChange={e => setForm(f => ({ ...f, extra: e.target.value }))} />
              <span className="sc-hint">Sem assento incluso (0) não existe assento extra.</span>
            </div>
            <div className="sc-field">
              <label className="field-label">Trial (dias)</label>
              <input className="field-dark" inputMode="numeric" value={form.trial}
                onChange={e => setForm(f => ({ ...f, trial: e.target.value }))} placeholder="0" />
            </div>
            <div className="sc-quotas">
              <span className="field-label">Quotas (limites em revisão)</span>
              <div className="sc-field">
                <label className="field-label">Deep Search (por dia)</label>
                <input className="field-dark" inputMode="numeric" value={form.deep}
                  onChange={e => setForm(f => ({ ...f, deep: e.target.value }))} placeholder="0" />
              </div>
              <div className="sc-field">
                <label className="field-label">Enriquecimento (por dia)</label>
                <input className="field-dark" inputMode="numeric" value={form.enrich}
                  onChange={e => setForm(f => ({ ...f, enrich: e.target.value }))} placeholder="0" />
              </div>
              <div className="sc-field">
                <label className="field-label">Cards (por mês)</label>
                <input className="field-dark" inputMode="numeric" value={form.cards}
                  onChange={e => setForm(f => ({ ...f, cards: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </React.Fragment>
        )}

        {guia === "Política" && (
          <React.Fragment>
            <span className="sc-note">
              Política comercial <b className="sc-anual-val">global</b> (vale para todos os planos). O valor do
              assento extra é por-plano — edite na guia Acentos.
            </span>
            {polMsg && <div className={"sc-msg " + (polMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{polMsg}</div>}
            <div className="sc-field">
              <label className="field-label">Desconto do plano anual (%)</label>
              <input className="field-dark" inputMode="decimal" value={pol.annual}
                onChange={e => setPol(p => ({ ...p, annual: e.target.value }))} placeholder="20" />
              <span className="sc-hint">Aplica no ciclo anual de todos os planos. Vazio/0 = padrão do catálogo (20%).</span>
            </div>
            <div className="sc-field sc-field--sep">
              <label className="sc-check">
                <input type="checkbox" checked={pol.refActive}
                  onChange={e => setPol(p => ({ ...p, refActive: e.target.checked }))} />
                Desconto por indicação ativo
              </label>
            </div>
            <div className="sc-field">
              <label className="field-label">Desconto da indicação (%)</label>
              <input className="field-dark" inputMode="decimal" value={pol.refPercent}
                onChange={e => setPol(p => ({ ...p, refPercent: e.target.value }))} placeholder="0" />
            </div>
            <div className="sc-field">
              <label className="field-label">Modo da indicação</label>
              <select className="field-dark" value={pol.refMode} onChange={e => setPol(p => ({ ...p, refMode: e.target.value }))}>
                <option value="ONCE">Uma vez</option>
                <option value="RECURRING">Recorrente</option>
              </select>
            </div>
            <button className="btn-teal" disabled={polBusy} onClick={salvarPolitica}>
              {polBusy ? "Salvando…" : "Salvar política"}
            </button>
          </React.Fragment>
        )}
      </div>
    </section>
  );
}
