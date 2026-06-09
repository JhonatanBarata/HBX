'use strict';

const {
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  runStep,
} = require('./common');

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
  console.log('Fluxo real: status/diff -> deploy-hostinger -> preflight local -> push -> Hostinger.');
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

  logStage('Deploy Hostinger');
  runStep('node', ['./scripts/deploy-hostinger.js']);

  printFinalStatus();
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
