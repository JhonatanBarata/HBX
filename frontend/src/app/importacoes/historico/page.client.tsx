"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type HistoricoRow = {
  id: number;
  pedido: string;
  fornecedor?: string | null;
  usd?: number | null;
  dolar?: number | null;
  peso?: number | null;
  rsKg?: number | null;
  status: string;
  dataAtracacao?: string | null;
};

type GraficoPoint = {
  dataEmbarque?: string | null;
  data?: string | null;
  rsKg?: number | null;
  valorUsd?: number | null;
  valorDolar?: number | null;
  pedido: string;
};

type GraficosPayload = {
  grafico1: GraficoPoint[];
  grafico2: GraficoPoint[];
};

function fmtNum(v?: number | null, decimals = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString();
}

function TinyLineChart({ points, valueKey, color }: { points: GraficoPoint[]; valueKey: "rsKg" | "valorUsd" | "valorDolar"; color: string }) {
  const values = points.map((p) => Number(p[valueKey])).filter((v) => Number.isFinite(v));
  if (!values.length) return <div className="text-xs text-muted">Sem dados</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalize = (v: number) => {
    if (max === min) return 50;
    return 90 - ((v - min) / (max - min)) * 80;
  };
  const stepX = points.length <= 1 ? 0 : 100 / (points.length - 1);
  const path = points
    .map((point, idx) => {
      const raw = Number(point[valueKey]);
      const y = Number.isFinite(raw) ? normalize(raw) : 90;
      const x = idx * stepX;
      return `${idx === 0 ? "M" : "L"} ${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-full h-32 border border-[var(--line)] rounded-[10px] bg-[var(--surface-soft)]">
      <path d={path} fill="none" stroke={color} strokeWidth={2.3} />
    </svg>
  );
}

export default function HistoricoImportacoesClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoricoRow[]>([]);
  const [charts, setCharts] = useState<GraficosPayload>({ grafico1: [], grafico2: [] });
  const [filters, setFilters] = useState({
    de: "",
    ate: "",
    fornecedor: "",
    status: "",
    porto: "",
    dolarMin: "",
    dolarMax: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [historico, graficos] = await Promise.all([
        apiFetch<HistoricoRow[]>(`/importacoes/historico${queryString ? `?${queryString}` : ""}`),
        apiFetch<GraficosPayload>(`/importacoes/graficos${queryString ? `?${queryString}` : ""}`),
      ]);
      setRows(historico || []);
      setCharts(graficos || { grafico1: [], grafico2: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar historico.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (hasToken !== true) return;
    load();
  }, [hasToken, load]);

  if (hasToken === null) {
    return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  }
  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Historico de importacoes"
      description="Filtro global de pedidos e historico financeiro com graficos temporais."
      actions={<button type="button" className="btn btn-primary btn-sm" onClick={load}>Atualizar</button>}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="panel p-4">
        <h2 className="text-lg font-semibold">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
          <input className="field" type="date" value={filters.de} onChange={(e) => setFilters((p) => ({ ...p, de: e.target.value }))} />
          <input className="field" type="date" value={filters.ate} onChange={(e) => setFilters((p) => ({ ...p, ate: e.target.value }))} />
          <input className="field" placeholder="Fornecedor" value={filters.fornecedor} onChange={(e) => setFilters((p) => ({ ...p, fornecedor: e.target.value }))} />
          <select className="field" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
            <option value="">Status</option>
            <option value="EM_CADASTRO">Em cadastro</option>
            <option value="EM_PRODUCAO">Em producao</option>
            <option value="EM_TRANSITO">Em transito</option>
            <option value="ATRACADO">Atracado</option>
            <option value="FINALIZADO">Finalizado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
          <input className="field" placeholder="Porto" value={filters.porto} onChange={(e) => setFilters((p) => ({ ...p, porto: e.target.value }))} />
          <input className="field" placeholder="Dolar minimo" value={filters.dolarMin} onChange={(e) => setFilters((p) => ({ ...p, dolarMin: e.target.value }))} />
          <input className="field" placeholder="Dolar maximo" value={filters.dolarMax} onChange={(e) => setFilters((p) => ({ ...p, dolarMax: e.target.value }))} />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Preco x Peso x Dolar</h2>
          <p className="text-xs text-muted mt-1">Linhas temporais por data de embarque.</p>
          <div className="mt-3 space-y-2">
            <div><p className="text-xs text-muted mb-1">R$/kg</p><TinyLineChart points={charts.grafico1 || []} valueKey="rsKg" color="#0b4f8a" /></div>
            <div><p className="text-xs text-muted mb-1">Valor USD</p><TinyLineChart points={charts.grafico1 || []} valueKey="valorUsd" color="#0f766e" /></div>
            <div><p className="text-xs text-muted mb-1">Valor dolar</p><TinyLineChart points={charts.grafico1 || []} valueKey="valorDolar" color="#b45309" /></div>
          </div>
        </article>
        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Historico do dolar</h2>
          <p className="text-xs text-muted mt-1">Valor de dolar usado por importacao.</p>
          <div className="mt-3">
            <TinyLineChart points={charts.grafico2 || []} valueKey="valorDolar" color="#334155" />
          </div>
        </article>
      </section>

      <section className="panel p-4 overflow-auto">
        <h2 className="text-lg font-semibold">Historico global</h2>
        {loading ? <p className="text-sm text-muted mt-2">Carregando...</p> : null}
        <table className="w-full mt-3 text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--line)]">
              <th className="py-2 pr-2">Pedido</th>
              <th className="py-2 pr-2">Fornecedor</th>
              <th className="py-2 pr-2">USD</th>
              <th className="py-2 pr-2">Dolar</th>
              <th className="py-2 pr-2">Peso</th>
              <th className="py-2 pr-2">R$/kg</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2">Data atracacao</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--line)]">
                <td className="py-2 pr-2">{row.pedido}</td>
                <td className="py-2 pr-2">{row.fornecedor || "-"}</td>
                <td className="py-2 pr-2">{fmtNum(row.usd)}</td>
                <td className="py-2 pr-2">{fmtNum(row.dolar)}</td>
                <td className="py-2 pr-2">{fmtNum(row.peso)}</td>
                <td className="py-2 pr-2">{fmtNum(row.rsKg, 4)}</td>
                <td className="py-2 pr-2">{row.status.replaceAll("_", " ")}</td>
                <td className="py-2 pr-2">{fmtDate(row.dataAtracacao)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={8} className="py-3 text-muted">Nenhum resultado encontrado.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </DashboardScaffold>
  );
}
