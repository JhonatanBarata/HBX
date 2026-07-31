"use client";

// Modal GENÉRICO de importação em massa por planilha (Excel/CSV), reusado por
// Contatos e Produtos. Segue as 5 Leis: visual todo em classe central
// (.hbx-veil/.hbx-modal/.ctt-form/.field-dark/.btn-* do kit + .imp-* de screens.css).
// Inline aqui = só layout (display/gap/grid) — nada de cor/borda/sombra/fonte.
//
// Fluxo: o parse do arquivo acontece NO NAVEGADOR (SheetJS via import dinâmico —
// não incha o bundle inicial), gera um PREVIEW pro dono conferir ANTES de importar,
// e envia em LOTES de 200 linhas (cada requisição pequena → sem estourar body limit).
// O backend só valida e roda o caminho idempotente que já existe (createConta /
// products.import). Uma linha ruim não derruba a batelada.

import React, { useCallback, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

export type ImportColumn = {
  /** chave interna + nome do cabeçalho no modelo gerado. */
  key: string;
  /** texto do cabeçalho na planilha (também casado no parse, sem acento/caixa). */
  header: string;
  /** rótulo humano curto. */
  label: string;
  required?: boolean;
  /** "puxa para..." — explicação da coluna (modelo + ajuda). */
  hint?: string;
  /** apelidos extras aceitos como cabeçalho (ex.: "whatsapp" p/ telefone). */
  aliases?: string[];
};

export type ImportSchema = {
  title: string;
  /** singular pra mensagens ("contato" / "produto"). */
  entity: string;
  templateName: string;
  endpoint: string;
  columns: ImportColumn[];
  /** registro (valores por column.key) → linha da API, ou null pra PULAR a linha. */
  normalizeRow: (rec: Record<string, string | number>) => Record<string, unknown> | null;
  /** chaves da linha da API mostradas no preview (cabeçalho + valores). */
  previewKeys: { key: string; label: string }[];
};

type ImportResult = {
  total: number;
  imported: number;
  skipped: number;
  errors: { line: number; message: string; nome?: string; name?: string }[];
};

type Phase = "idle" | "parsing" | "preview" | "importing" | "done";

const CHUNK = 200;
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** lowercase, sem acento, só alfanumérico — pra casar cabeçalho tolerando variação. */
function tokenize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** "12,50" / "R$ 1.234,50" / 12.5 → número (pt-BR tolerante). undefined se vazio/ inválido. */
export function parsePlanilhaNumero(v: string | number | undefined | null): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  let t = String(v ?? "").replace(/[R$\s]/gi, "").trim();
  if (!t) return undefined;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); // pt-BR: ponto=milhar, vírgula=decimal
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** "sim"/"1"/"x"/"true" → true; resto → false. */
export function parsePlanilhaBool(v: string | number | undefined | null): boolean {
  return ["sim", "s", "1", "true", "x", "yes"].includes(String(v ?? "").trim().toLowerCase());
}

function str(v: string | number | undefined | null): string {
  return String(v ?? "").trim();
}

/** Lê a planilha (1ª aba) em memória: detecta cabeçalho, mapeia colunas e normaliza. */
async function parseFile(
  file: File,
  schema: ImportSchema,
): Promise<{ rows: Record<string, unknown>[]; totalData: number; skipped: number }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], totalData: 0, skipped: 0 };
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (!matrix.length) return { rows: [], totalData: 0, skipped: 0 };

  // Tokens conhecidos por coluna (header + label + aliases) → índice.
  const tokensByCol = schema.columns.map((c) =>
    new Set([tokenize(c.header), tokenize(c.label), ...(c.aliases || []).map(tokenize)].filter(Boolean)),
  );
  const known = new Set<string>();
  tokensByCol.forEach((set) => set.forEach((t) => known.add(t)));

  // Cabeçalho? Linha 0 vira cabeçalho quando ≥2 células casam com tokens conhecidos.
  const head = matrix[0] || [];
  const headMatches = head.reduce<number>((n, cell) => n + (known.has(tokenize(cell)) ? 1 : 0), 0);
  const hasHeader = headMatches >= 2;

  // Índice de cada coluna: por NOME quando há cabeçalho; senão POSICIONAL (A,B,C… = ordem do schema).
  const colIndex: number[] = schema.columns.map((_, i) => (hasHeader ? -1 : i));
  if (hasHeader) {
    head.forEach((cell, idx) => {
      const t = tokenize(cell);
      const col = tokensByCol.findIndex((set, ci) => colIndex[ci] === -1 && set.has(t));
      if (col >= 0) colIndex[col] = idx;
    });
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const cells of dataRows) {
    if (!cells || cells.every((c) => str(c) === "")) continue; // linha totalmente vazia
    const rec: Record<string, string | number> = {};
    schema.columns.forEach((c, ci) => {
      const idx = colIndex[ci];
      const cell = idx >= 0 ? cells[idx] : "";
      rec[c.key] = typeof cell === "number" ? cell : str(cell);
    });
    const api = schema.normalizeRow(rec);
    if (api) rows.push(api);
    else skipped++;
  }
  return { rows, totalData: rows.length + skipped, skipped };
}

