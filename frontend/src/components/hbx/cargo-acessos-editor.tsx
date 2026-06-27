"use client";

// Configurações → Equipe → "Padrão por cargo" (PR13062026007 P4 + lei do dono
// 27/06). Mostra os DOIS padrões de cargo lado a lado: Vendedor (editável — nasce
// no MÁXIMO operacional, o admin CORTA) e Gerente (read-only — herda tudo, menos
// o muro financeiro/valores). Acesso por CARGO, não por pessoa. Financeiro/
// Gerencial são muro no backend (nunca entram para vendedor). Só lista módulo que
// a empresa já tem ligado.
//   GET /modules/company/seller-cargo-access → { items:[{key,name,allowed}] }
//   PUT /modules/company/seller-cargo-access → { access:{[key]:boolean} }
// Lei 5 (design system): zero estilo visual inline — só classes centrais (kit)
// + layout. Espelha o padrão do planos-editor (tabela + ON/OFF + Salvar).

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CargoItem = { key: string; name: string; allowed: boolean };

export function CargoAcessosEditor() {
  const [items, setItems] = useState<CargoItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(() => {
    // setState só no callback assíncrono (regra react-hooks/set-state-in-effect).
    apiFetch<{ items?: CargoItem[] }>("/modules/company/seller-cargo-access")
      .then((res) => { setItems(Array.isArray(res?.items) ? res.items : []); setLoadErr(null); setMsg(null); })
      .catch((err) => { setItems([]); setLoadErr(err instanceof Error ? err.message : "Falha ao carregar os acessos do cargo."); });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function alternar(key: string) {
    setItems((prev) => (prev || []).map((it) => (it.key === key ? { ...it, allowed: !it.allowed } : it)));
  }

  async function salvar() {
    if (busy || !items) return;
    setBusy(true);
    setMsg(null);
    try {
      const access: Record<string, boolean> = {};
      for (const it of items) access[it.key] = it.allowed;
      await apiFetch("/modules/company/seller-cargo-access", { method: "PUT", body: JSON.stringify({ access }) });
      setMsg("✓ Acessos do cargo Vendedor salvos. Vale para todos os vendedores da empresa.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Padrão por cargo</h2>
        <div className="meta">
          <button className="btn-teal" disabled={busy || !items} onClick={salvar}>{busy ? "Salvando…" : "Salvar acessos"}</button>
        </div>
      </div>
      <div style={{ padding: "10px 16px 16px", display: "grid", gap: 14 }}>
        <div className="meta">
          Acesso por <strong>cargo</strong>, não por pessoa: vale para todos da empresa de uma vez.
          A regra que nunca muda: <strong>só o Admin vê valores</strong> (planos, cobrança). Para mexer numa
          pessoa específica, use <strong>“Acessos”</strong> na lista de membros acima.
        </div>
        {loadErr && <div className="meta">{loadErr}</div>}
        {msg && <div className="meta">{msg}</div>}

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
          {/* Padrão VENDEDOR — editável. Nasce no MÁXIMO operacional; aqui o admin CORTA. */}
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <strong>Vendedor</strong>
            <div className="meta">
              Nasce com <strong>tudo operacional ligado</strong> (Vendas, Radar, Atendimento, Cadastro, E-mail).
              Aqui você <strong>corta</strong> o que não quiser — e <strong>liga</strong> Bot/Website para quem confiar.
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Módulo</th><th>Vendedor recebe</th></tr></thead>
                <tbody>
                  {items === null && <tr><td colSpan={2} className="meta">Carregando…</td></tr>}
                  {items?.length === 0 && !loadErr && (
                    <tr><td colSpan={2} className="meta">A empresa não tem módulos liberáveis para vendedor. Ligue módulos da empresa primeiro.</td></tr>
                  )}
                  {(items || []).map((it) => (
                    <tr key={it.key}>
                      <td>{it.name}</td>
                      <td>
                        <button className="btn-ghost" disabled={busy} onClick={() => alternar(it.key)}>
                          {it.allowed ? "ON" : "OFF"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Padrão GERENTE — read-only. Herda tudo da empresa, menos o muro financeiro/valores. */}
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <strong>Gerente</strong>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Módulo</th><th>Gerente recebe</th></tr></thead>
                <tbody>
                  <tr><td>Tudo que a empresa tem ligado</td><td><span className="tag teal">HERDA</span></td></tr>
                  <tr><td>Financeiro / valores e planos</td><td><span className="tag">MURO</span></td></tr>
                </tbody>
              </table>
            </div>
            <div className="meta">
              O Gerente <strong>herda tudo</strong> automaticamente — não passa por esta peneira. A única
              porta fechada é <strong>valores</strong> (planos/cobrança): isso é só do Admin e <strong>nunca muda</strong>.
              Para promover alguém a Gerente, use <strong>“Gerenciar”</strong> na lista de membros.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
