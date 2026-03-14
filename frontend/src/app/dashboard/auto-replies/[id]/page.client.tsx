"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";
import { RuleForm, RuleFormValue } from "../_components/RuleForm";

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

export default function EditRuleClientPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const id = Number(params.id);
  const [rule, setRule] = useState<AutoReplyRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const list = await apiFetch<AutoReplyRule[]>("/auto-replies/rules");
        const found = list.find((item) => item.id === id) ?? null;
        if (!found) throw new Error("Regra nao encontrada.");
        setRule(found);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar regra.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken, id]);

  const initial: RuleFormValue | null = useMemo(() => {
    if (!rule) return null;
    return {
      enabled: rule.enabled,
      priority: rule.priority,
      matchType: (rule.matchType === "CONTAINS" ? "CONTAINS" : "EXACT") as RuleFormValue["matchType"],
      pattern: rule.pattern,
      caseInsensitive: rule.caseInsensitive,
      responses: [...(rule.responses ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((response) => ({
          order: response.order,
          delaySeconds: response.delaySeconds ?? 0,
          template: response.template,
        })),
    };
  }, [rule]);

  async function onSubmit(value: RuleFormValue) {
    await apiFetch(`/auto-replies/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: value.enabled,
        priority: value.priority,
        matchType: value.matchType,
        pattern: value.pattern,
        caseInsensitive: value.caseInsensitive,
        responses: value.responses,
      }),
    });
    router.push("/dashboard/auto-replies");
  }

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
      title={`Editar regra #${id}`}
      description="Atualize condicoes de disparo, prioridade e respostas da automacao."
      actions={
        <Link href="/dashboard/auto-replies" className="btn btn-secondary btn-sm">
          Voltar para lista
        </Link>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading || !initial ? (
        <section className="panel p-4 text-sm text-muted">Carregando regra...</section>
      ) : (
        <section className="panel p-4">
          <RuleForm initial={initial} submitLabel="Salvar alteracoes" onSubmit={onSubmit} />
        </section>
      )}
    </DashboardScaffold>
  );
}
