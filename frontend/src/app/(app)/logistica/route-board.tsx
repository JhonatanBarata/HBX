"use client";

// PR29072026 — O TABULEIRO: uma FAIXA por motorista, uma TIRA por parada.
// Ordem do dono (29/07): o painel de crédito já diz "Motorista X, gasto Y"; o
// que faltava no computador era ver O QUE cada um tem NA MÃO, na ordem em que
// ele vai rodar. Antes disso o dia inteiro era UMA lista lisa: 40 linhas sem
// dizer de quem é cada parada nem qual é a próxima.
//
// 🔴 EIXO = `rotaOrdem`, NÃO relógio. Foi medido no backend antes de desenhar:
// `listRota` ordena por `rotaOrdem → status → scheduledAt → createdAt` e
// `scheduledAt` pode ser null (entrega aberta sem data). Gantt por hora ficaria
// vazio justamente no dia mais comum. A ordem da rota é o que o entregador
// segue no APK — é ela que vira o eixo aqui. `etaAt` (planejador) entra como
// RÓTULO da tira quando existe, nunca como posição.
//
// 🔴 ZERO ENDPOINT NOVO: as paradas são as que a tela já carregou (GET
// /logistica/rota) e arrastar reusa o PATCH /logistica/entregas/:id/atribuir
// que a folha de detalhe já usava. Soltar na faixa "Sem motorista" desatribui
// (o endpoint aceita entregadorId null) — é como se tira uma parada de alguém.
//
// Teclado: a folha da parada (clique na tira) tem o MESMO select de motorista.
// O arrasto é atalho de mouse, não o único caminho.

