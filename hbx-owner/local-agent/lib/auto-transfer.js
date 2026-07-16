"use strict";

// Agenda a transferencia local -> VPS sem criar um segundo fluxo de importacao.
// O worker decide QUANDO abrir um lote; o envio, journal, limpeza e lock continuam
// pertencendo ao startBatch injetado pelo server.js (o mesmo usado pela rota manual).

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_POLL_MS = 30_000;
const DEFAULT_BACKOFF_BASE_MS = 30_000;
const DEFAULT_BACKOFF_MAX_MS = 10 * 60_000;
const DEFAULT_MAX_BATCHES_PER_TICK = 50;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

// Confirma o contrato destrutivo do lote automatico: so existe sucesso quando
// exatamente o que foi solicitado chegou ao VPS e saiu do banco local.
function validateAutoBatchCompletion(input = {}) {
  const requested = positiveInt(input.requested, 0);
  const selected = Math.max(0, Number(input.selected) || 0);
  const mapped = Math.max(0, Number(input.mapped) || 0);
  const sent = Math.max(0, Number(input.sent) || 0);
  const cleared = Math.max(0, Number(input.cleared) || 0);
  if (!requested) return { ok: false, reason: "tamanho do lote automatico invalido" };
  if (input.cleanupFailed === true) return { ok: false, reason: "falha ao limpar o lote no banco local" };
  if (selected !== requested) return { ok: false, reason: `lote incompleto: leu ${selected} de ${requested}` };
  if (mapped !== requested) return { ok: false, reason: `lote invalido: mapeou ${mapped} de ${requested}` };
  if (sent !== requested) return { ok: false, reason: `lote incompleto: enviou ${sent} de ${requested}` };
  if (cleared !== requested) return { ok: false, reason: `limpeza incompleta: removeu ${cleared} de ${requested}` };
  return { ok: true, reason: null };
}

