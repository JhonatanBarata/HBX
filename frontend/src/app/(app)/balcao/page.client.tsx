"use client";

// B1 BALCÃO (PR04082026-BALCAO-DISTRIBUIDORA) — frente de caixa da vertical.
//
// TECLADO-FIRST: o leitor de código de barras é um TECLADO (keyboard wedge) —
// o listener global junta dígitos e fecha no Enter; bip e botão grande
// convivem (galão retornável às vezes não tem etiqueta). Preço é resolvido no
// SERVIDOR (a tela nunca manda preço). FIADO exige cliente da base. Cancelar
// tem rito (motivo + reversa de estoque no backend). Comprovante SEM VALOR
// FISCAL abre em nova aba pra imprimir do navegador (térmica = moradia v2).
//
// Visual 100% classe central (.bal-* de hbx-theme/balcao.css + kit). Modais em
// PORTAL pro <body> (lição do B0: ancestral com transform recorta o fixed).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

// ------------------------------------------------------------------ tipos

type SaldoT = { fisico: number; reservado: number; disponivel: number; faturado: number };

type ProdutoBalcao = {
  id: string;
  nome: string;
  unidade: string | null;
  gtin: string | null;
  precoCents: number | null;
  saldo: SaldoT;
};

type VendaItemT = { produtoId: string; produtoNome: string; quantidade: number; precoCents: number; subtotalCents: number };

type VendaT = {
  id: string;
  createdAt: string | null;
  pagamento: string;
  totalCents: number;
  status: string;
  clienteId: string | null;
  clienteNome: string | null;
  motivoCancelamento: string | null;
  itens: VendaItemT[];
};

type ClienteT = { id: string; nome: string; fone: string | null; limiteFiado: number | null };

type CarrinhoItem = { produto: ProdutoBalcao; quantidade: number };

const PAGAMENTOS: Array<{ id: string; rotulo: string }> = [
  { id: "DINHEIRO", rotulo: "Dinheiro" },
  { id: "PIX", rotulo: "Pix" },
  { id: "CARTAO", rotulo: "Cartão" },
  { id: "FIADO", rotulo: "Marcar" },
];

