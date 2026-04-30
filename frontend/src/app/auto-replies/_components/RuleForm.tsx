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
    if (value.responses.some((response) => !response.template.trim())) return false;
    return true;
  }, [value]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const normalized: RuleFormValue = {
        ...value,
        pattern: value.pattern.trim(),
        responses: value.responses
          .map((response, idx) => ({
            order: Number.isFinite(response.order) ? response.order : idx,
            delaySeconds: Number.isFinite(response.delaySeconds) ? response.delaySeconds : 0,
            template: response.template,
          }))
          .sort((a, b) => a.order - b.order),
      };
      await props.onSubmit(normalized);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Falha ao salvar regra.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function setResponse(index: number, patch: Partial<RuleFormValue["responses"][number]>) {
    setValue((current) => {
      const copy = [...current.responses];
      copy[index] = { ...copy[index], ...patch };
      return { ...current, responses: copy };
    });
  }

  function addResponse() {
    setValue((current) => {
      const nextOrder = current.responses.length
        ? Math.max(...current.responses.map((response) => response.order)) + 1
        : 0;
      return {
        ...current,
        responses: [...current.responses, { order: nextOrder, delaySeconds: 0, template: "" }],
      };
    });
  }

  function removeResponse(index: number) {
    setValue((current) => {
      const copy = [...current.responses];
      copy.splice(index, 1);
      return { ...current, responses: copy };
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Match type</label>
          <select
            className="field mt-1"
            value={value.matchType}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                matchType: event.target.value as RuleFormValue["matchType"],
              }))
            }
          >
            <option value="EXACT">EXACT</option>
            <option value="CONTAINS">CONTAINS</option>
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Prioridade</label>
          <input
            type="number"
            className="field mt-1"
            value={value.priority}
            onChange={(event) =>
              setValue((current) => ({ ...current, priority: Number(event.target.value) }))
            }
          />
        </div>
      </div>

      <div>
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Padrao (pattern)
        </label>
        <input
          className="field mt-1 mono"
          value={value.pattern}
          onChange={(event) => setValue((current) => ({ ...current, pattern: event.target.value }))}
          placeholder="Ex.: ola"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Regra ativa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.caseInsensitive}
            onChange={(event) =>
              setValue((current) => ({ ...current, caseInsensitive: event.target.checked }))
            }
          />
          Ignorar maiusculas/minusculas
        </label>
      </div>

      <div className="panel panel-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Sequencia de respostas</h2>
            <p className="text-xs text-muted mt-1">
              Placeholders: <span className="mono">{"{{greeting}}"}</span>,{" "}
              <span className="mono">{"{{companyName}}"}</span>,{" "}
              <span className="mono">{"{{from}}"}</span>
            </p>
          </div>
          <button type="button" onClick={addResponse} className="btn btn-secondary btn-sm">
            Adicionar resposta
          </button>
        </div>

        {value.responses.length === 0 ? (
          <p className="text-sm text-muted">Adicione ao menos uma resposta automatica.</p>
        ) : (
          <div className="space-y-3">
            {value.responses.map((response, index) => (
              <div key={index} className="border border-[var(--line)] rounded-[14px] p-3 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_160px] gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                      Ordem
                    </label>
                    <input
                      type="number"
                      className="field mt-1"
                      value={response.order}
                      onChange={(event) => setResponse(index, { order: Number(event.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                      Delay (s)
                    </label>
                    <input
                      type="number"
                      className="field mt-1"
                      value={response.delaySeconds}
                      onChange={(event) =>
                        setResponse(index, { delaySeconds: Number(event.target.value) })
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeResponse(index)}
                      className="btn btn-danger btn-sm w-full"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
                    Template da mensagem
                  </label>
                  <textarea
                    className="field mt-1 mono"
                    rows={3}
                    value={response.template}
                    onChange={(event) => setResponse(index, { template: event.target.value })}
                    placeholder="Ex.: {{greeting}}! Aqui esta nosso cardapio..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button disabled={!canSubmit || saving} className="btn btn-primary w-full" type="submit">
        {saving ? "Salvando..." : props.submitLabel}
      </button>
    </form>
  );
}
