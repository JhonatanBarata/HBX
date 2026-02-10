"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getToken } from "../../_lib/api";
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
  const id = Number(params.id);
  const [rule, setRule] = useState<AutoReplyRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    (async () => {
      setError(null);
      try {
        const list = await apiFetch<AutoReplyRule[]>("/auto-replies/rules");
        const found = list.find((r) => r.id === id) ?? null;
        if (!found) throw new Error("Regra não encontrada");
        setRule(found);
      } catch (e: any) {
        setError(e?.message ?? "Falha ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const initial: RuleFormValue | null = useMemo(() => {
    if (!rule) return null;
    return {
      enabled: rule.enabled,
      priority: rule.priority,
      matchType: (rule.matchType === "CONTAINS" ? "CONTAINS" : "EXACT") as any,
      pattern: rule.pattern,
      caseInsensitive: rule.caseInsensitive,
      responses: [...(rule.responses ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ order: r.order, delaySeconds: r.delaySeconds ?? 0, template: r.template })),
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

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Editar regra #{id}</h1>
            <p className="text-sm text-foreground/70">Atualize padrão e respostas.</p>
          </div>
          <Link
            href="/dashboard/auto-replies"
            className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
          >
            Voltar
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
            {error}
          </div>
        )}

        {loading || !initial ? (
          <p className="text-sm text-foreground/70">Carregando...</p>
        ) : (
          <div className="border border-foreground/10 rounded-2xl p-4 bg-background">
            <RuleForm initial={initial} submitLabel="Salvar" onSubmit={onSubmit} />
          </div>
        )}
      </div>
    </main>
  );
}
