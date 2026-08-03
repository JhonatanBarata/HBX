"use client";

// COCKPIT (03/08) — O TABULEIRO NOVO.
//
// Reescrito do zero por ordem do dono ("eu pedi para não usar a base") depois
// que a primeira versão do cockpit re-emoldurou o RouteBoard velho. Este
// arquivo não herda markup nem classe de lá — herda as 3 REGRAS que custaram
// bug pra ficarem certas:
//   1. o eixo é `rotaOrdem`, NUNCA relógio (`scheduledAt` pode ser null);
//   2. soltar na faixa "Sem motorista" DESATRIBUI (`entregadorId: null`);
//   3. parada sem `rotaOrdem` mostra "—" — número inventado é promessa falsa.
//
// O que ele tem que o velho não tinha (a dívida com o mock):
//   · SELEÇÃO MÚLTIPLA: a bolinha à esquerda de cada tira aberta marca a
//     parada; a barra "N selecionadas" (no palco) atribui tudo de uma vez pelo
//     endpoint de lote. Clique no MIOLO da tira continua abrindo a parada —
//     selecionar e abrir são gestos separados, no mesmo lugar de sempre.
//   · Faixas com crachá + progresso, tiras com estado visível (feita ✓ /
//     AGORA / só cobrar / GPS?), tudo classe própria `.cok-*`.

import React, { useCallback, useMemo, useState } from "react";

import { atribuirLote, type Entregador, type Parada } from "./cockpit-api";

const ABERTO = ["agendada", "em_rota"] as const;
const ORFA = "sem-motorista";

type Faixa = {
  chave: string;
  entregador: Entregador | null;
  nome: string;
  iniciais: string;
  paradas: Parada[];
};

