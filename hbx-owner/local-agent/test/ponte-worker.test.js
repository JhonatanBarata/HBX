"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  createPonteWorker,
  decideNextAction,
  computeBackoffMs,
  safeParseJson,
  PONTE_NUM_CTX,
} = require("../lib/ponte-worker");

// ─── Fakes injetáveis: gravam as chamadas e devolvem respostas roteirizadas ──────────────────────

function makeBackend(routeResponders) {
  const calls = [];
  const backendRequest = async (method, route, payload) => {
    calls.push({ method, route, payload });
    // procura por sufixo de rota (o :id varia) OU rota exata
    for (const [match, responder] of Object.entries(routeResponders)) {
      if (route === match || route.endsWith(match)) {
        return typeof responder === "function" ? responder(payload, route) : responder;
      }
    }
    return { ok: true, data: { ok: true } };
  };
  return { backendRequest, calls };
}

function makeOllama(responders) {
  const calls = [];
  const ollamaRequest = async (method, route, payload) => {
    calls.push({ method, route, payload });
    const key = `${method} ${route}`;
    const responder = responders[key] || responders[route];
    return typeof responder === "function" ? responder(payload) : (responder || { ok: true, data: {} });
  };
  return { ollamaRequest, calls };
}

function baseEnv(overrides = {}) {
  return {
    HBX_PONTE_WORKER_ENABLED: "on",
    HBX_PONTE_POLL_BASE_MS: "5000",
    HBX_PONTE_POLL_CAP_MS: "300000",
    HBX_PONTE_MAX_CONSECUTIVE_FAILURES: "3",
    HBX_PONTE_ACTIVITY_FREIA_THRESHOLD: "1",
    HBX_PONTE_UNLOAD_AFTER_IDLE_MS: "600000",
    ...overrides,
  };
}

// ─── 1. decideNextAction — o coração puro do elástico/freios ─────────────────────────────────────

test("decideNextAction: disjuntor aberto vence tudo", () => {
  const d = decideNextAction({ circuitOpen: true, activeUsers: 0, queuedDue: 5, warm: true });
  assert.equal(d.action, "circuit_open");
});

test("decideNextAction: usuário ativo → freia (mesmo com fila e quente)", () => {
  const d = decideNextAction({ circuitOpen: false, activeUsers: 1, queuedDue: 10, warm: true });
  assert.equal(d.action, "freia");
  assert.match(d.reason, /1 usuário/);
});

test("decideNextAction: fila vazia e ninguém ativo → idle", () => {
  const d = decideNextAction({ circuitOpen: false, activeUsers: 0, queuedDue: 0, warm: true });
  assert.equal(d.action, "idle");
});

test("decideNextAction: tem trabalho, ninguém ativo, FRIO → warm (nunca leaseia frio)", () => {
  const d = decideNextAction({ circuitOpen: false, activeUsers: 0, queuedDue: 3, warm: false });
  assert.equal(d.action, "warm");
});

test("decideNextAction: tem trabalho, ninguém ativo, QUENTE → work", () => {
  const d = decideNextAction({ circuitOpen: false, activeUsers: 0, queuedDue: 3, warm: true });
  assert.equal(d.action, "work");
});

test("decideNextAction: fila pausada → idle", () => {
  const d = decideNextAction({ circuitOpen: false, activeUsers: 0, queuedDue: 3, warm: true, paused: true });
  assert.equal(d.action, "idle");
});

test("decideNextAction: threshold de freio configurável (>=2 só freia com 2)", () => {
  assert.equal(decideNextAction({ activeUsers: 1, activityFreiaThreshold: 2, queuedDue: 3, warm: true }).action, "work");
  assert.equal(decideNextAction({ activeUsers: 2, activityFreiaThreshold: 2, queuedDue: 3, warm: true }).action, "freia");
});

// ─── 2. Backoff exponencial com teto ─────────────────────────────────────────────────────────────

test("computeBackoffMs: exponencial 1→base, 2→2x, 3→4x, com teto", () => {
  assert.equal(computeBackoffMs(1, 1000, 60000), 1000);
  assert.equal(computeBackoffMs(2, 1000, 60000), 2000);
  assert.equal(computeBackoffMs(3, 1000, 60000), 4000);
  assert.equal(computeBackoffMs(10, 1000, 8000), 8000); // capa
});

