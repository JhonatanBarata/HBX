"use client";

// PR29072026 — FILA "PRECISA DE VOCÊ": o que está TRAVANDO o dia, junto, em
// ordem de gravidade. Nasceu da varredura da tela: cada travamento morava num
// canto diferente (ou em canto nenhum) e o operador só descobria tropeçando.
//
// 🔴 ZERO FETCH NOVO: tudo sai do que a tela já tem na mão — os itens de
// /logistica/rota (endereço sem ponto no mapa, devedor "só cobrar", comprovante
// que faltou).
//
// 🔴 NÃO REPETE O QUE JÁ TEM DONO NA TELA (mostra num lugar, edita num lugar):
//  - "Sem motorista: N paradas — atribua para poder iniciar" é linha do painel
//    de CRÉDITO (e faixa própria no tabuleiro);
//  - "Rota X negada/devolvida por Y" é o banner .log-negada, que segue onde
//    sempre esteve, logo acima. Ele NÃO entra aqui de propósito.

import React from "react";

import type { BoardStop } from "./route-board";

export type RequisitosComprovante = {
  fotoObrigatoria: boolean;
  assinaturaObrigatoria: boolean;
  codigoObrigatorio: boolean;
};

export type TriageStop = BoardStop & {
  comprovante?: {
    fotoEnviada: boolean;
    assinaturaEnviada: boolean;
    codigoGerado: boolean;
    confirmadoAt: string | null;
  };
};

type Gravidade = "alta" | "media" | "baixa";

type Item = {
  key: string;
  gravidade: Gravidade;
  etiqueta: string;
  oQue: string;
  porQue: string;
  acao?: { texto: string; run: () => void };
};

const STATUS_ABERTO = ["agendada", "em_rota"];

function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

/** Falta de comprovante numa entrega JÁ dada como entregue (a cobrança trava). */
function comprovanteFaltando(stop: TriageStop, req: RequisitosComprovante): string[] {
  if (stop.status !== "entregue") return [];
  const falta: string[] = [];
  if (req.fotoObrigatoria && !stop.comprovante?.fotoEnviada) falta.push("foto");
  if (req.assinaturaObrigatoria && !stop.comprovante?.assinaturaEnviada) falta.push("assinatura");
  if (req.codigoObrigatorio && !stop.comprovante?.codigoGerado) falta.push("código");
  return falta;
}

export function RouteTriage({
  stops,
  requisitos,
  onOpen,
}: {
  stops: TriageStop[];
  requisitos: RequisitosComprovante | null;
  onOpen: (stop: TriageStop) => void;
}) {
  const abertas = stops.filter((stop) => STATUS_ABERTO.includes(stop.status));
  const semGeo = abertas.filter(
    (stop) => typeof stop.cliente.lat !== "number" || typeof stop.cliente.lng !== "number",
  );
  const devedores = abertas.filter((stop) => stop.somenteCobranca);
  const req = requisitos;
  const semComprovante = req
    ? stops
        .map((stop) => ({ stop, falta: comprovanteFaltando(stop, req) }))
        .filter((linha) => linha.falta.length > 0)
    : [];

  const itens: Item[] = [];

  // 1. Endereço sem ponto no mapa: a rota entra por texto e o km sai errado.
  if (semGeo.length) {
    itens.push({
      key: "sem-geo",
      gravidade: "media",
      etiqueta: "Endereço",
      oQue: `${plural(semGeo.length, "endereço", "endereços")} sem ponto no mapa`,
      porQue: `${semGeo
        .slice(0, 3)
        .map((stop) => stop.cliente.nome || "Cliente")
        .join(", ")}${semGeo.length > 3 ? ` e mais ${semGeo.length - 3}` : ""} — entram na rota por texto, então o plano de km e o ETA saem errados.`,
      acao: { texto: "Abrir a primeira", run: () => onOpen(semGeo[0]) },
    });
  }

  // 2. Devedor em modo COBRANÇA: a parada fica, a mercadoria não desce.
  if (devedores.length) {
    itens.push({
      key: "devedor",
      gravidade: "media",
      etiqueta: "Devedor",
      oQue: `${plural(devedores.length, "parada", "paradas")} só para cobrar`,
      porQue: `${devedores
        .slice(0, 3)
        .map((stop) => `${stop.cliente.nome || "Cliente"}${stop.motivoCobranca ? ` (${stop.motivoCobranca})` : ""}`)
        .join(", ")}${devedores.length > 3 ? ` e mais ${devedores.length - 3}` : ""} — regra da empresa é cobrar sem descarregar carga nova.`,
      acao: { texto: "Abrir a primeira", run: () => onOpen(devedores[0]) },
    });
  }

  // 3. Entregue sem o comprovante que a regra do dia exige (trava a cobrança).
  if (semComprovante.length) {
    const primeira = semComprovante[0];
    itens.push({
      key: "comprovante",
      gravidade: "baixa",
      etiqueta: "Comprovante",
      oQue: `${plural(semComprovante.length, "entrega", "entregas")} sem o comprovante exigido`,
      porQue: `${primeira.stop.cliente.nome || "Cliente"} fechou sem ${primeira.falta.join(" e ")}${
        semComprovante.length > 1 ? ` (e mais ${semComprovante.length - 1})` : ""
      }. A regra do dia pede isso para valer como entrega feita.`,
      acao: { texto: "Abrir a primeira", run: () => onOpen(primeira.stop) },
    });
  }

  const ordem: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };
  itens.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);

  // Sem nada travado o bloco não desaparece: "dia limpo" é informação — é o que
  // diz que a fila foi olhada e está vazia, e não que ela quebrou.
  return (
    <section className="log-triage" aria-label="Pendências que travam o dia">
      <header className="log-triage__head">
        <strong>Precisa de você</strong>
        <span className={`log-triage__count${itens.length ? "" : " is-limpo"}`}>
          {itens.length ? itens.length : "0"}
        </span>
      </header>

      {itens.length === 0 ? (
        <p className="log-triage__limpo">Nada travado no dia. As paradas seguem sozinhas.</p>
      ) : (
        <div className="log-triage__list">
          {itens.map((item) => (
            <article className={`log-triage__row is-${item.gravidade}`} key={item.key}>
              <span className="log-triage__stripe" aria-hidden />
              <div className="log-triage__body">
                <div className="log-triage__top">
                  <span className="log-triage__tag">{item.etiqueta}</span>
                </div>
                <strong className="log-triage__what">{item.oQue}</strong>
                <span className="log-triage__why">{item.porQue}</span>
              </div>
              {item.acao && (
                <button type="button" className="btn-ghost btn-xs log-triage__act" onClick={item.acao.run}>
                  {item.acao.texto}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
