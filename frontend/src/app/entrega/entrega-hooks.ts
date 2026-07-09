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

// ── ROTA-AUTOPILOT F2 — som de chegada ──────────────────────────────────────
// AudioContext SINGLETON de módulo: a autoplay policy do navegador só libera
// som depois de um gesto real do usuário. `primeAudio()` é chamado dentro do
// onIniciar (que TEM gesto — o toque em "Iniciar rota"); o `beep()` de chegada
// dispara depois, sem gesto próprio (é o geofence quem chama) — sem o prime
// antes, o beep sairia mudo em boa parte dos aparelhos.
type AudioContextCtor = typeof AudioContext;
let audioCtxSingleton: AudioContext | null = null;

/** Cria/retoma o AudioContext singleton. Chamar SEMPRE dentro de um handler com gesto do usuário. */
export function primeAudio(): void {
  try {
    if (typeof window === "undefined") return;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtxSingleton) audioCtxSingleton = new Ctor();
    if (audioCtxSingleton.state === "suspended") void audioCtxSingleton.resume();
  } catch {
    /* sem WebAudio: beep() vira no-op (audioCtxSingleton continua null) */
  }
}

/** 2 notas curtas (~880Hz→660Hz) pra marcar a chegada. No-op silencioso sem WebAudio/prime. */
export function beep(): void {
  try {
    const ctx = audioCtxSingleton;
    if (!ctx) return;
    const tocarNota = (freqHz: number, inicioMs: number, duracaoMs: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freqHz;
      gain.gain.value = 0.2; // ganho baixo — aviso, não alarme
      osc.connect(gain);
      gain.connect(ctx.destination);
      const inicio = ctx.currentTime + inicioMs / 1000;
      osc.start(inicio);
      osc.stop(inicio + duracaoMs / 1000);
    };
    tocarNota(880, 0, 120);
    tocarNota(660, 130, 120);
  } catch {
    /* aparelho sem WebAudio não pode quebrar o fluxo */
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

/** B2 — última posição lida pelo watcher do geofence (pro mapa embutido). */
export interface PosicaoAoVivo {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Geofence FOREGROUND: observa a posição e, ao entrar no raio do alvo, chama
 * onChegada UMA vez por alvo (guarda por id — swipe para outra parada rearma).
 * Só roda enquanto `ativo`.
 * B2 — também devolve a ÚLTIMA posição lida (`posicao`): o mapa embutido usa
 * pra desenhar a bolinha do entregador ao vivo. ZERO watcher novo — é o MESMO
 * watchPosition de sempre, só exposto pra quem quiser ler.
 */
export function useGeofence(
  alvo: GeofenceAlvo | null,
  ativo: boolean,
  onChegada: (id: string) => void,
): { posicao: PosicaoAoVivo | null } {
  const disparadoRef = useRef<string | null>(null);
  const cbRef = useRef(onChegada);
  cbRef.current = onChegada;
  const [posicao, setPosicao] = useState<PosicaoAoVivo | null>(null);

  useEffect(() => {
    if (!ativo || !alvo) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // Alvo trocou (swipe) → rearma o disparo.
    if (disparadoRef.current !== alvo.id) disparadoRef.current = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const atual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosicao({
          lat: atual.lat,
          lng: atual.lng,
          accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : undefined,
        });
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

  return { posicao };
}

// ── M8 (offline-first) — fila de confirmações + sync com teto/backoff ──────────
const SYNC_INTERVAL_MS = 20_000; // varre a fila a cada 20s (NÃO é loop apertado).

export interface OfflineSync {
  pendentes: number; // total de itens ainda na fila (não sincronizados).
  precisamAtencao: number; // itens que estouraram o teto de tentativas.
  // B3 (offline VISÍVEL) — ids das entregas com confirmação AINDA na fila (pending
  // + needs_attention). A tela ESCONDE essas paradas do carrossel de abertas e as
  // marca com ⇅ na lista "Hoje" (some a reconfirmação de uma parada já confirmada).
  entregaIdsPendentes: Set<string>;
  // B3 — contador que sobe quando o sync de FUNDO esvazia itens (enviados>0). A tela
  // observa pra recarregar a rota (a parada some/vira "entregue" sem intervenção).
  sincronizados: number;
  // Enfileira uma confirmação (gera a key) e tenta sincronizar já. Devolve a key usada.
  enqueueConfirmacao: (entregaId: string, payload: Omit<ConfirmarPayload, "idempotencyKey">) => Promise<string>;
  // Força uma passada de sync (ex.: quando a rota recarrega). Best-effort, não lança.
  syncNow: () => Promise<void>;
}

/** Igualdade de conjuntos (evita re-render/refiltro do carrossel quando nada muda). */
function setsIguais(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
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
  const [entregaIdsPendentes, setEntregaIdsPendentes] = useState<Set<string>>(() => new Set());
  const [sincronizados, setSincronizados] = useState(0);
  const rodando = useRef(false); // evita 2 drains concorrentes (online + timer juntos).

  const refreshContagem = useCallback(async () => {
    const all = await listAll();
    setPendentes(all.length);
    setPrecisamAtencao(all.filter((i: PendenciaItem) => i.status === "needs_attention").length);
    // B3 — mantém a MESMA referência quando o conjunto não mudou (não refiltra o
    // carrossel à toa a cada varredura de 20s num aparelho fraco).
    const proximo = new Set(all.map((i: PendenciaItem) => i.entregaId));
    setEntregaIdsPendentes((prev) => (setsIguais(prev, proximo) ? prev : proximo));
  }, []);

  const syncNow = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      const res = await drain(async (item: PendenciaItem) => {
        // Manda o idempotencyKey ao servidor — a idempotência dura mora lá.
        await confirmarEntrega(item.entregaId, { ...item.payload, idempotencyKey: item.idempotencyKey });
      });
      // B3 — esvaziou item(ns) em background: sinaliza a tela pra recarregar a rota.
      if (res && res.enviados > 0) setSincronizados((n) => n + res.enviados);
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

  return { pendentes, precisamAtencao, entregaIdsPendentes, sincronizados, enqueueConfirmacao, syncNow };
}
