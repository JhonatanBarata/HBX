"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  createPonteWorker,
  decideNextAction,
  computeBackoffMs,
  safeParseJson,
  selectRunnerPidsToKill,
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

function makeControlStore(initial = null, saveOk = true) {
  let value = initial;
  return {
    load: () => value,
    save: (next) => {
      if (!saveOk) return false;
      value = { ...next };
      return true;
    },
    read: () => value,
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
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "m1", stage: "enrich_lead", leaseId: "L1", payload: {} }], activity: { activeUsers: 2 }, lag: { queuedDue: 5 } } },
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
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "m1", stage: "enrich_lead", leaseId: "L1", payload: {} }], activity: { activeUsers: 0 }, lag: { queuedDue: 5 } } },
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

// ─── 7. tick work: processa enrich_lead quente → complete com num_ctx 8192 ────────────────────────

test("tick work: enrich_lead processado no 30B quente → complete com resultado", async () => {
  const completeCalls = [];
  const chatBodies = [];
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mX", stage: "enrich_lead", leaseId: "LX", payload: { radarLeadId: "lead-1", name: "ACME LTDA", website: "https://acme.test" } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/complete": (payload) => { completeCalls.push(payload); return { ok: true, data: { ok: true } }; },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } }, // já quente
    "POST /api/chat": (payload) => { chatBodies.push(payload); return { ok: true, data: { message: { content: '{"telefones":["1132224455"],"emails":["contato@acme.test"],"nome_dono":null}' } } }; },
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, fetchSiteText: async () => "Contato 11 3222-4455 contato@acme.test", env: baseEnv() });
  // 1º tick: já quente (ps resident) → work direto
  w._state.warm = true;
  await w._tickOnce();
  assert.equal(w.status().lastAction, "work");
  assert.equal(chatBodies.length, 1);
  assert.equal(chatBodies[0].options.num_ctx, PONTE_NUM_CTX, "num_ctx unificado 8192");
  assert.equal(completeCalls.length, 1);
  assert.deepEqual(completeCalls[0].result.telefones, ["1132224455"]);
  assert.equal(completeCalls[0].result.radarLeadId, "lead-1");
  assert.equal(w.status().totals.completed, 1);
});

// ─── 8. Disjuntor: N falhas consecutivas → circuito abre, para de leasear ─────────────────────────

test("disjuntor: falhas consecutivas até o teto abrem o circuito e param o worker", async () => {
  const backend = makeBackend({
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mF", stage: "enrich_lead", leaseId: "LF", payload: { radarLeadId: "l", website: "https://acme.test" } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/fail": { ok: true, data: { ok: true } },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } },
    "POST /api/chat": { ok: false, error: "timeout" }, // sempre falha
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, fetchSiteText: async () => "Contato 11 3222-4455", env: baseEnv({ HBX_PONTE_MAX_CONSECUTIVE_FAILURES: "3" }) });
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
    "/lease": { ok: true, data: { supported: true, paused: false, missions: [{ id: "mR", stage: "enrich_lead", leaseId: "LR", payload: { radarLeadId: "l", website: "https://acme.test" } }], activity: { activeUsers: 0 }, lag: { queuedDue: 1 } } },
    "/complete": { ok: false, data: { ok: false, reason: "apply_failed:update_falhou", retryable: true } },
    "/fail": (payload) => { failCalls.push(payload); return { ok: true, data: { ok: true } }; },
    "/heartbeat": { ok: true, data: { ok: true } },
  });
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } },
    "POST /api/chat": { ok: true, data: { message: { content: '{"telefones":["1132224455"],"emails":[],"nome_dono":null}' } } },
  });
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, fetchSiteText: async () => "Contato 11 3222-4455", env: baseEnv() });
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
  assert.equal(w.status().manualEnabled, false);
  assert.equal(w.status().pausedByOwner, true);
  assert.equal(w.status().running, false);
});

test("sem journal, o primeiro boot segue a configuração automática/env", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = makeControlStore();
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  assert.equal(w.status().manualEnabled, true);
  assert.equal(w.status().controlSource, "automatic_config");
  assert.equal(w.start(), true);
  assert.equal(w.status().running, true);
});

