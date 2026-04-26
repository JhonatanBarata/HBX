'use strict';

const path = require('path');
const {
  assertNonLocalHttpUrl,
  loadEnvFromFiles,
  repoRoot,
  run,
} = require('./lib/runtime');

const remote = 'origin';
const branch = 'master';
const rawArgs = process.argv.slice(2).map((arg) => String(arg || '').trim()).filter(Boolean);

function parseMode() {
  const wantsDryRun = rawArgs.some((arg) => ['d', 'dry-run', '--dry-run'].includes(arg.toLowerCase()));
  const wantsForce = rawArgs.some((arg) => ['f', 'force', '--force'].includes(arg.toLowerCase()));

  if (wantsDryRun && wantsForce) {
    throw new Error('Use only one publish mode at a time: dry-run or force.');
  }

  if (wantsDryRun) return 'dry-run';
  if (wantsForce) return 'force';
  return 'normal';
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

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

  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error([
      `Missing required Hostinger deploy environment variable(s): ${missing.join(', ')}`,
      'Add them to .env.production.local, .env.ops.local, or .env.operations.local.',
      'Use .env.production.example as the placeholder reference and keep real values out of git.',
    ].join('\n'));
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
    forceReboot: isTruthy(env.FORCE_REBOOT_HOSTINGER),
  };
}

function ensureMasterBranch() {
  const result = runStep('git', ['branch', '--show-current'], { captureOutput: true });
  const currentBranch = String(result.stdout || '').trim();
  if (currentBranch !== branch) {
    throw new Error(`Publish Hostinger only runs from ${branch}. Current branch: ${currentBranch || '(detached HEAD)'}`);
  }
}

function ensureCleanWorkingTree(mode) {
  const result = runStep('git', ['status', '--short'], { captureOutput: true });
  const status = String(result.stdout || '').trim();

  if (!status) {
    console.log('Working tree clean.');
    return;
  }

  console.log(status);
  if (mode === 'dry-run') {
    console.log('[dry-run] Working tree is dirty. Normal/force publish would stop here.');
    return;
  }

  throw new Error('Publish Hostinger requires a clean working tree. Run npm run commit first, then npm run publish.');
}

function listChangedFilesAheadOfRemote() {
  const result = runStep('git', ['diff', '--name-only', `${remote}/${branch}..HEAD`], {
    captureOutput: true,
    allowFailure: true,
  });

  if (result.status !== 0) {
    return [];
  }

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function printFrontendDeployNotice(config, changedFiles) {
  const frontendFiles = changedFiles.filter((value) => value.startsWith('frontend/'));
  if (!frontendFiles.length) return;

  const preview = frontendFiles.slice(0, 5).join(', ');
  const suffix = frontendFiles.length > 5 ? ` (+${frontendFiles.length - 5} arquivo(s))` : '';

  console.warn([
    '',
    'Aviso operacional: este publish conclui apenas Hostinger (backend/webscraping).',
    `O frontend oficial em ${config.frontendUrl} continua sendo servido pela Vercel e pode permanecer com bundle anterior ate o rollout externo terminar.`,
    `Mudancas de frontend detectadas neste publish: ${preview}${suffix}`,
  ].join('\n'));
}

function buildRemoteDeployScript(config, mode) {
  const isForce = mode === 'force';
  const rebootValue = isForce && config.forceReboot ? 'true' : 'false';

  const lines = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    `BACKEND_URL=${shellSingleQuote(config.backendUrl)}`,
    `FRONTEND_URL=${shellSingleQuote(config.frontendUrl)}`,
    `FORCE_REBOOT_HOSTINGER=${shellSingleQuote(rebootValue)}`,
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f backend/.env ]; then echo "ERRO: backend/.env nao existe na VPS."; exit 1; fi',
    'ENV_DB_LINES="$(awk -F= \'/^[[:space:]]*(DATABASE_URL|DIRECT_URL|PROD_DATABASE_URL|PROD_DIRECT_URL)[[:space:]]*=/{print $0}\' backend/.env)"',
    'if printf "%s\\n" "$ENV_DB_LINES" | grep -Eiq "supabase\\.com"; then echo "ERRO: backend/.env aponta DATABASE_URL/DIRECT_URL para Supabase. Deploy bloqueado."; exit 1; fi',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx-postgres"; then echo "ERRO: backend/.env precisa apontar para hbx-postgres."; exit 1; fi',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx_prod"; then echo "ERRO: backend/.env precisa apontar para o banco hbx_prod."; exit 1; fi',
    'if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: container hbx-postgres nao esta running."; exit 1; fi',
    'POSTGRES_NETWORK="$(docker inspect hbx-postgres --format \'{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}\' | grep -E \'^hbx[-_]net$\' | head -n 1 || true)"',
    'if [ -n "$POSTGRES_NETWORK" ]; then export HBX_DOCKER_NETWORK="$POSTGRES_NETWORK"; elif docker network inspect hbx_net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx_net; elif docker network inspect hbx-net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx-net; else echo "ERRO: rede Docker hbx_net/hbx-net nao encontrada."; exit 1; fi',
    'if docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; elif docker compose version >/dev/null 2>&1; then DC="docker compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'echo "Banco esperado: hbx-postgres/hbx_prod"',
    'echo "Backend URL: $BACKEND_URL"',
    'echo "Frontend URL: $FRONTEND_URL"',
    'echo "Rede Docker: $HBX_DOCKER_NETWORK"',
  ];

  if (isForce) {
    lines.push(
      '$DC -f docker-compose.hostinger.yml down --remove-orphans',
      'docker rm -f hbx-backend webscraping 2>/dev/null || true',
      '$DC -f docker-compose.hostinger.yml build --no-cache backend webscraping || echo "Aviso: build --no-cache falhou; tentando up -d --build."',
      '$DC -f docker-compose.hostinger.yml up -d --build backend webscraping',
      'docker restart hbx-backend webscraping',
      'docker image prune -f',
      'docker builder prune -f || true',
      'if [ "$FORCE_REBOOT_HOSTINGER" = "true" ]; then echo "FORCE_REBOOT_HOSTINGER=true: reiniciando VPS."; (sudo reboot || reboot); else echo "Reboot da VPS ignorado. Defina FORCE_REBOOT_HOSTINGER=true para habilitar."; fi',
    );
  } else {
    lines.push('docker rm -f hbx-backend webscraping 2>/dev/null || true');
    lines.push('$DC -f docker-compose.hostinger.yml up -d --build backend webscraping');
  }

  lines.push(
    'echo "Containers ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-backend|webscraping|hbx-postgres" || true',
  );

  return lines.join('\n');
}

