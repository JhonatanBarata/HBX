"use client";

// PR27072026 F2 (27/07, PR27072026-ROTA-3-NIVEIS) — ESTOQUE DE CARGA: conferência
// de caminhão do dia. NÃO é almoxarifado/WMS — 1 tela, 2 números por produto:
//   1) Declara o que subiu no caminhão (produto + qtd carregada).
//   2) A tela mostra o VENDIDO ao vivo (soma das entregas 'entregue' do dia, já
//      calculada no backend) e o RETORNO ESPERADO (carregado − vendido).
//   3) No fim do dia, confere o retorno de verdade por produto → fecha a carga
//      (imutável) com o resultado bateu/sobrou/faltou por item.
//
// Contratos reais (company-scoped, JWT; POSTs são ADMIN-only no backend):
//   - GET  /logistica/estoque/carga?date=YYYY-MM-DD        → CargaDiaDTO
//   - POST /logistica/estoque/carga {itens:[...]}          → CargaDiaDTO
//   - POST /logistica/estoque/carga/conferir {itens:[...]} → CargaDiaDTO
// Recurso ADVANCED+: sem o nível, o GET/POST devolvem 403. 28/07 — o 403 NÃO é
// erro vermelho de tela quebrada: é o VENDEDOR SILENCIOSO. A tela mostra o selo
// .plano-selo "Disponível no Advanced" (F1 item 3 — ver-mas-não-usar), MESMO
// padrão do showFullGate de /logistica/rastreamento. Qualquer outro erro segue
// no aviso vermelho com a mensagem do backend (humanError).
//
// Design system (5 Leis): casco reusa .log-agenda/.log-agenda__surface/
// .log-agenda__head (MESMO padrão de /logistica/importar e Saúde da Base);
// tabela reusa .tbl-wrap/.tbl (financeiro/gerencial); card do formulário reusa
// .log-cfg__block (config); a linha produto+qtd reusa .log-agenda-form__section/
// .log-agenda-form__products/.log-agenda-product/.log-agenda-form__field/
// .log-agenda-product__remove/.log-agenda-form__add — o MESMO stepper da Agenda
// Semanal (weekly-agenda.tsx), zero classe nova; cor do resultado reusa
// .is-ok/.is-danger (tokens --hbx-success/--hbx-danger, já usados em Saúde da
// Base). Inline aqui é só layout.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Produto = { id: number; nome: string; unidade: string | null; usaLogistica: boolean };

type Resultado = "bateu" | "sobrou" | "faltou";

type CargaItem = {
  id: string | null;
  productId: number;
  produtoNome: string | null;
  unidade: string | null;
  qtdCarregada: number;
  qtdVendida: number;
  qtdEsperadaRetorno: number;
  qtdRetorno: number | null;
  resultado: Resultado | null;
};

type CargaDia = {
  id: string | null;
  dataISO: string;
  status: "ABERTA" | "CONFERIDA" | null;
  declarada: boolean;
  conferidaAt: string | null;
  itens: CargaItem[];
};

const RESULTADO_LABEL: Record<Resultado, string> = { bateu: "Bateu", sobrou: "Sobrou", faltou: "Faltou" };

function resultadoClass(r: Resultado | null): string {
  if (r === "bateu") return "is-ok";
  if (r === "sobrou" || r === "faltou") return "is-danger";
  return "";
}

function humanError(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar o estoque de carga.";
}

/** 403 do gate de nível (BASIC) — vira selo de plano, nunca erro vermelho. */
function isGateDePlano(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 403;
}

