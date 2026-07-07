"use client";

// MOBILE-CASCA/W4 — LISTA de empresas (mockup aprovado 3). Topo "Empresas" +
// "+ Nova" + busca (nome/CNPJ/cidade) + stats 1 linha + linhas 60px (avatar
// quadrado 32 iniciais, nome, "cidade/UF · segmento", badge única, chevron).
// ≥8 visíveis. Dados: MESMO endpoint do desktop — GET /nucleo/empresas
// (mesma paginação/filtro; aqui sem UF pra caber no orçamento de cromo, o
// campo de busca já cobre nome/CNPJ/cidade). Zero endpoint novo.

import React, { useEffect, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import { CascaLoading } from "../loading";
import {
  fmtCnpj,
  initials,
  localCityUf,
  papelBadge,
  type EmpresaListResponse,
} from "./empresas-types";

export function EmpresasLista({
  onOpen,
  onNova,
  reloadKey,
}: {
  onOpen: (id: string) => void;
  onNova: () => void;
  reloadKey: number;
}) {
  const [data, setData] = useState<EmpresaListResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const qs = new URLSearchParams();
      if (busca) qs.set("query", busca);
      try {
        const res = await apiFetch<EmpresaListResponse>(`/nucleo/empresas?${qs.toString()}`);
        if (!alive) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar as empresas.");
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [busca, reloadKey, retryKey]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusca(buscaInput.trim());
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalClientes = items.filter((e) => e.isCliente).length;

  if (loading && !data) return <CascaLoading caption="Carregando empresas…" />;

  return (
    <div className="emp-m__body">
      {/* FIX4: painel de comando único (.casca-command, casca.css) — mesmo
          contrato visual de Vendas/Conversas. Reprova do dono: título
          "Empresas" duplicado (MobileShell já mostra no topo da casca — o
          cabeçalho interno foi removido, igual ao caso do W3/Conversas);
          "+ Nova" migrou pra dentro do painel, ao lado da busca. Linha 1 =
          busca+"+ Nova"; linha 2 = stats. */}
      <div className="casca-command">
        <form className="emp-m__searchbar" onSubmit={submitSearch}>
          <div className="emp-m__searchfield">
            <I d={ICONS.search} size={14} />
            <input
              className="emp-m__searchinput"
              placeholder="Nome, CNPJ ou cidade…"
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
            />
          </div>
          <button type="button" className="emp-m__nova" onClick={onNova}>
            <I d={ICONS.plus} size={14} /> Nova
          </button>
        </form>

        <div className="emp-m__stats">
          {total} {total === 1 ? "empresa" : "empresas"} · {totalClientes} {totalClientes === 1 ? "cliente" : "clientes"}
          {loading ? " · carregando…" : ""}
        </div>
      </div>

      {error ? (
        <div className="emp-m__empty">
          <I d={ICONS.empresas} size={28} />
          <p>{error}</p>
          <button type="button" className="btn-ghost btn-xs" onClick={() => setRetryKey((k) => k + 1)}>Tentar novamente</button>
        </div>
      ) : items.length === 0 ? (
        <div className="emp-m__empty">
          <I d={ICONS.empresas} size={28} />
          <p>Cadastre a primeira empresa.</p>
          <button type="button" className="btn-teal emp-m__empty-cta" onClick={onNova}>
            <I d={ICONS.plus} size={14} /> Nova empresa
          </button>
        </div>
      ) : (
        <div className="emp-m__list">
          {items.map((e) => {
            const badge = papelBadge(e);
            const cidadeUf = localCityUf(e.cidade, e.uf);
            const segmento = e.origin || "";
            const sub = [cidadeUf, segmento].filter(Boolean).join(" · ");
            return (
              <button type="button" key={e.id} className="emp-m__row" onClick={() => onOpen(e.id)}>
                <span className="emp-m__ico" aria-hidden="true">{initials(e.name)}</span>
                <span className="emp-m__row-main">
                  <span className="emp-m__row-name">{e.name || "(sem nome)"}</span>
                  <span className="emp-m__row-sub">{sub || fmtCnpj(e.cnpj)}</span>
                </span>
                {badge ? <span className={"emp-m__badge is-" + badge.tone}>{badge.label}</span> : null}
                <I d={ICONS.arrow} size={14} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
