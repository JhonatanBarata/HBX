import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SILENCE_FLOOR_MAX_MS,
  SILENCE_FLOOR_MIN_MS,
  clampInteger,
  computeHumanTimingPhases,
  computeSilenceRemainderMs,
  computeTypingDelayMs,
  randomSilenceFloorMs,
} from './prospecting-bot-timing';

// ── clampInteger ────────────────────────────────────────────────────────────

test('clampInteger usa o fallback quando o valor nao e numero finito', () => {
  // Mesmo comportamento do clampInteger original (vendas-automation.service.ts):
  // Number(undefined)=NaN cai no fallback; Number(null)=0 NAO cai (0 e finito e
  // dentro do clamp) -- comportamento herdado de propósito, não regressão.
  assert.equal(clampInteger(undefined, 8, 0, 45), 8);
  assert.equal(clampInteger(null, 8, 0, 45), 0);
  assert.equal(clampInteger('abc', 8, 0, 45), 8);
  assert.equal(clampInteger(NaN, 8, 0, 45), 8);
});

test('clampInteger trunca e limita ao intervalo [min, max]', () => {
  assert.equal(clampInteger(120, 8, 0, 45), 45);
  assert.equal(clampInteger(-5, 8, 0, 45), 0);
  assert.equal(clampInteger(12.9, 8, 0, 45), 12);
});

// ── computeSilenceRemainderMs (fase 1: silêncio) ────────────────────────────
// Regra do dono (correção 05/07): NÃO existe teto fixo na fase de silêncio — o
// único limite é o timeout do classificador (env, calibrada à parte). Aqui só
// testamos que a função nunca soma o tempo da IA duas vezes e nunca fica negativa.

test('computeSilenceRemainderMs: IA mais rapida que o piso -> espera o restante do piso', () => {
  // IA (keyword) levou 0ms, piso humano de 3000ms -> espera os 3000ms inteiros.
  assert.equal(computeSilenceRemainderMs(0, 3000), 3000);
  assert.equal(computeSilenceRemainderMs(500, 3000), 2500);
});

test('computeSilenceRemainderMs: IA mais lenta que o piso -> zero espera adicional (sem teto)', () => {
  // IA (LLM) levou 9000ms, piso de 3000ms -> nao soma nada, e nao ha cap superior.
  assert.equal(computeSilenceRemainderMs(9000, 3000), 0);
  // Mesmo uma IA MUITO lenta (ex.: 60s, cenario de timeout alto recalibrado) continua
  // devolvendo 0 -- a funcao nunca introduz um teto proprio.
  assert.equal(computeSilenceRemainderMs(60000, 3000), 0);
});

test('computeSilenceRemainderMs: nunca fica negativo e ignora entradas invalidas', () => {
  assert.equal(computeSilenceRemainderMs(-100, 3000), 3000);
  assert.equal(computeSilenceRemainderMs(NaN as unknown as number, 3000), 3000);
  assert.equal(computeSilenceRemainderMs(1000, -50), 0);
});

// ── randomSilenceFloorMs (piso aleatório humano) ────────────────────────────

test('randomSilenceFloorMs: piso default fica dentro de 2-6s', () => {
  for (let i = 0; i < 200; i += 1) {
    const floor = randomSilenceFloorMs();
    assert.ok(floor >= SILENCE_FLOOR_MIN_MS, `floor ${floor} < ${SILENCE_FLOOR_MIN_MS}`);
    assert.ok(floor <= SILENCE_FLOOR_MAX_MS, `floor ${floor} > ${SILENCE_FLOOR_MAX_MS}`);
  }
});

test('randomSilenceFloorMs: rng determinístico controla o resultado (extremos)', () => {
  assert.equal(randomSilenceFloorMs(2000, 6000, () => 0), 2000);
  // rng->1 cairia 1ms acima do topo por causa do Math.floor(rng()*(range+1)); usamos
  // um valor bem proximo de 1 para testar o teto sem depender de arredondamento exato.
  const nearMax = randomSilenceFloorMs(2000, 6000, () => 0.999999);
  assert.ok(nearMax <= 6000 && nearMax >= 5999);
});

