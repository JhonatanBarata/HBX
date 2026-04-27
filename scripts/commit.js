'use strict';

const path = require('path');
const {
  formatTimestamp,
  loadEnvFromFiles,
  repoRoot,
  run,
} = require('./lib/runtime');
const {
  isWebwhatsRepoAvailable,
  resolveWebwhatsRepoPath,
  shouldUseWebwhats,
} = require('./lib/webwhats-release');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const defaultCommitMessage = () => `chore: backup local ${formatTimestamp()}`;

function loadCommitEnv() {
  const files = [
    path.join(repoRoot, '.env.production.local'),
    path.join(repoRoot, '.env.ops.local'),
    path.join(repoRoot, '.env.operations.local'),
  ];

  return {
    ...loadEnvFromFiles(files),
    ...process.env,
  };
}

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
      cwd: options.cwd || repoRoot,
      captureOutput: options.captureOutput,
      allowFailure: options.allowFailure,
    });
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

function ensureNoMergeConflicts(cwd = repoRoot) {
  const conflictsResult = run('git', ['diff', '--name-only', '--diff-filter=U'], {
    cwd,
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

function isForbiddenCommitPath(filePath, options = {}) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const fileName = normalized.split('/').pop() || '';
  const allowedSqlPrefixes = options.allowedSqlPrefixes || ['backend/prisma/migrations/'];

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

  if (normalized.endsWith('.sql') && !allowedSqlPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  return false;
}

function ensureNoForbiddenFilesInStatus(statusText, options = {}) {
  const forbidden = String(statusText || '')
    .split(/\r?\n/)
    .flatMap(normalizeStatusPath)
    .filter((filePath) => isForbiddenCommitPath(filePath, options));

  if (forbidden.length) {
    throw new Error([
      'Commit blocked because sensitive or production data files were detected:',
      ...forbidden.map((filePath) => `- ${filePath}`),
      'Keep real .env files, backups, dumps, local databases, and secrets out of git.',
    ].join('\n'));
  }
}

function printGitStatus(label, cwd = repoRoot) {
  console.log(`\n${label}`);
  const result = runStep('git', ['status', '--short', '--branch'], { cwd, captureOutput: true });
  const output = String(result.stdout || '').trim();
  console.log(output || 'Working tree clean.');
  return output;
}

function getCurrentBranch(cwd = repoRoot) {
  const result = run('git', ['branch', '--show-current'], {
    cwd,
    captureOutput: true,
  });
  return String(result.stdout || '').trim() || '(detached HEAD)';
}

function commitRepository(config) {
  runStep('git', ['rev-parse', '--is-inside-work-tree'], { cwd: config.cwd });
  ensureNoMergeConflicts(config.cwd);

  const statusBefore = printGitStatus(`Status before commit (${config.label})`, config.cwd);
  const currentChanges = statusBefore
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('##'))
    .join('\n')
    .trim();

  if (!currentChanges) {
    console.log(`\nNenhuma mudanca local para commitar em ${config.label}.`);
    return false;
  }
  ensureNoForbiddenFilesInStatus(currentChanges, {
    allowedSqlPrefixes: config.allowedSqlPrefixes,
  });

  if (isDryRun) {
    console.log(`\nDry run only (${config.label}). The following changes would be included by git add -A:`);
    console.log(currentChanges);
    console.log(`\nCommit message: ${config.commitMessage}`);
    return false;
  }

  runStep('git', ['add', '-A'], { cwd: config.cwd });
  const commitResult = runStep('git', ['commit', '-m', config.commitMessage], {
    cwd: config.cwd,
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

  console.log(`\nCommit created on ${getCurrentBranch(config.cwd)} (${config.label}) with message: ${config.commitMessage}`);
  printGitStatus(`Status after commit (${config.label})`, config.cwd);
  return true;
}

function main() {
  const commitMessage = getCommitMessage();
  const commitEnv = loadCommitEnv();
  const webwhatsRepoPath = resolveWebwhatsRepoPath(commitEnv);
  const includeWebwhats = shouldUseWebwhats(commitEnv, 'WEBWHATS_COMMIT_ENABLED', webwhatsRepoPath);
  const repositories = [
    {
      label: 'HBX',
      cwd: repoRoot,
      commitMessage,
      allowedSqlPrefixes: ['backend/prisma/migrations/'],
    },
  ];

  if (includeWebwhats) {
    if (!isWebwhatsRepoAvailable(webwhatsRepoPath)) {
      throw new Error(`WEBWHATS_COMMIT_ENABLED is enabled, but no Webwhats git repository was found at: ${webwhatsRepoPath}`);
    }

    repositories.push({
      label: 'Webwhats',
      cwd: webwhatsRepoPath,
      commitMessage,
      allowedSqlPrefixes: ['prisma/mysql-migrations/', 'prisma/postgresql-migrations/'],
    });
  } else {
    console.log(`\nWebwhats commit skipped. Repository not found at ${webwhatsRepoPath} or WEBWHATS_COMMIT_ENABLED=false.`);
  }

  const created = repositories.map(commitRepository).filter(Boolean);

  if (!created.length && !isDryRun) {
    console.log('\nNenhuma mudanca local para commitar.');
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