test("freio do dono persiste e o boot não rearma mesmo com env ligado", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = makeControlStore();
  const first = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  assert.equal(first.setManualEnabled(false).ok, true);
  assert.equal(store.read().pausedByOwner, true);

  const rebooted = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  assert.equal(rebooted.status().manualEnabled, false);
  assert.equal(rebooted.status().pausedByOwner, true);
  assert.equal(rebooted.status().controlSource, "owner");
  assert.equal(rebooted.start(), false);
});

test("journal corrompido falha seguro e não rearma a ponte pelo env", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = {
    load: () => null,
    inspect: () => ({ status: "corrupt", data: null }),
    save: () => true,
  };
  const worker = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });

  assert.equal(worker.status().manualEnabled, false);
  assert.equal(worker.status().pausedByOwner, true);
  assert.equal(worker.status().controlSource, "fail_safe");
  assert.equal(worker.status().lastError, "controle_persistente_invalido");
  assert.equal(worker.start(), false);
  assert.equal(backend.calls.length, 0);
});

test("journal realmente ausente ainda permite a configuração automática do primeiro boot", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = {
    load: () => null,
    inspect: () => ({ status: "missing", data: null }),
    save: () => true,
  };
  const worker = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });

  assert.equal(worker.status().manualEnabled, true);
  assert.equal(worker.status().controlSource, "automatic_config");
});

test("journal presente com formato inválido também falha seguro", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = {
    load: () => ({ manualEnabled: "sim" }),
    inspect: () => ({ status: "valid", data: { manualEnabled: "sim" } }),
    save: () => true,
  };
  const worker = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });

  assert.equal(worker.status().manualEnabled, false);
  assert.equal(worker.status().controlSource, "fail_safe");
  assert.equal(worker.start(), false);
});

test("enabled=true libera novamente, confirma estado final e persiste no reboot", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = makeControlStore({ manualEnabled: false, pausedByOwner: true, updatedAt: "antes" });
  const first = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  const result = first.setManualEnabled(true);
  assert.equal(result.ok, true);
  assert.equal(result.status.manualEnabled, true);
  assert.equal(result.status.pausedByOwner, false);
  assert.equal(result.status.running, true);
  assert.equal(store.read().manualEnabled, true);

  const rebooted = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  assert.equal(rebooted.status().manualEnabled, true);
  assert.equal(rebooted.start(), true);
});

// ─── 12. readResident() — leitura da VERDADE via /api/ps (E2-a) ──────────────────────────────────

test("readResident: modelo presente no /api/ps → resident:true, ramMb convertido de bytes", async () => {
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M", size: 19_000_000_000 }] } },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  const r = await w.readResident();
  assert.equal(r.ok, true);
  assert.equal(r.resident, true);
  assert.equal(r.ramMb, 19000);
  assert.equal(r.error, null);
});

