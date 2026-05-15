'use strict';

const {
  autoCommitIfNeeded,
  ensureCleanWorkingTree,
  ensureMasterBranch,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  runStep,
} = require('./common');

function main() {
  logStage('Git status');
  ensureMasterBranch();
  printStatus();
  printChangedFiles();

  logStage('Diff resumido');
  printDiffSummary();

  logStage('Commit automatico');
  const commit = autoCommitIfNeeded('publish');
  ensureCleanWorkingTree('HBX');

  logStage('Deploy Hostinger');
  runStep('node', ['./scripts/deploy-hostinger.js']);

  printFinalStatus({ commitCreated: commit.created });
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