test('randomSilenceFloorMs: min/max invertidos nao quebram (normaliza)', () => {
  const floor = randomSilenceFloorMs(6000, 2000, () => 0.5);
  assert.ok(floor >= 2000 && floor <= 6000);
});

// ── computeTypingDelayMs (fase 3: digitando) — ÚNICO ponto com clamp ────────

test('computeTypingDelayMs: proporcional ao tamanho do texto dentro do teto', () => {
  // 50 chars * 60ms/char fixo = 3000ms, bem abaixo do teto (8+12=20s).
  const ms = computeTypingDelayMs(50, 8, 12, { msPerChar: 60 });
  assert.equal(ms, 3000);
});

test('computeTypingDelayMs: clampa no teto dos knobs typingSeconds+typingVarianceSeconds', () => {
  // Texto gigante (1000 chars) * 80ms/char = 80000ms, mas o teto e (8+12)*1000=20000ms.
  const ms = computeTypingDelayMs(1000, 8, 12, { msPerChar: 80 });
  assert.equal(ms, 20000);
});

test('computeTypingDelayMs: knobs zerados desliga o typing (compat campanhas antigas)', () => {
  assert.equal(computeTypingDelayMs(500, 0, 0, { msPerChar: 80 }), 0);
});

test('computeTypingDelayMs: knobs no maximo permitido (45+30=75s) ainda respeita o teto', () => {
  const ms = computeTypingDelayMs(100000, 45, 30, { msPerChar: 80 });
  assert.equal(ms, 75000);
});

test('computeTypingDelayMs: nunca fica negativo com texto vazio', () => {
  assert.equal(computeTypingDelayMs(0, 8, 12, { msPerChar: 60 }), 0);
  assert.equal(computeTypingDelayMs(-10, 8, 12, { msPerChar: 60 }), 0);
});

test('computeTypingDelayMs: msPerChar sorteado por rng fica dentro de 50-80ms/char', () => {
  const lengths = [10, 100];
  for (const length of lengths) {
    const msLow = computeTypingDelayMs(length, 45, 30, { rng: () => 0 });
    const msHigh = computeTypingDelayMs(length, 45, 30, { rng: () => 0.999999 });
    assert.ok(msLow <= msHigh + 1, `msLow=${msLow} deveria ser <= msHigh=${msHigh}`);
    assert.ok(msLow >= length * 50 - 1);
    assert.ok(msHigh <= length * 80 + 1);
  }
});

// ── computeHumanTimingPhases (orquestração das duas fases) ──────────────────

test('computeHumanTimingPhases: ordem/independencia das fases silencio e digitando', () => {
  const { silenceMs, typingMs } = computeHumanTimingPhases({
    aiElapsedMs: 0,
    responseBody: 'Boa! A ideia e entender como funciona a rotina de voces hoje.',
    typingSecondsKnob: 8,
    typingVarianceSecondsKnob: 12,
    rng: () => 0.5,
  });
  assert.ok(silenceMs > 0, 'silencio deve ser > 0 quando a IA foi instantanea (keyword)');
  assert.ok(typingMs > 0, 'digitando deve ser > 0 para uma resposta com texto');
  assert.ok(typingMs <= (8 + 12) * 1000, 'digitando nunca ultrapassa o teto dos knobs');
});

test('computeHumanTimingPhases: IA lenta (LLM) nao soma silencio extra, digitando fica intacto', () => {
  const { silenceMs, typingMs } = computeHumanTimingPhases({
    aiElapsedMs: 9000,
    responseBody: 'Perfeito. Primeiro eu entendo o cenario da empresa.',
    typingSecondsKnob: 8,
    typingVarianceSecondsKnob: 12,
    rng: () => 0.5,
  });
  assert.equal(silenceMs, 0);
  assert.ok(typingMs > 0);
});

test('computeHumanTimingPhases: resposta vazia -> digitando zero, silencio inalterado', () => {
  const { silenceMs, typingMs } = computeHumanTimingPhases({
    aiElapsedMs: 0,
    responseBody: '',
    typingSecondsKnob: 8,
    typingVarianceSecondsKnob: 12,
  });
  assert.equal(typingMs, 0);
  assert.ok(silenceMs >= 0);
});