function printDryRun(config, mode) {
  console.log('\n[dry-run] No git push, no SSH execution, no docker-compose down/up on Hostinger.');
  console.log('[dry-run] Would run: git push origin master');
  console.log(`[dry-run] Would SSH into: ${config.sshUser}@${config.sshHost}`);
  console.log('[dry-run] Would execute this remote script:');
  console.log('--- remote script start ---');
  console.log(buildRemoteDeployScript(config, mode));
  console.log('--- remote script end ---');
}

function deployOnHostinger(config, mode) {
  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const remoteScript = buildRemoteDeployScript(config, mode);
  runStep('ssh', [sshTarget, 'bash', '-lc', shellSingleQuote(remoteScript)]);
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

  console.log(`\n> GET ${healthUrl}`);
  const healthResponse = await requestWithRetry(healthUrl, { method: 'GET' });
  console.log(`Health OK: HTTP ${healthResponse.status}`);

  console.log(`\n> GET ${healthUrl} with Origin ${config.frontendUrl}`);
  const corsResponse = await requestWithRetry(healthUrl, {
    method: 'GET',
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
  const mode = parseMode();
  const env = loadOperationsEnv();
  const config = ensureRequiredEnv(env);

  logStage(`Local Preflight (${mode})`);
  console.log('Banco esperado: hbx-postgres/hbx_prod');
  console.log(`Backend URL: ${config.backendUrl}`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureMasterBranch();
  ensureCleanWorkingTree(mode);
  const changedFilesAheadOfRemote = listChangedFilesAheadOfRemote();
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:generate']);
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate']);
  runStep('npm', ['--prefix', 'backend', 'run', 'build']);
  runStep('npm', ['--prefix', 'frontend', 'run', 'build']);

  if (mode === 'dry-run') {
    logStage('Dry Run Plan');
    printDryRun(config, 'normal');
    return;
  }

  logStage('Git Push');
  runStep('git', ['push', remote, branch]);

  logStage(`Hostinger Deploy (${mode})`);
  deployOnHostinger(config, mode);

  logStage('Production Verify');
  await verifyProduction(config);
  printFrontendDeployNotice(config, changedFilesAheadOfRemote);

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