function brl(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function mensagemDe(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

function chaveAleatoria(): string {
  return `bal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ------------------------------------------------------------------ a tela

export function BalcaoClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);

  const [produtos, setProdutos] = useState<ProdutoBalcao[]>([]);
  const [erroGate, setErroGate] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [pagamento, setPagamento] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteT | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState<ClienteT[]>([]);
  const [finalizando, setFinalizando] = useState(false);
  const idempotencyRef = useRef<string>(chaveAleatoria());

  const [vendas, setVendas] = useState<VendaT[]>([]);
  const [dia, setDia] = useState<{ totalCents: number; quantidade: number }>({ totalCents: 0, quantidade: 0 });

  const [cancelando, setCancelando] = useState<VendaT | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [cancelOcupado, setCancelOcupado] = useState(false);

  const carregarProdutos = useCallback(async () => {
    try {
      const rows = await apiFetch<ProdutoBalcao[]>("/fiscal/balcao/produtos");
      setProdutos(Array.isArray(rows) ? rows : []);
      setErroGate(null);
    } catch (e) {
      setErroGate(mensagemDe(e, "Falha ao carregar o balcão."));
    }
  }, []);

  const carregarVendas = useCallback(async () => {
    try {
      const r = await apiFetch<{ vendas: VendaT[]; dia: { totalCents: number; quantidade: number } }>("/fiscal/balcao/vendas");
      setVendas(Array.isArray(r?.vendas) ? r.vendas : []);
      setDia(r?.dia || { totalCents: 0, quantidade: 0 });
    } catch {
      /* gate já aparece pela carga de produtos */
    }
  }, []);

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void carregarProdutos();
    void carregarVendas();
  }, [admin, carregarProdutos, carregarVendas]);

  // ── carrinho ──────────────────────────────────────────────────────────────
  const totalCents = useMemo(() => carrinho.reduce((s, i) => s + Math.round(i.quantidade * (i.produto.precoCents || 0)), 0), [carrinho]);

  const adicionar = useCallback((p: ProdutoBalcao) => {
    if (p.precoCents == null) {
      setErro(`"${p.nome}" está sem preço — defina no Estoque antes de vender.`);
      return;
    }
    setErro(null);
    setCarrinho((c) => {
      const idx = c.findIndex((i) => i.produto.id === p.id);
      if (idx >= 0) {
        const novo = [...c];
        novo[idx] = { ...novo[idx], quantidade: novo[idx].quantidade + 1 };
        return novo;
      }
      return [...c, { produto: p, quantidade: 1 }];
    });
  }, []);

  const mudarQtd = useCallback((produtoId: string, delta: number) => {
    setCarrinho((c) =>
      c
        .map((i) => (i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    );
  }, []);

  const limpar = useCallback(() => {
    setCarrinho([]);
    setPagamento(null);
    setCliente(null);
    setBuscaCliente("");
    setResultadosCliente([]);
    idempotencyRef.current = chaveAleatoria();
  }, []);

  // ── BIP — leitor é teclado: dígitos em sequência + Enter ─────────────────
  const bipRef = useRef<{ buffer: string; ultimo: number }>({ buffer: "", ultimo: 0 });
  const produtosRef = useRef<ProdutoBalcao[]>([]);
  produtosRef.current = produtos;

  const onBip = useCallback((codigo: string) => {
    const p = produtosRef.current.find((x) => x.gtin && x.gtin === codigo);
    if (!p) {
      setErro(`Código bipado não cadastrado: ${codigo} — cadastre o código de barras no Estoque.`);
      return;
    }
    adicionar(p);
  }, [adicionar]);

  useEffect(() => {
    if (!admin) return;
    const handler = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      // Digitação em campo é do campo — o bip global só vale com a tela "solta".
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
      const agora = Date.now();
      const st = bipRef.current;
      // Leitor "digita" rápido — pausa longa recomeça o código (digitação humana solta não vira EAN).
      if (agora - st.ultimo > 300) st.buffer = "";
      st.ultimo = agora;
      if (/^\d$/.test(ev.key)) {
        st.buffer += ev.key;
        return;
      }
      if (ev.key === "Enter" || ev.key === "Tab") {
        if (st.buffer.length >= 8 && st.buffer.length <= 14) {
          ev.preventDefault();
          onBip(st.buffer);
        }
        st.buffer = "";
        return;
      }
      st.buffer = "";
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [admin, onBip]);

  // ── busca de cliente (fiado) ──────────────────────────────────────────────
  useEffect(() => {
    if (pagamento !== "FIADO" || cliente || buscaCliente.trim().length < 2) {
      setResultadosCliente([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<ClienteT[]>(`/fiscal/balcao/clientes?q=${encodeURIComponent(buscaCliente.trim())}`)
        .then((rows) => setResultadosCliente(Array.isArray(rows) ? rows : []))
        .catch(() => setResultadosCliente([]));
    }, 250);
    return () => clearTimeout(t);
  }, [buscaCliente, pagamento, cliente]);

  // ── finalizar ─────────────────────────────────────────────────────────────
  const podeFinalizar = carrinho.length > 0 && pagamento != null && (pagamento !== "FIADO" || cliente != null) && !finalizando;

  const finalizar = useCallback(async () => {
    if (!podeFinalizar || !pagamento) return;
    setFinalizando(true);
    setErro(null);
    try {
      const r = await apiFetch<{ venda: VendaT; aviso: string | null }>("/fiscal/balcao/vendas", {
        method: "POST",
        body: JSON.stringify({
          itens: carrinho.map((i) => ({ produtoId: i.produto.id, quantidade: i.quantidade })),
          pagamento,
          clienteId: cliente?.id,
          idempotencyKey: idempotencyRef.current,
        }),
      });
      setAviso(
        `Venda de ${brl(r.venda.totalCents)} concluída (${PAGAMENTOS.find((p) => p.id === r.venda.pagamento)?.rotulo || r.venda.pagamento}).` +
          (r.aviso ? ` ${r.aviso}` : ""),
      );
      limpar();
      await Promise.all([carregarProdutos(), carregarVendas()]);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao concluir a venda."));
    } finally {
      setFinalizando(false);
    }
  }, [podeFinalizar, pagamento, carrinho, cliente, limpar, carregarProdutos, carregarVendas]);

  // ── comprovante (abre em nova aba pra imprimir) ──────────────────────────
  const abrirComprovante = useCallback(async (venda: VendaT) => {
    try {
      const res = await fetch(`${getApiBase()}/fiscal/balcao/vendas/${encodeURIComponent(venda.id)}/comprovante.pdf`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("download falhou");
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
    } catch {
      setErro("Falha ao abrir o comprovante.");
    }
  }, []);

  // ── cancelar (rito) ───────────────────────────────────────────────────────
  const confirmarCancelamento = useCallback(async () => {
    if (!cancelando) return;
    setCancelOcupado(true);
    setErro(null);
    try {
      await apiFetch(`/fiscal/balcao/vendas/${encodeURIComponent(cancelando.id)}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoCancel.trim() }),
      });
      setCancelando(null);
      setMotivoCancel("");
      await Promise.all([carregarProdutos(), carregarVendas()]);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao cancelar a venda."));
      setCancelando(null);
    } finally {
      setCancelOcupado(false);
    }
  }, [cancelando, motivoCancel, carregarProdutos, carregarVendas]);

  // ── estados de porta ──────────────────────────────────────────────────────
  if (!admin) {
    return (
      <section className="bal-wrap">
        <div className="fis-vazio">
          <strong>Balcão</strong>
          <span>Área do administrador da empresa.</span>
        </div>
      </section>
    );
  }
  if (erroGate) {
    return (
      <section className="bal-wrap">
        <div className="fis-vazio">
          <strong>Balcão</strong>
          <span>{erroGate}</span>
        </div>
      </section>
    );
  }

  const modalCancelar = cancelando ? (
    <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget && !cancelOcupado) setCancelando(null); }}>
      <div className="hbx-modal fis-modal" role="dialog" aria-label="Cancelar venda">
        <h3>Cancelar venda de {brl(cancelando.totalCents)}</h3>
        <div className="fis-dica">O estoque volta com rastro (reversa). Marcado ainda não pago é cancelado junto.</div>
        <label className="fis-campo">
          <span className="field-label">Motivo (obrigatório)</span>
          <input className="field-dark" value={motivoCancel} maxLength={500} onChange={(e) => setMotivoCancel(e.target.value)} />
        </label>
        <div className="fis-modal-acoes">
          <button type="button" className="btn-ghost" disabled={cancelOcupado} onClick={() => setCancelando(null)}>Voltar</button>
          <button
            type="button"
            className="btn-ghost danger"
            disabled={cancelOcupado || motivoCancel.trim().length < 5}
            onClick={confirmarCancelamento}
          >
            {cancelOcupado ? "Cancelando…" : "Cancelar venda"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <section className="bal-wrap">
      <header className="bal-topo">
        <h1>Balcão</h1>
        <span className="bal-bip-dica">Bipe o produto (leitor = teclado) ou toque no botão.</span>
        <span className="bal-dia">
          Hoje: <strong>{brl(dia.totalCents)}</strong> · {dia.quantidade} venda{dia.quantidade === 1 ? "" : "s"}
        </span>
      </header>

      {aviso ? (
        <div className="fis-aviso fis-aviso--atencao">
          <div className="fis-aviso-topo">
            <span>{aviso}</span>
            <button type="button" className="btn-ghost btn-xs" onClick={() => setAviso(null)}>Ok</button>
          </div>
        </div>
      ) : null}
      {erro ? <div className="fis-aviso fis-aviso--erro"><span>{erro}</span></div> : null}

      <div className="bal-main">
        <div className="bal-produtos">
          {produtos.length === 0 ? (
            <div className="fis-vazio">
              <strong>Nenhum produto</strong>
              <span>Cadastre os produtos (com preço e código de barras) no Estoque.</span>
            </div>
          ) : (
            produtos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={"bal-prod" + (p.precoCents == null ? " bal-prod--sem-preco" : "")}
                onClick={() => adicionar(p)}
              >
                <strong>{p.nome}</strong>
                <span className="bal-prod-preco">{p.precoCents == null ? "sem preço" : brl(p.precoCents)}</span>
                <span className="bal-prod-meta">
                  <span>Disp. {p.saldo.disponivel}</span>
                  {p.gtin ? <span>‖ {p.gtin}</span> : <span>sem código</span>}
                </span>
              </button>
            ))
          )}
        </div>

        <aside className="bal-carrinho panel">
          {carrinho.length === 0 ? (
            <div className="fis-vazio"><span>Carrinho vazio — bipe ou toque num produto.</span></div>
          ) : (
            carrinho.map((i) => (
              <div key={i.produto.id} className="bal-item">
                <span className="bal-item-nome">
                  {i.produto.nome}
                  <small>{brl(i.produto.precoCents)} {i.produto.unidade ? `· ${i.produto.unidade}` : ""}</small>
                </span>
                <span className="bal-qtd">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => mudarQtd(i.produto.id, -1)}>−</button>
                  <b>{i.quantidade}</b>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => mudarQtd(i.produto.id, +1)}>+</button>
                </span>
                <strong>{brl(Math.round(i.quantidade * (i.produto.precoCents || 0)))}</strong>
              </div>
            ))
          )}

          <div className="bal-total">
            <span>Total</span>
            <strong>{brl(totalCents)}</strong>
          </div>

          <div className="bal-pagamentos">
            {PAGAMENTOS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={"bal-pag" + (pagamento === p.id ? " is-active" : "")}
                onClick={() => { setPagamento(p.id); if (p.id !== "FIADO") { setCliente(null); setBuscaCliente(""); } }}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {pagamento === "FIADO" ? (
            <div className="bal-cliente">
              {cliente ? (
                <div className="bal-cliente-chip">
                  <span>{cliente.nome}{cliente.limiteFiado != null ? ` · limite R$ ${cliente.limiteFiado.toFixed(2)}` : ""}</span>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setCliente(null)}>Trocar</button>
                </div>
              ) : (
                <>
                  <label className="fis-campo">
                    <span className="field-label">Cliente do marcado</span>
                    <input
                      className="field-dark"
                      placeholder="Nome ou telefone…"
                      value={buscaCliente}
                      onChange={(e) => setBuscaCliente(e.target.value)}
                    />
                  </label>
                  {resultadosCliente.length > 0 ? (
                    <div className="bal-cliente-lista">
                      {resultadosCliente.map((c) => (
                        <button key={c.id} type="button" onClick={() => { setCliente(c); setResultadosCliente([]); }}>
                          {c.nome}{c.fone ? ` · ${c.fone}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <button type="button" className="btn-teal" disabled={!podeFinalizar} onClick={finalizar}>
            {finalizando ? "Concluindo…" : `Finalizar ${totalCents > 0 ? brl(totalCents) : ""}`}
          </button>
          {carrinho.length > 0 ? (
            <button type="button" className="btn-ghost btn-xs" onClick={limpar}>Limpar carrinho</button>
          ) : null}
        </aside>
      </div>

      <div className="bal-vendas">
        <h3>Últimas vendas</h3>
        {vendas.length === 0 ? (
          <div className="fis-vazio"><span>Nenhuma venda ainda.</span></div>
        ) : (
          vendas.map((v) => (
            <div key={v.id} className={"bal-venda" + (v.status === "CANCELADA" ? " bal-venda--cancelada" : "")}>
              <span>{hora(v.createdAt)}</span>
              <span>{v.itens.map((i) => `${i.quantidade}× ${i.produtoNome}`).join(" · ")}</span>
              <span>{PAGAMENTOS.find((p) => p.id === v.pagamento)?.rotulo || v.pagamento}{v.clienteNome ? ` — ${v.clienteNome}` : ""}</span>
              <strong>{brl(v.totalCents)}</strong>
              {v.status === "CANCELADA" ? <span className="fis-selo fis-selo--erro">Cancelada</span> : null}
              <span className="bal-venda-acoes">
                <button type="button" className="btn-ghost btn-xs" onClick={() => void abrirComprovante(v)}>Comprovante</button>
                {v.status === "CONCLUIDA" ? (
                  <button type="button" className="btn-ghost btn-xs" onClick={() => { setCancelando(v); setMotivoCancel(""); }}>Cancelar</button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>

      {modalCancelar && typeof document !== "undefined" ? createPortal(modalCancelar, document.body) : null}
    </section>
  );
}
