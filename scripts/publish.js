'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

const repoRoot = path.resolve(__dirname, '..');
const isDryRun = process.argv.includes('--dry-run');

function parseArg(name) {
  const long = `--${name}`;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === long && process.argv[i + 1]) return process.argv[i + 1];
    if (a.startsWith(`${long}=`)) return a.split('=')[1];
  }
  return undefined;
}

function run(command, args, options = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const printable = [executable, ...args].join(' ');
  console.log(`\n> ${printable}`);

  if (isDryRun && options.skipInDryRun) {
    console.log('[dry-run] skipped');
    return { status: 0, stdout: '', stderr: '' };
  }

  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (details) {
      console.error(details);
    }
    process.exit(result.status || 1);
  }

  return result;
}

// Non-interactive publish: parse optional --message or use env PUBLISH_MESSAGE.
function getCommitMessage() {
  const msgArg = parseArg('message') || process.env.PUBLISH_MESSAGE || process.env.PUBLISH_MSG;
  if (msgArg) return String(msgArg).trim();
  return `Automated publish ${new Date().toISOString()}`;
}

function tryRun(command, args) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  return spawnSync(executable, args, {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
}

async function main() {
  console.log('Validating backend and frontend before publish (non-interactive)...');

  run('git', ['rev-parse', '--is-inside-work-tree']);

  // check short status
  const status = run('git', ['status', '--short'], { captureOutput: true });
  const changedFiles = String(status.stdout || '').trim();

  if (!changedFiles && !isDryRun) {
    console.error('No local changes to publish. Aborting.');
    process.exit(1);
  }

  if (changedFiles) {
    console.log('\nChanged files:');
    console.log(changedFiles);
  }

  run('npm', ['--prefix', 'backend', 'run', 'prisma:generate']);
  run('node', ['backend/node_modules/typescript/bin/tsc', '-p', 'backend/tsconfig.json']);
  run('npm', ['--prefix', 'frontend', 'run', 'build']);

  if (isDryRun) {
    console.log('\nDry run completed. No commit or push executed.');
    return;
  }

  // Determine commit message
  const commitMessage = getCommitMessage();

  // Ensure git local user config exists to allow non-interactive commits
  const gitEmail = tryRun('git', ['config', '--get', 'user.email']);
  const hasEmail = gitEmail && gitEmail.status === 0 && String(gitEmail.stdout || '').trim();
  if (!hasEmail) {
    run('git', ['config', 'user.email', 'auto-publish@local']);
    run('git', ['config', 'user.name', 'Auto Publish']);
  }

  // Perform commit and push
  run('git', ['add', '-A']);
  tryRun('git', ['commit', '-m', commitMessage]);
  // If commit returned non-zero because there's nothing to commit, ignore
  run('git', ['push']);

  console.log('\nPublish completed. GitHub push finished; Vercel and Render can deploy from the updated branch.');
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});