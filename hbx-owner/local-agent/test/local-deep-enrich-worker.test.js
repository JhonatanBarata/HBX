"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PUBLIC_STATES,
  buildCommitPayload,
  buildLabJobInput,
  canonicalJson,
  createLocalDeepEnrichWorker,
  mapPublicState,
  sha256,
  validateMission,
} = require("../lib/local-deep-enrich-worker");

function mission(overrides = {}) {
  return {
    id: "mission-1",
    stage: "local_deep_enrich_v1",
    leaseId: "lease-1",
    leaseExpiresAt: "2026-07-16T21:00:00.000Z",
    heartbeatSeconds: 60,
    payloadVersion: 1,
    payload: {
      contractVersion: "local_deep_enrich_v1",
      consumerKind: "owner_local",
      radarLeadId: "radar-1",
      companyId: 7,
      requestedByUserId: null,
      runId: "run-1",
      correlationId: "corr-1",
      workVersion: 2,
      workHash: "a".repeat(64),
      priorityReason: "delivered",
      lead: {
        name: "Empresa Real",
        city: "Xangri-lá",
        state: "RS",
        segment: "Madeireira",
        website: "https://empresa.test",
        sourceUrl: "https://empresa.test",
        identityKey: "place:real",
      },
      ...(overrides.payload || {}),
    },
    ...overrides,
  };
}

function evidence() {
  return {
    id: "ev_123456789012345678901234",
    sourceUrl: "https://empresa.test/contato",
    provider: "site_crawl",
    pageType: "contact",
    capturedAt: "2026-07-16T20:00:00.000Z",
    contentHash: "b".repeat(64),
    excerpt: "Contato contato@empresa.test WhatsApp (51) 99999-1234 Proprietária Maria Silva",
  };
}

function batch() {
  return {
    leads: [{
      name: "Empresa Real",
      website: "https://empresa.test",
      contacts: [{
        kind: "email",
        value: "contato@empresa.test",
        evidenceId: evidence().id,
        confidence: 95,
      }],
    }],
    emails: [],
    evidence: [evidence()],
  };
}

function memoryJournal(initial = null) {
  let value = initial;
  return {
    inspect: () => value ? { status: "valid", data: value } : { status: "missing", data: null },
    load: () => value,
    save: (next) => { value = structuredClone(next); return true; },
    clear: () => { value = null; return true; },
    read: () => value,
  };
}

function makeHarness(options = {}) {
  const calls = { backend: [], lab: [], ollama: [], commits: [] };
  const queue = Array.isArray(options.leases) ? [...options.leases] : [mission()];
  const journal = options.journal || memoryJournal();
  const writer = {
    configuration: () => ({ ready: true, expectedDatabase: "hbx_production" }),
    handshake: async () => ({ ok: true, contract: { contractVersion: "local_deep_enrich_v1" } }),
    commit: async (payload) => {
      calls.commits.push(payload);
      if (options.commit) return options.commit(payload, calls.commits.length);
      return { ok: true, receipt: {
        missionId: payload.mission.id,
        noNewData: false,
        createdContactIds: ["contact-1"],
        summary: { emailsAdded: 1, phonesAdded: 0, ownersAdded: 1 },
        committedAt: "2026-07-16T20:05:00.000Z",
      } };
    },
    close: async () => {},
  };
  const backendRequest = async (method, route, payload) => {
    calls.backend.push({ method, route, payload });
    if (route.endsWith("/lease")) {
      if (options.leaseError) return { ok: false, error: "backend_offline" };
      const next = queue.length ? queue.shift() : null;
      return { ok: true, data: { supported: true, paused: false, missions: next ? [next] : [], lag: { queuedDue: queue.length, oldestQueuedAgeMs: 10 } } };
    }
    return { ok: true, data: { ok: true, status: "queued" } };
  };
  const localLabRequest = async (method, route, payload) => {
    calls.lab.push({ method, route, payload });
    if (method === "POST" && route === "/local-lab/jobs") return { ok: true, data: { id: "lab-1" } };
    if (method === "GET" && route.endsWith("/export?file=batch")) return { ok: true, data: { batch: batch() } };
    if (method === "GET") return { ok: true, data: { id: "lab-1", status: "completed" } };
    return { ok: true, data: {} };
  };
  const ollamaRequest = async (method, route, payload) => {
    calls.ollama.push({ method, route, payload });
    if (route === "/api/ps") return { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } };
    if (options.invalidJson) return { ok: true, data: { message: { content: "não é json" } } };
    return { ok: true, data: { message: { content: JSON.stringify({
      contacts: [{ kind: "phone", value: "51999991234", evidenceId: evidence().id, confidence: 88 }],
      people: [{ name: "Maria Silva", role: "proprietaria", evidenceId: evidence().id, confidence: 90 }],
      assessment: { summary: "Empresa com canais públicos.", qualification: "aderente", signals: ["site oficial"] },
    }) } } };
  };
  const worker = createLocalDeepEnrichWorker({
    backendRequest,
    ensureLocalLabUp: async () => true,
    localLabRequest,
    ollamaRequest,
    writer,
    journalStore: journal,
    readResources: async () => ({ pressure: { ram: { usedPct: 30 }, cpu: { usedPct: 10 } } }),
    backendUrl: "https://app.hbx.test",
    env: {
      HBX_LOCAL_DEEP_ENABLED: "on",
      HBX_LOCAL_DEEP_TARGET: "production",
      HBX_OWNER_BACKEND_URL: "https://app.hbx.test",
      HBX_LOCAL_ENRICH_EXPECTED_DATABASE: "hbx_production",
      HBX_LOCAL_DEEP_POLL_BASE_MS: "100",
    },
    sleep: async () => {},
    now: options.now || (() => Date.parse("2026-07-16T20:00:00.000Z")),
  });
  return { calls, journal, worker };
}

