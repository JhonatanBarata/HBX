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

test("writer exige confirmação de canal privado até quando a conexão remota usa TLS", async () => {
  let opened = false;
  const writer = createLocalEnrichmentDbWriter({
    env: {
      ...baseEnv(),
      HBX_LOCAL_ENRICH_DATABASE_URL: "postgresql://worker:oculto@db.example.com:5432/hbx",
      HBX_LOCAL_ENRICH_DB_SSL: "require",
    },
    poolFactory: () => { opened = true; return {}; },
  });
  const result = await writer.handshake();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "canal_privado_nao_confirmado");
  assert.equal(opened, false);
});

test("writer distingue rejeição SQL de falha de transporte com resultado incerto", async () => {
  let mode = "sql";
  const pool = {
    async query(text) {
      if (String(text).includes("contract_v1")) return { rows: [{ contract: {
        schemaVersion: 1,
        contractVersion: "local_deep_enrich_v1",
        stage: "local_deep_enrich_v1",
        consumerKind: "owner_local",
        commitFunction: COMMIT_SIGNATURE,
        maxPayloadBytes: 262144,
        database: "hbx_production",
      } }] };
      if (mode === "sql") throw Object.assign(new Error("hbx_local_enrichment:lease_expired"), { code: "P0001" });
      throw new Error("socket hang up");
    },
  };
  const writer = createLocalEnrichmentDbWriter({ env: baseEnv(), poolFactory: () => pool });
  await writer.handshake();
  const rejected = await writer.commit({ mission: { id: "mission-1" } });
  assert.equal(rejected.reason, "commit_rejeitado");
  assert.equal(rejected.outcomeUnknown, false);
  assert.equal(rejected.retryable, true);

  mode = "network";
  const uncertain = await writer.commit({ mission: { id: "mission-1" } });
  assert.equal(uncertain.reason, "commit_indisponivel");
  assert.equal(uncertain.outcomeUnknown, true);
});

test("writer invalida rejeições determinísticas e mantém lease/lock/timeout em retry", async () => {
  let failure = null;
  const pool = {
    async query(text) {
      if (String(text).includes("contract_v1")) return { rows: [{ contract: {
        schemaVersion: 1,
        contractVersion: "local_deep_enrich_v1",
        stage: "local_deep_enrich_v1",
        consumerKind: "owner_local",
        commitFunction: COMMIT_SIGNATURE,
        maxPayloadBytes: 262144,
        database: "hbx_production",
      } }] };
      throw failure;
    },
  };
  const writer = createLocalEnrichmentDbWriter({ env: baseEnv(), poolFactory: () => pool });
  await writer.handshake();

  const deterministic = [
    "hbx_local_enrichment:literal_evidence_missing:email",
    "hbx_local_enrichment:whatsapp_not_confirmed",
    "hbx_local_enrichment:no_new_data_has_business_delta",
    "hbx_local_enrichment:radar_phone_conflict",
    "hbx_local_enrichment:vendas_phone_conflict",
  ];
  for (const message of deterministic) {
    failure = Object.assign(new Error(message), { code: "P0001" });
    const result = await writer.commit({ mission: { id: "mission-1" } });
    assert.equal(result.reason, "commit_rejeitado", message);
    assert.equal(result.outcomeUnknown, false, message);
    assert.equal(result.retryable, false, message);
  }

  const operational = [
    { message: "hbx_local_enrichment:lease_expired", code: "P0001" },
    { message: "hbx_local_enrichment:lease_mismatch", code: "P0001" },
    { message: "canceling statement due to lock timeout", code: "55P03" },
    { message: "canceling statement due to statement timeout", code: "57014" },
  ];
  for (const item of operational) {
    failure = Object.assign(new Error(item.message), { code: item.code });
    const result = await writer.commit({ mission: { id: "mission-1" } });
    assert.equal(result.reason, "commit_rejeitado", item.message);
    assert.equal(result.outcomeUnknown, false, item.message);
    assert.equal(result.retryable, true, item.message);
  }
});