import React, { useCallback, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

export type BoardEntregador = { id: number; nome: string | null; email: string | null };

/** Forma mínima usada aqui — o item de /logistica/rota é compatível. */
export type BoardStop = {
  id: string;
  status: string;
  quantidade: number;
  scheduledAt: string | null;
  etaAt?: string | null;
  rotaOrdem?: number | null;
  somenteCobranca?: boolean;
  motivoCobranca?: string | null;
  cliente: {
    nome: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    lat: number | null;
    lng: number | null;
  };
  produto: { nome: string; unidade: string | null } | null;
  entregador: BoardEntregador | null;
};

type Faixa = {
  key: string;
  entregadorId: number | null;
  nome: string;
  iniciais: string;
  paradas: BoardStop[];
};

const STATUS_ABERTO = ["agendada", "em_rota"];
const SEM_MOTORISTA = "sem-motorista";

function nomeDoMotorista(entregador: BoardEntregador | null): string {
  if (!entregador) return "Sem motorista";
  return entregador.nome || entregador.email || `Usuário ${entregador.id}`;
}

/** Iniciais do crachá da faixa: 2 letras, sem inventar quando o nome é curto. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Hora de um ISO no fuso do NAVEGADOR (o dono opera no -03; o container é UTC). */
function hora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function semPontoNoMapa(stop: BoardStop): boolean {
  return typeof stop.cliente.lat !== "number" || typeof stop.cliente.lng !== "number";
}

/** Estado visual da tira. `agora` é a PRÓXIMA da faixa, decidida por faixa. */
function estadoDaTira(stop: BoardStop, ehAgora: boolean): string {
  if (stop.status === "entregue") return "feita";
  if (stop.status === "cancelada") return "cancelada";
  if (stop.somenteCobranca) return "cobranca";
  return ehAgora ? "agora" : "fila";
}

export function RouteBoard({
  stops,
  onOpen,
  onAssigned,
}: {
  stops: BoardStop[];
  onOpen: (stop: BoardStop) => void;
  /** Sobe a reatribuição pro estado da página (mesma assinatura da folha). */
  onAssigned: (stopId: string, entregador: BoardEntregador | null) => void;
}) {
  const [arrastando, setArrastando] = useState<BoardStop | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Faixas: um balde por motorista + o balde órfão SEMPRE por último (mesma
  // ordem do painel de crédito logo acima — padronizar é IGUALAR).
  const faixas = useMemo<Faixa[]>(() => {
    const baldes = new Map<string, Faixa>();
    stops.forEach((stop) => {
      const id = Number(stop.entregador?.id);
      const temMotorista = Number.isInteger(id) && id > 0;
      const key = temMotorista ? `m${id}` : SEM_MOTORISTA;
      const balde = baldes.get(key) || {
        key,
        entregadorId: temMotorista ? id : null,
        nome: nomeDoMotorista(temMotorista ? stop.entregador : null),
        iniciais: temMotorista ? iniciaisDe(nomeDoMotorista(stop.entregador)) : "—",
        paradas: [],
      };
      balde.paradas.push(stop);
      baldes.set(key, balde);
    });

    const ordenadas = [...baldes.values()];
    ordenadas.forEach((faixa) => {
      faixa.paradas.sort((a, b) => {
        const ordemA = typeof a.rotaOrdem === "number" ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
        const ordemB = typeof b.rotaOrdem === "number" ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
        if (ordemA !== ordemB) return ordemA - ordemB;
        const quandoA = a.etaAt || a.scheduledAt || "";
        const quandoB = b.etaAt || b.scheduledAt || "";
        if (quandoA !== quandoB) return quandoA.localeCompare(quandoB);
        return a.id.localeCompare(b.id);
      });
    });

    return ordenadas.sort((a, b) => {
      if (a.key === SEM_MOTORISTA) return 1;
      if (b.key === SEM_MOTORISTA) return -1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [stops]);

  const reatribuir = useCallback(
    async (stop: BoardStop, entregadorId: number | null) => {
      setErro(null);
      setMovendo(stop.id);
      try {
        const res = await apiFetch<{ entregador: BoardEntregador | null }>(
          `/logistica/entregas/${stop.id}/atribuir`,
          { method: "PATCH", body: JSON.stringify({ entregadorId }) },
        );
        onAssigned(stop.id, res.entregador);
      } catch (err: unknown) {
        setErro(err instanceof Error ? err.message : "Não foi possível trocar o motorista.");
      } finally {
        setMovendo(null);
      }
    },
    [onAssigned],
  );

  if (!faixas.length) return null;

  const totalAbertas = stops.filter((stop) => STATUS_ABERTO.includes(stop.status)).length;

  return (
    <section className="log-board" aria-label="Tabuleiro das rotas de hoje">
      <header className="log-board__head">
        <strong>O tabuleiro</strong>
        <span className="log-board__hint">
          {faixas.filter((f) => f.entregadorId).length} motorista(s) · {totalAbertas} parada(s) aberta(s) · na ordem da rota
        </span>
        {erro && <span className="log-board__err" role="status">{erro}</span>}
      </header>

      <div className="log-board__lanes">
        {faixas.map((faixa) => {
          const feitas = faixa.paradas.filter((p) => p.status === "entregue").length;
          const emRota = faixa.paradas.find((p) => p.status === "em_rota");
          const proxima = emRota || faixa.paradas.find((p) => p.status === "agendada");
          const orfa = faixa.key === SEM_MOTORISTA;
          const podeReceber = !!arrastando && (
            orfa ? !!arrastando.entregador : Number(arrastando.entregador?.id) !== faixa.entregadorId
          );

          return (
            <div className={`log-lane${orfa ? " is-orfa" : ""}`} key={faixa.key}>
              <div className="log-lane__head">
                <span className="log-lane__badge" aria-hidden>{faixa.iniciais}</span>
                <span className="log-lane__who">
                  <b>{faixa.nome}</b>
                  <span>
                    {orfa
                      ? `${faixa.paradas.length} parada(s) · atribua para poder iniciar`
                      : `${feitas}/${faixa.paradas.length} feitas`}
                  </span>
                </span>
              </div>

              <div
                className={`log-lane__track${podeReceber && alvo === faixa.key ? " is-alvo" : ""}`}
                onDragOver={(ev) => {
                  if (!podeReceber) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  setAlvo(faixa.key);
                }}
                onDragLeave={() => setAlvo((atual) => (atual === faixa.key ? null : atual))}
                onDrop={(ev) => {
                  ev.preventDefault();
                  setAlvo(null);
                  if (!arrastando || !podeReceber) return;
                  void reatribuir(arrastando, faixa.entregadorId);
                  setArrastando(null);
                }}
              >
                {faixa.paradas.map((stop) => {
                  const ehAgora = !orfa && proxima?.id === stop.id;
                  const quando = hora(stop.etaAt) || hora(stop.scheduledAt);
                  // Sem `rotaOrdem` não existe ordem de rota — numerar pela posição
                  // do array inventaria uma sequência que o entregador não vai
                  // seguir. "Não sei" é resposta legítima: mostra "—" até a rota
                  // ser montada (é o que grava rotaOrdem).
                  const sequencia = typeof stop.rotaOrdem === "number" ? String(stop.rotaOrdem + 1) : "—";
                  const semGeo = semPontoNoMapa(stop);
                  return (
                    <button
                      type="button"
                      key={stop.id}
                      className={`log-strip log-strip--${estadoDaTira(stop, ehAgora)}${movendo === stop.id ? " is-movendo" : ""}`}
                      draggable={movendo !== stop.id}
                      onDragStart={() => setArrastando(stop)}
                      onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                      onClick={() => onOpen(stop)}
                      title={`${stop.cliente.nome || "Cliente"}${stop.cliente.endereco ? ` — ${stop.cliente.endereco}` : ""}${
                        stop.somenteCobranca && stop.motivoCobranca ? `\n${stop.motivoCobranca}` : ""
                      }`}
                    >
                      <span
                        className="log-strip__seq"
                        aria-label={sequencia === "—" ? "Sem ordem de rota" : `Parada ${sequencia}`}
                      >
                        {sequencia}
                      </span>
                      <span className="log-strip__main">
                        <b>{stop.cliente.nome || "Cliente"}</b>
                        <span>
                          {[
                            quando,
                            stop.produto ? `${stop.quantidade}× ${stop.produto.nome}` : `${stop.quantidade} un`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="log-strip__marks">
                        {ehAgora && <span className="log-strip__now" aria-label="Próxima parada" />}
                        {stop.somenteCobranca && <span className="log-strip__mark is-cobranca">Só cobrar</span>}
                        {semGeo && <span className="log-strip__mark is-geo" aria-label="Sem ponto no mapa">
                          <I d={ICONS.mapin} size={11} />
                        </span>}
                      </span>
                    </button>
                  );
                })}
                {podeReceber && (
                  <span className="log-lane__drop" aria-hidden>
                    {orfa ? "Soltar aqui tira o motorista" : `Soltar aqui passa pro ${faixa.nome.split(" ")[0]}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="log-board__foot">
        Arraste uma tira pra outra faixa e a parada troca de motorista. Clique abre a parada
        (a folha tem o mesmo campo de motorista, pelo teclado).
      </p>
    </section>
  );
}
