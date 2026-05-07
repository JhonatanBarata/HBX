"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type CardPedido = {
  id: number;
  numeroPedido: string;
  fornecedor?: string | null;
  pais?: string | null;
  usdTotal?: number | null;
  cambio?: number | string | null;
  valorDolarCambio?: number | string | null;
  previsaoEmbarque?: string | null;
  status: string;
  statusColor: string;
};

type CardTransito = {
  id: number;
  numeroPedido: string;
  fornecedor?: string | null;
  dataEmbarque?: string | null;
  dataAtracacao?: string | null;
  diasRestantes?: number | null;
  progresso: number;
  dolar?: number | null;
  peso?: number | null;
  status: string;
  statusColor: string;
};

type CardConcluida = {
  id: number;
  pedido: string;
  dataChegada?: string | null;
  rsKgFinal?: number | null;
  dolar?: number | null;
  status: string;
  statusColor: string;
};

type FollowupGlobalPayload = {
  resumo: {
    emTransito: number;
    emProducao: number;
    concluidas: number;
    usdTotalEmAberto: number;
    pesoTotalVindo: number;
  };
  bloco1: CardPedido[];
  bloco2: CardTransito[];
  bloco3: CardConcluida[];
};

type Filters = {
  numero: string;
  pais: string;
  fornecedor: string;
  de: string;
  ate: string;
  status: string;
  dolarMin: string;
  dolarMax: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString();
}

