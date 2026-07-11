'use strict';

const {
  createDatabaseBackupIfAvailable,
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  runStep,
} = require('./common');
const { isTruthy } = require('../lib/webwhats-release');

const rawArgs = process.argv.slice(2).map((arg) => String(arg || '').trim()).filter(Boolean);

// Frase-cofre: pular o Quality Gate exige consciencia explicita, nao so uma flag solta.
// Sem esta frase EXATA em HBX_SKIP_GATE_CONFIRM, --skip-gate/HBX_SKIP_GATE=1 NAO pulam o gate.
const SKIP_GATE_CONFIRM_PHRASE = 'EU-ASSUMO-O-RISCO-SEM-GATE';

function redLine(message) {
  console.log(`\x1b[1;31m${message}\x1b[0m`);
}

function wantsSkipGate() {
  const flagged = rawArgs.some((arg) => ['--skip-gate', 'skip-gate'].includes(arg.toLowerCase()))
    || isTruthy(process.env.HBX_SKIP_GATE);
  if (!flagged) return false;

  const confirm = String(process.env.HBX_SKIP_GATE_CONFIRM || '').trim();
  if (confirm !== SKIP_GATE_CONFIRM_PHRASE) {
    redLine('==================================================================');
    redLine('AVISO: --skip-gate/HBX_SKIP_GATE=1 SOZINHO NAO pula mais o Quality Gate.');
    redLine(`Para pular conscientemente, exporte HBX_SKIP_GATE_CONFIRM=${SKIP_GATE_CONFIRM_PHRASE}`);
    redLine('junto da flag. Sem a frase-cofre, o gate VAI rodar normalmente.');
    redLine('==================================================================');
    return false;
  }

  redLine('==================================================================');
  redLine('PERIGO: Quality Gate PULADO conscientemente (frase-cofre confirmada).');
  redLine('Os checks backend/frontend/Webwhats/motor NAO rodaram. Uso de emergencia.');
  redLine('==================================================================');
  return true;
}

function runPostDeploySmokeTest() {
  logStage('Smoke HTTP externo (pos-deploy)');
  const env = loadOperationsEnv();
  const backendUrl = String(env.PROD_BACKEND_URL || '').trim();
  const frontendUrl = String(env.PROD_FRONTEND_URL || '').trim();

  if (!backendUrl || !frontendUrl) {
    redLine('==================================================================');
    redLine('AVISO ALTO: smoke HTTP externo PULADO — PROD_BACKEND_URL/PROD_FRONTEND_URL ausentes.');
    redLine('O deploy NAO foi validado por fora (health/frontend). Configure as URLs de prod');
    redLine('em .env.production.local/.env.ops.local para reprovar deploy quebrado automaticamente.');
    redLine('==================================================================');
    return;
  }

  console.log(`Validando producao por fora: ${backendUrl}/health + ${frontendUrl}.`);
  // verify-prod.js roda o verificador HTTP REAL (health + frontend, e mail/whatsapp/db quando ha secret).
  // Ele resolve o proprio ops-env; exit != 0 -> runStep lanca -> publish FALHA (fatal, como deve).
  runStep('node', ['./scripts/verify-prod.js']);
  console.log('Smoke HTTP externo OK.');
}

const HBX_DEFAULT_ENGINE_CAPACITY = 20;
const HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT = 3;
const HBX_ENGINE_HARD_LIMIT = 200;

function parsePositiveInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function resolvePublishEngineCapacity(env) {
  return Math.min(
    parsePositiveInteger(
      env.HBX_PUBLISH_ENGINE_MAX_COUNT
        || env.HBX_ENGINE_MAX_COUNT
        || env.HBX_ENGINE_COUNT
        || env.HBX_ENGINE_DEFAULT_COUNT,
      HBX_DEFAULT_ENGINE_CAPACITY,
    ),
    HBX_ENGINE_HARD_LIMIT,
  );
}

function resolvePublishWarmCount(env, capacity) {
  return Math.min(
    parsePositiveInteger(
      env.HBX_PUBLISH_ENGINE_COUNT
        || env.HBX_PUBLISH_WARM_ENGINE_COUNT
        || env.HBX_ENGINE_WARM_MAX,
      HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT,
    ),
    capacity,
  );
}

function printAsapSummary() {
  const env = loadOperationsEnv();
  const engineCapacity = resolvePublishEngineCapacity(env);
  const warmCount = resolvePublishWarmCount(env, engineCapacity);
  const webwhatsEnabled = String(env.WEBWHATS_DEPLOY_ENABLED || '').trim().toLowerCase() !== 'false';

  logStage('Publish ASAP');
  console.log('Fluxo real: status/diff -> quality gate (G4) -> deploy-hostinger -> preflight local -> push -> Hostinger.');
  console.log(`Motores HBX no publish normal: capacidade ${engineCapacity}, warm inicial ${warmCount}.`);
  console.log(`Webwhats deploy: ${webwhatsEnabled ? 'habilitado se o repo estiver disponivel' : 'desabilitado por WEBWHATS_DEPLOY_ENABLED=false'}.`);
  console.log('Para reduzir tempo sem perder cobertura do publish completo: mantenha HBX_PUBLISH_ENGINE_COUNT baixo e ajuste HBX_PUBLISH_ENGINE_MAX_COUNT apenas para mudar capacidade.');
}

function main() {
  printAsapSummary();

  logStage('Git status');
  ensureMasterBranch();
  printStatus();
  printChangedFiles();

  logStage('Diff resumido');
  printDiffSummary();

  logStage('Quality Gate (G4)');
  if (wantsSkipGate()) {
    console.log('PULADO via --skip-gate/HBX_SKIP_GATE=1. Uso de emergencia apenas — os checks NAO rodaram.');
  } else {
    console.log('Rodando backend/frontend/Webwhats/motor antes do deploy. Escape de emergencia: npm run publish -- --skip-gate (ou HBX_SKIP_GATE=1).');
    runStep('npm', ['run', 'gate']);
  }

  logStage('Backup de banco (antes do deploy)');
  // Tolerante por design: se pg_dump/SSH indisponivel, imprime "pulado" e segue.
  // Falha de backup NUNCA aborta o publish — so registra.
  createDatabaseBackupIfAvailable();

  logStage('Deploy Hostinger');
  runStep('node', ['./scripts/deploy-hostinger.js']);

  runPostDeploySmokeTest();

  printFinalStatus();
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
