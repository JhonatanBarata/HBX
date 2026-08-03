"use client";

// COCKPIT (03/08) — O ELENCO.
//
// Um chip por motorista com SEMÁFORO. Antes, saber que alguém estava parado ou
// sem sinal exigia abrir OUTRA página (/rastreamento) e deixar ela aberta — o
// estado existia só enquanto alguém olhava. Aqui ele é a primeira coisa da tela.
//
// 🔴 O FAROL NÃO INVENTA: ele lê os avisos que a SENTINELA gravou no servidor
// (sem_sinal / parado_demais / atraso) e o progresso das entregas. Sem aviso e
// sem parada aberta = cinza (folga), não verde — "não sei" é resposta legítima.
//
// O balde "Sem motorista" mora aqui, com o botão que mata as 51 arrastadas.

import React from "react";

import { I, ICONS } from "@/components/hbx/shell";

import type { AvisoTipo, RotaAviso } from "./cockpit-api";
import type { BoardEntregador, BoardStop } from "./route-board";
import type { FarolEstado } from "./cockpit-inspetor";

export type LinhaDoElenco = {
  motorista: BoardEntregador;
  nome: string;
  total: number;
  feitas: number;
  abertas: number;
  farol: FarolEstado;
  situacao: string;
  naoLidos: number;
};

/** Gravidade por tipo — só o que some do mapa é vermelho. */
const GRAVE: readonly AvisoTipo[] = ["sem_sinal", "abandonada", "parada"];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Monta a linha do elenco de UM motorista. Exportada porque o inspetor
 * precisa do MESMO farol e da MESMA frase — dois cálculos do mesmo estado
 * seriam duas verdades na mesma tela.
 */
export function montarLinha(
  motorista: BoardEntregador,
  paradas: BoardStop[],
  avisos: RotaAviso[],
  naoLidos: number,
): LinhaDoElenco {
  const nome = motorista.nome || motorista.email || `Motorista ${motorista.id}`;
  const minhas = paradas.filter((stop) => Number(stop.entregador?.id) === motorista.id);
  const feitas = minhas.filter((stop) => stop.status === "entregue").length;
  const abertas = minhas.filter((stop) => stop.status === "agendada" || stop.status === "em_rota").length;

  // O aviso mais grave que a sentinela gravou pra esta pessoa hoje.
  const meus = avisos.filter((aviso) => aviso.motoristaUserId === motorista.id);
  const pior = meus.find((aviso) => GRAVE.includes(aviso.tipo)) ?? meus[0] ?? null;

  let farol: FarolEstado = "ok";
  let situacao: string;
  if (pior) {
    farol = GRAVE.includes(pior.tipo) ? "grave" : "atencao";
    situacao = pior.detalhe || rotuloCurto(pior.tipo);
  } else if (abertas > 0) {
    situacao = `${feitas}/${minhas.length} feitas`;
  } else if (minhas.length > 0) {
    situacao = `${minhas.length} entrega(s) concluída(s)`;
  } else {
    situacao = "Sem rota hoje";
  }

  return { motorista, nome, total: minhas.length, feitas, abertas, farol, situacao, naoLidos };
}

function rotuloCurto(tipo: AvisoTipo): string {
  switch (tipo) {
    case "sem_sinal": return "Sem sinal";
    case "parado_demais": return "Parado demais";
    case "atraso": return "Atrasado";
    case "abandonada": return "Saiu e não entregou";
    case "parcial": return "Encerrou no meio";
    default: return "Rota parada";
  }
}

export function CockpitElenco({
  linhas,
  selecionado,
  orfas,
  onSelecionar,
  onDarTodas,
  onParadaAvulsa,
}: {
  linhas: LinhaDoElenco[];
  selecionado: number | null;
  orfas: number;
  onSelecionar: (motorista: BoardEntregador) => void;
  onDarTodas: () => void;
  onParadaAvulsa: () => void;
}) {
  return (
    <aside className="cok__elenco" aria-label="Motoristas">
      <h3 className="cok__elenco-titulo">Motoristas · {linhas.length}</h3>

      <div className="cok__elenco-lista">
        {linhas.length === 0 && (
          <p className="cok__chat-vazio">Ninguém com capacidade de entrega ainda.</p>
        )}
        {linhas.map((linha) => (
          <button
            type="button"
            key={linha.motorista.id}
            className={`cok-motorista${selecionado === linha.motorista.id ? " is-ativo" : ""}`}
            aria-pressed={selecionado === linha.motorista.id}
            onClick={() => onSelecionar(linha.motorista)}
          >
            <span className="cok-motorista__cracha" aria-hidden>
              {iniciais(linha.nome)}
              <i className={`cok-motorista__farol is-${linha.farol}`} />
            </span>
            <span className="cok-motorista__quem">
              <b className="hbx-1linha">{linha.nome}</b>
              <small className={`hbx-1linha${linha.farol === "ok" ? "" : ` is-${linha.farol}`}`}>
                {linha.situacao}
              </small>
              {linha.total > 0 && (
                <span className="cok-motorista__barra" aria-hidden>
                  <i style={{ width: `${Math.round((linha.feitas / linha.total) * 100)}%` }} />
                </span>
              )}
            </span>
            {linha.naoLidos > 0 && (
              <span className="cok-motorista__bolha" aria-label={`${linha.naoLidos} recado(s) não lido(s)`}>
                {linha.naoLidos}
              </span>
            )}
          </button>
        ))}
      </div>

      {orfas > 0 && (
        <div className="cok__pote">
          <b>Sem motorista</b>
          <small>{orfas} parada(s) esperando dono</small>
          <button type="button" className="btn-ghost btn-xs cok__botao-largo" onClick={onDarTodas}>
            Dar todas para…
          </button>
        </div>
      )}

      <div className="cok__elenco-rodape">
        <button type="button" className="btn-ghost btn-xs cok__botao-largo" onClick={onParadaAvulsa}>
          <I d={ICONS.plus} size={12} /> Parada avulsa
        </button>
      </div>
    </aside>
  );
}
