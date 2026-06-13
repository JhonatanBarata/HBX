"use client";

// Sistema → Planos (PR13062026007 PF2 + PR13062026008): edita a "caixa do plano"
// VIVA — módulos padrões (ON/OFF) + os VALORES inclusos do plano (parcela, trial,
// assentos padrões, valor do assento extra e quotas deep/enriquecimento/cards).
// Editar aqui vale ao vivo para todas as empresas do plano que NÃO têm post-it
// (exceção por empresa, só no HBX Full).
//   GET /modules/master/plan/:planKey/modules  → { items, planInfo }
//   PUT /modules/master/plan/:planKey/modules  → { modules, planInfo }
//
// Régua do dono 13/06: "Valor do Assento extra" só edita se houver assento padrão
// (> 0). Persiste em PlanModuleConfig.planInfoJson (override do catálogo). As
// regras de LIMITE (deep/enriquecimento/cards) ainda vão ser refeitas — aqui só
// guardamos os valores da caixa.
// Lei 5 (design system): zero estilo visual inline — só classes centrais + layout.

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const PLANOS = [
  { key: "hbx_lite", label: "HBX List" },
  { key: "hbx_padrao", label: "HBX Lead Plus" },
  { key: "hbx_melhor", label: "HBX Full" },
];

type ModItem = { key: string; name: string; enabled: boolean };
type PlanInfo = {
  monthlyPrice: number; includedUsers: number; extraUserMonthly: number;
  trialDays: number; deepSearchesPerDay: number; enrichmentsPerDay: number; cardsPerMonth: number;
};
type IncForm = { price: string; trial: string; seats: string; extra: string; deep: string; enrich: string; cards: string };

const num = (s: string) => Number(String(s).replace(",", ".").trim());
const str = (n: number | null | undefined) => (n != null ? String(n) : "");

function infoToForm(pi: PlanInfo | null): IncForm {
  return {
    price: str(pi?.monthlyPrice),
    trial: str(pi?.trialDays),
    seats: str(pi?.includedUsers),
    extra: str(pi?.extraUserMonthly),
    deep: str(pi?.deepSearchesPerDay),
    enrich: str(pi?.enrichmentsPerDay),
    cards: str(pi?.cardsPerMonth),
  };
}

export function PlanosEditor() {
  const [plano, setPlano] = useState("hbx_lite");
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [form, setForm] = useState<IncForm>({ price: "", trial: "", seats: "", extra: "", deep: "", enrich: "", cards: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback((planKey: string) => {
    // setState só no callback assíncrono (regra react-hooks/set-state-in-effect).
    apiFetch<{ items?: ModItem[]; planInfo?: PlanInfo }>(`/modules/master/plan/${encodeURIComponent(planKey)}/modules`)
      .then(res => {
        setItems(Array.isArray(res?.items) ? res.items : []);
        setForm(infoToForm(res?.planInfo || null));
        setMsg(null);
      })
      .catch(() => { setItems([]); setForm(infoToForm(null)); setMsg("Falha ao carregar o plano."); });
  }, []);

  useEffect(() => { carregar(plano); }, [plano, carregar]);

  function alternar(key: string) {
    setItems(prev => (prev || []).map(it => it.key === key ? { ...it, enabled: !it.enabled } : it));
  }

  // Sem assento padrão (<= 0) → não há assento extra: tranca e zera o campo.
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
        monthlyPrice: form.price,
        trialDays: form.trial,
        includedUsers: form.seats,
        extraUserMonthly: semAssentoBase ? "0" : form.extra,
        deepSearchesPerDay: form.deep,
        enrichmentsPerDay: form.enrich,
        cardsPerMonth: form.cards,
      };
      const res = await apiFetch<{ planInfo?: PlanInfo }>(`/modules/master/plan/${encodeURIComponent(plano)}/modules`, {
        method: "PUT",
        body: JSON.stringify({ modules, planInfo }),
      });
      if (res?.planInfo) setForm(infoToForm(res.planInfo));
      setMsg("✓ Plano salvo (módulos e valores). Vale ao vivo para todas as empresas deste plano (sem post-it).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Planos — módulos padrões</h2>
        <div className="meta">
          <select className="field-dark" value={plano} onChange={e => setPlano(e.target.value)}>
            {PLANOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button className="btn-teal" disabled={busy || !items} onClick={salvar}>{busy ? "Salvando…" : "Salvar plano"}</button>
        </div>
      </div>

      <div style={{ padding: "12px 16px 16px", display: "grid", gap: 12 }}>
        <div className="meta">Editar aqui vale ao vivo para todas as empresas deste plano. A exceção por empresa (post-it) fica só no HBX Full, dentro da empresa.</div>
        {msg && <div className="meta">{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>
          {/* Esquerda — módulos padrões (ON/OFF). */}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Módulo</th><th>Nome</th><th>Padrão</th></tr></thead>
              <tbody>
                {items === null && <tr><td colSpan={3} className="meta">Carregando…</td></tr>}
                {items?.length === 0 && <tr><td colSpan={3} className="meta">Sem módulos.</td></tr>}
                {(items || []).map(it => (
                  <tr key={it.key}>
                    <td>{it.key}</td>
                    <td>{it.name}</td>
                    <td>
                      <button className="btn-ghost" disabled={busy} onClick={() => alternar(it.key)}>
                        {it.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Direita — inclusos do plano (parcela/trial/assentos/quotas). */}
          <aside style={{ display: "grid", gap: 12 }}>
            <strong>Inclusos no plano</strong>

            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Parcela (R$/mês)</label>
              <input className="field-dark" inputMode="decimal" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Trial (dias)</label>
              <input className="field-dark" inputMode="numeric" value={form.trial}
                onChange={e => setForm(f => ({ ...f, trial: e.target.value }))} placeholder="0" />
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Assentos Padrões</label>
              <input className="field-dark" inputMode="numeric" value={form.seats}
                onChange={e => setSeats(e.target.value)} placeholder="0" />
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Valor do Assento extra (R$/mês)</label>
              <input className="field-dark" inputMode="decimal" value={semAssentoBase ? "" : form.extra}
                disabled={semAssentoBase} placeholder={semAssentoBase ? "sem assento base" : "0,00"}
                onChange={e => setForm(f => ({ ...f, extra: e.target.value }))} />
            </div>

            <div className="sep" />

            <span className="field-label">Quotas — limites em revisão (serão refeitos)</span>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Deep Search (por dia)</label>
              <input className="field-dark" inputMode="numeric" value={form.deep}
                onChange={e => setForm(f => ({ ...f, deep: e.target.value }))} placeholder="0" />
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Enriquecimento (por dia)</label>
              <input className="field-dark" inputMode="numeric" value={form.enrich}
                onChange={e => setForm(f => ({ ...f, enrich: e.target.value }))} placeholder="0" />
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <label className="field-label">Cards (por mês)</label>
              <input className="field-dark" inputMode="numeric" value={form.cards}
                onChange={e => setForm(f => ({ ...f, cards: e.target.value }))} placeholder="0" />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
