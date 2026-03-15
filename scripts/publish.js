'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

const repoRoot = path.resolve(__dirname, '..');
const isDryRun = process.argv.includes('--dry-run');

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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function main() {
  console.log('Validating backend and frontend before publish...');

  run('git', ['rev-parse', '--is-inside-work-tree']);

  const status = run('git', ['status', '--short'], { captureOutput: true });
  const changedFiles = String(status.stdout || '').trim();

  if (!changedFiles && !isDryRun) {
    console.error('No local changes to publish.');
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

  const confirmation = await ask('Type PUBLISH to commit and push: ');
  if (confirmation !== 'PUBLISH') {
    console.error('Publish cancelled.');
    process.exit(1);
  }

  const commitMessage = await ask('Commit message: ');
  if (!commitMessage) {
    console.error('Publish cancelled: commit message is required.');
    process.exit(1);
  }

  run('git', ['add', '-A']);
  run('git', ['commit', '-m', commitMessage]);
  run('git', ['push']);

  console.log('\nPublish completed. GitHub push finished; Vercel and Render can deploy from the updated branch.');
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});