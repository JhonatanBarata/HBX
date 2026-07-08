"use client";

// ================================================================
// LOGÍSTICA-MOBILE M4 — hooks do app do entregador.
//  · useWakeLock   — mantém a tela acesa DURANTE a rota (Screen Wake Lock).
//  · getPosicaoUma — 1 leitura de GPS (origem ao iniciar / ponto do confirmar).
//  · useGeofence   — watchPosition + Haversine < raio → dispara chegada 1×.
//  · buzz          — feedback físico (Lei nº4): navigator.vibrate.
// GPS/LGPD: NADA de posição contínua sobe pro servidor — o watchPosition roda
// só no cliente; ao servidor vai APENAS o ponto da confirmação (M3/N6).
// ================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import { confirmarEntrega, distanciaMetros, type ConfirmarPayload } from "./entrega-api";
import {
  drain,
  enqueue,
  listAll,
  novaIdempotencyKey,
  type PendenciaItem,
} from "./entrega-offline";

// Tipos mínimos p/ APIs fora do lib.dom padrão (evita any, tsc estrito verde).
type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

/** Feedback físico curto (chegada/confirmação). No-op onde não há vibrate. */
export function buzz(pattern: number | number[] = 14): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* sem vibrate */
  }
}

/** Screen Wake Lock: tela acesa durante a rota; solta ao sair/desmontar. */
export function useWakeLock() {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  const enable = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
      if (!nav.wakeLock) return false;
      sentinel.current = await nav.wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    try {
      await sentinel.current?.release();
    } catch {
      /* já liberado */
    }
    sentinel.current = null;
  }, []);

  // Re-adquire o lock quando a aba volta ao foco (o SO solta ao esconder).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && sentinel.current == null) {
        void enable();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
    };
  }, [enable]);

  return { enable, disable };
}

/**
 * 1 leitura de GPS (Promise). Rejeita se indisponível/negado/timeout.
 * B1 — devolve também `accuracy` (metros, coords.accuracy) pra quem consome
 * decidir se o ponto é bom o bastante pra realimentar o cadastro do cliente.
 */
export function getPosicaoUma(): Promise<{ lat: number; lng: number; accuracy?: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS indisponível"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : undefined,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

export interface GeofenceAlvo {
  id: string;
  lat: number;
  lng: number;
  raioM: number;
}

/**
 * Geofence FOREGROUND: observa a posição e, ao entrar no raio do alvo, chama
 * onChegada UMA vez por alvo (guarda por id — swipe para outra parada rearma).
 * Só roda enquanto `ativo`. Retorna nada; a limpeza é automática.
 */
export function useGeofence(
  alvo: GeofenceAlvo | null,
  ativo: boolean,
  onChegada: (id: string) => void,
): void {
  const disparadoRef = useRef<string | null>(null);
  const cbRef = useRef(onChegada);
  cbRef.current = onChegada;

  useEffect(() => {
    if (!ativo || !alvo) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // Alvo trocou (swipe) → rearma o disparo.
    if (disparadoRef.current !== alvo.id) disparadoRef.current = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const atual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const dist = distanciaMetros(atual, { lat: alvo.lat, lng: alvo.lng });
        if (dist <= alvo.raioM && disparadoRef.current !== alvo.id) {
          disparadoRef.current = alvo.id;
          cbRef.current(alvo.id);
        }
      },
      () => {
        /* erro/negado: o entregador ainda abre a folha no toque (Chegar manual) */
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [alvo, ativo]);
}

// ── M8 (offline-first) — fila de confirmações + sync com teto/backoff ──────────
const SYNC_INTERVAL_MS = 20_000; // varre a fila a cada 20s (NÃO é loop apertado).

export interface OfflineSync {
  pendentes: number; // total de itens ainda na fila (não sincronizados).
  precisamAtencao: number; // itens que estouraram o teto de tentativas.
  // Enfileira uma confirmação (gera a key) e tenta sincronizar já. Devolve a key usada.
  enqueueConfirmacao: (entregaId: string, payload: Omit<ConfirmarPayload, "idempotencyKey">) => Promise<string>;
  // Força uma passada de sync (ex.: quando a rota recarrega). Best-effort, não lança.
  syncNow: () => Promise<void>;
}

/**
 * Sync da fila offline: 1 passada por gatilho (evento 'online' + intervalo), NUNCA
 * um loop apertado. O `drain` tem TETO de tentativas + backoff exponencial por item
 * (o freio duro vive em entrega-offline.ts). A idempotência é do SERVIDOR (a key vai
 * no confirmar), então reenviar o MESMO item não dispara efeito 2×.
 */
export function useOfflineSync(): OfflineSync {
  const [pendentes, setPendentes] = useState(0);
  const [precisamAtencao, setPrecisamAtencao] = useState(0);
  const rodando = useRef(false); // evita 2 drains concorrentes (online + timer juntos).

  const refreshContagem = useCallback(async () => {
    const all = await listAll();
    setPendentes(all.length);
    setPrecisamAtencao(all.filter((i: PendenciaItem) => i.status === "needs_attention").length);
  }, []);

  const syncNow = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      await drain(async (item: PendenciaItem) => {
        // Manda o idempotencyKey ao servidor — a idempotência dura mora lá.
        await confirmarEntrega(item.entregaId, { ...item.payload, idempotencyKey: item.idempotencyKey });
      });
    } catch {
      /* drain já é best-effort; nunca deixa o timer/evento quebrar */
    } finally {
      rodando.current = false;
      await refreshContagem();
    }
  }, [refreshContagem]);

  const enqueueConfirmacao = useCallback(
    async (entregaId: string, payload: Omit<ConfirmarPayload, "idempotencyKey">) => {
      const key = novaIdempotencyKey();
      await enqueue(entregaId, payload, key);
      await refreshContagem();
      // Tenta sincronizar já (online → some da fila na hora; offline → fica e drena depois).
      void syncNow();
      return key;
    },
    [refreshContagem, syncNow],
  );

  useEffect(() => {
    void refreshContagem();
    void syncNow();
    const onOnline = () => void syncNow();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [refreshContagem, syncNow]);

  return { pendentes, precisamAtencao, enqueueConfirmacao, syncNow };
}
