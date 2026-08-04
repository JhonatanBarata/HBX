"use client";

// BLOCO ESTOQUE (fiscal F3) — extraído da tela /fiscal a pedido do dono (04/08):
// o estoque mora no MÓDULO Estoque (rota /produtos, menu "Estoque"), junto do
// cadastro de produtos — "dentro do estoque tem os produtos". O /fiscal ficou
// só com perfil/emissão/notas. Mesmos endpoints /fiscal/estoque/* (@Admin no
// backend) — renderizar apenas para admin com o modo HBX Gestão Fiscal ativo.
// Visual 100% classe central (família .fis-* de hbx-theme/fiscal-tenant.css,
// importada global no globals.css). ZERO style inline.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

// ------------------------------------------------------------------ TIPOS

type SaldoEstoque = { fisico: number; reservado: number; disponivel: number; faturado: number };

type EstoqueProdutoT = {
  id: string;
  nome: string;
  unidade: string | null;
  ncm: string | null;
  logisticaProductId: number | null;
  ativo: boolean;
  saldo: SaldoEstoque;
};

type ProdutoLogisticaT = { id: number; name: string; unidade: string | null };

type MovimentoEstoqueT = {
  id: string;
  produtoId: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  refChaveNfe: string | null;
  createdAt: string;
};

type PreviewXmlItem = {
  cProd: string;
  nome: string;
  ncm: string | null;
  unidade: string | null;
  quantidade: number;
  sugestaoProdutoId: string | null;
  sugestaoProdutoNome: string | null;
};

type PreviewXml = {
  chaveAcesso: string;
  emitenteNome: string | null;
  jaLancada: boolean;
  itens: PreviewXmlItem[];
};

// ------------------------------------------------------------------ RÓTULOS

const TIPO_MOVIMENTO: Record<string, string> = {
  ENTRADA_XML: "Entrada (XML compra)",
  ENTRADA_MANUAL: "Entrada manual",
  RESERVA: "Reserva (carga)",
  LIBERA_RESERVA: "Liberação (carga)",
  BAIXA_ENTREGA: "Baixa (entrega)",
  SAIDA_EMISSAO: "Saída (emissão)",
  PERDA: "Perda",
  INVENTARIO: "Inventário",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
  REVERSA_CANCELAMENTO: "Reversa (cancelamento)",
};

type MovimentoAcao = "entrada-manual" | "perda" | "inventario" | "ajuste" | "devolucao";

const ACAO_MOVIMENTO: Record<MovimentoAcao, { rotulo: string; motivoObrigatorio: boolean; campoQtd: string }> = {
  "entrada-manual": { rotulo: "Entrada manual", motivoObrigatorio: false, campoQtd: "Quantidade" },
  perda: { rotulo: "Perda", motivoObrigatorio: true, campoQtd: "Quantidade perdida" },
  inventario: { rotulo: "Inventário", motivoObrigatorio: false, campoQtd: "Contagem física TOTAL" },
  ajuste: { rotulo: "Ajuste (+/−)", motivoObrigatorio: true, campoQtd: "Quantidade (use − pra tirar)" },
  devolucao: { rotulo: "Devolução", motivoObrigatorio: false, campoQtd: "Quantidade devolvida" },
};

