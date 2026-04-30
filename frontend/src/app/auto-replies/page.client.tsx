"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxConfirmDialog from "@/components/HbxConfirmDialog";
import { apiFetch } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type AutoReplyResponse = {
  id: number;
  order: number;
  delaySeconds: number;
  template: string;
};

type AutoReplyRule = {
  id: number;
  enabled: boolean;
  priority: number;
  matchType: "EXACT" | "CONTAINS" | string;
  pattern: string;
  caseInsensitive: boolean;
  responses: AutoReplyResponse[];
};

export default function AutoRepliesListClientPage() {
  const hasToken = useRequireAuth();
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<AutoReplyRule[]>("/auto-replies/rules");
      setRules(data);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar regras.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoading(true);
    return startSmartPolling(load, { intervalMs: 10000, immediate: true });
  }, [hasToken, load]);

  async function removeRule(id: number) {
    setBusyId(id);
    setError(null);

    try {
      await apiFetch(`/auto-replies/rules/${id}`, { method: "DELETE" });
      setDeleteRuleId(null);
      await load();
    } catch (removeError) {
      const message =
        removeError instanceof Error ? removeError.message : "Falha ao excluir regra.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = useMemo(() => rules.filter((rule) => rule.enabled).length, [rules]);
  const pausedCount = rules.length - activeCount;

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }
  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Respostas automaticas"
      description="Padrao de respostas com prioridade, delay e regras condicionais."
      actions={
        <>
          <Link href="/messages" className="btn btn-secondary btn-sm">
            Mensagens e logs
          </Link>
          <Link href="/auto-replies/new" className="btn btn-primary btn-sm">
            Nova regra
          </Link>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="metrics-grid">
        <article className="stat-card">
          <p className="stat-card__label">Total de regras</p>
          <p className="stat-card__value">{rules.length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Ativas</p>
          <p className="stat-card__value">{activeCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Pausadas</p>
          <p className="stat-card__value">{pausedCount}</p>
        </article>
      </section>

      <HbxConfirmDialog
        open={deleteRuleId !== null}
        title="Excluir regra automática"
        description="Essa regra deixará de responder novos atendimentos imediatamente."
        confirmLabel="Excluir regra"
        destructive
        busy={busyId === deleteRuleId}
        onCancel={() => setDeleteRuleId(null)}
        onConfirm={() => {
          if (deleteRuleId !== null) void removeRule(deleteRuleId);
        }}
      />

      {loading ? (
        <div className="panel p-4 text-sm text-muted">Carregando regras...</div>
      ) : rules.length === 0 ? (
        <section className="panel p-5">
          <p className="text-sm text-muted">Nenhuma regra cadastrada.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {rules.map((rule) => (
            <article key={rule.id} className="panel panel-interactive p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-brand">#{rule.id}</span>
                    <span className={`badge ${rule.enabled ? "badge-success" : "badge-danger"}`}>
                      {rule.enabled ? "ATIVA" : "PAUSADA"}
                    </span>
                    <span className="badge">{rule.matchType}</span>
                    <span className="badge">prioridade {rule.priority}</span>
                  </div>

                  <p className="mt-2 text-sm">
                    <span className="text-muted">Padrao: </span>
                    <span className="mono break-all">{rule.pattern}</span>
                    {rule.caseInsensitive ? (
                      <span className="text-muted"> (ignorar maiusculas/minusculas)</span>
                    ) : null}
                  </p>

                  <div className="mt-3">
                    <p className="text-xs text-muted mb-1">Sequencia de respostas</p>
                    <ol className="space-y-1">
                      {[...rule.responses]
                        .sort((a, b) => a.order - b.order)
                        .map((response) => (
                          <li key={response.id} className="text-sm leading-relaxed">
                            <span className="text-muted">[{response.order}]</span>{" "}
                            <span className="text-muted">(+{response.delaySeconds}s)</span>{" "}
                            <span className="mono break-words">{response.template}</span>
                          </li>
                        ))}
                    </ol>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <Link
                    href={`/auto-replies/${rule.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Editar
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === rule.id}
                    onClick={() => setDeleteRuleId(rule.id)}
                    className="btn btn-danger btn-sm"
                  >
                    {busyId === rule.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </DashboardScaffold>
  );
}