function nomeDe(entregador: Entregador | null): string {
  if (!entregador) return "Sem motorista";
  return entregador.nome || entregador.email || `Motorista ${entregador.id}`;
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function hora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? null
    : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function aberta(parada: Parada): boolean {
  return (ABERTO as readonly string[]).includes(parada.status);
}

function semPino(parada: Parada): boolean {
  return typeof parada.cliente.lat !== "number" || typeof parada.cliente.lng !== "number";
}

/** Regra 1: rotaOrdem manda; empate por ETA/hora; id estabiliza. */
function ordenar(paradas: Parada[]): Parada[] {
  return [...paradas].sort((a, b) => {
    const oa = typeof a.rotaOrdem === "number" ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
    const ob = typeof b.rotaOrdem === "number" ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    const qa = a.etaAt || a.scheduledAt || "";
    const qb = b.etaAt || b.scheduledAt || "";
    if (qa !== qb) return qa.localeCompare(qb);
    return a.id.localeCompare(b.id);
  });
}

export function CockpitTabuleiro({
  stops,
  drivers,
  selecionadas,
  onToggleSelecao,
  onOpen,
  onDriverSelect,
  onAssigned,
}: {
  stops: Parada[];
  drivers: Entregador[];
  /** Ids marcados pra ação em lote — o estado mora no cockpit, não aqui. */
  selecionadas: ReadonlySet<string>;
  onToggleSelecao: (id: string) => void;
  onOpen: (stop: Parada) => void;
  onDriverSelect: (driver: Entregador) => void;
  onAssigned: (stopId: string, entregador: Entregador | null) => void;
}) {
  const [arrastando, setArrastando] = useState<Parada | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const faixas = useMemo<Faixa[]>(() => {
    const mapa = new Map<string, Faixa>();
    // Motorista sem parada também aparece — faixa vazia é informação ("fulano
    // está livre"), não lixo.
    for (const driver of drivers) {
      const nome = nomeDe(driver);
      mapa.set(`m${driver.id}`, {
        chave: `m${driver.id}`,
        entregador: driver,
        nome,
        iniciais: iniciaisDe(nome),
        paradas: [],
      });
    }
    for (const stop of stops) {
      const id = Number(stop.entregador?.id);
      const chave = Number.isInteger(id) && id > 0 ? `m${id}` : ORFA;
      const faixa = mapa.get(chave) ?? {
        chave,
        entregador: chave === ORFA ? null : stop.entregador,
        nome: nomeDe(chave === ORFA ? null : stop.entregador),
        iniciais: chave === ORFA ? "—" : iniciaisDe(nomeDe(stop.entregador)),
        paradas: [],
      };
      faixa.paradas.push(stop);
      mapa.set(chave, faixa);
    }
    const lista = [...mapa.values()];
    for (const faixa of lista) faixa.paradas = ordenar(faixa.paradas);
    // Órfã SEMPRE por último: é o balde do problema, não um motorista.
    return lista.sort((a, b) => {
      if (a.chave === ORFA) return 1;
      if (b.chave === ORFA) return -1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [drivers, stops]);

  const mover = useCallback(
    async (stop: Parada, entregadorId: number | null) => {
      setErro(null);
      setMovendo(stop.id);
      try {
        // Mesmo endpoint da barra de seleção: lote de 1. Um porteiro só.
        const res = await atribuirLote([stop.id], entregadorId);
        onAssigned(stop.id, res.entregador ? { ...res.entregador, email: null } : null);
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : "Não foi possível trocar o motorista.");
      } finally {
        setMovendo(null);
      }
    },
    [onAssigned],
  );

  if (!faixas.length) return null;

  return (
    <section className="cok-tab" aria-label="Tabuleiro das rotas de hoje">
      {erro && <p className="cok__palco-dica" role="status">{erro}</p>}

      {faixas.map((faixa) => {
        const feitas = faixa.paradas.filter((p) => p.status === "entregue").length;
        const orfa = faixa.chave === ORFA;
        const agora = orfa
          ? null
          : faixa.paradas.find((p) => p.status === "em_rota") ?? faixa.paradas.find((p) => p.status === "agendada") ?? null;
        const podeReceber = !!arrastando && (
          orfa ? !!arrastando.entregador : Number(arrastando.entregador?.id) !== faixa.entregador?.id
        );

        return (
          <div className={`cok-faixa${orfa ? " is-orfa" : ""}`} key={faixa.chave}>
            <button
              type="button"
              className="cok-faixa__cabeca"
              disabled={!faixa.entregador}
              aria-label={faixa.entregador ? `Abrir ${faixa.nome}` : "Paradas sem motorista"}
              onClick={() => { if (faixa.entregador) onDriverSelect(faixa.entregador); }}
            >
              <span className="cok-faixa__cracha" aria-hidden>{faixa.iniciais}</span>
              <span className="cok-faixa__quem">
                <b className="hbx-1linha">{faixa.nome}</b>
                <small>
                  {orfa
                    ? `${faixa.paradas.length} sem atribuição`
                    : `${feitas}/${faixa.paradas.length} feitas`}
                </small>
              </span>
              {!orfa && faixa.paradas.length > 0 && (
                <span className="cok-faixa__barra" aria-hidden>
                  <i style={{ width: `${Math.round((feitas / faixa.paradas.length) * 100)}%` }} />
                </span>
              )}
            </button>

            <div
              className={`cok-faixa__trilho${podeReceber && alvo === faixa.chave ? " is-alvo" : ""}`}
              onDragOver={(ev) => {
                if (!podeReceber) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "move";
                setAlvo(faixa.chave);
              }}
              onDragLeave={() => setAlvo((atual) => (atual === faixa.chave ? null : atual))}
              onDrop={(ev) => {
                ev.preventDefault();
                setAlvo(null);
                if (!arrastando || !podeReceber) return;
                // Regra 2: soltar na órfã desatribui.
                void mover(arrastando, faixa.entregador?.id ?? null);
                setArrastando(null);
              }}
            >
              {faixa.paradas.length === 0 && <span className="cok-faixa__vazia">Livre</span>}

              {faixa.paradas.map((stop) => {
                const feita = stop.status === "entregue";
                const cancelada = stop.status === "cancelada";
                const ehAgora = agora?.id === stop.id;
                // Regra 3: sem rotaOrdem não existe sequência — "—".
                const seq = typeof stop.rotaOrdem === "number" ? String(stop.rotaOrdem + 1) : "—";
                const quando = hora(stop.etaAt) || hora(stop.scheduledAt);
                const marcada = selecionadas.has(stop.id);
                const estado = feita ? "feita" : cancelada ? "cancelada" : stop.somenteCobranca ? "cobranca" : ehAgora ? "agora" : "fila";

                return (
                  <div
                    className={`cok-tira is-${estado}${marcada ? " is-marcada" : ""}${movendo === stop.id ? " is-movendo" : ""}`}
                    key={stop.id}
                    draggable={!feita && !cancelada && movendo !== stop.id}
                    onDragStart={() => setArrastando(stop)}
                    onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                  >
                    {/* A bolinha da SELEÇÃO — só em parada aberta (entregue/
                        cancelada não entra em lote; o backend ignoraria e a
                        tela prometeria o que não faz). */}
                    {aberta(stop) ? (
                      <input
                        type="checkbox"
                        className="cok-tira__marca"
                        checked={marcada}
                        aria-label={`Selecionar ${stop.cliente.nome || "parada"}`}
                        onChange={() => onToggleSelecao(stop.id)}
                      />
                    ) : (
                      <span className="cok-tira__marca is-morta" aria-hidden />
                    )}

                    <button
                      type="button"
                      className="cok-tira__miolo"
                      onClick={() => onOpen(stop)}
                      aria-label={[
                        seq === "—" ? "Parada sem ordem" : `Parada ${seq}`,
                        stop.cliente.nome || "Cliente",
                        quando,
                        stop.somenteCobranca ? "só cobrar" : null,
                        semPino(stop) ? "sem ponto no mapa" : null,
                      ].filter(Boolean).join(" · ")}
                    >
                      <span className="cok-tira__seq" aria-hidden>{feita ? "✓" : seq}</span>
                      <span className="cok-tira__texto">
                        <b className="hbx-1linha">{stop.cliente.nome || "Cliente"}</b>
                        <small className="hbx-1linha">
                          {[
                            quando,
                            stop.produto ? `${stop.quantidade}× ${stop.produto.nome}` : `${stop.quantidade} un`,
                          ].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                      <span className="cok-tira__selos">
                        {ehAgora && <span className="cok-tira__agora">agora</span>}
                        {stop.somenteCobranca && <span className="cok-tira__selo is-cobranca">Só cobrar</span>}
                        {semPino(stop) && !feita && <span className="cok-tira__selo is-gps">GPS?</span>}
                      </span>
                    </button>
                  </div>
                );
              })}

              {podeReceber && (
                <span className="cok-faixa__solta" aria-hidden>
                  {orfa ? "Soltar tira a atribuição" : `Soltar atribui pra ${faixa.nome.split(" ")[0]}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