function createAutoTransferWorker(deps = {}) {
  const readLocalTotal = deps.readLocalTotal;
  const isTransferRunning = deps.isTransferRunning;
  const getResume = deps.getResume;
  const startBatch = deps.startBatch;
  if (typeof readLocalTotal !== "function") throw new Error("auto-transfer: readLocalTotal obrigatorio");
  if (typeof isTransferRunning !== "function") throw new Error("auto-transfer: isTransferRunning obrigatorio");
  if (typeof getResume !== "function") throw new Error("auto-transfer: getResume obrigatorio");
  if (typeof startBatch !== "function") throw new Error("auto-transfer: startBatch obrigatorio");

  const batchSize = positiveInt(deps.batchSize, DEFAULT_BATCH_SIZE);
  const pollMs = positiveInt(deps.pollMs, DEFAULT_POLL_MS);
  const backoffBaseMs = positiveInt(deps.backoffBaseMs, DEFAULT_BACKOFF_BASE_MS);
  const backoffMaxMs = Math.max(backoffBaseMs, positiveInt(deps.backoffMaxMs, DEFAULT_BACKOFF_MAX_MS));
  const maxBatchesPerTick = positiveInt(deps.maxBatchesPerTick, DEFAULT_MAX_BATCHES_PER_TICK);
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const setTimer = typeof deps.setTimer === "function" ? deps.setTimer : setTimeout;
  const clearTimer = typeof deps.clearTimer === "function" ? deps.clearTimer : clearTimeout;
  const log = typeof deps.log === "function" ? deps.log : () => {};

  let timer = null;
  let started = false;
  let tickPromise = null;
  let consecutiveFailures = 0;
  let nextAttemptAt = 0;

  function autoResume() {
    const resume = getResume();
    if (!resume || resume.direction !== "push" || resume.trigger !== "auto") return null;
    if (Number.isFinite(Number(resume.remaining)) && Number(resume.remaining) <= 0) return null;
    const remaining = positiveInt(resume.remaining, positiveInt(resume.batchSize, batchSize));
    return { ...resume, remaining };
  }

  function failure(reason) {
    // Exponencial, mas limitado: nunca gira em loop apertado nem cresce sem teto.
    consecutiveFailures = Math.min(consecutiveFailures + 1, 16);
    const exponent = Math.min(consecutiveFailures - 1, 10);
    const retryAfterMs = Math.min(backoffMaxMs, backoffBaseMs * (2 ** exponent));
    nextAttemptAt = now() + retryAfterMs;
    log(`[auto-transfer] falha: ${reason}; nova tentativa em ${retryAfterMs}ms.`);
    return { status: "failed", reason, retryAfterMs, consecutiveFailures };
  }

  async function runTick() {
    const waitMs = nextAttemptAt - now();
    if (waitMs > 0) return { status: "backoff", retryAfterMs: waitMs, consecutiveFailures };
    if (isTransferRunning()) return { status: "busy", retryAfterMs: pollMs };

    let completedBatches = 0;
    while (completedBatches < maxBatchesPerTick) {
      if (isTransferRunning()) return { status: "busy", completedBatches, retryAfterMs: pollMs };

      const resume = autoResume();
      let total;
      try {
        total = Number(await readLocalTotal());
      } catch (error) {
        return failure(error?.message || "falha ao contar banco local");
      }
      if (!Number.isFinite(total) || total < 0) return failure("contagem local indisponivel");

      // Um journal automatico interrompido completa o lote original mesmo se restarem
      // menos de 1.000. Sem journal, abaixo de 1.000 nunca abre transferencia.
      const requested = resume ? Math.min(batchSize, resume.remaining) : (total >= batchSize ? batchSize : 0);
      if (requested <= 0) {
        consecutiveFailures = 0;
        nextAttemptAt = 0;
        return { status: "below_threshold", total, completedBatches, retryAfterMs: pollMs };
      }

      let launch;
      try {
        launch = await startBatch(requested, { resume, total });
      } catch (error) {
        return failure(error?.message || "falha ao iniciar lote automatico");
      }
      if (!launch || launch.started !== true || !launch.done || typeof launch.done.then !== "function") {
        return { status: "busy", completedBatches, retryAfterMs: pollMs };
      }

      let outcome;
      try {
        outcome = await launch.done;
      } catch (error) {
        return failure(error?.message || "lote automatico falhou");
      }
      if (!outcome || outcome.ok !== true) {
        return failure(outcome?.error || outcome?.lastError || "lote automatico falhou");
      }

      const cleared = Number(outcome.cleared) || 0;
      if (cleared <= 0) return failure("lote concluido sem remover leads do banco local");

      consecutiveFailures = 0;
      nextAttemptAt = 0;
      completedBatches += 1;
      // Volta ao topo e reconta. Assim 2.500 vira 1.000 + 1.000, sempre
      // sequencialmente, e deixa 500 sem abrir uma terceira transferencia.
    }

    return { status: "yield", completedBatches, retryAfterMs: 1 };
  }

  function tick() {
    if (tickPromise) return tickPromise;
    tickPromise = runTick().finally(() => { tickPromise = null; });
    return tickPromise;
  }

  function schedule(delayMs) {
    if (!started) return;
    if (timer) clearTimer(timer);
    timer = setTimer(async () => {
      timer = null;
      const result = await tick().catch((error) => failure(error?.message || "tick falhou"));
      schedule(positiveInt(result?.retryAfterMs, pollMs));
    }, Math.max(0, Number(delayMs) || 0));
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function start(initialDelayMs = 5_000) {
    if (started) return false;
    started = true;
    schedule(initialDelayMs);
    return true;
  }

  function stop() {
    started = false;
    if (timer) clearTimer(timer);
    timer = null;
  }

  function status() {
    return {
      started,
      inFlight: Boolean(tickPromise),
      batchSize,
      consecutiveFailures,
      nextAttemptAt,
    };
  }

  return { start, stop, tick, status };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  createAutoTransferWorker,
  validateAutoBatchCompletion,
};
