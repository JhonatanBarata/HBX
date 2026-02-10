"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, clearToken, getToken } from "../_lib/api";

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
  const router = useRouter();
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const hasToken = useMemo(() => Boolean(getToken()), []);

  async function load() {
    setError(null);
    try {
      const data = await apiFetch<AutoReplyRule[]>("/auto-replies/rules");
      setRules(data);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar regras");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeRule(id: number) {
    if (!confirm("Excluir esta regra?")) return;
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/auto-replies/rules/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  if (!hasToken) {
    return null;
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Respostas Automáticas</h1>
            <p className="text-sm text-foreground/70">
              Placeholders: <span className="font-mono">{"{{greeting}}"}</span>,{" "}
              <span className="font-mono">{"{{companyName}}"}</span>,{" "}
              <span className="font-mono">{"{{from}}"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/messages"
              className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            >
              Teste & Logs
            </Link>
            <Link
              href="/dashboard/auto-replies/new"
              className="px-3 py-2 rounded-xl bg-secondary text-foreground text-sm hover:opacity-90"
            >
              Nova regra
            </Link>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            >
              Sair
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-foreground/70">Carregando...</p>
        ) : rules.length === 0 ? (
          <div className="p-6 border border-foreground/10 rounded-2xl bg-background">
            <p className="text-sm text-foreground/70">Nenhuma regra cadastrada.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((r) => (
              <div key={r.id} className="border border-foreground/10 rounded-2xl p-4 bg-background">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">#{r.id}</span>
                      <span className="text-xs px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5">
                        {r.enabled ? "ATIVA" : "PAUSADA"}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5">
                        {r.matchType}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5">
                        prioridade {r.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="text-foreground/70">Padrão: </span>
                      <span className="font-mono">{r.pattern}</span>
                      {r.caseInsensitive ? (
                        <span className="text-foreground/60"> (ignore case)</span>
                      ) : null}
                    </p>
                    <div className="mt-3">
                      <p className="text-xs text-foreground/70 mb-1">Respostas</p>
                      <ol className="space-y-1">
                        {[...r.responses]
                          .sort((a, b) => a.order - b.order)
                          .map((resp) => (
                            <li key={resp.id} className="text-sm">
                              <span className="text-foreground/60">[{resp.order}]</span>{" "}
                              <span className="text-foreground/60">(+{resp.delaySeconds}s)</span>{" "}
                              <span className="font-mono wrap-break-word">{resp.template}</span>
                            </li>
                          ))}
                      </ol>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      href={`/dashboard/auto-replies/${r.id}`}
                      className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm text-center"
                    >
                      Editar
                    </Link>
                    <button
                      disabled={busyId === r.id}
                      onClick={() => removeRule(r.id)}
                      className="px-3 py-2 rounded-xl border border-foreground/10 text-sm hover:bg-foreground/5 disabled:opacity-50"
                    >
                      {busyId === r.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
