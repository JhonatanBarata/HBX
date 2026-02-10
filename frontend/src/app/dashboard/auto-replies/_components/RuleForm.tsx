"use client";

import { useMemo, useState } from "react";

export type RuleFormValue = {
  enabled: boolean;
  priority: number;
  matchType: "EXACT" | "CONTAINS";
  pattern: string;
  caseInsensitive: boolean;
  responses: Array<{ order: number; delaySeconds: number; template: string }>;
};

export function RuleForm(props: {
  initial: RuleFormValue;
  submitLabel: string;
  onSubmit: (value: RuleFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<RuleFormValue>(props.initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!value.pattern.trim()) return false;
    if (!value.responses.length) return false;
    if (value.responses.some((r) => !r.template.trim())) return false;
    return true;
  }, [value]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const normalized: RuleFormValue = {
        ...value,
        pattern: value.pattern.trim(),
        responses: value.responses
          .map((r, idx) => ({
            order: Number.isFinite(r.order) ? r.order : idx,
            delaySeconds: Number.isFinite(r.delaySeconds) ? r.delaySeconds : 0,
            template: r.template,
          }))
          .sort((a, b) => a.order - b.order),
      };
      await props.onSubmit(normalized);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function setResponse(index: number, patch: Partial<RuleFormValue["responses"][number]>) {
    setValue((v) => {
      const copy = [...v.responses];
      copy[index] = { ...copy[index], ...patch };
      return { ...v, responses: copy };
    });
  }

  function addResponse() {
    setValue((v) => {
      const nextOrder = v.responses.length ? Math.max(...v.responses.map((r) => r.order)) + 1 : 0;
      return {
        ...v,
        responses: [...v.responses, { order: nextOrder, delaySeconds: 0, template: "" }],
      };
    });
  }

  function removeResponse(index: number) {
    setValue((v) => {
      const copy = [...v.responses];
      copy.splice(index, 1);
      return { ...v, responses: copy };
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Match</label>
          <select
            className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
            value={value.matchType}
            onChange={(e) => setValue((v) => ({ ...v, matchType: e.target.value as any }))}
          >
            <option value="EXACT">EXACT</option>
            <option value="CONTAINS">CONTAINS</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Prioridade</label>
          <input
            type="number"
            className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
            value={value.priority}
            onChange={(e) => setValue((v) => ({ ...v, priority: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Padrão (pattern)</label>
        <input
          className="w-full mt-1 p-2 border border-foreground/10 rounded-xl font-mono bg-background"
          value={value.pattern}
          onChange={(e) => setValue((v) => ({ ...v, pattern: e.target.value }))}
          placeholder='Ex.: olá'
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => setValue((v) => ({ ...v, enabled: e.target.checked }))}
          />
          Ativa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.caseInsensitive}
            onChange={(e) => setValue((v) => ({ ...v, caseInsensitive: e.target.checked }))}
          />
          Case-insensitive
        </label>
      </div>

      <div className="border border-foreground/10 rounded-2xl p-4 bg-background">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Sequência de respostas</h2>
            <p className="text-xs text-foreground/70">
              Use <span className="font-mono">{"{{greeting}}"}</span>,{" "}
              <span className="font-mono">{"{{companyName}}"}</span>,{" "}
              <span className="font-mono">{"{{from}}"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={addResponse}
            className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
          >
            Adicionar
          </button>
        </div>

        {value.responses.length === 0 ? (
          <p className="text-sm text-foreground/70">Adicione ao menos 1 resposta.</p>
        ) : (
          <div className="space-y-3">
            {value.responses
              .map((r, idx) => ({ r, idx }))
              .map(({ r, idx }) => (
                <div key={idx} className="border border-foreground/10 rounded-2xl p-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-foreground/70">order</label>
                      <input
                        type="number"
                        className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
                        value={r.order}
                        onChange={(e) => setResponse(idx, { order: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-foreground/70">delaySeconds</label>
                      <input
                        type="number"
                        className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
                        value={r.delaySeconds}
                        onChange={(e) => setResponse(idx, { delaySeconds: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeResponse(idx)}
                        className="w-full px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-foreground/70">template</label>
                    <textarea
                      className="w-full mt-1 p-2 border border-foreground/10 rounded-xl font-mono bg-background"
                      rows={3}
                      value={r.template}
                      onChange={(e) => setResponse(idx, { template: e.target.value })}
                      placeholder="Ex.: {{greeting}}! Aqui está nosso cardápio..."
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <button
        disabled={!canSubmit || saving}
        className="w-full py-2 rounded-xl bg-primary text-background hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Salvando..." : props.submitLabel}
      </button>
    </form>
  );
}
