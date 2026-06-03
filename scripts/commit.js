'use strict';

const path = require('path');
const {
  formatTimestamp,
  repoRoot,
  run,
} = require('./lib/runtime');

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

function isLocalGeneratedDataPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (!normalized.startsWith('hbx-scraping-engine/data')) return false;
  return (
    /^hbx-scraping-engine\/data(?:-\d+)?\/?$/.test(normalized)
    || /^hbx-scraping-engine\/data(?:-\d+)?\//.test(normalized)
  );
}

function isTracked(cwd, filePath) {
  const result = run('git', ['ls-files', '--error-unmatch', filePath], {
    cwd,
    captureOutput: true,
    allowFailure: true,
  });
  return result.status === 0;
}

function ensureLocalExclude(cwd) {
  const excludePath = path.join(cwd, '.git', 'info', 'exclude');
  const patterns = [
    'hbx-scraping-engine/data/',
    'hbx-scraping-engine/data-*/',
  ];
  const current = require('fs').existsSync(excludePath)
    ? require('fs').readFileSync(excludePath, 'utf8')
    : '';
  const missing = patterns.filter((pattern) => !current.split(/\r?\n/).includes(pattern));
  if (!missing.length) return;
  require('fs').appendFileSync(
    excludePath,
    `${current.endsWith('\n') || !current ? '' : '\n'}# HBX local scraping runtime data\n${missing.join('\n')}\n`,
    'utf8',
  );
}

function hideLocalGeneratedDataFromGitStatus(statusText, cwd) {
  const localDataPaths = String(statusText || '')
    .split(/\r?\n/)
    .flatMap(normalizeStatusPath)
    .filter(isLocalGeneratedDataPath);

  if (!localDataPaths.length) return false;

  ensureLocalExclude(cwd);

  const tracked = localDataPaths.filter((filePath) => isTracked(cwd, filePath));
  if (tracked.length) {
    runStep('git', ['update-index', '--skip-worktree', '--', ...tracked], { cwd });
  }

  console.log('\nDados locais do scraping ignorados no commit/publish:');
  for (const filePath of localDataPaths) console.log(`- ${filePath}`);
  return true;
}

function ensureNoForbiddenFilesInStatus(statusText, options = {}) {
  const forbidden = String(statusText || '')
    .split(/\r?\n/)
    .flatMap(normalizeStatusPath)
    .filter((filePath) => !isLocalGeneratedDataPath(filePath))
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

  let statusBefore = printGitStatus(`Status before commit (${config.label})`, config.cwd);
  if (hideLocalGeneratedDataFromGitStatus(statusBefore, config.cwd)) {
    statusBefore = printGitStatus(`Status before commit sem dados locais (${config.label})`, config.cwd);
  }

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
  const repositories = [
    {
      label: 'HBX',
      cwd: repoRoot,
      commitMessage,
      allowedSqlPrefixes: [
        'backend/prisma/migrations/',
        'webwhats/prisma/mysql-migrations/',
        'webwhats/prisma/postgresql-migrations/',
      ],
    },
  ];

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
