"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";

type ModuleItem = { key: string; name: string };

type DeletionItem = {
  id: number;
  moduleKey: string;
  entityType: string;
  entityId: string;
  companyId?: number | null;
  motivo?: string | null;
  deletedAt: string;
  company?: { id: number; name: string } | null;
  deletedBy?: { id: number; username?: string | null; email?: string | null } | null;
  snapshot?: string | null;
};

type Payload = {
  modules: ModuleItem[];
  records: DeletionItem[];
};

export default function ExclusoesMasterClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);
  const [data, setData] = useState<Payload>({ modules: [], records: [] });
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedSnapshotError, setSelectedSnapshotError] = useState<string | null>(null);
  const [moduleKey, setModuleKey] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (moduleKey) params.set("moduleKey", moduleKey);
    if (companyId) params.set("companyId", companyId);
    if (search) params.set("search", search);
    return params.toString();
  }, [moduleKey, companyId, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<Payload>(`/modules/master/exclusoes${query ? `?${query}` : ""}`);
      setData(payload || { modules: [], records: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar exclusões");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (hasToken !== true) return;
    load();
  }, [hasToken, load]);

  async function permanentDelete(item: DeletionItem) {
    const motivo = (prompt(`Motivo para limpeza permanente do registro #${item.id} (opcional):`, "") || "").trim();
    const ok = confirm(`Confirma exclusão permanente do registro #${item.id}?`);
    if (!ok) return;

    setBusyId(item.id);
    setError(null);
    setInfo(null);
    try {
      await apiFetch(`/modules/master/exclusoes/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo: motivo || undefined }),
      });
      setInfo(`Registro #${item.id} removido da fila de exclusões.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir permanentemente");
    } finally {
      setBusyId(null);
    }
  }

  async function permanentDeleteBatch() {
    const first = confirm("Confirma iniciar limpeza em lote para os filtros atuais?");
    if (!first) return;

    const secondText = (prompt('Confirmação dupla: digite pelo menos 10 caracteres para confirmar a limpeza em lote', '') || '').trim();
    if (secondText.length < 10) {
      setError('Confirmação inválida: digite pelo menos 10 caracteres para continuar.');
      return;
    }

    const motivo = (prompt('Motivo da limpeza em lote (opcional):', '') || '').trim();

    setBusyBatch(true);
    setError(null);
    setInfo(null);
    try {
      const payload = await apiFetch<{ ok: boolean; affected: number }>(`/modules/master/exclusoes/batch`, {
        method: 'DELETE',
        body: JSON.stringify({
          moduleKey: moduleKey || undefined,
          companyId: companyId ? Number(companyId) : undefined,
          motivo: motivo || undefined,
          confirmText: secondText,
        }),
      });
      setInfo(`Limpeza em lote concluída. Registros afetados: ${payload?.affected ?? 0}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na limpeza em lote');
    } finally {
      setBusyBatch(false);
    }
  }

  if (hasToken === null) {
    return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  }
  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Exclusões"
      description="Auditoria de itens deletados e limpeza permanente (MASTER)."
      actions={
        <div className="flex gap-2">
          <button type="button" onClick={load} className="btn btn-primary btn-sm">Atualizar</button>
          <Link href="/dashboard/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>
        </div>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {info ? <div className="msg-info"><div className="text-sm">{info}</div></div> : null}

      <section className="panel p-4">
        <h2 className="text-lg font-semibold">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
          <select className="field" value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
            <option value="">Todos os módulos</option>
            {data.modules.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          </select>
          <input className="field" placeholder="Company ID" value={companyId} onChange={(e) => setCompanyId(e.target.value.replace(/[^0-9]/g, ""))} />
          <input className="field" placeholder="Buscar por entidade/motivo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busyBatch}
            onClick={permanentDeleteBatch}
          >
            {busyBatch ? 'Limpando lote...' : 'Limpeza em lote (filtros atuais)'}
          </button>
        </div>
      </section>

      <section className="panel p-4 mt-3">
        <h2 className="text-lg font-semibold">Itens deletados</h2>
        {loading ? <div className="text-sm text-muted mt-2">Carregando...</div> : null}
        {!loading && data.records.length === 0 ? <div className="text-sm text-muted mt-2">Nenhum item encontrado.</div> : null}

        <div className="space-y-2 mt-3">
          {data.records.map((item) => (
            <article key={item.id} className="border border-[var(--line)] rounded-[12px] bg-[var(--surface-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">#{item.id} • {item.moduleKey} • {item.entityType} #{item.entityId}</p>
                  <p className="text-xs text-muted mt-1">
                    Empresa: {item.company ? `${item.company.name} (#${item.company.id})` : "-"} • Deletado em: {new Date(item.deletedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Por: {item.deletedBy?.username || item.deletedBy?.email || "-"}
                  </p>
                  <p className="text-xs text-muted mt-1">Motivo: {item.motivo || "-"}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedSnapshot(item.snapshot || null);
                      setSelectedSnapshotError(null);
                    }}
                  >
                    Ver detalhes
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => permanentDelete(item)}
                  >
                    {busyId === item.id ? "Limpando..." : "Excluir permanente"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedSnapshot !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded p-4 max-w-3xl w-full">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Detalhes do registro</h3>
              <button className="btn btn-ghost" onClick={() => setSelectedSnapshot(null)}>Fechar</button>
            </div>
            <div className="mt-3">
              {selectedSnapshot ? (
                <pre className="text-xs overflow-auto max-h-80 bg-[var(--surface-soft)] p-2 rounded">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedSnapshot), null, 2);
                    } catch (err) {
                      return selectedSnapshot;
                    }
                  })()}
                </pre>
              ) : (
                <div className="text-sm text-muted">Nenhum snapshot disponível.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
