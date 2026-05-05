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
const isDryRun = rawArgs.some((arg) => ['d', 'dry-run', '--dry-run'].includes(arg.toLowerCase()));

const serviceOrder = ['backend', 'webscraping', 'hbx-scraping-engine', 'frontend'];
const serviceLabels = {
  backend: 'backend',
  frontend: 'frontend',
  webscraping: 'webscraping',
  'hbx-scraping-engine': 'hbx-scraping-engine',
};

function logStage(title) {
  console.log(`\n=== ${title} ===`);
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
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

function quietToolEnv(extra = {}) {
  return {
    ...process.env,
    HUSKY: '0',
    PRISMA_HIDE_UPDATE_MESSAGE: 'true',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_LOGLEVEL: 'error',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_loglevel: 'error',
    npm_config_update_notifier: 'false',
    ...extra,
  };
}

function runStep(command, args, options = {}) {
  console.log(`\n> ${options.label || [command, ...args].join(' ')}`);
  return run(command, args, {
    cwd: options.cwd || repoRoot,
    captureOutput: options.captureOutput,
    allowFailure: options.allowFailure,
    env: options.env,
  });
}

function ensureRequiredEnv(env) {
  const required = [
    'HOSTINGER_SSH_HOST',
    'HOSTINGER_SSH_USER',
    'HOSTINGER_APP_DIR',
    'PROD_FRONTEND_URL',
  ];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error([
      `Missing required Hostinger release environment variable(s): ${missing.join(', ')}`,
      'Add them to .env.production.local, .env.ops.local, or .env.operations.local.',
    ].join('\n'));
  }

  const frontendUrl = normalizeBaseUrl(env.PROD_FRONTEND_URL);
  assertNonLocalHttpUrl(frontendUrl, 'PROD_FRONTEND_URL');

  return {
    sshHost: String(env.HOSTINGER_SSH_HOST).trim(),
    sshUser: String(env.HOSTINGER_SSH_USER).trim(),
    appDir: String(env.HOSTINGER_APP_DIR).trim(),
    frontendUrl,
    backendUrl: normalizeBaseUrl(env.PROD_BACKEND_URL || ''),
  };
}

