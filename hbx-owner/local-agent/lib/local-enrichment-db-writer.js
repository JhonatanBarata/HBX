"use strict";

const CONTRACT_VERSION = "local_deep_enrich_v1";
const STAGE = "local_deep_enrich_v1";
const CONSUMER_KIND = "owner_local";
const CONTRACT_FUNCTION = "hbx_local_enrichment.hbx_local_enrichment_contract_v1";
const COMMIT_FUNCTION = "hbx_local_enrichment.hbx_commit_local_enrichment_v1";
const COMMIT_SIGNATURE = `${COMMIT_FUNCTION}(jsonb)`;

function envBool(env, name, fallback = false) {
  const value = String(env && env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(value);
}

function parseJsonValue(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return null; }
}

function safeError(error) {
  const code = String(error && error.code || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  const message = String(error && error.message || error || "erro_desconhecido")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[conexao_oculta]")
    .slice(0, 300);
  return code ? `${code}:${message}` : message;
}

const RETRYABLE_SQL_STATES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available / lock_timeout
  "57014", // query_canceled / statement_timeout
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

function isTerminalContractRejection(error) {
  const sqlState = String(error && error.code || "").toUpperCase();
  if (!/^[0-9A-Z]{5}$/.test(sqlState) || RETRYABLE_SQL_STATES.has(sqlState)) return false;
  const message = String(error && error.message || "").toLowerCase();
  // O lease pode ser renovado/reobtido e o mesmo journal reaplicado com segurança. Não invalida
  // conteúdo por uma disputa ou expiração puramente operacional.
  if (/hbx_local_enrichment:(?:lease_expired|lease_mismatch)\b/.test(message)) return false;
  // Toda rejeição nomeada pelo contrato v1 é determinística para este payload/lead. Repetir crawl
  // e 30B não corrige evidência ausente, WhatsApp não confirmado, delta contraditório, conflito de
  // identidade/telefone ou tenant divergente; esses casos devem chegar ao estado Invalidado.
  if (/hbx_local_enrichment:[a-z0-9_%.-]+/.test(message)) return true;
  // Erros de dados/constraints produzidos pelo PostgreSQL também são determinísticos. Falhas
  // operacionais genéricas (rede, lock, timeout, shutdown) permanecem fora desta classificação.
  return sqlState.startsWith("22") || sqlState.startsWith("23");
}

function buildPoolOptions(env) {
  const connectionString = String(env.HBX_LOCAL_ENRICH_DATABASE_URL || "").trim();
  const sslMode = String(env.HBX_LOCAL_ENRICH_DB_SSL || "").trim().toLowerCase();
  let loopback = false;
  try {
    const parsed = new URL(connectionString);
    loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch { /* configuração será recusada antes da conexão */ }
  const ssl = sslMode === "disable" || (!sslMode && loopback)
    ? false
    : { rejectUnauthorized: !envBool(env, "HBX_LOCAL_ENRICH_DB_ALLOW_SELF_SIGNED", false) };
  return {
    connectionString,
    application_name: "hbx-owner-local-deep-enrich-v1",
    max: 1,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 8_000,
    query_timeout: 30_000,
    statement_timeout: 25_000,
    ssl,
    _loopback: loopback,
  };
}

function createLocalEnrichmentDbWriter(options = {}) {
  const env = options.env || process.env;
  const poolFactory = options.poolFactory || ((poolOptions) => {
    // Lazy: o painel local continua subindo quando a dependência/canal ainda não foi liberado.
    // A primeira tentativa real falha fechada e aparece na telemetria, sem vazar a conexão.
    const { Pool } = require("pg");
    return new Pool(poolOptions);
  });
  const expectedDatabase = String(env.HBX_LOCAL_ENRICH_EXPECTED_DATABASE || "").trim();
  const target = String(env.HBX_LOCAL_DEEP_TARGET || "").trim().toLowerCase();
  const poolOptions = buildPoolOptions(env);
  let pool = null;
  let acceptedContract = null;

  function configuration() {
    let reason = null;
    if (target !== "production") reason = "target_production_obrigatorio";
    else if (!poolOptions.connectionString) reason = "database_url_ausente";
    else if (!expectedDatabase) reason = "expected_database_ausente";
    else if (!poolOptions._loopback && !envBool(env, "HBX_LOCAL_ENRICH_PRIVATE_CHANNEL_CONFIRMED", false)) reason = "canal_privado_nao_confirmado";
    return {
      ready: !reason,
      reason,
      target: target || null,
      expectedDatabase: expectedDatabase || null,
      ssl: poolOptions.ssl !== false,
      privateTunnel: poolOptions.ssl === false,
    };
  }

  function getPool() {
    if (!pool) {
      const { _loopback, ...safePoolOptions } = poolOptions;
      pool = poolFactory(safePoolOptions);
    }
    return pool;
  }

  async function handshake() {
    const config = configuration();
    if (!config.ready) return { ok: false, reason: config.reason, configuration: config };
    try {
      const result = await getPool().query(`SELECT ${CONTRACT_FUNCTION}() AS contract`);
      const contract = parseJsonValue(result && result.rows && result.rows[0] && result.rows[0].contract);
      const matches = contract
        && Number(contract.schemaVersion) === 1
        && contract.contractVersion === CONTRACT_VERSION
        && contract.stage === STAGE
        && contract.consumerKind === CONSUMER_KIND
        && contract.commitFunction === COMMIT_SIGNATURE
        && contract.database === expectedDatabase;
      if (!matches) {
        acceptedContract = null;
        return {
          ok: false,
          reason: "contrato_ou_banco_incompativel",
          contract: contract ? {
            schemaVersion: contract.schemaVersion,
            contractVersion: contract.contractVersion,
            stage: contract.stage,
            consumerKind: contract.consumerKind,
            commitFunction: contract.commitFunction,
            database: contract.database,
          } : null,
        };
      }
      acceptedContract = contract;
      return { ok: true, contract };
    } catch (error) {
      acceptedContract = null;
      return { ok: false, reason: "handshake_indisponivel", error: safeError(error) };
    }
  }

  async function commit(payload) {
    if (!acceptedContract) {
      const checked = await handshake();
      if (!checked.ok) return checked;
    }
    const serialized = JSON.stringify(payload || {});
    const maxPayloadBytes = Math.max(1, Number(acceptedContract.maxPayloadBytes || 262_144));
    if (Buffer.byteLength(serialized, "utf8") > maxPayloadBytes) {
      return { ok: false, reason: "payload_acima_do_contrato", retryable: false };
    }
    try {
      const result = await getPool().query(
        `SELECT ${COMMIT_FUNCTION}($1::jsonb) AS receipt`,
        [serialized],
      );
      const receipt = parseJsonValue(result && result.rows && result.rows[0] && result.rows[0].receipt);
      if (!receipt || !receipt.missionId) return { ok: false, reason: "recibo_invalido", retryable: true };
      return { ok: true, receipt };
    } catch (error) {
      const sqlState = String(error && error.code || "");
      const serverRejected = /^[0-9A-Z]{5}$/.test(sqlState);
      const terminalContractError = isTerminalContractRejection(error);
      return {
        ok: false,
        reason: serverRejected ? "commit_rejeitado" : "commit_indisponivel",
        error: safeError(error),
        retryable: !terminalContractError,
        // Só falha de transporte/timeout pode ter ocorrido depois do COMMIT sem a resposta chegar.
        // SQLSTATE significa que o PostgreSQL respondeu com erro e a transação foi desfeita.
        outcomeUnknown: !serverRejected,
      };
    }
  }

  async function close() {
    const current = pool;
    pool = null;
    acceptedContract = null;
    if (current && typeof current.end === "function") await current.end().catch(() => null);
  }

  return { close, commit, configuration, handshake };
}

module.exports = {
  COMMIT_FUNCTION,
  COMMIT_SIGNATURE,
  CONSUMER_KIND,
  CONTRACT_FUNCTION,
  CONTRACT_VERSION,
  STAGE,
  buildPoolOptions,
  createLocalEnrichmentDbWriter,
  isTerminalContractRejection,
  parseJsonValue,
  safeError,
};