// ------------------------------------------------------------------ AJUDANTES

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function mensagemDe(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

function Interruptor({
  nome,
  dica,
  ligado,
  onChange,
  disabled,
}: {
  nome: string;
  dica?: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="fis-switch">
      <input type="checkbox" checked={ligado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="fis-switch-txt">
        <span className="fis-switch-nome">{nome}</span>
        {dica ? <span className="fis-switch-dica">{dica}</span> : null}
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ O BLOCO

export function BlocoEstoque() {
  const [produtos, setProdutos] = useState<EstoqueProdutoT[]>([]);
  const [logistica, setLogistica] = useState<ProdutoLogisticaT[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ nome: "", unidade: "", ncm: "", logisticaProductId: "" });

  const [mov, setMov] = useState<{ acao: MovimentoAcao; produto: EstoqueProdutoT } | null>(null);
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");

  const [extratoDe, setExtratoDe] = useState<EstoqueProdutoT | null>(null);
  const [extrato, setExtrato] = useState<MovimentoEstoqueT[]>([]);

  const xmlRef = useRef<HTMLInputElement | null>(null);
  const [xmlTexto, setXmlTexto] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewXml | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [relancar, setRelancar] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [p, l] = await Promise.all([
        apiFetch<EstoqueProdutoT[]>("/fiscal/estoque/produtos"),
        apiFetch<ProdutoLogisticaT[]>("/fiscal/estoque/produtos-logistica"),
      ]);
      setProdutos(Array.isArray(p) ? p : []);
      setLogistica(Array.isArray(l) ? l : []);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao carregar o estoque."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do bloco
    void carregar();
  }, [carregar]);

  const criarProduto = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      await apiFetch("/fiscal/estoque/produtos", {
        method: "POST",
        body: JSON.stringify({
          nome: novo.nome.trim(),
          unidade: novo.unidade.trim() || undefined,
          ncm: novo.ncm.replace(/\D/g, "") || undefined,
          logisticaProductId: novo.logisticaProductId ? Number(novo.logisticaProductId) : undefined,
        }),
      });
      setNovo({ nome: "", unidade: "", ncm: "", logisticaProductId: "" });
      setNovoAberto(false);
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao criar o produto."));
    } finally {
      setOcupado(false);
    }
  }, [novo, carregar]);

  const lancarMovimento = useCallback(async () => {
    if (!mov) return;
    setOcupado(true);
    setErro(null);
    try {
      const qtd = Number(movQtd.replace(",", "."));
      const body =
        mov.acao === "inventario"
          ? { produtoId: mov.produto.id, contagem: qtd, motivo: movMotivo.trim() || undefined }
          : { produtoId: mov.produto.id, quantidade: qtd, motivo: movMotivo.trim() || undefined };
      const r = await apiFetch<any>(`/fiscal/estoque/${mov.acao}`, { method: "POST", body: JSON.stringify(body) });
      setAviso(mov.acao === "inventario" && r?.lancado === false ? r.aviso : null);
      setMov(null);
      setMovQtd("");
      setMovMotivo("");
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao lançar o movimento."));
    } finally {
      setOcupado(false);
    }
  }, [mov, movQtd, movMotivo, carregar]);

  const abrirExtrato = useCallback(async (p: EstoqueProdutoT) => {
    setExtratoDe(p);
    setExtrato([]);
    try {
      const rows = await apiFetch<MovimentoEstoqueT[]>(`/fiscal/estoque/extrato?produtoId=${encodeURIComponent(p.id)}`);
      setExtrato(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao carregar o extrato."));
    }
  }, []);

  const lerXml = useCallback(async (file: File | null) => {
    if (!file) return;
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const texto = await file.text();
      const p = await apiFetch<PreviewXml>("/fiscal/estoque/entrada-xml/preview", {
        method: "POST",
        body: JSON.stringify({ xml: texto }),
      });
      setXmlTexto(texto);
      setPreview(p);
      setRelancar(false);
      const inicial: Record<string, string> = {};
      for (const item of p.itens) inicial[item.cProd] = item.sugestaoProdutoId || "__novo";
      setMapa(inicial);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao ler o XML."));
    } finally {
      setOcupado(false);
      if (xmlRef.current) xmlRef.current.value = "";
    }
  }, []);

  const confirmarXml = useCallback(async () => {
    if (!preview || !xmlTexto) return;
    setOcupado(true);
    setErro(null);
    try {
      const mapeamentos = preview.itens.map((item) => {
        const escolha = mapa[item.cProd] || "__ignorar";
        if (escolha === "__ignorar") return { cProd: item.cProd, ignorar: true };
        if (escolha === "__novo") {
          return { cProd: item.cProd, novoProduto: { nome: item.nome, unidade: item.unidade || undefined, ncm: item.ncm || undefined } };
        }
        return { cProd: item.cProd, produtoId: escolha };
      });
      const r = await apiFetch<{ lancados: number; duplicados: number; ignorados: number }>(
        "/fiscal/estoque/entrada-xml/confirmar",
        { method: "POST", body: JSON.stringify({ xml: xmlTexto, mapeamentos, permitirRelancamento: relancar }) },
      );
      setAviso(`Entrada lançada: ${r.lancados} item(ns)` + (r.duplicados ? ` · ${r.duplicados} já lançado(s)` : "") + (r.ignorados ? ` · ${r.ignorados} ignorado(s)` : ""));
      setPreview(null);
      setXmlTexto(null);
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao confirmar a entrada."));
    } finally {
      setOcupado(false);
    }
  }, [preview, xmlTexto, mapa, relancar, carregar]);

  const nomeLogistica = useCallback(
    (id: number | null) => (id == null ? null : logistica.find((l) => l.id === id)?.name || `#${id}`),
    [logistica],
  );

  return (
    <section className="panel fis-bloco">
      <header className="fis-bloco-head">
        <h2>Estoque</h2>
        <label className="btn-ghost fis-upload-xml">
          <input
            ref={xmlRef}
            type="file"
            accept=".xml,text/xml"
            onChange={(e) => void lerXml(e.target.files?.[0] || null)}
          />
          <I d={ICONS.upload} size={14} />
          XML da compra
        </label>
        <button type="button" className="btn-ghost" onClick={() => setNovoAberto((v) => !v)}>
          <I d={ICONS.plus} size={14} />
          Produto
        </button>
      </header>
      <div className="fis-bloco-corpo">
        {aviso ? (
          <div className="fis-aviso fis-aviso--atencao">
            <div className="fis-aviso-topo">
              <span>{aviso}</span>
              <button type="button" className="btn-ghost btn-xs" onClick={() => setAviso(null)}>Entendi</button>
            </div>
          </div>
        ) : null}
        {erro ? <div className="fis-aviso fis-aviso--erro"><span>{erro}</span></div> : null}

        {novoAberto ? (
          <div className="fis-grade">
            <label className="fis-campo">
              <span className="field-label">Nome</span>
              <input className="field-dark" value={novo.nome} maxLength={200} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">Unidade</span>
              <input className="field-dark" placeholder="galão, un, cx" value={novo.unidade} maxLength={20} onChange={(e) => setNovo((n) => ({ ...n, unidade: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">NCM</span>
              <input className="field-dark" inputMode="numeric" value={novo.ncm} maxLength={8} onChange={(e) => setNovo((n) => ({ ...n, ncm: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">Produto da logística (vínculo)</span>
              <select className="field-dark" value={novo.logisticaProductId} onChange={(e) => setNovo((n) => ({ ...n, logisticaProductId: e.target.value }))}>
                <option value="">Sem vínculo</option>
                {logistica.map((l) => (
                  <option key={l.id} value={String(l.id)}>{l.name}</option>
                ))}
              </select>
            </label>
            <div className="fis-linha-acoes fis-campo--inteiro">
              <button type="button" className="btn-teal" disabled={ocupado || !novo.nome.trim()} onClick={criarProduto}>
                {ocupado ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setNovoAberto(false)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="fis-xml-conferencia">
            <strong className="hbx-inteiro">
              NF-e de {preview.emitenteNome || "fornecedor"} — confira o destino de cada item
            </strong>
            {preview.jaLancada ? (
              <>
                <div className="fis-aviso fis-aviso--atencao"><span>Esta nota JÁ teve entrada lançada. Re-lançar duplica o estoque — só siga se for corrigir um mapeamento (e estorne o lançamento anterior com um ajuste).</span></div>
                <Interruptor
                  nome="Sei que já foi lançada — lançar mesmo assim"
                  ligado={relancar}
                  onChange={setRelancar}
                />
              </>
            ) : null}
            {preview.itens.map((item) => (
              <div key={item.cProd} className="fis-xml-item">
                <span className="fis-xml-item-nome">
                  <strong>{item.nome}</strong>
                  <small>{item.quantidade} {item.unidade || "un"}{item.ncm ? ` · NCM ${item.ncm}` : ""}</small>
                </span>
                <select
                  className="field-dark"
                  value={mapa[item.cProd] || "__ignorar"}
                  onChange={(e) => setMapa((m) => ({ ...m, [item.cProd]: e.target.value }))}
                >
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>→ {p.nome}</option>
                  ))}
                  <option value="__novo">Criar produto novo</option>
                  <option value="__ignorar">Ignorar este item</option>
                </select>
              </div>
            ))}
            <div className="fis-linha-acoes">
              <button type="button" className="btn-teal" disabled={ocupado} onClick={confirmarXml}>
                {ocupado ? "Lançando…" : "Lançar entrada"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setPreview(null); setXmlTexto(null); }}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {produtos.length === 0 ? (
          <div className="fis-vazio">
            <strong>Nenhum produto no estoque</strong>
            <span>Crie o produto (1–5 itens) ou suba o XML da primeira compra.</span>
          </div>
        ) : (
          <div className="fis-servicos">
            {produtos.map((p) => (
              <div key={p.id} className="fis-servico">
                <div className="fis-servico-topo">
                  <strong>{p.nome}</strong>
                </div>
                <div className="fis-servico-meta">
                  <span>Disponível <b>{p.saldo.disponivel}</b></span>
                  <span>Reservado <b>{p.saldo.reservado}</b></span>
                  <span>Faturado <b>{p.saldo.faturado}</b></span>
                  <span>Físico <b>{p.saldo.fisico}</b></span>
                  {p.logisticaProductId != null ? <span>↔ {nomeLogistica(p.logisticaProductId)}</span> : <span>Sem vínculo com a rota</span>}
                </div>
                {p.saldo.fisico < 0 ? (
                  <div className="fis-aviso fis-aviso--erro"><span>Estoque NEGATIVO — confira entradas ou faça o inventário.</span></div>
                ) : null}
                <div className="fis-linha-acoes">
                  {(Object.keys(ACAO_MOVIMENTO) as MovimentoAcao[]).map((acao) => (
                    <button
                      key={acao}
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={() => { setMov({ acao, produto: p }); setMovQtd(""); setMovMotivo(""); }}
                    >
                      {ACAO_MOVIMENTO[acao].rotulo}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost btn-xs" onClick={() => void abrirExtrato(p)}>Extrato</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mov ? (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) setMov(null); }}>
          <div className="hbx-modal fis-modal" role="dialog" aria-label={ACAO_MOVIMENTO[mov.acao].rotulo}>
            <h3>{ACAO_MOVIMENTO[mov.acao].rotulo} — {mov.produto.nome}</h3>
            <label className="fis-campo">
              <span className="field-label">{ACAO_MOVIMENTO[mov.acao].campoQtd}</span>
              <input className="field-dark" inputMode="decimal" value={movQtd} onChange={(e) => setMovQtd(e.target.value.replace(/[^\d.,-]/g, ""))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">{ACAO_MOVIMENTO[mov.acao].motivoObrigatorio ? "Motivo (obrigatório)" : "Motivo"}</span>
              <input className="field-dark" value={movMotivo} maxLength={300} onChange={(e) => setMovMotivo(e.target.value)} />
            </label>
            <div className="fis-modal-acoes">
              <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => setMov(null)}>Voltar</button>
              <button
                type="button"
                className="btn-teal"
                disabled={ocupado || !movQtd.trim() || (ACAO_MOVIMENTO[mov.acao].motivoObrigatorio && movMotivo.trim().length < 3)}
                onClick={lancarMovimento}
              >
                {ocupado ? "Lançando…" : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {extratoDe ? (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) setExtratoDe(null); }}>
          <div className="hbx-modal fis-modal fis-modal--largo" role="dialog" aria-label="Extrato do estoque">
            <h3>Extrato — {extratoDe.nome}</h3>
            <div className="fis-tabela-scroll">
              {extrato.length === 0 ? (
                <div className="fis-vazio"><span>Nenhum movimento.</span></div>
              ) : (
                <table className="tbl fis-tabela">
                  <thead>
                    <tr><th>Data</th><th>Movimento</th><th className="fis-col-valor">Qtd</th><th>Motivo</th></tr>
                  </thead>
                  <tbody>
                    {extrato.map((m) => (
                      <tr key={m.id}>
                        <td>{fmtData(m.createdAt)}</td>
                        <td>{TIPO_MOVIMENTO[m.tipo] || m.tipo}</td>
                        <td className="fis-col-valor">{m.quantidade}</td>
                        <td>{m.motivo || (m.refChaveNfe ? `NF-e ${m.refChaveNfe.slice(0, 10)}…` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="fis-modal-acoes">
              <button type="button" className="btn-ghost" onClick={() => setExtratoDe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