// ─── 3. safeParseJson tolerante ──────────────────────────────────────────────────────────────────

test("safeParseJson: extrai bloco JSON de texto sujo", () => {
  assert.deepEqual(safeParseJson('lixo {"a":1} mais lixo'), { a: 1 });
  assert.equal(safeParseJson("sem json"), null);
});

// ─── 4. tick: lease VAZIO (idle) não processa nem abre disjuntor ─────────────────────────────────

test("tick idle: lease sem missões e fila vazia → idle, sem chamada ao Ollama", async () => {
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [], activity: { activeUsers: 0 }, lag: { queuedDue: 0 } } },
  });
  const ollama = makeOllama({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  const delay = await w._tickOnce();
  assert.equal(w.status().lastAction, "idle");
  assert.equal(ollama.calls.length, 0, "não deve tocar o Ollama quando idle");
  assert.ok(delay > 0);
});

// ─── 5. tick: freio por atividade solta o lease e recua ──────────────────────────────────────────

test("tick freia: usuário ativo → devolve missão leaseada (fail retryable) e não chama Ollama", async () => {
  const failCalls = [];
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "m1", stage: "xray_note", leaseId: "L1", payload: {} }], activity: { activeUsers: 2 }, lag: { queuedDue: 5 } } },
    "/fail": (payload, route) => { failCalls.push({ route, payload }); return { ok: true, data: { ok: true } }; },
  });
  const ollama = makeOllama({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  await w._tickOnce();
  assert.equal(w.status().lastAction, "freia");
  assert.equal(ollama.calls.length, 0, "não processa nada durante o freio");
  assert.equal(failCalls.length, 1, "devolve a missão leaseada pra fila");
  assert.equal(failCalls[0].payload.retryable, true);
  assert.match(failCalls[0].payload.error, /cedendo/);
});

// ─── 6. warm-check bloqueando lease (lei anti-swap) ──────────────────────────────────────────────

test("tick warm: 30B frio → warm-check exclusivo (1-token, ctx 8192) ANTES de processar", async () => {
  const generateBodies = [];
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "m1", stage: "xray_note", leaseId: "L1", payload: {} }], activity: { activeUsers: 0 }, lag: { queuedDue: 5 } } },
    "/fail": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [] } }, // frio
    "POST /api/generate": (payload) => { generateBodies.push(payload); return { ok: true, data: { done: true } }; },
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  await w._tickOnce();
  assert.equal(w.status().lastAction, "warm");
  assert.equal(w.status().warm, true, "warm-check deixou o modelo residente");
  // a chamada de warm é 1-token com num_ctx unificado 8192
  assert.equal(generateBodies.length, 1);
  assert.equal(generateBodies[0].options.num_predict, 1);
  assert.equal(generateBodies[0].options.num_ctx, PONTE_NUM_CTX);
  assert.equal(generateBodies[0].keep_alive, -1);
  // nenhuma missão processada neste tick (só aqueceu) — não chamou /api/chat
  assert.ok(!ollama.calls.some((c) => c.route === "/api/chat"), "não processa missão no tick de warm");
});

// ─── 7. tick work: processa xray_note quente → complete com num_ctx 8192 ──────────────────────────

test("tick work: nota xray processada no 30B quente → complete com resultado", async () => {
  const completeCalls = [];
  const chatBodies = [];
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mX", stage: "xray_note", leaseId: "LX", payload: { radarLeadId: "lead-1", note: { razaoSocial: "ACME LTDA", situacao: "ATIVA", cnaeDescription: "Comércio", porte: "ME", city: "SP", state: "SP", hasWebsite: true, hasWhatsappValidado: true, hasEmail: true } } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/complete": (payload) => { completeCalls.push(payload); return { ok: true, data: { ok: true } }; },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } }, // já quente
    "POST /api/chat": (payload) => { chatBodies.push(payload); return { ok: true, data: { message: { content: '{"nota_icp": 72, "resumo": "empresa ativa com canais"}' } } }; },
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  // 1º tick: já quente (ps resident) → work direto
  w._state.warm = true;
  await w._tickOnce();
  assert.equal(w.status().lastAction, "work");
  assert.equal(chatBodies.length, 1);
  assert.equal(chatBodies[0].options.num_ctx, PONTE_NUM_CTX, "num_ctx unificado 8192");
  assert.equal(completeCalls.length, 1);
  assert.equal(completeCalls[0].result.notaIcp, 72);
  assert.equal(completeCalls[0].result.radarLeadId, "lead-1");
  assert.equal(w.status().totals.completed, 1);
});

