'use strict';

const {
  autoCommitIfNeeded,
  createDatabaseBackupIfAvailable,
  createLocalOpsBackup,
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  pushMaster,
  runStep,
  verifyBasicHealth,
} = require('./common');

async function main() {
  logStage('Backup antes de force');
  createLocalOpsBackup();
  createDatabaseBackupIfAvailable();

  logStage('Git status');
  ensureMasterBranch();
  printStatus();
  printChangedFiles();

  logStage('Diff resumido');
  printDiffSummary();

  logStage('Commit automatico');
  const commit = autoCommitIfNeeded('force');

  logStage('Git push');
  pushMaster();

  logStage('Rebuild/restart completo Hostinger');
  runStep('node', ['./scripts/deploy-hostinger.js', 'force']);

  const health = await verifyBasicHealth(loadOperationsEnv());
  printFinalStatus({ commitCreated: commit.created, ...health });
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
