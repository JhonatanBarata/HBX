"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";
import { RuleForm, RuleFormValue } from "../_components/RuleForm";

export default function NewRulePage() {
  const router = useRouter();
  const hasToken = useRequireAuth();

  const initial: RuleFormValue = {
    enabled: true,
    priority: 0,
    matchType: "EXACT",
    pattern: "",
    caseInsensitive: true,
    responses: [{ order: 0, delaySeconds: 0, template: "{{greeting}}!" }],
  };

  async function onSubmit(value: RuleFormValue) {
    await apiFetch("/auto-replies/rules", {
      method: "POST",
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
      title="Nova regra"
      description="Defina o padrao de acionamento e a sequencia das mensagens."
      actions={
        <Link href="/dashboard/auto-replies" className="btn btn-secondary btn-sm">
          Voltar para lista
        </Link>
      }
    >
      <section className="panel p-4">
        <RuleForm initial={initial} submitLabel="Criar regra" onSubmit={onSubmit} />
      </section>
    </DashboardScaffold>
  );
}