test("worker executa Lab + 30B + commit direto sem endpoint complete", async () => {
  const { worker, calls, journal } = makeHarness();
  await worker.tick();

  assert.equal(calls.commits.length, 1);
  const payload = calls.commits[0];
  assert.equal(payload.contractVersion, "local_deep_enrich_v1");
  assert.equal(payload.mission.workerId.startsWith("owner-local-"), true);
  assert.equal(payload.delta.contacts.length, 2);
  assert.equal(payload.delta.people[0].name, "Maria Silva");
  assert.equal(payload.delta.radarPatch.email, "contato@empresa.test");
  assert.match(payload.mission.requestHash, /^[a-f0-9]{64}$/);
  const { requestHash, ...missionWithoutHash } = payload.mission;
  assert.equal(requestHash, sha256(canonicalJson({ ...payload, mission: missionWithoutHash })));
  assert.equal(calls.backend.some((call) => call.route.endsWith("/complete")), false);
  assert.equal(journal.read(), null);
  assert.equal(worker.status().publicState, PUBLIC_STATES.RELEASED);
  assert.equal(worker.status().metrics.completedWithData, 1);
  assert.equal(worker.status().metrics.emailsAdded, 1);
});

test("JSON inválido do 30B devolve missão para retry e limpa journal local", async () => {
  const { worker, calls, journal } = makeHarness({ invalidJson: true });
  await worker.tick();

  assert.equal(calls.commits.length, 0);
  const failed = calls.backend.find((call) => call.route.endsWith("/fail"));
  assert.equal(Boolean(failed), true);
  assert.equal(failed.payload.retryable, true);
  assert.equal(journal.read(), null);
  assert.equal(worker.status().metrics.retries, 1);
});

test("resultado de commit incerto permanece no journal e é reexecutado idempotentemente", async () => {
  const harness = makeHarness({
    leases: [mission()],
    commit: async (payload, attempt) => attempt === 1
      ? { ok: false, reason: "commit_indisponivel", retryable: true, outcomeUnknown: true }
      : { ok: true, receipt: { missionId: payload.mission.id, noNewData: true, committedAt: "2026-07-16T20:06:00.000Z" } },
  });
  await harness.worker.tick();
  assert.equal(harness.journal.read().phase, "ready_to_commit");
  await harness.worker.tick();
  assert.equal(harness.calls.commits.length, 2);
  assert.equal(harness.journal.read(), null);
  assert.equal(harness.worker.status().metrics.completedNoNewData, 1);
});

test("validação, estados públicos e job social permanecem determinísticos", () => {
  assert.equal(validateMission(mission()).ok, true);
  assert.equal(validateMission(mission({ stage: "enrich_lead" })).ok, false);
  assert.equal(mapPublicState("crawling", null), PUBLIC_STATES.PROCESSING);
  assert.equal(mapPublicState("idle", "invalidated"), PUBLIC_STATES.INVALIDATED);
  const social = buildLabJobInput(mission({ payload: {
    lead: { name: "Empresa", website: null, sourceUrl: "https://instagram.com/empresa" },
  } }));
  assert.deepEqual(social.providers, ["social_probe"]);
  assert.deepEqual(social.socialUrls, ["https://instagram.com/empresa"]);
});

test("hash do commit não reutiliza workHash e metadata fica no bloco interno", () => {
  const built = buildCommitPayload(mission(), {
    evidence: [evidence()],
    contacts: [],
    people: [],
    assessment: { summary: "Resumo", qualification: null, signals: [] },
  }, "worker-1", "model-1", "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z");
  assert.notEqual(built.mission.requestHash, mission().payload.workHash);
  assert.equal(Boolean(built.delta.metadataBlock.localDeepEnrich), false);
  assert.equal(built.delta.metadataBlock.model, "model-1");
});
