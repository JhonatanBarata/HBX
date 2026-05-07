'use strict';

const {
  autoCommitIfNeeded,
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printFinalStatus,
  printStatus,
  pushMaster,
  runQuickValidations,
  verifyBasicHealth,
  verifyHostingerRuntime,
} = require('./common');

async function main() {
  logStage('Git status');
  ensureMasterBranch();
  printStatus();
  printChangedFiles();

  runQuickValidations();

  logStage('Commit automatico');
  const commit = autoCommitIfNeeded('release');

  logStage('Git push');
  pushMaster();

  const env = loadOperationsEnv();
  verifyHostingerRuntime(env);
  const health = await verifyBasicHealth(env);
  printFinalStatus({ commitCreated: commit.created, ...health });
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