test("readResident: /api/ps devolve campo 'model' (não 'name') e nenhum match → resident:false", async () => {
  const ollama = makeOllama({
    "GET /api/ps": { ok: true, data: { models: [{ model: "outro-modelo:8b", size: 4_000_000_000 }] } },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  const r = await w.readResident();
  assert.equal(r.ok, true);
  assert.equal(r.resident, false);
  assert.equal(r.ramMb, null);
});

test("readResident: Ollama fora do ar → ok:false, resident:false, error 'ollama_off' (não é 'desligado')", async () => {
  const ollama = makeOllama({ "GET /api/ps": { ok: false, error: "ECONNREFUSED" } });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  const r = await w.readResident();
  assert.equal(r.ok, false);
  assert.equal(r.resident, false);
  assert.equal(r.ramMb, null);
  assert.equal(r.error, "ollama_off");
});

// ─── 13. unload(reason, opts) COM PROVA — a razão de existir da etapa E2-a ───────────────────────
// keep_alive:0 sozinho NUNCA prova nada; quem decide é sempre o /api/ps. Timeouts/poll curtos aqui
// (não o padrão de 60s/2s da lei) só pra suíte não travar — produção chama sem esses overrides.

test("unload: /api/ps esvazia na 2ª leitura → descarga CONFIRMADA, warm cai", async () => {
  let psCalls = 0;
  const ollama = makeOllama({
    "POST /api/generate": { ok: true, data: {} },
    "GET /api/ps": () => {
      psCalls += 1;
      if (psCalls >= 2) return { ok: true, data: { models: [] } };
      return { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M", size: 19_000_000_000 }] } };
    },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  const result = await w.unload("teste", { timeoutMs: 200, pollIntervalMs: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.resident, false);
  assert.equal(result.forced, false);
  assert.equal(result.reason, null);
  assert.equal(w.status().warm, false);
  assert.ok(psCalls >= 2, "leu o /api/ps mais de uma vez antes de confirmar");
});

test("unload: /api/ps NUNCA esvazia, force:false → não mente que desligou (warm continua true)", async () => {
  const ollama = makeOllama({
    "POST /api/generate": { ok: true, data: {} },
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M", size: 19_000_000_000 }] } },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  const result = await w.unload("teste", { force: false, timeoutMs: 30, pollIntervalMs: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.resident, true);
  assert.ok(result.ramMb > 0);
  assert.equal(result.forced, false);
  assert.equal(result.reason, "ainda_residente");
  assert.equal(w.status().warm, true, "sem prova de descarga, warm NÃO pode virar false");
});

test("unload force:true: kill do runner resolve → forced:true, ok:true", async () => {
  let killed = false;
  const ollama = makeOllama({
    "POST /api/generate": { ok: true, data: {} },
    "GET /api/ps": () => {
      if (killed) return { ok: true, data: { models: [] } };
      return { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M", size: 19_000_000_000 }] } };
    },
  });
  const backend = makeBackend({});
  const killCalls = [];
  const killOllamaRunner = async () => {
    killCalls.push(1);
    killed = true;
    return { killed: [{ pid: "4242", imageName: "ollama_llama_server.exe" }], error: null };
  };
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), killOllamaRunner });
  w._state.warm = true;
  const result = await w.unload("teste", { force: true, timeoutMs: 20, pollIntervalMs: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.forced, true);
  assert.equal(result.resident, false);
  assert.equal(killCalls.length, 1, "kill só dispara depois do timeout sem force não confirmar");
  assert.equal(w.status().warm, false);
});

test("unload: /api/generate volta 500 mas /api/ps confirma saída → verdade é o /api/ps, não o status HTTP", async () => {
  const ollama = makeOllama({
    "POST /api/generate": { ok: false, statusCode: 500, error: "http_500" },
    "GET /api/ps": { ok: true, data: { models: [] } },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  const result = await w.unload("teste", { timeoutMs: 50, pollIntervalMs: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.resident, false);
  assert.equal(w.status().warm, false);
});

test("unload: Ollama fora do ar → reason 'ollama_sem_resposta', warm INTOCADO (nunca afirma descarga)", async () => {
  const ollama = makeOllama({
    "POST /api/generate": { ok: false, error: "ECONNREFUSED" },
    "GET /api/ps": { ok: false, error: "ECONNREFUSED" },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  const result = await w.unload("teste", { timeoutMs: 50, pollIntervalMs: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.resident, false);
  assert.equal(result.reason, "ollama_sem_resposta");
  assert.equal(w.status().warm, true, "estado intocado quando Ollama está mudo");
});

test("unload: /api/ps falha 2x seguidas mas resolve na 3ª leitura → NÃO desiste num timeout isolado (tolerância pedida pelo dono, 30B ocupado pode atrasar 1 leitura)", async () => {
  let calls = 0;
  const ollama = makeOllama({
    "POST /api/generate": { ok: true, data: {} },
    "GET /api/ps": () => {
      calls += 1;
      if (calls <= 2) return { ok: false, error: "timeout" }; // 2 falhas seguidas — NÃO pode decidir "mudo" aqui
      return { ok: true, data: { models: [] } }; // 3ª leitura confirma sumido
    },
  });
  const backend = makeBackend({});
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv() });
  w._state.warm = true;
  const result = await w.unload("teste", { timeoutMs: 200, pollIntervalMs: 5 });
  assert.equal(result.ok, true, "não pode desistir por causa de um timeout isolado do /api/ps");
  assert.equal(result.resident, false);
  assert.equal(w.status().warm, false);
  assert.ok(calls >= 3, "precisou de mais de 1 leitura pra decidir");
});

test("unload force:true: nenhum runner encontrado (nada com 'runner' na cmdline) → reason 'runner_nao_encontrado', não finge que descarregou", async () => {
  const ollama = makeOllama({
    "POST /api/generate": { ok: true, data: {} },
    "GET /api/ps": { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M", size: 19_000_000_000 }] } },
  });
  const backend = makeBackend({});
  const killOllamaRunner = async () => ({ killed: [], error: null }); // simula: só achou "serve"/"app.exe", nada pra matar
  const w = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), killOllamaRunner });
  w._state.warm = true;
  const result = await w.unload("teste", { force: true, timeoutMs: 20, pollIntervalMs: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.resident, true);
  assert.equal(result.forced, true);
  assert.equal(result.reason, "runner_nao_encontrado");
  assert.equal(w.status().warm, true, "sem runner pra matar nada mudou de verdade — warm continua true");
});

// ─── 14. selectRunnerPidsToKill — a peça PURA que decide quem morre (achado em campo, Ollama 0.32.5) ─
// Dump real do dono: "ollama app.exe" PID 14172 (bandeja, PAI do serve) + "ollama.exe serve" PID 2440
// (API :11434). A 1ª versão do kill filtrava por nome de imagem e matava o app.exe (inútil e perigoso)
// e pulava o runner de verdade (mesmo nome de imagem do serve, só a cmdline diferencia). Este é o
// teste que tranca essa regressão.

test("selectRunnerPidsToKill: mata SÓ o runner — 'ollama app.exe' (bandeja) e '...serve' (API) sobrevivem", () => {
  const rows = [
    { ProcessId: 14172, Name: "ollama app.exe", CommandLine: '"C:\\Program Files\\Ollama\\ollama app.exe"' },
    { ProcessId: 2440, Name: "ollama.exe", CommandLine: "C:\\Program Files\\Ollama\\ollama.exe serve" },
    { ProcessId: 5555, Name: "ollama.exe", CommandLine: "C:\\Program Files\\Ollama\\ollama.exe runner --model qwen3:30b-a3b-instruct-2507-q4_K_M --port 55001" },
  ];
  const targets = selectRunnerPidsToKill(rows);
  assert.equal(targets.length, 1, "só o runner deve virar alvo");
  assert.equal(targets[0].pid, "5555");
  assert.ok(!targets.some((t) => t.pid === "14172"), "ollama app.exe (bandeja/supervisor) NUNCA é alvo");
  assert.ok(!targets.some((t) => t.pid === "2440"), "ollama.exe serve (API :11434, inclusive o /api/ps) NUNCA é alvo");
});

test("selectRunnerPidsToKill: sem nenhum processo → lista vazia; objeto solto (1 processo do PowerShell) também funciona", () => {
  assert.deepEqual(selectRunnerPidsToKill([]), []);
  assert.deepEqual(selectRunnerPidsToKill(null), []);
  // ConvertTo-Json do PowerShell devolve OBJETO (não array) quando só 1 processo casa o filtro.
  const single = selectRunnerPidsToKill({ ProcessId: 777, Name: "ollama.exe", CommandLine: "ollama.exe runner --port 1" });
  assert.equal(single.length, 1);
  assert.equal(single[0].pid, "777");
});

test("falha ao persistir mantém o estado anterior e não responde otimista", () => {
  const backend = makeBackend({});
  const ollama = makeOllama({});
  const store = makeControlStore(null, false);
  const worker = createPonteWorker({ backendRequest: backend.backendRequest, ollamaRequest: ollama.ollamaRequest, env: baseEnv(), controlStore: store });
  const result = worker.setManualEnabled(false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "controle_nao_persistido");
  assert.equal(result.status.manualEnabled, true);
});