async function baixarModelo(schema: ImportSchema) {
  const XLSX = await import("xlsx");
  const headers = schema.columns.map((c) => c.header);
  const wsDados = XLSX.utils.aoa_to_sheet([headers]);
  wsDados["!cols"] = schema.columns.map((c) => ({ wch: Math.max(14, c.header.length + 2) }));

  const info = [
    ["Coluna", "O que preencher", "Obrigatório"],
    ...schema.columns.map((c, i) => [
      `${LETRAS[i] || "?"} — ${c.header}`,
      c.hint || c.label,
      c.required ? "Sim" : "Não",
    ]),
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo["!cols"] = [{ wch: 20 }, { wch: 52 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDados, "Dados");
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instruções");
  XLSX.writeFile(wb, schema.templateName);
}

export function ImportPlanilhaModal({
  schema,
  onClose,
  onImported,
}: {
  schema: ImportSchema;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<{ rows: Record<string, unknown>[]; totalData: number; skipped: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const onPick = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      setResult(null);
      setFileName(file.name);
      setPhase("parsing");
      try {
        const out = await parseFile(file, schema);
        setParsed(out);
        setPhase("preview");
        if (out.rows.length === 0) {
          setError(`Nenhuma linha válida encontrada. Confira se a coluna "${schema.columns[0].header}" está preenchida.`);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Não consegui ler a planilha.");
        setPhase("idle");
      }
    },
    [schema],
  );

  const doImport = useCallback(async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setPhase("importing");
    setError(null);
    const agg: ImportResult = { total: 0, imported: 0, skipped: 0, errors: [] };
    const rows = parsed.rows;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const res = await apiFetch<ImportResult>(schema.endpoint, {
          method: "POST",
          body: JSON.stringify({ rows: chunk }),
        });
        agg.total += res.total;
        agg.imported += res.imported;
        agg.skipped += res.skipped;
        if (Array.isArray(res.errors)) agg.errors.push(...res.errors);
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      // linhas puladas no navegador (sem nome) entram na conta do skipped total.
      agg.skipped += parsed.skipped;
      setResult(agg);
      setPhase("done");
      if (agg.imported > 0) onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao importar.");
      setPhase("preview");
    }
  }, [parsed, schema, onImported]);

  const prontas = parsed?.rows.length ?? 0;
  const puladas = parsed?.skipped ?? 0;

  return (
    <div className="hbx-veil" onClick={onClose}>
      <div className="hbx-modal ctt-form imp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {schema.title}
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          {/* Explicação: qual coluna puxa o quê */}
          <p className="imp-intro">
            Monte uma planilha (Excel ou CSV) com uma linha por {schema.entity}. Cada coluna vira um campo:
          </p>
          <div className="imp-cols">
            {schema.columns.map((c, i) => (
              <div key={c.key} className={`imp-col${c.required ? " is-required" : ""}`}>
                <span className="imp-col__tag">{LETRAS[i] || "?"}</span>
                <span>
                  <span className="imp-col__name">{c.header}</span>
                  {c.hint && <span className="imp-col__hint"> — {c.hint}</span>}
                </span>
              </div>
            ))}
          </div>
          <p className="imp-intro">
            Só a coluna <strong>{schema.columns[0].header}</strong> é obrigatória. As demais são opcionais —
            preencha as que tiver. Baixe o modelo pra não errar a ordem.
          </p>

          <div className="imp-actions">
            <button type="button" className="btn-ghost" onClick={() => baixarModelo(schema)}>
              <I d={ICONS.download} size={13} /> Baixar modelo (.xlsx)
            </button>
            <label className="btn-teal" style={{ cursor: "pointer" }}>
              <I d={ICONS.upload} size={13} /> {fileName ? "Trocar planilha" : "Escolher planilha"}
              <input
                ref={fileRef}
                className="imp-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </label>
            {fileName && <span className="emp-row__sub" style={{ maxWidth: 200 }}>{fileName}</span>}
          </div>

          {phase === "parsing" && <p className="imp-progress">Lendo a planilha…</p>}

          {/* Preview antes de importar */}
          {parsed && phase !== "parsing" && prontas > 0 && (
            <>
              <div className="imp-summary">
                {prontas} {schema.entity}(s) pronto(s) pra importar
                {puladas > 0 && <small>{puladas} linha(s) ignorada(s) por não ter {schema.columns[0].header}.</small>}
              </div>
              <div className="imp-prev" style={{ "--imp-cols": schema.previewKeys.length } as React.CSSProperties}>
                <div className="imp-prev__row is-head">
                  {schema.previewKeys.map((p) => (
                    <span key={p.key} className="imp-prev__cell">{p.label}</span>
                  ))}
                </div>
                {parsed.rows.slice(0, 6).map((row, idx) => (
                  <div className="imp-prev__row" key={idx}>
                    {schema.previewKeys.map((p) => (
                      <span key={p.key} className="imp-prev__cell">{formatCell(row[p.key])}</span>
                    ))}
                  </div>
                ))}
              </div>
              {prontas > 6 && <p className="imp-progress">…e mais {prontas - 6}.</p>}
            </>
          )}

          {phase === "importing" && (
            <p className="imp-progress">Importando… {progress.done}/{progress.total}</p>
          )}

          {phase === "done" && result && (
            <div className="imp-summary">
              Pronto! {result.imported} {schema.entity}(s) importado(s).
              {result.skipped > 0 && <small>{result.skipped} linha(s) ignorada(s).</small>}
              {result.errors.length > 0 && (
                <div className="imp-errs">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <span key={i}>Linha {e.line}: {e.message}</span>
                  ))}
                  {result.errors.length > 5 && <span>…e mais {result.errors.length - 5} erro(s).</span>}
                </div>
              )}
            </div>
          )}

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          {phase === "done" ? (
            <button type="button" className="btn-teal" onClick={onClose}>Fechar</button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={onClose} disabled={phase === "importing"}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-teal"
                onClick={doImport}
                disabled={phase === "importing" || prontas === 0}
              >
                {phase === "importing" ? "Importando…" : `Importar ${prontas || ""} ${schema.entity}(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}
