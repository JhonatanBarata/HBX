"use client";

// Sistema → Planos (PR13062026007 PF2): edita os MÓDULOS PADRÕES de cada plano —
// a "caixa do plano" viva. Editar aqui vale ao vivo para todas as empresas do
// plano que NÃO têm post-it (exceção por empresa, só no HBX Full).
//   GET /modules/master/plan/:planKey/modules  → { items: [{key,name,enabled}] }
//   PUT /modules/master/plan/:planKey/modules  → { modules: { key: bool } }
// Lei 5 (design system): zero estilo visual inline — só classes centrais do kit.

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

const brl = (n: number) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PlanosEditor() {
  const [plano, setPlano] = useState("hbx_lite");
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback((planKey: string) => {
    // setState só no callback assíncrono (regra react-hooks/set-state-in-effect).
    apiFetch<{ items?: ModItem[]; planInfo?: PlanInfo }>(`/modules/master/plan/${encodeURIComponent(planKey)}/modules`)
      .then(res => { setItems(Array.isArray(res?.items) ? res.items : []); setInfo(res?.planInfo || null); setMsg(null); })
      .catch(() => { setItems([]); setInfo(null); setMsg("Falha ao carregar o plano."); });
  }, []);

  useEffect(() => { carregar(plano); }, [plano, carregar]);

  function alternar(key: string) {
    setItems(prev => (prev || []).map(it => it.key === key ? { ...it, enabled: !it.enabled } : it));
  }

  async function salvar() {
    if (busy || !items) return;
    setBusy(true);
    setMsg(null);
    try {
      const modules: Record<string, boolean> = {};
      for (const it of items) modules[it.key] = it.enabled;
      await apiFetch(`/modules/master/plan/${encodeURIComponent(plano)}/modules`, {
        method: "PUT",
        body: JSON.stringify({ modules }),
      });
      setMsg("✓ Plano salvo. Vale ao vivo para todas as empresas deste plano (sem post-it).");
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
      <div className="tbl-wrap">
        <div className="meta">Editar aqui vale ao vivo para todas as empresas deste plano. A exceção por empresa (post-it) fica só no HBX Full, dentro da empresa.</div>
        {info && (
          <div className="meta">
            Parcela {brl(info.monthlyPrice)}/mês · {info.includedUsers} assento(s) inclusos{info.extraUserMonthly > 0 ? ` · extra ${brl(info.extraUserMonthly)}/mês cada` : " · sem assento extra"} · Deep search {info.deepSearchesPerDay}/dia · Enriquecimento {info.enrichmentsPerDay}/dia · {info.cardsPerMonth} cards/mês{info.trialDays > 0 ? ` · trial ${info.trialDays} dias` : ""}
          </div>
        )}
        {msg && <div className="meta">{msg}</div>}
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
    </section>
  );
}
