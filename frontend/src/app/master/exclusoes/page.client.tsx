"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxConfirmDialog from "@/components/HbxConfirmDialog";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

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

type RadarExcludedCard = {
  id: string;
  companyId?: number | null;
  companyName?: string | null;
  radarLeadId?: string | null;
  vendasLeadId?: string | null;
  status: "discarded" | "complaint" | string;
  reason?: string | null;
  lastActionAt?: string | null;
  updatedAt?: string | null;
  lead?: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    website?: string | null;
    status?: string | null;
    opportunityScore?: number | null;
  };
};

type Payload = {
  modules: ModuleItem[];
  records: DeletionItem[];
  radarCards?: RadarExcludedCard[];
  radarSummary?: {
    total?: number;
    discarded?: number;
    complaint?: number;
  };
};

export default function ExclusoesMasterClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);
  const [data, setData] = useState<Payload>({ modules: [], records: [], radarCards: [] });
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [moduleKey, setModuleKey] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ item: DeletionItem; motivo: string } | null>(null);
  const [batchDialog, setBatchDialog] = useState<{ confirmText: string; motivo: string } | null>(null);
  const [restoreDialog, setRestoreDialog] = useState<{ item: RadarExcludedCard; motivo: string } | null>(null);

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
      setData(payload || { modules: [], records: [], radarCards: [] });
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

  async function permanentDelete(item: DeletionItem, motivo: string) {

    setBusyId(item.id);
    setError(null);
    setInfo(null);
    try {
      await apiFetch(`/modules/master/exclusoes/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo: motivo || undefined }),
      });
      setInfo(`Registro #${item.id} removido da fila de exclusões.`);
      setDeleteDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir permanentemente");
    } finally {
      setBusyId(null);
    }
  }

  async function permanentDeleteBatch(confirmText: string, motivo: string) {
    const secondText = confirmText.trim();
    if (secondText.length < 10) {
      setError('Confirmação inválida: digite pelo menos 10 caracteres para continuar.');
      return;
    }

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
      setBatchDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na limpeza em lote');
    } finally {
      setBusyBatch(false);
    }
  }

  async function restoreRadarCard(item: RadarExcludedCard, motivo: string) {
    setBusyId(Number.NaN);
    setError(null);
    setInfo(null);
    try {
      await apiFetch(`/modules/master/exclusoes/radar-cards/${encodeURIComponent(item.id)}/restore`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: motivo || undefined }),
      });
      setInfo(`Card ${item.lead?.name || item.radarLeadId || item.id} removido da fila de exclusão.`);
      setRestoreDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover card da exclusão");
    } finally {
      setBusyId(null);
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
          <Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>
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
            onClick={() => setBatchDialog({ confirmText: "", motivo: "" })}
          >
            {busyBatch ? 'Limpando lote...' : 'Limpeza em lote (filtros atuais)'}
          </button>
        </div>
      </section>

      <section className="panel p-4 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Cards removidos/reclamados</h2>
            <p className="text-sm text-muted mt-1">
              Reclamações: {data.radarSummary?.complaint || 0} · Removidos: {data.radarSummary?.discarded || 0}
            </p>
          </div>
        </div>
        {loading ? <div className="text-sm text-muted mt-2">Carregando...</div> : null}
        {!loading && !(data.radarCards || []).length ? <div className="text-sm text-muted mt-2">Nenhum card removido ou reclamado encontrado.</div> : null}

        <div className="space-y-2 mt-3">
          {(data.radarCards || []).map((item) => (
            <article key={item.id} className="border border-[var(--line)] rounded-[12px] bg-[var(--surface-soft)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {item.lead?.name || "Card sem nome"} · {item.status === "complaint" ? "Reclamação" : "Removido"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Empresa: {item.companyName ? `${item.companyName} (#${item.companyId})` : item.companyId || "-"} · Lead: {item.radarLeadId || "-"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {[item.lead?.phone, item.lead?.city && item.lead?.state ? `${item.lead.city}/${item.lead.state}` : item.lead?.city || item.lead?.state, item.lead?.segment].filter(Boolean).join(" · ") || "Sem dados comerciais"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Motivo: {item.reason || "-"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Atualizado em: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRestoreDialog({ item, motivo: "" })}
                >
                  Remover da remoção
                </button>
              </div>
            </article>
          ))}
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
                    }}
                  >
                    Ver detalhes
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => setDeleteDialog({ item, motivo: "" })}
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
                    } catch {
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

      <HbxConfirmDialog
        open={restoreDialog !== null}
        title={restoreDialog ? `Restaurar ${restoreDialog.item.lead?.name || "card"}` : "Restaurar card"}
        description="O card volta a ficar liberado para esta empresa no Radar. A reclamação registrada no histórico não é apagada."
        confirmLabel="Remover da remoção"
        busy={busyId !== null}
        onCancel={() => setRestoreDialog(null)}
        onConfirm={() => {
          if (restoreDialog) void restoreRadarCard(restoreDialog.item, restoreDialog.motivo.trim());
        }}
      >
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Motivo (opcional)
        </label>
        <textarea
          className="field min-h-[96px]"
          value={restoreDialog?.motivo || ""}
          onChange={(event) =>
            setRestoreDialog((current) => current ? { ...current, motivo: event.target.value } : current)
          }
          placeholder="Descreva por que este card deve sair da remoção."
        />
      </HbxConfirmDialog>

      <HbxConfirmDialog
        open={deleteDialog !== null}
        title={deleteDialog ? `Excluir registro #${deleteDialog.item.id}` : "Excluir registro"}
        description="A limpeza permanente remove o item da auditoria de exclusões. Essa ação não volta pelo HBX."
        confirmLabel="Excluir permanente"
        destructive
        busy={deleteDialog ? busyId === deleteDialog.item.id : false}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (deleteDialog) void permanentDelete(deleteDialog.item, deleteDialog.motivo.trim());
        }}
      >
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Motivo (opcional)
        </label>
        <textarea
          className="field min-h-[96px]"
          value={deleteDialog?.motivo || ""}
          onChange={(event) =>
            setDeleteDialog((current) => current ? { ...current, motivo: event.target.value } : current)
          }
          placeholder="Descreva por que este registro será limpo permanentemente."
        />
      </HbxConfirmDialog>

      <HbxConfirmDialog
        open={batchDialog !== null}
        title="Limpeza em lote"
        description="A limpeza usará os filtros atuais da tela. Digite uma confirmação com pelo menos 10 caracteres antes de continuar."
        confirmLabel="Limpar lote"
        destructive
        busy={busyBatch}
        confirmDisabled={!batchDialog || batchDialog.confirmText.trim().length < 10}
        onCancel={() => setBatchDialog(null)}
        onConfirm={() => {
          if (batchDialog) void permanentDeleteBatch(batchDialog.confirmText, batchDialog.motivo.trim());
        }}
      >
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Confirmação
        </label>
        <input
          className="field"
          value={batchDialog?.confirmText || ""}
          onChange={(event) =>
            setBatchDialog((current) => current ? { ...current, confirmText: event.target.value } : current)
          }
          placeholder="Digite ao menos 10 caracteres"
        />
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Motivo (opcional)
        </label>
        <textarea
          className="field min-h-[96px]"
          value={batchDialog?.motivo || ""}
          onChange={(event) =>
            setBatchDialog((current) => current ? { ...current, motivo: event.target.value } : current)
          }
          placeholder="Descreva o motivo da limpeza em lote."
        />
      </HbxConfirmDialog>
    </DashboardScaffold>
  );
}
