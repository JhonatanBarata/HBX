"use client";

// PR29072026 — PAINEL DE CRÉDITO POR MOTORISTA no topo do /logistica.
// Ordem do dono (29/07): "monte esse painel: Motorista X, gasto até agora Y".
//
// Fecha o buraco que eu tinha relatado: `rota/custo-preview` responde 400 pra
// admin quando o dia tem mais de um motorista ("Atribua as entregas a
// exatamente um motorista"), e o computador — diferente do celular — não tinha
// NENHUM outro lugar mostrando crédito. Resultado: às vezes o operador montava
// sem ver o custo.
//
// 🔴 ZERO ENDPOINT NOVO e zero fetch extra de rota: `resolveSingleDriver` do
// backend (logistica-custo-preview.service.ts) filtra o dia pelos `deliveryIds`
// recebidos — mandando SÓ as paradas de um motorista, ele resolve aquele
// motorista e o preview volta 200. As paradas já vêm da rota que a tela carregou.
//
// 💰 O número de dinheiro NÃO é inventado aqui. O endpoint devolve
// `creditosAIniciar` (= blocos pendentes × preço do catálogo) e a contagem de
// blocos; o preço do bloco é DERIVADO de uma linha que tenha bloco pendente e
// reaproveitado nas outras (o catálogo é da empresa, não do motorista). Sem
// nenhuma linha pendente não há de onde tirar o preço — aí o painel fala em
// BLOCOS em vez de fingir um valor. "Não sei" é resposta legítima.

import React, { useCallback, useEffect, useState } from "react";

import { getCustoPreview, type CustoPreviewResult } from "./route-conference-api";

export type CreditPanelStop = {
  id: string;
  status: string;
  entregador: { id: number; nome: string | null; email: string | null } | null;
};

type Linha = {
  entregadorId: number;
  nome: string;
  paradas: number;
  custo: CustoPreviewResult | null;
  /** Por que o custo não veio (frase do backend). Nunca some calado. */
  motivo: string | null;
};

const STATUS_ABERTO = ["agendada", "em_rota"];

function nomeDoMotorista(entregador: CreditPanelStop["entregador"]): string {
  if (!entregador) return "Sem motorista";
  return entregador.nome || entregador.email || `Usuário ${entregador.id}`;
}

/** Créditos com no máximo 3 casas, sem zero à direita (o catálogo é Decimal(18,3)). */
function fmtCreditos(valor: number): string {
  const numero = Number(valor) || 0;
  return Number.isInteger(numero) ? String(numero) : String(Math.round(numero * 1000) / 1000);
}

