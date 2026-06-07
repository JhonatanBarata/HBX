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

const HBX_DEFAULT_PUBLISH_ENGINE_COUNT = 3;
const HBX_ENGINE_HARD_LIMIT = 200;

function parsePositiveInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function resolvePublishEngineCount(env) {
  return Math.min(
    parsePositiveInteger(
      env.HBX_PUBLISH_ENGINE_COUNT || env.HBX_PUBLISH_WARM_ENGINE_COUNT,
      HBX_DEFAULT_PUBLISH_ENGINE_COUNT,
    ),
    HBX_ENGINE_HARD_LIMIT,
  );
}

function printAsapSummary() {
  const env = loadOperationsEnv();
  const engineCount = resolvePublishEngineCount(env);
  const webwhatsEnabled = String(env.WEBWHATS_DEPLOY_ENABLED || '').trim().toLowerCase() !== 'false';

  logStage('Publish ASAP');
  console.log('Fluxo real: status/diff -> deploy-hostinger -> preflight local -> push -> Hostinger.');
  console.log(`Motores HBX no publish normal: ${engineCount} warm engine(s), nao frota grande.`);
  console.log(`Webwhats deploy: ${webwhatsEnabled ? 'habilitado se o repo estiver disponivel' : 'desabilitado por WEBWHATS_DEPLOY_ENABLED=false'}.`);
  console.log('Para reduzir tempo sem perder cobertura do publish completo: mantenha HBX_PUBLISH_ENGINE_COUNT baixo; use npm run new quando quiser deploy seletivo.');
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
