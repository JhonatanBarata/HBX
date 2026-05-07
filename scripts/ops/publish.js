'use strict';

const {
  autoCommitIfNeeded,
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  pushMaster,
  runBuildValidations,
  runStep,
  verifyBasicHealth,
} = require('./common');

async function main() {
  logStage('Git status');
  ensureMasterBranch();
  printStatus();
  printChangedFiles();

  logStage('Diff resumido');
  printDiffSummary();

  logStage('Commit automatico');
  const commit = autoCommitIfNeeded('publish');

  logStage('Git push');
  pushMaster();

  runBuildValidations();

  logStage('Deploy Hostinger');
  runStep('node', ['./scripts/deploy-hostinger.js']);

  const health = await verifyBasicHealth(loadOperationsEnv());
  printFinalStatus({ commitCreated: commit.created, ...health });
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
