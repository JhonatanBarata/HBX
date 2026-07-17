"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMIT_SIGNATURE,
  createLocalEnrichmentDbWriter,
} = require("../lib/local-enrichment-db-writer");

function baseEnv() {
  return {
    HBX_LOCAL_DEEP_TARGET: "production",
    HBX_LOCAL_ENRICH_DATABASE_URL: "postgresql://worker:oculto@127.0.0.1:55432/hbx",
    HBX_LOCAL_ENRICH_EXPECTED_DATABASE: "hbx_production",
    HBX_LOCAL_ENRICH_DB_SSL: "disable",
  };
}

test("writer faz handshake exato e chama somente a função versionada", async () => {
  const calls = [];
  const pool = {
    async query(text, params) {
      calls.push({ text, params });
      if (String(text).includes("contract_v1")) {
        return { rows: [{ contract: {
          schemaVersion: 1,
          contractVersion: "local_deep_enrich_v1",
          stage: "local_deep_enrich_v1",
          consumerKind: "owner_local",
          commitFunction: COMMIT_SIGNATURE,
          maxPayloadBytes: 262144,
          database: "hbx_production",
        } }] };
      }
      return { rows: [{ receipt: { missionId: "mission-1", noNewData: true, committedAt: "2026-07-16T20:00:00.000Z" } }] };
    },
    async end() {},
  };
  const writer = createLocalEnrichmentDbWriter({ env: baseEnv(), poolFactory: () => pool });

  const handshake = await writer.handshake();
  assert.equal(handshake.ok, true);
  const committed = await writer.commit({ mission: { id: "mission-1" } });
  assert.equal(committed.ok, true);
  assert.equal(committed.receipt.missionId, "mission-1");
  assert.match(calls[0].text, /hbx_local_enrichment_contract_v1/);
  assert.match(calls[1].text, /hbx_commit_local_enrichment_v1\(\$1::jsonb\)/);
  assert.equal(calls[1].params.length, 1);
});

test("writer falha fechado quando banco do handshake diverge", async () => {
  let calls = 0;
  const writer = createLocalEnrichmentDbWriter({
    env: baseEnv(),
    poolFactory: () => ({
      async query() {
        calls += 1;
        return { rows: [{ contract: {
          schemaVersion: 1,
          contractVersion: "local_deep_enrich_v1",
          stage: "local_deep_enrich_v1",
          consumerKind: "owner_local",
          commitFunction: COMMIT_SIGNATURE,
          database: "banco_errado",
        } }] };
      },
    }),
  });

  const result = await writer.handshake();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "contrato_ou_banco_incompativel");
  assert.equal(calls, 1);
});

test("writer não abre conexão sem target e banco esperados", async () => {
  let opened = false;
  const writer = createLocalEnrichmentDbWriter({ env: {}, poolFactory: () => { opened = true; return {}; } });
  const result = await writer.handshake();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target_production_obrigatorio");
  assert.equal(opened, false);
});