function fmtHora(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type DeclararLinha = { productId: string; qtd: string };

export function EstoqueCargaClient() {
  const [dados, setDados] = useState<CargaDia | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<DeclararLinha[]>([{ productId: "", qtd: "" }]);
  const [retorno, setRetorno] = useState<Record<number, string>>({});
  // 28/07 — plano BASIC: o backend recusa com 403 e a tela vira convite de upgrade.
  const [semPlano, setSemPlano] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<CargaDia>("/logistica/estoque/carga")
      .then((res) => {
        setDados(res);
        setError(null);
        setSemPlano(false);
        setRetorno({});
      })
      .catch((err: unknown) => {
        if (isGateDePlano(err)) {
          setSemPlano(true);
          setError(null);
          return;
        }
        setError(humanError(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    apiFetch<Produto[]>("/logistica/produtos").then(setProdutos).catch(() => setProdutos([]));
  }, []);

  const produtosDisponiveis = useMemo(
    () => produtos.filter((p) => p.usaLogistica),
    [produtos],
  );

  function addLinha() {
    setLinhas((prev) => [...prev, { productId: "", qtd: "" }]);
  }

  function removerLinha(index: number) {
    setLinhas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function atualizarLinha(index: number, patch: Partial<DeclararLinha>) {
    setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, ...patch } : linha)));
  }

  async function declarar() {
    const itens = linhas
      .map((linha) => ({ productId: Number(linha.productId), qtdCarregada: Math.max(0, Math.trunc(Number(linha.qtd) || 0)) }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0);
    if (itens.length === 0) {
      setFeedback("Escolha ao menos 1 produto com quantidade.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<CargaDia>("/logistica/estoque/carga", { method: "POST", body: JSON.stringify({ itens }) });
      setDados(res);
      setLinhas([{ productId: "", qtd: "" }]);
      setError(null);
    } catch (err) {
      setFeedback(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function conferir() {
    if (!dados) return;
    const itens = dados.itens.map((item) => ({
      productId: item.productId,
      qtdRetorno: Math.max(0, Math.trunc(Number(retorno[item.productId]) || 0)),
    }));
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<CargaDia>("/logistica/estoque/carga/conferir", { method: "POST", body: JSON.stringify({ itens }) });
      setDados(res);
      setError(null);
    } catch (err) {
      setFeedback(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  const status = dados?.status ?? null;

  return (
    <section className="log-agenda hbx-page-mobile-enter">
      <div className="log-agenda__surface">
        <header className="log-agenda__head">
          <div className="log-agenda__head-main">
            <div className="log-agenda__head-copy">
              <h2>Estoque de carga</h2>
              <p>
                {semPlano
                  ? "Carregou, vendeu, voltou — a conferência do caminhão do dia."
                  : status === "CONFERIDA"
                    ? "Carga do dia conferida — carregado, vendido e retorno de cada produto."
                    : status === "ABERTA"
                      ? "O vendido é atualizado sozinho a cada entrega confirmada. No fim do dia, confira o retorno."
                      : "Declare o que subiu no caminhão hoje — produto e quantidade."}
              </p>
            </div>
          </div>
          {!semPlano && (
            <div className="log-agenda__actions">
              <button type="button" className="btn-ghost btn-xs" onClick={() => void load()} disabled={loading}>
                <span aria-hidden>↻</span> {loading ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          )}
        </header>

        {semPlano && (
          <div className="emp-empty" aria-label="Recurso do plano Advanced">
            <span className="plano-selo">Disponível no Advanced</span>
            <strong className="emp-empty__title">Estoque de carga é do plano Advanced</strong>
            <span className="emp-empty__text">
              Você declara o que subiu no caminhão, o sistema abate cada entrega confirmada e no fim do dia
              mostra o que tinha que voltar — bateu, sobrou ou faltou, produto por produto.
            </span>
          </div>
        )}

        {loading && !dados && (
          <div className="log-agenda__feedback">
            <strong>Carregando o estoque de carga…</strong>
          </div>
        )}

        {error && (
          <div className="log-agenda__feedback is-error">
            <strong>Não carregou</strong>
            <span>{error}</span>
          </div>
        )}

        {feedback && (
          <div className="log-agenda__feedback is-error">
            <span>{feedback}</span>
          </div>
        )}

        {dados && !error && !dados.declarada && (
          <div className="log-cfg__block">
            <div className="log-cfg__block-head">
              <strong className="log-cfg__block-title">Declarar carga do dia</strong>
            </div>

            <section className="log-agenda-form__section">
              <div className="log-agenda-form__products">
                {linhas.map((linha, index) => (
                  <div className="log-agenda-product" key={index}>
                    <label className="log-agenda-form__field">
                      <span>Produto</span>
                      <select
                        className="field-dark"
                        value={linha.productId}
                        onChange={(e) => atualizarLinha(index, { productId: e.target.value })}
                      >
                        <option value="">Escolha</option>
                        {produtosDisponiveis.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}{p.unidade ? ` · ${p.unidade}` : ""}</option>
                        ))}
                      </select>
                    </label>
                    <label className="log-agenda-form__field">
                      <span>Qtd.</span>
                      <input
                        className="field-dark"
                        type="number"
                        min={0}
                        step={1}
                        value={linha.qtd}
                        onChange={(e) => atualizarLinha(index, { qtd: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="log-agenda-product__remove"
                      aria-label="Remover produto"
                      onClick={() => removerLinha(index)}
                      disabled={linhas.length === 1}
                    >
                      <I d={ICONS.trash} size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-ghost btn-xs log-agenda-form__add" onClick={addLinha}>
                <I d={ICONS.plus} size={13} /> Produto
              </button>
            </section>

            <div className="log-agenda__actions">
              <button type="button" className="btn-teal" onClick={() => void declarar()} disabled={busy}>
                {busy ? "Declarando…" : "Declarar carga"}
              </button>
            </div>
          </div>
        )}

        {dados && !error && dados.declarada && (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Carregado</th>
                    <th>Vendido</th>
                    <th>Retorno esperado</th>
                    <th>Retorno</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map((item) => (
                    <tr key={item.id ?? item.productId}>
                      <td>{item.produtoNome || "Produto"}{item.unidade ? ` (${item.unidade})` : ""}</td>
                      <td>{item.qtdCarregada}</td>
                      <td>{item.qtdVendida}</td>
                      <td>{item.qtdEsperadaRetorno}</td>
                      <td>
                        {status === "CONFERIDA" ? (
                          <span className={resultadoClass(item.resultado)}>
                            {item.qtdRetorno} · {item.resultado ? RESULTADO_LABEL[item.resultado] : "—"}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="field-dark"
                            value={retorno[item.productId] ?? ""}
                            onChange={(e) => setRetorno((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {status === "ABERTA" && (
              <div className="log-agenda__actions">
                <button type="button" className="btn-teal" onClick={() => void conferir()} disabled={busy}>
                  {busy ? "Conferindo…" : "Confirmar conferência"}
                </button>
              </div>
            )}

            {status === "CONFERIDA" && (
              <p className="log-agenda-form__success">
                Carga conferida{dados.conferidaAt ? ` às ${fmtHora(dados.conferidaAt)}` : ""}.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
