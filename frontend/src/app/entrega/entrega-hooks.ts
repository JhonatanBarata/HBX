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

import { useCallback, useEffect, useRef } from "react";

import { distanciaMetros } from "./entrega-api";

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

/** 1 leitura de GPS (Promise). Rejeita se indisponível/negado/timeout. */
export function getPosicaoUma(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS indisponível"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
