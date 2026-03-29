'use strict';

const { repoRoot, run } = require('./lib/runtime');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const defaultCommitMessage = 'chore: update app master state';

function readArgValue(flagName) {
  const direct = args.find((arg) => arg.startsWith(`${flagName}=`));
  if (direct) {
    return direct.split('=', 2)[1] || '';
  }

  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return '';
}

function getCommitMessage() {
  const explicitMessage = String(readArgValue('--message') || '').trim();
  if (explicitMessage) {
    return explicitMessage;
  }

  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
  const positionalMessage = positionalArgs.join(' ').trim();
  return positionalMessage || defaultCommitMessage;
}

function runStep(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(' ');
  console.log(`\n> ${printable}`);

  try {
    return run(command, commandArgs, {
      cwd: repoRoot,
      captureOutput: options.captureOutput,
      allowFailure: options.allowFailure,
    });
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

function ensureMasterBranch() {
  const branchResult = run('git', ['branch', '--show-current'], {
    cwd: repoRoot,
    captureOutput: true,
  });
  const currentBranch = String(branchResult.stdout || '').trim();

  if (currentBranch !== 'master') {
    throw new Error(`Commit only runs from master. Current branch: ${currentBranch || '(detached HEAD)'}`);
  }
}

function ensureNoMergeConflicts() {
  const conflictsResult = run('git', ['diff', '--name-only', '--diff-filter=U'], {
    cwd: repoRoot,
    captureOutput: true,
  });
  const conflicts = String(conflictsResult.stdout || '').trim();

  if (conflicts) {
    throw new Error(`Resolve merge conflicts before committing.\n${conflicts}`);
  }
}

function main() {
  const commitMessage = getCommitMessage();

  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureMasterBranch();
  ensureNoMergeConflicts();

  const statusBefore = run('git', ['status', '--short'], {
    cwd: repoRoot,
    captureOutput: true,
  });
  const currentChanges = String(statusBefore.stdout || '').trim();
  if (!currentChanges) {
    console.log('No local changes to commit.');
    return;
  }

  if (isDryRun) {
    console.log('\nDry run only. The following changes would be included by git add -A:');
    console.log(currentChanges);
    console.log(`\nCommit message: ${commitMessage}`);
    return;
  }

  runStep('git', ['add', '-A']);
  const commitResult = runStep('git', ['commit', '-m', commitMessage], {
    captureOutput: true,
    allowFailure: true,
  });

  if (commitResult.status !== 0) {
    const stdout = String(commitResult.stdout || '');
    const stderr = String(commitResult.stderr || '');
    if (/nothing to commit/i.test(stdout) || /nothing to commit/i.test(stderr) || /nothing added to commit/i.test(stdout)) {
      console.log('No changes to commit after git add -A.');
      return;
    }

    throw new Error(`git commit failed: ${stdout || stderr}`);
  }

  const output = [String(commitResult.stdout || '').trim(), String(commitResult.stderr || '').trim()].filter(Boolean).join('\n');
  if (output) {
    console.log(output);
  }

  console.log(`\nCommit created on master with message: ${commitMessage}`);
}

main();