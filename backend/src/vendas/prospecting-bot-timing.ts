// Timing humano do bot de prospecção (ver → ler → digitar → enviar), PR05072026.
//
// Ordem exigida pelo dono (literal, docs/PLANEJAMENTOS/PR05072026/01-bot-timing-humano.md):
//   1. Silêncio total (sem read, sem presence) enquanto a IA classifica — a resposta já
//      está DECIDIDA quando esta fase acaba. Piso aleatório humano (`max(tempo da IA, piso)`)
//      porque o caminho keyword é ~0ms e responderia instantâneo (nada humano).
//   2. Marcar como lida (read/seen) SÓ ao fim da fase 1.
//   3. "Digitando" (presence composing) por tempo proporcional ao TAMANHO da resposta,
//      clampado nos knobs existentes `typingSeconds`/`typingVarianceSeconds` da campanha
//      (vendas-automation.service.ts, default 8 + rand(12)).
//   4. Enviar. Presence volta ao normal depois.
//
// Módulo PURO (sem I/O, sem Date.now() implícito fora dos parâmetros) para ser testável
// por unidade sem mockar Prisma/HTTP/timers globais.

/** Piso de "demora pra ver a mensagem" quando o classificador é instantâneo (keyword). */
export const SILENCE_FLOOR_MIN_MS = 2000;
export const SILENCE_FLOOR_MAX_MS = 6000;

/** ms de "digitando" por caractere da resposta — ~50-80ms/char pedido no briefing. */
export const TYPING_MS_PER_CHAR_MIN = 50;
export const TYPING_MS_PER_CHAR_MAX = 80;

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
}

/**
 * Fase 1 — silêncio. `aiElapsedMs` é o tempo que a classificação (IA ou fallback
 * keyword) já consumiu; `floorMs` é o piso humano sorteado para esta mensagem
 * (ver `randomSilenceFloorMs`). O resultado é SEMPRE >= 0 e nunca soma o tempo da
 * IA duas vezes — se a IA já demorou mais que o piso, a espera adicional é zero.
 */
export function computeSilenceRemainderMs(aiElapsedMs: number, floorMs: number): number {
  const elapsed = Math.max(0, Math.trunc(Number(aiElapsedMs) || 0));
  const floor = Math.max(0, Math.trunc(Number(floorMs) || 0));
  return Math.max(0, floor - elapsed);
}

/** Sorteia o piso humano de silêncio (jitter 2-6s por padrão, configurável via env). */
export function randomSilenceFloorMs(
  min: number = SILENCE_FLOOR_MIN_MS,
  max: number = SILENCE_FLOOR_MAX_MS,
  rng: () => number = Math.random,
): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(lo, Math.max(min, max));
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Fase 3 — digitando proporcional ao tamanho da resposta, clampado nos knobs
 * `typingSeconds`/`typingVarianceSeconds` já existentes da campanha (segundos,
 * não ms). `msPerChar` deixa o jitter de velocidade de digitação configurável;
 * por padrão sorteia dentro da faixa 50-80ms/char pedida no briefing.
 */
export function computeTypingDelayMs(
  bodyLength: number,
  typingSecondsKnob: number,
  typingVarianceSecondsKnob: number,
  options?: { msPerChar?: number; rng?: () => number },
): number {
  const rng = options?.rng ?? Math.random;
  const msPerChar =
    options?.msPerChar ?? TYPING_MS_PER_CHAR_MIN + rng() * (TYPING_MS_PER_CHAR_MAX - TYPING_MS_PER_CHAR_MIN);
  const length = Math.max(0, Math.trunc(Number(bodyLength) || 0));
  const rawMs = length * msPerChar;

  // Clamp nos knobs existentes (segundos -> ms). typingSeconds=0 e variance=0 desliga
  // o typing (campanhas com o knob zerado continuam sem digitar, comportamento intacto).
  const minMs = 0;
  const maxMs = (Math.max(0, typingSecondsKnob) + Math.max(0, typingVarianceSecondsKnob)) * 1000;
  if (maxMs <= 0) return 0;
  return Math.min(Math.max(rawMs, minMs), maxMs);
}

export type HumanTimingPhases = {
  /** Fase 1: ms de silêncio total (sem read, sem presence) ainda faltando. */
  silenceMs: number;
  /** Fase 3: ms de presence "composing" antes do envio. */
  typingMs: number;
};

/**
 * Calcula as duas fases de espera (silêncio + digitando) de uma vez, a partir dos
 * knobs da campanha e do texto já decidido. Não faz I/O — quem chama decide QUANDO
 * aguardar (silêncio) e QUANDO marcar como lida / mandar presence (typing).
 */
export function computeHumanTimingPhases(input: {
  aiElapsedMs: number;
  responseBody: string;
  typingSecondsKnob: number;
  typingVarianceSecondsKnob: number;
  silenceFloorMinMs?: number;
  silenceFloorMaxMs?: number;
  msPerChar?: number;
  rng?: () => number;
}): HumanTimingPhases {
  const rng = input.rng ?? Math.random;
  const floorMs = randomSilenceFloorMs(input.silenceFloorMinMs, input.silenceFloorMaxMs, rng);
  const silenceMs = computeSilenceRemainderMs(input.aiElapsedMs, floorMs);
  const typingMs = computeTypingDelayMs(
    String(input.responseBody || '').length,
    input.typingSecondsKnob,
    input.typingVarianceSecondsKnob,
    { msPerChar: input.msPerChar, rng },
  );
  return { silenceMs, typingMs };
}