function fmtNum(v?: number | null, decimals = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function statusClass(color: string) {
  if (color === "green") return "badge badge-success";
  if (color === "red") return "badge badge-danger";
  if (color === "yellow") return "badge";
  return "badge badge-brand";
}

export default function FollowupGlobalClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FollowupGlobalPayload | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingForce, setDeletingForce] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deletingReason, setDeletingReason] = useState("");
  const [filters, setFilters] = useState<Filters>({
    numero: "",
    pais: "",
    fornecedor: "",
    de: "",
    ate: "",
    status: "",
    dolarMin: "",
    dolarMax: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await apiFetch<FollowupGlobalPayload>(`/importacoes/followup-global${queryString ? `?${queryString}` : ""}`);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar follow-up global.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const rsEmAberto = useMemo(() => {
    if (!data) return null;
    let sum = 0;
    (data.bloco1 || []).forEach((it) => {
      const usd = Number(it.usdTotal || 0);
      // try to use a conversion present on the item (campo 'cambio' or 'valorDolar' if present), fallback to 1
      const cambio = Number(it.cambio || it.valorDolarCambio || 1) || 1;
      sum += usd * cambio;
    });
    return sum;
  }, [data]);

  useEffect(() => {
    if (hasToken !== true) return;
    // fetch current user to determine admin role
    (async () => {
      try {
        const me = await apiFetch<{ role?: string }>("/profile/current-user");
        setIsAdmin(String(me?.role || "").toUpperCase() === "ADMIN");
      } catch {
        setIsAdmin(false);
      }
    })();
    load();
  }, [hasToken, load]);

  async function doDelete(id: number, force = false, reason?: string) {
    setDeletingBusy(true);
    setError(null);
    try {
      await apiFetch(`/importacoes/${id}${force ? '?force=true' : ''}`, { method: 'DELETE', body: JSON.stringify({ motivo: reason || null }) });
      setDeletingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir pedido');
    } finally {
      setDeletingBusy(false);
    }
  }

  if (hasToken === null) {
    return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  }
  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Follow up internacional"
      description="Visao executiva das importacoes em producao, em transito e concluidas."
      actions={
        <div className="flex gap-2">
          <button type="button" onClick={load} className="btn btn-primary btn-sm">Atualizar</button>
          <Link href="/importacoes/novo" className="btn btn-success btn-sm">Novo pedido</Link>
          <Link href="/importacoes/historico" className="btn btn-secondary btn-sm">Historico</Link>
        </div>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="panel p-4">
        <h2 className="text-lg font-semibold">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
          <input className="field" placeholder="Buscar numero do pedido" value={filters.numero} onChange={(e) => setFilters((p) => ({ ...p, numero: e.target.value }))} />
          <input className="field" placeholder="Pais" value={filters.pais} onChange={(e) => setFilters((p) => ({ ...p, pais: e.target.value }))} />
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
          <input className="field" type="date" value={filters.de} onChange={(e) => setFilters((p) => ({ ...p, de: e.target.value }))} />
          <input className="field" type="date" value={filters.ate} onChange={(e) => setFilters((p) => ({ ...p, ate: e.target.value }))} />
          <input className="field" placeholder="Dolar min" value={filters.dolarMin} onChange={(e) => setFilters((p) => ({ ...p, dolarMin: e.target.value }))} />
          <input className="field" placeholder="Dolar max" value={filters.dolarMax} onChange={(e) => setFilters((p) => ({ ...p, dolarMax: e.target.value }))} />
        </div>
      </section>

      {deletingId ? (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => { if (!deletingBusy) setDeletingId(null); }} />
          <div className="bg-white rounded shadow p-4 z-10 w-full max-w-md">
            <h3 className="font-semibold text-lg">Confirmar exclusão</h3>
            <p className="text-sm text-muted mt-2">Deseja realmente excluir o pedido {deletingId}? Esta ação é permanente.</p>
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={deletingForce} onChange={(e) => setDeletingForce(e.target.checked)} />
              <span className="text-sm">Forçar exclusão (remover dependências como logs/alertas)</span>
            </label>
            <div className="mt-3">
              <label className="text-sm text-muted block mb-1">Motivo (opcional)</label>
              <input className="field" value={deletingReason} onChange={(e) => setDeletingReason(e.target.value)} placeholder="Descreva o motivo da exclusão" />
            </div>
            {error ? <div className="alert alert-error mt-2">{error}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => { if (!deletingBusy) setDeletingId(null); }} disabled={deletingBusy}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => { if (!deletingBusy && deletingId) doDelete(deletingId, deletingForce, deletingReason); }} disabled={deletingBusy}>{deletingBusy ? 'Excluindo...' : 'Excluir'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="metrics-grid">
        <article className="stat-card"><p className="stat-card__label">Em transito</p><p className="stat-card__value">{data?.resumo.emTransito ?? 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">Em producao</p><p className="stat-card__value">{data?.resumo.emProducao ?? 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">Concluidas</p><p className="stat-card__value">{data?.resumo.concluidas ?? 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">USD em aberto</p><p className="stat-card__value">{fmtNum(data?.resumo.usdTotalEmAberto)}</p></article>
        <article className="stat-card"><p className="stat-card__label">R$ em aberto</p><p className="stat-card__value">{rsEmAberto !== null ? fmtNum(rsEmAberto) : "-"}</p></article>
        <article className="stat-card"><p className="stat-card__label">Peso vindo (kg)</p><p className="stat-card__value">{fmtNum(data?.resumo.pesoTotalVindo)}</p></article>
      </section>

      {loading ? <div className="panel p-4 text-sm text-muted">Carregando...</div> : null}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Pedido e producao</h2>
          <div className="space-y-2 mt-3">
            {(data?.bloco1 || []).map((item) => (
              <div key={item.id} className="border border-[var(--line)] rounded-[12px] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Pedido {item.numeroPedido}</p>
                  <div className="flex items-center gap-2">
                    <span className={statusClass(item.statusColor)}>{item.status.replaceAll("_", " ")}</span>
                    <Link href={`/importacoes/editar/${item.id}`} className="btn btn-secondary btn-sm" title="Editar pedido" aria-label="Editar pedido">✏️</Link>
                    {isAdmin ? (
                      <button type="button" className="btn btn-danger btn-sm" title="Excluir pedido" aria-label="Excluir pedido" onClick={() => { setDeletingId(item.id); setDeletingForce(false); }}>
                        ✖
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted mt-1">Fornecedor: {item.fornecedor || "-"}</p>
                <p className="text-sm text-muted">Pais: {item.pais || "-"}</p>
                <p className="text-sm text-muted">USD total: {fmtNum(item.usdTotal)}</p>
                <p className="text-sm text-muted">Previsao embarque: {fmtDate(item.previsaoEmbarque)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Em transito</h2>
          <div className="space-y-2 mt-3">
            {(data?.bloco2 || []).map((item) => (
              <div key={item.id} className="border border-[var(--line)] rounded-[12px] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Pedido {item.numeroPedido}</p>
                  <div className="flex items-center gap-2">
                    <span className={statusClass(item.statusColor)}>{item.status.replaceAll("_", " ")}</span>
                    <Link href={`/importacoes/editar/${item.id}`} className="btn btn-secondary btn-sm" title="Editar pedido" aria-label="Editar pedido">✏️</Link>
                    {isAdmin ? (
                      <button type="button" className="btn btn-danger btn-sm" title="Excluir pedido" aria-label="Excluir pedido" onClick={() => { setDeletingId(item.id); setDeletingForce(false); }}>
                        ✖
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted mt-1">Fornecedor: {item.fornecedor || "-"}</p>
                <p className="text-sm text-muted">Embarque: {fmtDate(item.dataEmbarque)} | Atracacao: {fmtDate(item.dataAtracacao)}</p>
                <p className="text-sm text-muted">Dias restantes: {item.diasRestantes ?? "-"}</p>
                <div className="mt-2 h-2 rounded-full bg-[var(--line)] overflow-hidden">
                  <div className="h-full bg-[var(--brand)]" style={{ width: `${Math.max(0, Math.min(100, item.progresso || 0))}%` }} />
                </div>
                <p className="text-xs text-muted mt-1">Progresso: {fmtNum(item.progresso, 1)}%</p>
                <p className="text-sm text-muted">Dolar: {fmtNum(item.dolar)} | Peso: {fmtNum(item.peso)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Concluidas</h2>
          <div className="space-y-2 mt-3">
            {(data?.bloco3 || []).map((item) => (
              <div key={item.id} className="border border-[var(--line)] rounded-[12px] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Pedido {item.pedido}</p>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-success">Finalizado</span>
                    {isAdmin ? (
                      <>
                        <Link href={`/importacoes/editar/${item.id}`} className="btn btn-secondary btn-sm" title="Editar pedido" aria-label="Editar pedido">✏️</Link>
                        <button type="button" className="btn btn-danger btn-sm" title="Excluir pedido" aria-label="Excluir pedido" onClick={() => { setDeletingId(item.id); setDeletingForce(false); }}>
                          ✖
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted mt-1">Data chegada: {fmtDate(item.dataChegada)}</p>
                <p className="text-sm text-muted">R$/kg final: {fmtNum(item.rsKgFinal, 4)}</p>
                <p className="text-sm text-muted">Dolar usado: {fmtNum(item.dolar)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </DashboardScaffold>
  );
}