// ─── 8. Disjuntor: N falhas consecutivas → circuito abre, para de leasear ─────────────────────────

test("disjuntor: falhas consecutivas até o teto abrem o circuito e param o worker", async () => {
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mF", stage: "xray_note", leaseId: "LF", payload: { radarLeadId: "l", note: { razaoSocial: "X", situacao: "A", cnaeDescription: "C", porte: "ME", city: "SP", state: "SP", hasWebsite: true, hasWhatsappValidado: true, hasEmail: true } } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/fail": { ok: true, data: { ok: true } },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } },
    "POST /api/chat": { ok: false, error: "timeout" }, // sempre falha
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv({ HBX_PONTE_MAX_CONSECUTIVE_FAILURES: "3" }) });
  w._state.warm = true;
  await w._tickOnce(); // falha 1
  assert.equal(w.status().circuitOpen, false);
  assert.equal(w.status().consecutiveFailures, 1);
  w._state.warm = true;
  await w._tickOnce(); // falha 2
  assert.equal(w.status().consecutiveFailures, 2);
  w._state.warm = true;
  await w._tickOnce(); // falha 3 → abre
  assert.equal(w.status().circuitOpen, true);
  assert.match(w.status().circuitReason, /3 falhas/);
  // com o circuito aberto, o próximo tick não leaseia mais
  const before = backend.calls.length;
  await w._tickOnce();
  assert.equal(backend.calls.length, before, "circuito aberto → não faz mais chamadas de lease");
  // rearmar fecha o circuito
  w.resetCircuit();
  assert.equal(w.status().circuitOpen, false);
  assert.equal(w.status().consecutiveFailures, 0);
});

// ─── 9. Falha de REDE no lease NÃO abre disjuntor (só backoff) ────────────────────────────────────

test("falha de rede no lease: backoff, NÃO conta pro disjuntor", async () => {
  const backend = makeBackend({ "/lease": { ok: false, error: "ECONNREFUSED" } });
  const ollama = makeOllama({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  const delay = await w._tickOnce();
  assert.equal(w.status().lastAction, "backoff_lease");
  assert.equal(w.status().circuitOpen, false);
  assert.equal(w.status().consecutiveFailures, 0, "rede não conta pro disjuntor");
  assert.ok(delay >= 5000);
});

// ─── 10. Idempotência: complete recusado pelo backend (apply falhou) → fail retryable ────────────

test("complete recusado (apply falhou) → worker marca fail retryable, não conta como sucesso", async () => {
  const failCalls = [];
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mR", stage: "xray_note", leaseId: "LR", payload: { radarLeadId: "l", note: { razaoSocial: "X", situacao: "A", cnaeDescription: "C", porte: "ME", city: "SP", state: "SP", hasWebsite: true, hasWhatsappValidado: true, hasEmail: true } } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/complete": { ok: false, data: { ok: false, reason: "apply_failed:update_falhou", retryable: true } },
    "/fail": (payload) => { failCalls.push(payload); return { ok: true, data: { ok: true } }; },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } },
    "POST /api/chat": { ok: true, data: { message: { content: '{"nota_icp": 50, "resumo": "ok"}' } } },
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  await w._tickOnce();
  assert.equal(w.status().totals.completed, 0);
  assert.equal(w.status().totals.failed, 1);
  assert.equal(failCalls.length, 1);
  assert.equal(failCalls[0].retryable, true, "complete recusado é retomável (idempotente ao reprocessar)");
});

// ─── 11. start() é no-op quando desligado (flag OFF default) ─────────────────────────────────────

test("worker DESLIGADO (flag OFF) não inicia loop", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv({ HBX_PONTE_WORKER_ENABLED: "" }) });
  assert.equal(w.start(), false);
  assert.equal(w.status().enabled, false);
  assert.equal(w.status().running, false);
});
