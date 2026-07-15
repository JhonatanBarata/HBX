"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseEngineCapacity } = require("../lib/engine-capacity");

// Payload mínimo do dashboard de motores; cada teste sobrescreve o que importa.
function base(overrides = {}) {
  return {
    engines: [],
    capacityConfig: {},
    capacity: {},
    ...overrides,
  };
}

test("governor OFF: elastic=false, elasticEnabled=false, razão explica capacidade fixa", () => {
  const out = parseEngineCapacity(base({
    engines: [{ status: "online" }, { status: "online" }],
    capacityConfig: { governorEnabled: false, maxCount: 8, warmMin: 2 },
  }));
  assert.equal(out.ok, true);
  assert.equal(out.governorOn, false);
  assert.equal(out.elastic, false);
  assert.equal(out.elasticEnabled, false); // fallback = governorOn quando data.elasticEnabled ausente
  assert.equal(out.alive, 2);
  assert.equal(out.ceiling, 8);
  assert.match(out.reason, /Governor desligado/);
});

test("fila cheia no teto: alive>=ceiling e queue>0 → razão 'Fila cheia e no teto'", () => {
  const out = parseEngineCapacity(base({
    engines: Array.from({ length: 8 }, () => ({ status: "busy" })),
    capacityConfig: { governorEnabled: true, maxCount: 8, warmMin: 2 },
    capacity: { queuedCount: 5 },
  }));
  assert.equal(out.alive, 8);
  assert.equal(out.ceiling, 8);
  assert.equal(out.queue, 5);
  assert.equal(out.governorOn, true);
  // governor on e ceiling(8) > max(warm 2, alive 8)? 8 > 8 = false → elastic false
  assert.equal(out.elastic, false);
  assert.match(out.reason, /Fila cheia e no teto/);
});

test("factoryStopped:true domina a razão (freio do dono)", () => {
  const out = parseEngineCapacity(base({
    engines: [{ status: "online" }],
    capacityConfig: { governorEnabled: true, maxCount: 8, warmMin: 1, factoryStopped: true },
    capacity: { queuedCount: 3 },
  }));
  assert.equal(out.factoryStopped, true);
  assert.match(out.reason, /Fábrica PARADA/);
});

test("contrato elástico 25/06: elasticEnabled/running/physicalMax/memoryPressurePercent surfaçados", () => {
  const out = parseEngineCapacity(base({
    engines: [{ status: "online" }, { status: "standby" }],
    capacityConfig: { governorEnabled: true, maxCount: 10, warmMin: 2 },
    capacity: { queuedCount: 1 },
    elasticEnabled: true,
    running: 4,
    physicalMax: 12,
    memoryPressurePercent: 63.4,
    memoryHeadroomEngines: 3,
  }));
  assert.equal(out.elasticEnabled, true);
  assert.equal(out.running, 4); // vem do payload, não do alive(2)
  assert.equal(out.physicalMax, 12); // vem do payload, não do ceiling(10)
  assert.equal(out.memoryPressurePercent, 63); // arredondado
  assert.equal(out.memoryHeadroomEngines, 3);
  // governor on, ceiling 10 > max(warm 2, alive 2) → elastic true
  assert.equal(out.elastic, true);
  assert.match(out.reason, /Fila com trabalho/);
});

test("turbo on/active vem do mesmo payload", () => {
  const on = parseEngineCapacity(base({
    isTurboEnabled: true,
    isTurboWindowActive: true,
  }));
  assert.equal(on.turboEnabled, true);
  assert.equal(on.turboActive, true);

  const forced = parseEngineCapacity(base({
    isTurboEnabled: true,
    isTurboForcedNow: true,
  }));
  assert.equal(forced.turboActive, true);

  const off = parseEngineCapacity(base());
  assert.equal(off.turboEnabled, false);
  assert.equal(off.turboActive, false);
});

test("alive cai pro capacity.runningCount quando nenhum engine tem status vivo", () => {
  const out = parseEngineCapacity(base({
    engines: [{ status: "offline" }, { status: "error" }],
    capacity: { runningCount: 3 },
    capacityConfig: { maxCount: 8 },
  }));
  assert.equal(out.alive, 3); // nenhum status vivo → usa runningCount
  // ceiling nunca menor que alive
  assert.ok(out.ceiling >= out.alive);
});

test("ceiling nunca fica abaixo dos vivos (config inconsistente)", () => {
  const out = parseEngineCapacity(base({
    engines: [{ status: "online" }, { status: "online" }, { status: "online" }],
    capacityConfig: { governorEnabled: true, maxCount: 1, warmMin: 0 },
  }));
  assert.equal(out.alive, 3);
  assert.equal(out.ceiling, 3); // Math.max(1, maxCount 1, alive 3) = 3
});
