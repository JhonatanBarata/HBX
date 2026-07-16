"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFabricaResponse } = require("../lib/fabrica-proxy");

test("status distingue backend offline, rota ausente e erro interno", () => {
  assert.deepEqual(
    normalizeFabricaResponse("status", { ok: false, error: "ECONNREFUSED" }),
    { ok: false, offline: true, reason: "backend_indisponivel", backendStatus: null, message: "ECONNREFUSED" },
  );
  assert.equal(normalizeFabricaResponse("status", { ok: false, statusCode: 404 }).reason, "fabrica_rota_ausente");
  const internal = normalizeFabricaResponse("status", { ok: false, statusCode: 500, data: { message: "Prisma falhou" } });
  assert.equal(internal.offline, false);
  assert.equal(internal.reason, "fabrica_backend_erro");
  assert.equal(internal.message, "Prisma falhou");
});

test("HTTP 200 só confirma start/stop quando a operação realmente ocorreu", () => {
  const refused = normalizeFabricaResponse("start", { ok: true, data: { started: false, reason: "budget_obrigatorio" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "budget_obrigatorio");
  assert.equal(normalizeFabricaResponse("start", { ok: true, data: { started: true } }).ok, true);
  assert.equal(normalizeFabricaResponse("stop", { ok: true, data: { stopped: false } }).ok, false);
});

test("status sem infraestrutura é indisponível, não offline", () => {
  const payload = normalizeFabricaResponse("status", {
    ok: true,
    data: { supported: false, unavailableReason: "migration_ausente:RadarFabricaRun" },
  });
  assert.equal(payload.ok, false);
  assert.equal(payload.offline, false);
  assert.equal(payload.reason, "migration_ausente:RadarFabricaRun");
});
