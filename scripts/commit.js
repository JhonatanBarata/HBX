'use strict';

const { formatTimestamp, repoRoot, run } = require('./lib/runtime');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const defaultCommitMessage = () => `chore: backup local ${formatTimestamp()}`;

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
  return positionalMessage || defaultCommitMessage();
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

function normalizeStatusPath(line) {
  const pathPart = String(line || '').slice(3).trim();
  if (pathPart.includes(' -> ')) {
    return pathPart.split(' -> ').map((value) => value.trim().replace(/^"|"$/g, ''));
  }
  return [pathPart.replace(/^"|"$/g, '')];
}

function isForbiddenCommitPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const fileName = normalized.split('/').pop() || '';

  if (!normalized) {
    return false;
  }

  if (normalized.endsWith('.example')) {
    return false;
  }

  if (normalized === '.env' || normalized.includes('/.env') || fileName.startsWith('.env.')) {
    return true;
  }

  if (normalized.startsWith('backups/') || normalized.startsWith('postgres-data/')) {
    return true;
  }

  if (
    normalized.endsWith('.dump')
    || normalized.endsWith('.tar.gz')
    || normalized.endsWith('.bak')
    || normalized.endsWith('.backup')
    || normalized.endsWith('.sqlite')
    || normalized.endsWith('.sqlite3')
    || normalized.endsWith('.db')
  ) {
    return true;
  }

  if (normalized.endsWith('.sql') && !normalized.startsWith('backend/prisma/migrations/')) {
    return true;
  }

  return false;
}

function ensureNoForbiddenFilesInStatus(statusText) {
  const forbidden = String(statusText || '')
    .split(/\r?\n/)
    .flatMap(normalizeStatusPath)
    .filter(isForbiddenCommitPath);

  if (forbidden.length) {
    throw new Error([
      'Commit blocked because sensitive or production data files were detected:',
      ...forbidden.map((filePath) => `- ${filePath}`),
      'Keep real .env files, backups, dumps, local databases, and secrets out of git.',
    ].join('\n'));
  }
}

function printGitStatus(label) {
  console.log(`\n${label}`);
  const result = runStep('git', ['status', '--short', '--branch'], { captureOutput: true });
  const output = String(result.stdout || '').trim();
  console.log(output || 'Working tree clean.');
  return output;
}

function getCurrentBranch() {
  const result = run('git', ['branch', '--show-current'], {
    cwd: repoRoot,
    captureOutput: true,
  });
  return String(result.stdout || '').trim() || '(detached HEAD)';
}

function main() {
  const commitMessage = getCommitMessage();

  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureNoMergeConflicts();

  const statusBefore = printGitStatus('Status before commit');
  const currentChanges = statusBefore
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('##'))
    .join('\n')
    .trim();

  if (!currentChanges) {
    console.log('\nNenhuma mudanca local para commitar.');
    return;
  }
  ensureNoForbiddenFilesInStatus(currentChanges);

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

  console.log(`\nCommit created on ${getCurrentBranch()} with message: ${commitMessage}`);
  printGitStatus('Status after commit');
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
