"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAutoTransferWorker, validateAutoBatchCompletion } = require("../lib/auto-transfer");

function createHarness(initialTotal, options = {}) {
  let total = initialTotal;
  let resume = options.resume || null;
  let failuresLeft = options.failures || 0;
  let clock = 0;
  const calls = [];
  const worker = createAutoTransferWorker({
    batchSize: 1000,
    backoffBaseMs: 100,
    backoffMaxMs: 800,
    now: () => clock,
    readLocalTotal: async () => total,
    isTransferRunning: () => false,
    getResume: () => resume,
    startBatch: async (requested) => {
      calls.push(requested);
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        resume = { direction: "push", trigger: "auto", batchSize: requested, remaining: requested };
        return { started: true, done: Promise.resolve({ ok: false, cleared: 0, error: "VPS indisponivel" }) };
      }
      const moved = Math.min(requested, total);
      total -= moved;
      resume = null;
      return { started: true, done: Promise.resolve({ ok: true, cleared: moved }) };
    },
  });
  return {
    worker,
    calls,
    total: () => total,
    advance: (ms) => { clock += ms; },
  };
}

test("999 leads nao abrem transferencia automatica", async () => {
  const h = createHarness(999);
  const result = await h.worker.tick();
  assert.equal(result.status, "below_threshold");
  assert.deepEqual(h.calls, []);
  assert.equal(h.total(), 999);
});

test("1000 leads abrem exatamente um lote de 1000", async () => {
  const h = createHarness(1000);
  const result = await h.worker.tick();
  assert.equal(result.status, "below_threshold");
  assert.equal(result.completedBatches, 1);
  assert.deepEqual(h.calls, [1000]);
  assert.equal(h.total(), 0);
});

test("2500 leads drenam dois lotes sequenciais e deixam 500", async () => {
  const h = createHarness(2500);
  const result = await h.worker.tick();
  assert.equal(result.status, "below_threshold");
  assert.equal(result.completedBatches, 2);
  assert.deepEqual(h.calls, [1000, 1000]);
  assert.equal(h.total(), 500);
});

test("falha preserva os leads e respeita backoff antes de tentar novamente", async () => {
  const h = createHarness(1000, { failures: 1 });

  const failed = await h.worker.tick();
  assert.equal(failed.status, "failed");
  assert.equal(failed.retryAfterMs, 100);
  assert.deepEqual(h.calls, [1000]);
  assert.equal(h.total(), 1000, "falha nao pode remover leads locais");

  const blocked = await h.worker.tick();
  assert.equal(blocked.status, "backoff");
  assert.deepEqual(h.calls, [1000], "nao deve repetir em loop apertado");

  h.advance(100);
  const recovered = await h.worker.tick();
  assert.equal(recovered.status, "below_threshold");
  assert.deepEqual(h.calls, [1000, 1000]);
  assert.equal(h.total(), 0);
});

test("journal automatico retoma o restante mesmo abaixo de 1000", async () => {
  const h = createHarness(400, {
    resume: { direction: "push", trigger: "auto", batchSize: 1000, remaining: 400 },
  });
  const result = await h.worker.tick();
  assert.equal(result.status, "below_threshold");
  assert.deepEqual(h.calls, [400]);
  assert.equal(h.total(), 0);
});

test("ticks concorrentes compartilham o mesmo lote em andamento", async () => {
  let total = 1000;
  let starts = 0;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const worker = createAutoTransferWorker({
    readLocalTotal: async () => total,
    isTransferRunning: () => false,
    getResume: () => null,
    startBatch: async () => {
      starts += 1;
      return { started: true, done };
    },
  });

  const first = worker.tick();
  const second = worker.tick();
  assert.strictEqual(second, first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts, 1);

  total = 0;
  finish({ ok: true, cleared: 1000 });
  await first;
  assert.equal(starts, 1);
});

test("lote automatico so confirma quando limpa exatamente o tamanho solicitado", () => {
  assert.deepEqual(validateAutoBatchCompletion({
    requested: 1000,
    selected: 1000,
    mapped: 1000,
    sent: 1000,
    cleared: 1000,
    cleanupFailed: false,
  }), { ok: true, reason: null });

  const partial = validateAutoBatchCompletion({
    requested: 1000,
    selected: 1000,
    mapped: 1000,
    sent: 1000,
    cleared: 999,
    cleanupFailed: false,
  });
  assert.equal(partial.ok, false);
  assert.match(partial.reason, /removeu 999 de 1000/);
});

test("POST no VPS OK com exclusao local falhando nunca vira sucesso", () => {
  const result = validateAutoBatchCompletion({
    requested: 1000,
    selected: 1000,
    mapped: 1000,
    sent: 1000,
    cleared: 0,
    cleanupFailed: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /falha ao limpar/);
});

test("card local invalido filtrado impede sucesso silencioso com lote menor", () => {
  const result = validateAutoBatchCompletion({
    requested: 1000,
    selected: 1000,
    mapped: 999,
    sent: 999,
    cleared: 999,
    cleanupFailed: false,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /mapeou 999 de 1000/);
});