function getCurrentBranch() {
  const result = runStep('git', ['branch', '--show-current'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function ensureMasterBranch() {
  const currentBranch = getCurrentBranch();
  if (currentBranch !== branch) {
    throw new Error(`Release only runs from ${branch}. Current branch: ${currentBranch || '(detached HEAD)'}`);
  }
}

function getHead() {
  const result = runStep('git', ['rev-parse', 'HEAD'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function listFilesAheadOfRemote() {
  const result = runStep('git', ['diff', '--name-only', `${remote}/${branch}..HEAD`], {
    captureOutput: true,
    allowFailure: true,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function listCommitsAheadOfRemote() {
  const result = runStep('git', ['log', '--oneline', `${remote}/${branch}..HEAD`], {
    captureOutput: true,
    allowFailure: true,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getLatestCommitLine() {
  const result = runStep('git', ['log', '-1', '--oneline'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function runCommitScript() {
  const passthroughArgs = rawArgs.filter((arg) => !['d', 'dry-run', '--dry-run'].includes(arg.toLowerCase()));
  if (isDryRun) {
    passthroughArgs.push('--dry-run');
  }
  runStep('node', ['./scripts/commit.js', ...passthroughArgs], {
    env: quietToolEnv(),
  });
}

function isMarkdownOrDocsOnly(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith('docs/')) return true;
  if (normalized.endsWith('.md') || normalized.endsWith('.markdown') || normalized.endsWith('.mdx')) return true;
  if (normalized.startsWith('scripts/')) return true;
  if (normalized === 'package.json' || normalized === 'package-lock.json') return true;
  return false;
}

function classifyChangedFiles(files) {
  const services = new Set();
  const structural = [];

  for (const filePath of files) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const lower = normalized.toLowerCase();
    const name = lower.split('/').pop() || '';

    if (
      lower === 'docker-compose.hostinger.yml'
      || lower === 'docker-compose.yml'
      || lower === '.dockerignore'
      || name === 'dockerfile'
      || name.startsWith('dockerfile.')
      || lower.startsWith('deploy/')
    ) {
      structural.push(normalized);
      continue;
    }

    if (lower.startsWith('frontend/')) services.add('frontend');
    if (lower.startsWith('backend/')) services.add('backend');
    if (lower.startsWith('webscraping/')) services.add('webscraping');
    if (lower.startsWith('hbx-scraping-engine/')) services.add('hbx-scraping-engine');
  }

  if (structural.length) {
    return {
      mode: 'full',
      services: serviceOrder.slice(),
      structural,
    };
  }

  const selectedServices = serviceOrder.filter((service) => services.has(service));
  if (!selectedServices.length && files.every(isMarkdownOrDocsOnly)) {
    return {
      mode: 'none',
      services: [],
      structural: [],
    };
  }

  return {
    mode: selectedServices.length ? 'partial' : 'none',
    services: selectedServices,
    structural: [],
  };
}

function buildRemoteReleaseScript(config, services) {
  const serviceArgs = services.map(shellSingleQuote).join(' ');
  const lines = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    `SERVICES="${services.join(' ')}"`,
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f .env ]; then echo "ERRO: .env raiz nao existe na VPS."; exit 1; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'if docker network inspect hbx_net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx_net; elif docker network inspect hbx-net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx-net; else docker network create hbx_net >/dev/null; export HBX_DOCKER_NETWORK=hbx_net; fi',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker start hbx-postgres >/dev/null; else run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d hbx-postgres; fi',
    'docker network connect "$HBX_DOCKER_NETWORK" hbx-postgres 2>/dev/null || true',
    'for i in $(seq 1 60); do if docker exec hbx-postgres sh -lc \'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\' >/dev/null 2>&1; then echo "Postgres pronto."; break; fi; echo "Aguardando Postgres ($i/60)..."; sleep 2; done',
    'echo "Servicos para rebuild: $SERVICES"',
    'REMOVE_CONTAINERS=""',
    'for s in $SERVICES; do',
    '  case "$s" in',
    '    backend) REMOVE_CONTAINERS="$REMOVE_CONTAINERS hbx-backend backend";;',
    '    frontend) REMOVE_CONTAINERS="$REMOVE_CONTAINERS hbx-frontend frontend";;',
    '    webscraping) REMOVE_CONTAINERS="$REMOVE_CONTAINERS webscraping";;',
    '    hbx-scraping-engine) REMOVE_CONTAINERS="$REMOVE_CONTAINERS hbx-scraping-engine";;',
    '  esac',
    'done',
    'if [ -n "$REMOVE_CONTAINERS" ]; then',
    '  echo "Removendo containers: $REMOVE_CONTAINERS"',
    '  docker rm -f $REMOVE_CONTAINERS 2>/dev/null || true',
    'fi',
    `run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps ${serviceArgs}`,
    'echo "Containers ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-frontend|hbx-backend|webscraping|hbx-scraping-engine|hbx-postgres" || true',
  ];

  return lines.join('\n');
}

function buildRemoteFetchOnlyScript(config) {
  return [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'echo "Sem servicos para rebuild."',
  ].join('\n');
}

function deployOnHostinger(config, services) {
  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const remoteScript = services.length
    ? buildRemoteReleaseScript(config, services)
    : buildRemoteFetchOnlyScript(config);
  runStep('ssh', [sshTarget, 'bash', '-lc', shellSingleQuote(remoteScript)], {
    label: `ssh ${sshTarget} release seletivo`,
  });
}

async function requestWithRetry(url) {
  const timeoutSeconds = Math.max(30, Number(process.env.HOSTINGER_VERIFY_TIMEOUT_SECONDS || '180'));
  const intervalMs = Math.max(1000, Number(process.env.HOSTINGER_VERIFY_INTERVAL_MS || '5000'));
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutSeconds * 1000) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw lastError || new Error(`Verification timed out for ${url}`);
}

async function verifyFinalUrl(config) {
  console.log(`\n> GET ${config.frontendUrl}`);
  const response = await requestWithRetry(config.frontendUrl);
  console.log(`URL final verificada: ${config.frontendUrl} (HTTP ${response.status})`);
  return `${config.frontendUrl} (HTTP ${response.status})`;
}

function printReleaseSummary({ commitCreated, commitLine, changedFiles, services, finalUrl }) {
  logStage('Resumo do release');
  console.log(`Commit criado: ${commitCreated ? commitLine : 'nenhum commit novo'}`);
  console.log('Arquivos alterados:');
  if (changedFiles.length) {
    for (const filePath of changedFiles) {
      console.log(`- ${filePath}`);
    }
  } else {
    console.log('- nenhum arquivo entre origin/master..HEAD');
  }
  console.log(`Servicos publicados: ${services.length ? services.map((service) => serviceLabels[service] || service).join(', ') : 'Sem servicos para rebuild'}`);
  console.log(`URL final verificada: ${finalUrl}`);
}

async function main() {
  const env = loadOperationsEnv();
  const config = ensureRequiredEnv(env);

  logStage('Commit local');
  ensureMasterBranch();
  const headBeforeCommit = getHead();
  runCommitScript();
  const headAfterCommit = getHead();
  const commitCreated = headBeforeCommit !== headAfterCommit;
  const commitLine = commitCreated ? getLatestCommitLine() : '';

  logStage('Detectar alteracoes');
  runStep('git', ['fetch', remote, branch]);
  const changedFiles = listFilesAheadOfRemote();
  const commitsAhead = listCommitsAheadOfRemote();
  const releasePlan = classifyChangedFiles(changedFiles);
  console.log(`Commits pendentes: ${commitsAhead.length}`);
  console.log(`Arquivos alterados: ${changedFiles.length}`);
  console.log(`Plano: ${releasePlan.mode === 'none' ? 'Sem servicos para rebuild' : releasePlan.services.join(', ')}`);
  if (releasePlan.structural.length) {
    console.log(`Rebuild completo por mudanca estrutural: ${releasePlan.structural.join(', ')}`);
  }

  if (isDryRun) {
    logStage('Dry Run');
    console.log('[dry-run] Sem git push, sem SSH e sem verificacao de URL.');
    printReleaseSummary({
      commitCreated,
      commitLine,
      changedFiles,
      services: releasePlan.services,
      finalUrl: 'nao verificada em dry-run',
    });
    return;
  }

  logStage('Git push');
  runStep('git', ['push', remote, branch], { env: quietToolEnv() });

  logStage('Deploy seletivo VPS');
  deployOnHostinger(config, releasePlan.services);
  if (!releasePlan.services.length) {
    console.log('\nSem serviços para rebuild');
  }

  logStage('Verificacao final');
  const finalUrl = await verifyFinalUrl(config);

  printReleaseSummary({
    commitCreated,
    commitLine,
    changedFiles,
    services: releasePlan.services,
    finalUrl,
  });
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
