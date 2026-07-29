"use client";

// PR29072026 — CONFERÊNCIA DE ROTA no computador (/logistica).
// É a tela que faltava: antes o site montava e escrevia "Rota planejada." —
// quem montava não sabia km, previsão, crédito nem endereço torto. Aqui ele vê
// o MESMO que o celular mostra, com o mapa junto.
//
// Leis herdadas do APK (padronizar é IGUALAR):
//  · Montar e conferir são a MESMA coisa — reordenar ▲▼ é DENTRO desta tela.
//  · Só "Aceitar rota" consolida (e é quem debita). Qualquer outra saída DESFAZ
//    a montagem (`rota/descartar-montagem`) e avisa "Rota desfeita." — sem isso,
//    montar e desistir consumia o dia do cliente na agenda.
//  · Vermelho é aviso, não bloqueio: o portão de endereços roda ANTES de montar.
//  · Preview de crédito degrada MUDO: indisponível = sem linha, nunca trava.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

import styles from "./route-builder.module.css";
import { RoutePlanMap, type PlanMapStop } from "./route-plan-map";
import { RouteQuickStop } from "./route-quick-stop";
import {
  conferirRota,
  descartarMontagem,
  getCustoPreview,
  horaCurta,
  legLabel,
  motivosTexto,
  resumoLinhas,
  type ConferirRotaResult,
  type CustoPreviewResult,
} from "./route-conference-api";

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function RouteConference({
  date,
  deliveryIds,
  admin,
  onAccepted,
  onDiscarded,
}: {
  date: string;
  deliveryIds: string[];
  admin: boolean;
  onAccepted: (message: string) => void;
  onDiscarded: (message: string) => void;
}) {
  const [data, setData] = useState<ConferirRotaResult | null>(null);
  const [custo, setCusto] = useState<CustoPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aceitando, setAceitando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [rapida, setRapida] = useState(false);
  // A seleção cresce quando a Rota rápida adiciona uma parada — e o conferir
  // roda de novo sozinho, então a distância e a previsão já contam com ela.
  const [ids, setIds] = useState<string[]>(deliveryIds);
  // A ordem que o próximo conferir deve AUDITAR. Fica em ref, não em estado: a
  // sequência que a tela mostra é sempre a que o servidor devolveu (`data`), e
  // guardar isso em estado faria o efeito disparar dois conferir por toque.
  const ordemRef = useRef<string[] | null>(null);

  const conferir = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Preview de crédito roda em PARALELO — zero lentidão artificial, e a falha
    // dele nunca vaza pro catch do conferir.
    const custoPromise = getCustoPreview(date, ids);
    try {
      const manual = ordemRef.current;
      const result = await conferirRota({
        date,
        deliveryIds: ids,
        ...(manual?.length ? { ordemManual: manual } : {}),
      });
      setData(result);
    } catch (conferirError: unknown) {
      setError(humanError(conferirError, "Não foi possível conferir a rota."));
    } finally {
      setCusto(await custoPromise);
      setLoading(false);
    }
  }, [date, ids]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { void conferir(); }, [conferir]);

  const paradas = data?.paradas ?? [];

  function mover(index: number, direction: -1 | 1) {
    const alvo = index + direction;
    if (alvo < 0 || alvo >= paradas.length) return;
    const proxima = paradas.map((parada) => String(parada.id));
    [proxima[index], proxima[alvo]] = [proxima[alvo], proxima[index]];
    ordemRef.current = proxima;
    // Reconfere na hora: a distância e a previsão têm que responder ao que o
    // operador acabou de fazer — é exatamente o "saber o que está acontecendo".
    void conferir();
  }

  async function aceitar() {
    if (aceitando || loading || !data) return;
    setAceitando(true);
    setError(null);
    try {
      // A ordem revisada vira a rota REAL antes de fechar: um replanejar só,
      // com a sequência final (o conferir acima era dry-run).
      const ordemFinal = paradas.map((parada) => String(parada.id));
      await apiFetch("/logistica/rota/planejar", {
        method: "POST",
        body: JSON.stringify({ date, deliveryIds: ordemFinal, ordemManual: ordemFinal }),
      });
      onAccepted("Rota aceita.");
    } catch (aceitarError: unknown) {
      setError(humanError(aceitarError, "Não foi possível aceitar a rota."));
      setAceitando(false);
    }
  }

  async function cancelar() {
    if (desfazendo || aceitando) return;
    setDesfazendo(true);
    setError(null);
    try {
      await descartarMontagem(date, "Rota desfeita antes da confirmação.");
      onDiscarded("Rota desfeita.");
    } catch (cancelarError: unknown) {
      setError(humanError(cancelarError, "Não foi possível desfazer a rota."));
      setDesfazendo(false);
    }
  }

  const mapStops: PlanMapStop[] = paradas.map((parada) => ({
    id: String(parada.id),
    nome: parada.nome || "Cliente",
    lat: parada.lat,
    lng: parada.lng,
    alerta: parada.semaforo === "vermelho",
  }));

  const linhas = data ? resumoLinhas(data) : null;
  const travado = loading || aceitando || desfazendo;

  return (
    <>
      <div className={styles.body}>
        {linhas && (
          <div className={styles.conferenciaResumo}>
            <span>{linhas[0]}</span>
            <span>{linhas[1]}</span>
          </div>
        )}

        {/* Crédito: o operador não pode descobrir o custo depois de apertar. */}
        {custo && admin && (
          <p className={custo.saldoCobre ? styles.creditoLinha : styles.creditoFalta}>
            {custo.saldoCobre
              ? `Créditos atual: ${custo.saldoAtual} · Aceitar debitará: ${custo.creditosAIniciar}`
              : `Créditos insuficientes para aceitar. Créditos atual: ${custo.saldoAtual} · Aceitar debitará: ${custo.creditosAIniciar}`}
          </p>
        )}
        {custo && !admin && !custo.saldoCobre && (
          <p className={styles.creditoFalta}>Créditos insuficientes para aceitar — avise o administrador.</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {!data && loading && <p className={styles.empty}>Conferindo a rota…</p>}
        {!data && !loading && !error && <p className={styles.empty}>Nada para conferir.</p>}

        {data && (
          <>
            <RoutePlanMap stops={mapStops} />
            <div className={styles.conferenciaLista}>
              {paradas.map((parada, index) => {
                const perna = legLabel(parada);
                const semCoordenada = !Number.isFinite(Number(parada.lat)) || !Number.isFinite(Number(parada.lng));
                const frase = motivosTexto(parada);
                const chegada = horaCurta(parada.etaAt);
                return (
                  <React.Fragment key={String(parada.id)}>
                    {semCoordenada ? (
                      <span className={styles.legAlert}>sem trajeto</span>
                    ) : perna ? (
                      <span className={styles.leg}>{perna}</span>
                    ) : null}
                    <div className={`${styles.orderRow} ${parada.semaforo === "vermelho" ? styles.orderRowAlert : ""}`}>
                      <span className={styles.orderNumber}>{index + 1}</span>
                      <span className={styles.previewCopy}>
                        <strong>{parada.nome || "Cliente"}</strong>
                        {frase && <small className={styles.motivo}>{frase}</small>}
                      </span>
                      {chegada && <span className={styles.eta}>~{chegada}</span>}
                      <span className={styles.arrows}>
                        <button
                          type="button"
                          onClick={() => mover(index, -1)}
                          disabled={index === 0 || travado}
                          aria-label={`Mover ${parada.nome || "parada"} para cima`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(index, 1)}
                          disabled={index === paradas.length - 1 || travado}
                          aria-label={`Mover ${parada.nome || "parada"} para baixo`}
                        >
                          ▼
                        </button>
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
              {!paradas.length && <p className={styles.empty}>Sem paradas.</p>}
            </div>
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerActions}>
          <button type="button" className={styles.secondary} onClick={() => void cancelar()} disabled={aceitando || desfazendo}>
            {desfazendo ? "Desfazendo…" : "Cancelar rota"}
          </button>
          <button type="button" className={styles.secondary} onClick={() => setRapida(true)} disabled={travado}>
            + Parada
          </button>
          <button type="button" className={styles.primary} onClick={() => void aceitar()} disabled={travado || !paradas.length}>
            {aceitando ? "Aceitando…" : loading ? "Atualizando…" : "Aceitar rota"}
          </button>
        </div>
      </footer>

      {rapida && (
        <RouteQuickStop
          date={date}
          contasNaRota={paradas.map((parada) => String(parada.customerProfileId || "")).filter(Boolean)}
          onClose={() => setRapida(false)}
          onAdded={(deliveryId) => {
            setRapida(false);
            // A parada nova não está na ordem que o operador tinha alinhado à
            // mão — devolver a decisão pro motor é mais honesto que enfiar ela
            // no fim calado. Depois ele reordena com as setas se quiser.
            ordemRef.current = null;
            setIds((atuais) => [...new Set([...atuais, deliveryId])]);
          }}
        />
      )}
    </>
  );
}
