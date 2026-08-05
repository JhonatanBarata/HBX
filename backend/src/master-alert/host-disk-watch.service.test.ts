import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateHostPressure, HostPressureSample, HostPressureThresholds } from './host-disk-watch.service';

// VIGIA DO DISCO — o avaliador é PURO: amostra → veredito. O que provamos aqui:
//   1. o estado real da VPS em 05/08 (68% disco, 44% RAM, swap 100%) NÃO grita;
//   2. as faixas de 80% e 90% do disco levantam o nível certo;
//   3. swap cheio só conta ACOMPANHADO de RAM apertada (senão o alarme gritaria
//      todo dia nesta máquina e o dono aprenderia a ignorar).

const THRESHOLDS: HostPressureThresholds = {
  diskWarnPct: 80,
  diskCritPct: 90,
  memWarnPct: 92,
  swapWarnPct: 90,
  swapWithMemAbovePct: 85,
};

function sample(partial: Partial<HostPressureSample>): HostPressureSample {
  return {
    diskUsedPct: 50,
    diskTotalGib: 194,
    diskFreeGib: 90,
    memUsedPct: 44,
    swapUsedPct: 0,
    ...partial,
  };
}

test('estado real da VPS em 05/08 (disco 68%, RAM 44%, swap 100%) NÃO grita', () => {
  const verdict = evaluateHostPressure(
    sample({ diskUsedPct: 68, memUsedPct: 44, swapUsedPct: 100 }),
    THRESHOLDS,
  );
  assert.equal(verdict.level, 'ok');
  assert.deepEqual(verdict.reasons, []);
});

test('o estado que ninguém viu (84%) teria virado aviso', () => {
  const verdict = evaluateHostPressure(sample({ diskUsedPct: 84 }), THRESHOLDS);
  assert.equal(verdict.level, 'warning');
  assert.match(verdict.reasons.join(','), /disco=84%/);
});

test('disco >=90% é crítico (é onde o Postgres para de escrever)', () => {
  assert.equal(evaluateHostPressure(sample({ diskUsedPct: 90 }), THRESHOLDS).level, 'critical');
  assert.equal(evaluateHostPressure(sample({ diskUsedPct: 97 }), THRESHOLDS).level, 'critical');
});

test('exatamente no limiar de aviso (80%) já avisa; 79% não', () => {
  assert.equal(evaluateHostPressure(sample({ diskUsedPct: 80 }), THRESHOLDS).level, 'warning');
  assert.equal(evaluateHostPressure(sample({ diskUsedPct: 79 }), THRESHOLDS).level, 'ok');
});

test('swap 100% com RAM folgada NÃO é motivo (normal desta máquina)', () => {
  const verdict = evaluateHostPressure(sample({ swapUsedPct: 100, memUsedPct: 60 }), THRESHOLDS);
  assert.equal(verdict.level, 'ok');
});

test('swap 100% COM RAM apertada (>=85%) vira aviso de risco de OOM', () => {
  const verdict = evaluateHostPressure(sample({ swapUsedPct: 100, memUsedPct: 88 }), THRESHOLDS);
  assert.equal(verdict.level, 'warning');
  assert.match(verdict.reasons.join(','), /risco de OOM/);
});

test('RAM >=92% avisa sozinha, mesmo sem swap', () => {
  const verdict = evaluateHostPressure(sample({ memUsedPct: 95, swapUsedPct: 0 }), THRESHOLDS);
  assert.equal(verdict.level, 'warning');
  assert.match(verdict.reasons.join(','), /RAM=95%/);
});

test('RAM/swap nunca promovem a CRÍTICO sozinhos — só disco faz isso', () => {
  const verdict = evaluateHostPressure(
    sample({ diskUsedPct: 50, memUsedPct: 99, swapUsedPct: 100 }),
    THRESHOLDS,
  );
  assert.equal(verdict.level, 'warning');
});

test('disco crítico + RAM apertada acumula os dois motivos e segue crítico', () => {
  const verdict = evaluateHostPressure(
    sample({ diskUsedPct: 93, memUsedPct: 95, swapUsedPct: 100 }),
    THRESHOLDS,
  );
  assert.equal(verdict.level, 'critical');
  assert.equal(verdict.reasons.length, 3);
});

test('host sem swap (-1) nunca vira motivo', () => {
  const verdict = evaluateHostPressure(sample({ swapUsedPct: -1, memUsedPct: 90 }), THRESHOLDS);
  assert.equal(verdict.reasons.join(','), '');
  assert.equal(verdict.level, 'ok');
});

test('limiar 0 desliga o sinal correspondente', () => {
  const off: HostPressureThresholds = { ...THRESHOLDS, diskWarnPct: 0, diskCritPct: 0, memWarnPct: 0, swapWarnPct: 0 };
  assert.equal(evaluateHostPressure(sample({ diskUsedPct: 99, memUsedPct: 99, swapUsedPct: 100 }), off).level, 'ok');
});

test('state serve de dedup: mesmo nível e mesmo % não repete; 1% a mais é episódio novo', () => {
  const a = evaluateHostPressure(sample({ diskUsedPct: 84.2 }), THRESHOLDS).state;
  const b = evaluateHostPressure(sample({ diskUsedPct: 84.4 }), THRESHOLDS).state;
  const c = evaluateHostPressure(sample({ diskUsedPct: 86 }), THRESHOLDS).state;
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a, 'warning:d84');
});

test('número inválido (NaN) nunca vira alarme fantasma', () => {
  const verdict = evaluateHostPressure(
    sample({ diskUsedPct: Number.NaN, memUsedPct: Number.NaN, swapUsedPct: Number.NaN }),
    THRESHOLDS,
  );
  assert.equal(verdict.level, 'ok');
});