export function RouteCreditPanel({ date, stops }: { date: string; stops: CreditPanelStop[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [semMotorista, setSemMotorista] = useState(0);
  const [carregando, setCarregando] = useState(true);
  // Diagnóstico do DIA quando não há nenhum motorista pra consultar. Foi o
  // buraco do bug de 29/07: o dono cancelou tudo, o painel sumiu junto e ele
  // ficou "preso, sem enxergar o q falta fazer".
  const [diaMotivo, setDiaMotivo] = useState<string | null>(null);

  // Assinatura do dia: quem são os motoristas e quantas paradas abertas cada um
  // tem. Só isso muda o painel — re-render de outra coisa não refaz os previews.
  const assinatura = JSON.stringify(
    stops
      .filter((stop) => STATUS_ABERTO.includes(stop.status))
      .map((stop) => `${stop.entregador?.id ?? 0}:${stop.id}`)
      .sort(),
  );

  const carregar = useCallback(async () => {
    const abertas = stops.filter((stop) => STATUS_ABERTO.includes(stop.status));
    const porMotorista = new Map<number, { nome: string; ids: string[] }>();
    let orfas = 0;
    abertas.forEach((stop) => {
      const id = Number(stop.entregador?.id);
      if (!Number.isInteger(id) || id <= 0) { orfas += 1; return; }
      const atual = porMotorista.get(id) || { nome: nomeDoMotorista(stop.entregador), ids: [] };
      atual.ids.push(String(stop.id));
      porMotorista.set(id, atual);
    });
    setSemMotorista(orfas);

    if (!porMotorista.size) {
      // Dia sem motorista nenhum: pergunta o diagnóstico DO DIA (sem
      // deliveryIds) em vez de simplesmente não renderizar nada.
      setLinhas([]);
      const doDia = await getCustoPreview(date);
      setDiaMotivo(doDia.custo ? null : doDia.motivo);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const resultado = await Promise.all(
      [...porMotorista.entries()].map(async ([entregadorId, dados]) => {
        const resposta = await getCustoPreview(date, dados.ids);
        return {
          entregadorId,
          nome: dados.nome,
          paradas: dados.ids.length,
          custo: resposta.custo,
          motivo: resposta.motivo,
        };
      }),
    );
    setDiaMotivo(null);
    setLinhas(resultado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setCarregando(false);
  }, [date, stops]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API; efeito legítimo, não estado derivado.
  useEffect(() => { void carregar(); }, [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preço do bloco: sai de quem TEM bloco pendente e vale pra todos (o catálogo
  // é da empresa). Sem ninguém pendente, fica null e o painel fala em blocos.
  const custoBloco = (() => {
    for (const linha of linhas) {
      const custo = linha.custo;
      if (!custo) continue;
      const pendentes = Number(custo.blocosTotais) - Number(custo.blocosJaDebitados);
      if (pendentes > 0 && Number(custo.creditosAIniciar) > 0) {
        return Number(custo.creditosAIniciar) / pendentes;
      }
    }
    return null;
  })();

  const saldo = linhas.find((linha) => linha.custo)?.custo?.saldoAtual ?? null;
  const aIniciar = linhas.reduce((soma, linha) => soma + Number(linha.custo?.creditosAIniciar || 0), 0);
  const cobre = linhas.every((linha) => linha.custo?.saldoCobre !== false);

  // Só cala a boca quando NÃO HÁ NADA a dizer — nem linha, nem parada órfã,
  // nem motivo de bloqueio. Antes ele sumia sempre que o dia esvaziava.
  if (!carregando && !linhas.length && !semMotorista && !diaMotivo) return null;

  return (
    <section className="log-cred" aria-label="Créditos da rota de hoje">
      <header className="log-cred__head">
        <strong>Créditos de hoje</strong>
        {saldo !== null && <span className="log-cred__saldo">Saldo: {fmtCreditos(saldo)}</span>}
        {aIniciar > 0 && (
          <span className={`log-cred__iniciar${cobre ? "" : " is-falta"}`}>
            Iniciar debita: {fmtCreditos(aIniciar)}
          </span>
        )}
      </header>

      {carregando && !linhas.length ? (
        <p className="log-cred__vazio">Somando os créditos…</p>
      ) : (
        <div className="log-cred__list">
          {linhas.map((linha) => {
            const custo = linha.custo;
            const debitados = Number(custo?.blocosJaDebitados || 0);
            const pendentes = Math.max(0, Number(custo?.blocosTotais || 0) - debitados);
            const gasto = custoBloco !== null ? debitados * custoBloco : null;
            return (
              <div className="log-cred__row" key={linha.entregadorId}>
                <span className="log-cred__nome">{linha.nome}</span>
                <span className="log-cred__dado">{linha.paradas} {linha.paradas === 1 ? "parada" : "paradas"}</span>
                <span className="log-cred__dado">
                  {/* "gasto até agora" — o que a rota dele JÁ consumiu hoje. */}
                  Gasto: {gasto !== null
                    ? `${fmtCreditos(gasto)} ${gasto === 1 ? "crédito" : "créditos"}`
                    : `${debitados} ${debitados === 1 ? "bloco" : "blocos"}`}
                </span>
                <span className={`log-cred__dado${custo?.saldoCobre === false || (!custo && linha.motivo) ? " is-falta" : ""}`}>
                  {!custo
                    ? linha.motivo || "Custo indisponível"
                    : pendentes > 0
                      ? `Iniciar: +${fmtCreditos(custo.creditosAIniciar)}`
                      : "Nada a debitar"}
                </span>
              </div>
            );
          })}

          {/* Dia sem motorista nenhum: a frase do backend explica o que falta. */}
          {diaMotivo && !linhas.length && (
            <div className="log-cred__row is-falta">
              <span className="log-cred__nome">Nada para iniciar</span>
              <span className="log-cred__dado">{diaMotivo}</span>
            </div>
          )}

          {/* Sem motorista TRAVA o Iniciar no backend — o operador precisa saber. */}
          {semMotorista > 0 && (
            <div className="log-cred__row is-falta">
              <span className="log-cred__nome">Sem motorista</span>
              <span className="log-cred__dado">{semMotorista} {semMotorista === 1 ? "parada" : "paradas"}</span>
              <span className="log-cred__dado">Atribua para poder iniciar</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
