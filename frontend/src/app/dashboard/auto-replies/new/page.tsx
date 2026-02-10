"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiFetch, getToken } from "../../_lib/api";
import { RuleForm, RuleFormValue } from "../_components/RuleForm";

export default function NewRulePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

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

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Nova regra</h1>
            <p className="text-sm text-foreground/70">
              Defina o padrão e a sequência de respostas.
            </p>
          </div>
          <Link
            href="/dashboard/auto-replies"
            className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
          >
            Voltar
          </Link>
        </div>

        <div className="border border-foreground/10 rounded-2xl p-4 bg-background">
          <RuleForm initial={initial} submitLabel="Criar regra" onSubmit={onSubmit} />
        </div>
      </div>
    </main>
  );
}
