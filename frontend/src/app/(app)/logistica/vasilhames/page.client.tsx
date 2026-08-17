"use client";

// VASILHAME onda 2 (17/08) — PATRIMÔNIO NA RUA: o argumento de venda do módulo.
//
// A pergunta mais cara de uma distribuidora não é quanto ela vendeu, é quanto
// dela está na casa dos outros. Cada garrafão custa R$25–40, fica meses fora e
// some sem ninguém perceber — o ativo mais caro e menos controlado do setor.
// Esta tela responde em dois números: quantos cascos e quantos reais. E, logo
// abaixo, QUEM está com eles — que é onde o dono decide pra quem ligar.
//
// Contrato (company-scoped, JWT; ADMIN/dono — o backend usa ensureBillingOwner):
//   - GET /logistica/vasilhames/patrimonio?limite=50 → PatrimonioDTO
//
// Leitura PURA de propósito. Quem move casco é a ficha do cliente (injetar/
// devolver, com extrato) e a entrega confirmada (saldo += saiu − voltou). Botão
// de mexer aqui criaria uma 2ª porta pro mesmo patrimônio, sem o contexto do
// cliente na frente — e patrimônio com duas portas é saldo que ninguém explica.
//
// Design system (5 Leis): casco reusa .log-agenda/.log-agenda__surface/
// .log-agenda__head (mesmo padrão do Estoque de carga e da Saúde da Base);
// tabela reusa .tbl-wrap/.tbl; vazio reusa .emp-empty. As únicas classes novas
// (.log-vas__*) vivem em hbx-theme/logistica-agenda.css e só usam token.

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type ClienteComCasco = {
  customerProfileId: string;
  nome: string;
  qtd: number;
  totalCents: number;
};

type Patrimonio = {
  totalQtd: number;
  totalCents: number;
  clientes: ClienteComCasco[];
  clientesComCasco: number;
};

function fmtMoney(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function humanError(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar o patrimônio na rua.";
}

/** 403 = a tela é do dono/admin (ensureBillingOwner no backend). */
function isGateDeAcesso(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 403;
}

export function PatrimonioNaRuaClient() {
  const [dados, setDados] = useState<Patrimonio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<Patrimonio>("/logistica/vasilhames/patrimonio?limite=50")
      .then((res) => {
        setDados(res);
        setError(null);
        setSemAcesso(false);
      })
      .catch((err: unknown) => {
        if (isGateDeAcesso(err)) {
          setSemAcesso(true);
          setError(null);
          return;
        }
        setError(humanError(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { void load(); }, [load]);

  const vazio = !!dados && dados.totalQtd === 0;

  return (
    <section className="log-agenda hbx-page-mobile-enter">
      <div className="log-agenda__surface">
        <header className="log-agenda__head">
          <div className="log-agenda__head-main">
            <div className="log-agenda__head-copy">
              <h2>Patrimônio na rua</h2>
              <p>
                {semAcesso
                  ? "Quanto casco (e quanto dinheiro) está na casa dos clientes."
                  : vazio
                    ? "Ainda não há vasilhame registrado com nenhum cliente."
                    : "Garrafão, botijão e engradado que saíram e ainda não voltaram — por cliente."}
              </p>
            </div>
          </div>
          {!semAcesso && (
            <div className="log-agenda__actions">
              <button type="button" className="btn-ghost btn-xs" onClick={() => void load()} disabled={loading}>
                <span aria-hidden>↻</span> {loading ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          )}
        </header>

        {semAcesso && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Esta tela é do dono da conta</strong>
            <span className="emp-empty__text">
              O patrimônio na rua mostra dinheiro da empresa inteira. Peça a quem administra a conta.
            </span>
          </div>
        )}

        {loading && !dados && (
          <div className="log-agenda__feedback">
            <strong>Somando o que está na rua…</strong>
          </div>
        )}

        {error && (
          <div className="log-agenda__feedback is-error">
            <strong>Não carregou</strong>
            <span>{error}</span>
          </div>
        )}

        {dados && !error && (
          <>
            {/* Os dois números que vendem o módulo — e o terceiro que diz em
                quantas casas eles estão. Quantidade primeiro, dinheiro do lado:
                é o valor que faz o dono cobrar a caução que nunca cobrou. */}
            <div className="log-vas__stats" role="list" aria-label="Resumo do patrimônio na rua">
              <span className="log-vas__stat" role="listitem">
                <b>{dados.totalQtd}</b>
                <small>{dados.totalQtd === 1 ? "vasilhame na rua" : "vasilhames na rua"}</small>
              </span>
              <span className="log-vas__stat log-vas__stat--dinheiro" role="listitem">
                <b>{fmtMoney(dados.totalCents)}</b>
                <small>em patrimônio emprestado</small>
              </span>
              <span className="log-vas__stat" role="listitem">
                <b>{dados.clientesComCasco}</b>
                <small>{dados.clientesComCasco === 1 ? "cliente com casco" : "clientes com casco"}</small>
              </span>
            </div>

            {vazio ? (
              <div className="emp-empty">
                <strong className="emp-empty__title">Nenhum vasilhame na rua</strong>
                <span className="emp-empty__text">
                  Ligue &quot;trabalha com vasilhame&quot; no produto (em Produtos) e informe quanto vale um casco.
                  A partir daí, cada entrega confirmada acerta o saldo sozinha: sai cheio, volta vazio.
                  Você também pode injetar ou devolver na mão, na ficha do cliente.
                </span>
              </div>
            ) : (
              <>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Vasilhames</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.clientes.map((c) => (
                        <tr key={c.customerProfileId}>
                          <td>{c.nome}</td>
                          <td>{c.qtd}</td>
                          <td>{fmtMoney(c.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* O ranking é dos 50 maiores. Dizer isso é obrigatório: uma
                    lista cortada em silêncio faz a soma da coluna não bater com
                    o total lá em cima, e quem confere acha que o número mente. */}
                {dados.clientesComCasco > dados.clientes.length && (
                  <p className="log-vas__nota">
                    Mostrando os {dados.clientes.length} clientes com mais casco, de {dados.clientesComCasco} no total.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
