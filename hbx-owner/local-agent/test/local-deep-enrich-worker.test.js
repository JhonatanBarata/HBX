"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  PUBLIC_STATES,
  buildCommitPayload,
  buildDefaultWorkerId,
  buildLabJobInput,
  canonicalJson,
  computeHeartbeatIntervalMs,
  createLocalDeepEnrichWorker,
  mapPublicState,
  normalizeModelResult,
  receiptDeltaCounts,
  sha256,
  validateMission,
} = require("../lib/local-deep-enrich-worker");

function mission(overrides = {}) {
  const { payload: payloadOverrides = {}, ...missionOverrides } = overrides;
  return {
    id: "mission-1",
    stage: "local_deep_enrich_v1",
    leaseId: "lease-1",
    leaseExpiresAt: "2026-07-16T21:00:00.000Z",
    heartbeatSeconds: 60,
    payloadVersion: 1,
    payload: {
      contractVersion: "local_deep_enrich_v1",
      promptVersion: "local_deep_enrich_30b_prompt_v1",
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
      ...payloadOverrides,
    },
    ...missionOverrides,
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
  const heartbeatResponses = Array.isArray(options.heartbeatResponses) ? [...options.heartbeatResponses] : [];
  const journal = options.journal || memoryJournal();
  const writer = {
    configuration: () => ({ ready: true, expectedDatabase: "hbx_production" }),
    handshake: async () => options.handshake || ({ ok: true, contract: { contractVersion: "local_deep_enrich_v1" } }),
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
      const leaseShouldFail = typeof options.leaseError === "function" ? options.leaseError() : options.leaseError;
      if (leaseShouldFail) return { ok: false, error: "backend_offline" };
      const next = queue.length ? queue.shift() : null;
      return { ok: true, data: { supported: true, paused: false, missions: next ? [next] : [], lag: { queuedDue: queue.length, oldestQueuedAgeMs: 10 } } };
    }
    if (route.endsWith("/heartbeat") && heartbeatResponses.length) {
      const response = heartbeatResponses.shift();
      return typeof response === "function"
        ? response({ method, route, payload, callNumber: calls.backend.length })
        : response;
    }
    return { ok: true, data: { ok: true, status: "queued" } };
  };
  const localLabRequest = async (method, route, payload) => {
    calls.lab.push({ method, route, payload });
    if (typeof options.localLabRequest === "function") return options.localLabRequest(method, route, payload);
    if (method === "POST" && route === "/local-lab/jobs") return { ok: true, data: { id: "lab-1" } };
    if (method === "GET" && route.endsWith("/export?file=batch")) return { ok: true, data: { batch: options.batch || batch() } };
    if (method === "GET") return { ok: true, data: { id: "lab-1", status: "completed" } };
    return { ok: true, data: {} };
  };
  const ollamaRequest = async (method, route, payload) => {
    calls.ollama.push({ method, route, payload });
    if (options.ollamaError) return { ok: false, error: options.ollamaError };
    if (route === "/api/ps") return { ok: true, data: { models: [{ name: "qwen3:30b-a3b-instruct-2507-q4_K_M" }] } };
    if (options.invalidJson) return { ok: true, data: { message: { content: "não é json" } } };
    return { ok: true, data: { message: { content: JSON.stringify(options.modelResult || {
      contacts: [{ kind: "phone", value: "51999991234", evidenceId: evidence().id, confidence: 88 }],
      people: [{ name: "Maria Silva", role: "proprietaria", evidenceId: evidence().id, confidence: 90 }],
      assessment: { summary: "Empresa com canais públicos.", qualification: "aderente", signals: ["site oficial"] },
    }) } } };
  };
  const worker = createLocalDeepEnrichWorker({
    backendRequest,
    ensureLocalLabUp: async () => typeof options.labUp === "function" ? options.labUp() : options.labUp !== false,
    localLabRequest,
    ollamaRequest,
    writer,
    journalStore: journal,
    readResources: options.readResources || (async () => ({ pressure: { ram: { usedPct: 30 }, cpu: { usedPct: 10 } } })),
    backendUrl: "https://app.hbx.test",
    machineIdentity: options.machineIdentity || "maquina-owner-teste",
    env: {
      HBX_LOCAL_DEEP_ENABLED: "on",
      HBX_LOCAL_DEEP_TARGET: "production",
      HBX_OWNER_BACKEND_URL: "https://app.hbx.test",
      HBX_LOCAL_ENRICH_EXPECTED_DATABASE: "hbx_production",
      HBX_LOCAL_DEEP_POLL_BASE_MS: "100",
      ...(options.env || {}),
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
  assert.equal(payload.delta.radarPatch.email.value, "contato@empresa.test");
  assert.equal(payload.delta.radarPatch.email.domainCompatible, true);
  assert.equal(Object.hasOwn(payload.delta.contacts[0], "sourceUrl"), false);
  assert.equal(Object.hasOwn(payload.evidence[0], "provider"), false);
  assert.match(payload.delta.people[0].personKey, /^person:[a-z0-9_-]+$/);
  assert.deepEqual(Object.keys(payload.evidence[0]).sort(), ["capturedAt", "contentHash", "excerpt", "id", "pageType", "sourceUrl"].sort());
  assert.deepEqual(Object.keys(payload.delta.contacts[0]).sort(), ["confidence", "evidenceId", "kind", "rank", "source", "value", "valueNormalized"].sort());
  assert.deepEqual(Object.keys(payload.delta.people[0]).sort(), ["evidenceId", "name", "personKey", "rank", "role", "source"].sort());
  assert.match(payload.mission.requestHash, /^[a-f0-9]{64}$/);
  const { requestHash, ...missionWithoutHash } = payload.mission;
  assert.equal(requestHash, sha256(canonicalJson({ ...payload, mission: missionWithoutHash })));
  assert.equal(calls.backend.some((call) => call.route.endsWith("/complete")), false);
  const heartbeat = calls.backend.find((call) => call.route.endsWith("/heartbeat"));
  assert.deepEqual(heartbeat.payload, { leaseId: "lease-1", leaseTtlSeconds: 900 });
  assert.equal(journal.read(), null);
  assert.equal(worker.status().publicState, PUBLIC_STATES.RELEASED);
  assert.equal(worker.status().metrics.completedWithData, 1);
  assert.equal(worker.status().metrics.emailsAdded, 1);
  assert.equal(computeHeartbeatIntervalMs(mission(), 900), 45_000);
  assert.equal(computeHeartbeatIntervalMs({ heartbeatSeconds: 20 }, 60), 20_000);
});

test("heartbeat HTTP 2xx rejeitado não avança a missão e o próximo tick reobtém lease seguro", async () => {
  const firstClock = Date.parse("2026-07-16T20:00:00.000Z");
  let clock = firstClock;
  const staleAt = firstClock + 60_000;
  const acceptedAt = firstClock + 120_000;
  const beforeCommitAt = firstClock + 180_000;
  const harness = makeHarness({
    leases: [
      mission({ leaseId: "lease-antigo" }),
      mission({ leaseId: "lease-novo" }),
    ],
    now: () => clock,
    heartbeatResponses: [
      () => {
        clock = staleAt;
        return { ok: true, data: { ok: false, reason: "stale_lease" } };
      },
      () => {
        clock = acceptedAt;
        return { ok: true, data: { ok: true } };
      },
      () => {
        clock = beforeCommitAt;
        return { ok: true, data: { ok: true } };
      },
    ],
  });

  await harness.worker.tick();

  assert.equal(harness.calls.lab.length, 0);
  assert.equal(harness.calls.commits.length, 0);
  assert.equal(harness.calls.backend.some((call) => call.route.endsWith("/fail")), false);
  assert.equal(harness.journal.read(), null);
  assert.equal(harness.worker.status().telemetry.lastHeartbeatAt, new Date(firstClock).toISOString());
  assert.equal(harness.worker.status().telemetry.lastError, "heartbeat_rejeitado:stale_lease");
  assert.equal(harness.worker.status().metrics.retries, 1);

  await harness.worker.tick();

  assert.equal(harness.calls.commits.length, 1);
  assert.equal(harness.calls.commits[0].mission.leaseId, "lease-novo");
  assert.equal(harness.journal.read(), null);
  assert.equal(harness.worker.status().telemetry.lastHeartbeatAt, new Date(beforeCommitAt).toISOString());
  assert.equal(harness.worker.status().metrics.completedWithData, 1);
});

test("stale detectado durante crawl ou antes do commit impede qualquer escrita", async () => {
  let crawlPolls = 0;
  const duringCrawl = makeHarness({
    heartbeatResponses: [
      { ok: true, data: { ok: true } },
      { ok: true, data: { ok: false, reason: "stale_lease" } },
    ],
    localLabRequest: async (method, route) => {
      if (method === "POST" && route === "/local-lab/jobs") return { ok: true, data: { id: "lab-stale" } };
      if (method === "GET" && route.includes("/local-lab/jobs/lab-stale")) {
        crawlPolls += 1;
        return { ok: true, data: { id: "lab-stale", status: "running" } };
      }
      return { ok: false, statusCode: 404 };
    },
  });

  await duringCrawl.worker.tick();

  assert.equal(crawlPolls, 1);
  assert.equal(duringCrawl.calls.commits.length, 0);
  assert.equal(duringCrawl.calls.ollama.some((call) => call.route === "/api/chat"), false);
  assert.equal(duringCrawl.calls.backend.some((call) => call.route.endsWith("/fail")), false);
  assert.equal(duringCrawl.journal.read(), null);

  const beforeCommit = makeHarness({
    heartbeatResponses: [
      { ok: true, data: { ok: true } },
      { ok: true, data: { ok: false, reason: "stale_lease" } },
    ],
  });

  await beforeCommit.worker.tick();

  assert.equal(beforeCommit.calls.ollama.some((call) => call.route === "/api/chat"), true);
  assert.equal(beforeCommit.calls.commits.length, 0);
  assert.equal(beforeCommit.calls.backend.some((call) => call.route.endsWith("/fail")), false);
  assert.equal(beforeCommit.journal.read(), null);
  assert.equal(beforeCommit.worker.status().telemetry.lastError, "heartbeat_rejeitado:stale_lease");
});

test("falha transitória de heartbeat não vira sucesso falso e recupera antes do commit", async () => {
  const leaseAt = Date.parse("2026-07-16T20:00:00.000Z");
  let clock = leaseAt;
  const initialTransportFailureAt = leaseAt + 30_000;
  const preCommitTransportFailureAt = leaseAt + 60_000;
  const acceptedAt = leaseAt + 90_000;
  const harness = makeHarness({
    now: () => clock,
    heartbeatResponses: [
      () => {
        clock = initialTransportFailureAt;
        return { ok: false, statusCode: 503, error: "timeout" };
      },
      () => {
        clock = preCommitTransportFailureAt;
        return { ok: false, statusCode: 503, error: "timeout" };
      },
      () => {
        clock = acceptedAt;
        return { ok: true, data: { ok: true } };
      },
    ],
  });

  await harness.worker.tick();

  assert.equal(harness.calls.commits.length, 1);
  assert.equal(harness.calls.backend.some((call) => call.route.endsWith("/fail")), false);
  assert.equal(harness.journal.read(), null);
  assert.equal(harness.worker.status().telemetry.lastHeartbeatAt, new Date(acceptedAt).toISOString());
  assert.equal(harness.worker.status().metrics.completedWithData, 1);
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

test("modelo 30B aquecido com RAM em 90% permanece abaixo do limite seguro padrão", async () => {
  const harness = makeHarness({
    readResources: async () => ({ pressure: { ram: { usedPct: 90 }, cpu: { usedPct: 11 } } }),
  });

  await harness.worker.tick();

  assert.equal(harness.calls.commits.length, 1);
  assert.equal(harness.worker.status().metrics.resourceThrottles, 0);
  assert.deepEqual(harness.worker.status().telemetry.resourceGate, {
    throttled: false,
    ramUsedPct: 90,
    cpuUsedPct: 11,
    ramThrottlePct: 94,
    cpuThrottlePct: 95,
    ramResumePct: 91,
    cpuResumePct: 92,
  });
});

test("limite configurável aplica histerese e retoma novas missões sem intervenção", async () => {
  const snapshots = [
    { pressure: { ram: { usedPct: 94 }, cpu: { usedPct: 11 } } },
    { pressure: { ram: { usedPct: 92 }, cpu: { usedPct: 11 } } },
    { pressure: { ram: { usedPct: 90 }, cpu: { usedPct: 11 } } },
  ];
  const harness = makeHarness({
    readResources: async () => snapshots.shift(),
    env: {
      HBX_LOCAL_DEEP_RAM_THROTTLE_PCT: "94",
      HBX_LOCAL_DEEP_RESOURCE_HYSTERESIS_PCT: "3",
    },
  });

  await harness.worker.tick();
  assert.equal(harness.calls.backend.some((call) => call.route.endsWith("/lease")), false);
  assert.equal(harness.worker.status().telemetry.phase, "resource_throttle");
  assert.equal(harness.worker.status().metrics.resourceThrottles, 1);

  await harness.worker.tick();
  assert.equal(harness.calls.backend.some((call) => call.route.endsWith("/lease")), false);
  assert.equal(harness.worker.status().metrics.resourceThrottles, 1);

  await harness.worker.tick();
  assert.equal(harness.calls.commits.length, 1);
  assert.equal(harness.worker.status().telemetry.resourceGate.throttled, false);
  assert.equal(harness.worker.status().metrics.resourceThrottles, 1);
});

test("pressão de recursos não abandona journal já iniciado", async () => {
  let resourceReads = 0;
  const journal = memoryJournal({
    version: 1,
    contractVersion: "local_deep_enrich_v1",
    phase: "lab_completed",
    workerId: "owner-local-journal",
    mission: mission(),
    batch: batch(),
    startedMs: Date.parse("2026-07-16T19:59:00.000Z"),
    savedAt: Date.parse("2026-07-16T20:00:00.000Z"),
  });
  const harness = makeHarness({
    journal,
    leases: [],
    readResources: async () => {
      resourceReads += 1;
      return { pressure: { ram: { usedPct: 99 }, cpu: { usedPct: 99 } } };
    },
  });

  await harness.worker.tick();

  assert.equal(resourceReads, 0);
  assert.equal(harness.calls.commits.length, 1);
  assert.equal(journal.read(), null);
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

test("rejeição conhecida propaga erro técnico sanitizado do writer", async () => {
  const harness = makeHarness({
    leases: [mission()],
    commit: async () => ({
      ok: false,
      reason: "commit_rejeitado",
      error: "P0001:hbx_local_enrichment:lease_expired",
      retryable: true,
      outcomeUnknown: false,
    }),
  });

  await harness.worker.tick();

  const failed = harness.calls.backend.find((call) => call.route.endsWith("/fail"));
  assert.ok(failed);
  assert.equal(failed.payload.error, "P0001:hbx_local_enrichment:lease_expired");
  assert.equal(failed.payload.retryable, true);
  assert.equal(harness.worker.status().telemetry.lastError, "P0001:hbx_local_enrichment:lease_expired");
  assert.equal(harness.journal.read(), null);
});

test("validação, estados públicos e job social permanecem determinísticos", () => {
  assert.equal(validateMission(mission()).ok, true);
  assert.equal(validateMission(mission({ stage: "enrich_lead" })).ok, false);
  assert.deepEqual(
    validateMission(mission({ payload: { promptVersion: "local_deep_enrich_30b_prompt_v2" } })),
    { ok: false, reason: "prompt_version_invalida" },
  );
  assert.equal(mapPublicState("crawling", null), PUBLIC_STATES.PROCESSING);
  assert.equal(mapPublicState("idle", "invalidated"), PUBLIC_STATES.INVALIDATED);
  const social = buildLabJobInput(mission({ payload: {
    lead: { name: "Empresa", website: null, sourceUrl: "https://instagram.com/empresa" },
  } }));
  assert.deepEqual(social.providers, ["social_probe"]);
  assert.deepEqual(social.socialUrls, ["https://instagram.com/empresa"]);
});

test("prompt incompatível é falha técnica retryable e não invalida o lead", async () => {
  const harness = makeHarness({
    leases: [mission({ payload: { promptVersion: "local_deep_enrich_30b_prompt_v2" } })],
  });
  await harness.worker.tick();
  const failed = harness.calls.backend.find((call) => call.route.endsWith("/fail"));
  assert.ok(failed);
  assert.equal(failed.payload.retryable, true);
  assert.equal(harness.calls.commits.length, 0);
  assert.equal(harness.worker.status().telemetry.terminalState, null);
});

test("roteamento cobre site oficial, sem site, social-only e diretório sem inventar URL", () => {
  const official = buildLabJobInput(mission());
  assert.deepEqual(official.providers, ["site_crawl"]);
  assert.equal(official.candidates[0].website, "https://empresa.test/");

  const withoutSite = buildLabJobInput(mission({ payload: { lead: {
    name: "Empresa Real", city: "Xangri-lá", state: "RS", segment: "Madeireira",
    website: null, sourceUrl: null, identityKey: "place:real",
  } } }));
  assert.deepEqual(withoutSite.providers, ["web_query"]);
  assert.equal(withoutSite.city, "Xangri-lá");
  assert.equal(withoutSite.candidates[0].website, "");
  assert.equal(withoutSite.candidates[0].sourceUrl, "");

  const social = buildLabJobInput(mission({ payload: { lead: {
    name: "Empresa Real", city: "Xangri-lá", state: "RS", segment: "Madeireira",
    website: null, sourceUrl: "https://instagram.com/empresa", identityKey: "place:real",
  } } }));
  assert.deepEqual(social.providers, ["social_probe"]);
  assert.deepEqual(social.socialUrls, ["https://instagram.com/empresa"]);

  const directory = buildLabJobInput(mission({ payload: { lead: {
    name: "Empresa Real", city: "Xangri-lá", state: "RS", segment: "Madeireira",
    website: null, sourceUrl: "https://guiamais.com.br/empresa-real", identityKey: "place:real",
  } } }));
  assert.deepEqual(directory.providers, ["directory_probe"]);
  assert.deepEqual(directory.directoryUrls, ["https://guiamais.com.br/empresa-real"]);
  assert.deepEqual(directory.candidates, []);
});

test("sem site pode concluir noNewData explícito quando a busca pública válida não acha novidade", async () => {
  const withoutSiteMission = mission({ payload: { lead: {
    name: "Empresa Real", city: "Xangri-lá", state: "RS", segment: "Madeireira",
    website: null, sourceUrl: null, identityKey: "place:real",
  } } });
  const harness = makeHarness({
    leases: [withoutSiteMission],
    batch: { leads: [], emails: [], evidence: [] },
    modelResult: { contacts: [], people: [], assessment: {} },
    commit: async (payload) => ({ ok: true, receipt: {
      missionId: payload.mission.id,
      noNewData: payload.noNewData,
      committedAt: "2026-07-16T20:05:00.000Z",
    } }),
  });

  await harness.worker.tick();

  const labCreate = harness.calls.lab.find((call) => call.method === "POST");
  assert.deepEqual(labCreate.payload.providers, ["web_query"]);
  assert.equal(labCreate.payload.candidates[0].name, "Empresa Real");
  assert.equal(harness.calls.commits[0].noNewData, true);
  assert.equal(harness.worker.status().metrics.completedNoNewData, 1);
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

test("cinco falhas abrem circuito temporário e half-open recupera sem reset manual", async () => {
  let failLease = true;
  let clock = Date.parse("2026-07-16T20:00:00.000Z");
  const harness = makeHarness({
    leases: [mission()],
    leaseError: () => failLease,
    now: () => clock,
  });
  for (let attempt = 0; attempt < 5; attempt += 1) await harness.worker.tick();
  const opened = harness.worker.status().telemetry.circuit;
  assert.equal(opened.state, "open");
  assert.equal(opened.failures, 5);

  failLease = false;
  clock = Number(opened.openUntil) + 1;
  await harness.worker.tick();
  assert.equal(harness.worker.status().telemetry.circuit.state, "closed");
  assert.equal(harness.calls.commits.length, 1);
});

test("métricas de contato e dono usam somente IDs realmente criados no recibo", () => {
  const payload = buildCommitPayload(mission(), {
    evidence: [evidence()],
    contacts: [{
      kind: "email", value: "contato@empresa.test", valueNormalized: "contato@empresa.test",
      rank: 1, source: "website_crawl", confidence: 95, evidenceId: evidence().id,
      sourceUrl: evidence().sourceUrl, officialDomainMatch: true,
    }],
    people: [{
      name: "Maria Silva", role: "proprietaria", personKey: "person:maria-silva", rank: 1,
      source: "ia_30b", confidence: 90, evidenceId: evidence().id, sourceUrl: evidence().sourceUrl,
    }],
    assessment: { summary: null, qualification: null, signals: [] },
  }, "worker-1", "model-1", "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z");
  const hash = (value) => createHash("md5").update(value).digest("hex");
  const counts = receiptDeltaCounts({
    createdContactIds: [`hbx_lc_${hash(`mission-1:email:contato@empresa.test`)}`],
    createdPersonIds: [`hbx_lp_${hash(`mission-1:person:maria-silva`)}`],
  }, payload);
  assert.deepEqual(counts, { emailsAdded: 1, phonesAdded: 0, ownersAdded: 1 });
});

test("CNPJ observado nunca vira telefone nem campo canônico", () => {
  const sourceEvidence = { ...evidence(), excerpt: "CNPJ 12.345.678/9012-34" };
  const result = normalizeModelResult({
    contacts: [{ kind: "phone", value: "45678901234", evidenceId: sourceEvidence.id, confidence: 99 }],
    people: [],
    assessment: {},
  }, {
    leads: [{ cnpj: "12345678901234", contacts: [] }],
    emails: [],
    evidence: [sourceEvidence],
  }, mission());
  assert.equal(result.ok, true);
  assert.deepEqual(result.contacts, []);
});

test("restart durante crawl retoma o mesmo job do Lab sem criar outro", async () => {
  const journal = memoryJournal({
    version: 1,
    contractVersion: "local_deep_enrich_v1",
    phase: "crawling",
    workerId: "owner-local-persistido",
    mission: mission(),
    labJobId: "lab-recuperado",
    startedMs: Date.parse("2026-07-16T19:59:00.000Z"),
    savedAt: Date.parse("2026-07-16T20:00:00.000Z"),
  });
  const harness = makeHarness({ journal, leases: [] });

  await harness.worker.tick();

  assert.equal(harness.calls.lab.some((call) => call.method === "POST"), false);
  assert.equal(harness.calls.lab.some((call) => call.route.includes("lab-recuperado")), true);
  assert.equal(harness.calls.commits.length, 1);
  assert.equal(harness.calls.commits[0].mission.workerId, "owner-local-persistido");
  assert.equal(journal.read(), null);
});

test("restart pré-commit preserva worker estável e pós-commit apenas limpa journal", async () => {
  assert.equal(buildDefaultWorkerId("PC-OWNER"), buildDefaultWorkerId("pc-owner"));
  assert.equal(buildDefaultWorkerId("PC-OWNER").includes(String(process.pid)), false);

  const beforeCommit = memoryJournal({
    version: 1,
    contractVersion: "local_deep_enrich_v1",
    phase: "lab_completed",
    workerId: "owner-local-lease-original",
    mission: mission(),
    batch: batch(),
    startedMs: Date.parse("2026-07-16T19:59:00.000Z"),
    savedAt: Date.parse("2026-07-16T20:00:00.000Z"),
  });
  const recovered = makeHarness({ journal: beforeCommit, leases: [], machineIdentity: "outra-identidade-de-processo" });
  await recovered.worker.tick();
  assert.equal(recovered.calls.lab.length, 0);
  assert.equal(recovered.calls.commits[0].mission.workerId, "owner-local-lease-original");
  assert.equal(beforeCommit.read(), null);

  const afterCommit = memoryJournal({
    version: 1,
    contractVersion: "local_deep_enrich_v1",
    phase: "committed",
    workerId: "owner-local-lease-original",
    mission: mission(),
    receipt: { missionId: "mission-1", committedAt: "2026-07-16T20:05:00.000Z" },
    savedAt: Date.parse("2026-07-16T20:05:00.000Z"),
  });
  const cleaned = makeHarness({ journal: afterCommit, leases: [] });
  await cleaned.worker.tick();
  assert.equal(cleaned.calls.commits.length, 0);
  assert.equal(afterCommit.read(), null);
});

test("Lab e internet residencial se recuperam sem clique; Ollama e DB indisponíveis falham fechado", async () => {
  let labAvailable = false;
  const lab = makeHarness({ leases: [mission(), mission()], labUp: () => labAvailable });
  await lab.worker.tick();
  assert.equal(lab.calls.commits.length, 0);
  assert.equal(lab.worker.status().telemetry.dependencies.localLab, "down");
  assert.equal(lab.calls.backend.some((call) => call.route.endsWith("/fail")), true);
  labAvailable = true;
  await lab.worker.tick();
  assert.equal(lab.calls.commits.length, 1);
  assert.equal(lab.worker.status().telemetry.dependencies.localLab, "up");

  const ollama = makeHarness({ ollamaError: "ollama_offline" });
  await ollama.worker.tick();
  assert.equal(ollama.calls.commits.length, 0);
  assert.equal(ollama.worker.status().telemetry.dependencies.ollama, "down");
  assert.equal(ollama.calls.backend.some((call) => call.route.endsWith("/fail")), true);

  const database = makeHarness({ handshake: { ok: false, reason: "db_transport_unavailable" } });
  await database.worker.tick();
  assert.equal(database.calls.backend.length, 0);
  assert.equal(database.worker.status().telemetry.target.status, "unavailable");
  assert.equal(database.worker.status().telemetry.circuit.failures, 1);
});

test("contato repetido na passada é deduplicado e contato já existente não infla métricas", () => {
  const normalized = normalizeModelResult({
    contacts: [{ kind: "email", value: "contato@empresa.test", evidenceId: evidence().id, confidence: 99 }],
    people: [],
    assessment: {},
  }, batch(), mission());
  assert.equal(normalized.ok, true);
  assert.equal(normalized.contacts.filter((item) => item.kind === "email").length, 1);

  const payload = buildCommitPayload(
    mission(), normalized, "owner-local-teste", "model-1",
    "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z",
  );
  assert.deepEqual(receiptDeltaCounts({ createdContactIds: [], createdPersonIds: [] }, payload), {
    emailsAdded: 0,
    phonesAdded: 0,
    ownersAdded: 0,
  });
});

test("site oficial descoberto promove website e email do mesmo domínio com evidência", () => {
  const discoveredEvidence = {
    ...evidence(),
    sourceUrl: "https://descoberta.example/contato",
    excerpt: "Empresa Real contato@descoberta.example",
  };
  const withoutSite = mission({ payload: { lead: {
    name: "Empresa Real", city: "Xangri-lá", state: "RS", segment: "Madeireira",
    website: null, sourceUrl: null, identityKey: "place:real",
  } } });
  const normalized = normalizeModelResult({ contacts: [], people: [], assessment: {} }, {
    leads: [{
      name: "Empresa Real",
      website: "https://descoberta.example/contato",
      sourceProvider: "web_query_verified",
      raw: { discovery: { identityConfirmed: true } },
      contacts: [{
        kind: "email", value: "contato@descoberta.example",
        evidenceId: discoveredEvidence.id, confidence: 95,
      }],
    }],
    emails: [],
    evidence: [discoveredEvidence],
  }, withoutSite);

  assert.equal(normalized.officialWebsite.value, "https://descoberta.example/");
  assert.equal(normalized.contacts[0].officialDomainMatch, true);
  const payload = buildCommitPayload(
    withoutSite, normalized, "owner-local-teste", "model-1",
    "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z",
  );
  assert.deepEqual(payload.delta.radarPatch.website, {
    value: "https://descoberta.example/",
    evidenceId: discoveredEvidence.id,
    officialSite: true,
    sameCompany: true,
    sourceIdentified: true,
  });
  assert.equal(payload.delta.radarPatch.email.value, "contato@descoberta.example");
  assert.deepEqual(payload.delta.vendasPatch.website, payload.delta.radarPatch.website);
});

test("cargo da pessoa só é gravado quando o mesmo cargo aparece literalmente na evidência", () => {
  const supported = normalizeModelResult({
    contacts: [],
    people: [{ name: "Maria Silva", role: "proprietária", evidenceId: evidence().id, confidence: 90 }],
    assessment: {},
  }, batch(), mission());
  assert.equal(supported.people[0].role, "Proprietária");

  const mismatched = normalizeModelResult({
    contacts: [],
    people: [{ name: "Maria Silva", role: "diretora", evidenceId: evidence().id, confidence: 90 }],
    assessment: {},
  }, batch(), mission());
  assert.equal(mismatched.people[0].role, null);

  const mixedEvidence = { ...evidence(), excerpt: "Proprietária Joana Lima. Diretora Maria Silva." };
  const wrongPersonAssociation = normalizeModelResult({
    contacts: [],
    people: [{ name: "Maria Silva", role: "proprietária", evidenceId: mixedEvidence.id, confidence: 90 }],
    assessment: {},
  }, { leads: [], emails: [], evidence: [mixedEvidence] }, mission());
  assert.equal(wrongPersonAssociation.people[0].role, null);

  const partnerEvidence = { ...evidence(), excerpt: "Sócia Ana Souza responsável pelo atendimento." };
  const partner = normalizeModelResult({
    contacts: [],
    people: [{ name: "Ana Souza", role: "socia", evidenceId: partnerEvidence.id, confidence: 90 }],
    assessment: {},
  }, { leads: [], emails: [], evidence: [partnerEvidence] }, mission());
  assert.equal(partner.people[0].role, "Sócia");
});

test("telefone comum e confirmação inventada pelo 30B não promovem; link oficial do crawler promove", () => {
  const commonPhone = normalizeModelResult({
    contacts: [{ kind: "phone", value: "51999991234", evidenceId: evidence().id, confidence: 90 }],
    people: [],
    assessment: {},
  }, { leads: [], emails: [], evidence: [evidence()] }, mission());
  const commonPayload = buildCommitPayload(
    mission(), commonPhone, "owner-local-teste", "model-1",
    "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z",
  );
  assert.equal(Object.hasOwn(commonPayload.delta.radarPatch, "phone"), false);
  assert.equal(Object.hasOwn(commonPayload.delta.vendasPatch, "phone"), false);

  const modelClaimedWhatsapp = normalizeModelResult({
    contacts: [{
      kind: "whatsapp", value: "51999991234", evidenceId: evidence().id,
      confidence: 90, whatsappConfirmed: true,
    }],
    people: [],
    assessment: {},
  }, { leads: [], emails: [], evidence: [evidence()] }, mission());
  assert.equal(modelClaimedWhatsapp.contacts.length, 0);

  const deterministicEvidence = evidence();
  const confirmedWhatsapp = normalizeModelResult({ contacts: [], people: [], assessment: {} }, {
    leads: [{
      contacts: [{
        kind: "whatsapp",
        value: "51999991234",
        evidenceId: deterministicEvidence.id,
        confidence: 100,
        whatsappConfirmed: true,
        verification: "official_whatsapp_link",
      }],
    }],
    emails: [],
    evidence: [deterministicEvidence],
  }, mission());
  const whatsappPayload = buildCommitPayload(
    mission(), confirmedWhatsapp, "owner-local-teste", "model-1",
    "2026-07-16T20:00:00.000Z", "2026-07-16T20:01:00.000Z",
  );
  assert.deepEqual(whatsappPayload.delta.radarPatch.phone, {
    value: "51999991234",
    evidenceId: evidence().id,
    whatsappConfirmed: true,
  });
  assert.deepEqual(whatsappPayload.delta.vendasPatch.phone, whatsappPayload.delta.radarPatch.phone);
});
