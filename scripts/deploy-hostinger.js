'use strict';

const path = require('path');
const {
  assertNonLocalHttpUrl,
  loadEnvFromFiles,
  repoRoot,
  requireEnv,
  run,
} = require('./lib/runtime');

const remote = 'origin';
const branch = 'master';
const isDryRun = process.argv.includes('--dry-run');

function logStage(title) {
  console.log(`\n=== ${title} ===`);
}

function loadOperationsEnv() {
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

function runStep(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);

  if (isDryRun && options.skipInDryRun) {
    console.log('[dry-run] skipped');
    return { status: 0, stdout: '', stderr: '' };
  }

  return run(command, args, {
    cwd: repoRoot,
    captureOutput: options.captureOutput,
    allowFailure: options.allowFailure,
    env: options.env,
  });
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function ensureRequiredEnv(env) {
  const required = [
    'HOSTINGER_SSH_HOST',
    'HOSTINGER_SSH_USER',
    'HOSTINGER_APP_DIR',
    'PROD_BACKEND_URL',
    'PROD_FRONTEND_URL',
  ];

  for (const key of required) {
    requireEnv(env, key);
  }

  const backendUrl = normalizeBaseUrl(env.PROD_BACKEND_URL);
  const frontendUrl = normalizeBaseUrl(env.PROD_FRONTEND_URL);
  assertNonLocalHttpUrl(backendUrl, 'PROD_BACKEND_URL');
  assertNonLocalHttpUrl(frontendUrl, 'PROD_FRONTEND_URL');

  return {
    sshHost: String(env.HOSTINGER_SSH_HOST).trim(),
    sshUser: String(env.HOSTINGER_SSH_USER).trim(),
    appDir: String(env.HOSTINGER_APP_DIR).trim(),
    backendUrl,
    frontendUrl,
  };
}

function ensureMasterBranch() {
  const result = runStep('git', ['branch', '--show-current'], { captureOutput: true });
  const currentBranch = String(result.stdout || '').trim();
  if (currentBranch !== branch) {
    throw new Error(`Deploy Hostinger only runs from ${branch}. Current branch: ${currentBranch || '(detached HEAD)'}`);
  }
}

function ensureCleanWorkingTree() {
  const result = runStep('git', ['status', '--short'], { captureOutput: true });
  const status = String(result.stdout || '').trim();

  if (status) {
    console.log(status);
    throw new Error('Deploy Hostinger requires a clean working tree. Commit first, then run npm run publish.');
  }

  console.log('Working tree clean.');
}

function buildRemoteDeployCommand(appDir) {
  return [
    'set -e',
    `cd ${shellSingleQuote(appDir)}`,
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi',
    '$DC down',
    '$DC up -d --build',
    'docker ps',
  ].join(' && ');
}

function deployOnHostinger(config) {
  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const remoteCommand = buildRemoteDeployCommand(config.appDir);
  runStep('ssh', [sshTarget, remoteCommand], { skipInDryRun: true });
}

async function requestWithRetry(url, options = {}) {
  const timeoutSeconds = Math.max(30, Number(process.env.HOSTINGER_VERIFY_TIMEOUT_SECONDS || '180'));
  const intervalMs = Math.max(1000, Number(process.env.HOSTINGER_VERIFY_INTERVAL_MS || '5000'));
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutSeconds * 1000) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw lastError || new Error(`Verification timed out for ${url}`);
}

async function verifyProduction(config) {
  const healthUrl = `${config.backendUrl}/health`;

  console.log(`\n> HEAD ${healthUrl}`);
  const healthResponse = await requestWithRetry(healthUrl, { method: 'HEAD' });
  console.log(`Health OK: HTTP ${healthResponse.status}`);

  console.log(`\n> HEAD ${healthUrl} with Origin ${config.frontendUrl}`);
  const corsResponse = await requestWithRetry(healthUrl, {
    method: 'HEAD',
    headers: {
      Origin: config.frontendUrl,
    },
  });
  const allowOrigin = corsResponse.headers.get('access-control-allow-origin') || '';
  if (!allowOrigin) {
    throw new Error('CORS check failed: missing access-control-allow-origin header.');
  }
  if (allowOrigin && allowOrigin !== '*' && allowOrigin !== config.frontendUrl) {
    throw new Error(`Unexpected CORS allow-origin header: ${allowOrigin}`);
  }
  console.log(`CORS OK: HTTP ${corsResponse.status}${allowOrigin ? `, allow-origin=${allowOrigin}` : ''}`);
}

async function main() {
  const env = loadOperationsEnv();
  const config = ensureRequiredEnv(env);

  logStage('Local Preflight');
  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureMasterBranch();
  ensureCleanWorkingTree();
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:generate']);
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate']);
  runStep('npm', ['--prefix', 'frontend', 'run', 'build']);

  logStage('Git Push');
  runStep('git', ['push', remote, branch], { skipInDryRun: true });

  logStage('Hostinger Deploy');
  deployOnHostinger(config);

  logStage('Production Verify');
  if (isDryRun) {
    console.log('[dry-run] skipped');
    return;
  }
  await verifyProduction(config);

  console.log('\nHostinger deploy completed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  main,
};
