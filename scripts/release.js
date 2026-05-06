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
  frontend: 'frontend (PM2)',
  webscraping: 'webscraping',
  'hbx-scraping-engine': 'hbx-scraping-engine',
};
const composeManagedServices = new Set(['webscraping']);

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
  const composeServices = services.filter((service) => composeManagedServices.has(service));
  const composeServiceArgs = composeServices.map(shellSingleQuote).join(' ');
  const lines = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    `SERVICES="${services.join(' ')}"`,
    `COMPOSE_SERVICES="${composeServices.join(' ')}"`,
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f .env ]; then echo "ERRO: .env raiz nao existe na VPS."; exit 1; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'if ! docker network inspect hbx_net >/dev/null 2>&1; then docker network create hbx_net >/dev/null; fi',
    'export HBX_DOCKER_NETWORK=hbx_net',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker start hbx-postgres >/dev/null; else run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d hbx-postgres; fi',
    'docker network connect "$HBX_DOCKER_NETWORK" hbx-postgres 2>/dev/null || true',
    'for i in $(seq 1 60); do if docker exec hbx-postgres sh -lc \'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\' >/dev/null 2>&1; then echo "Postgres pronto."; break; fi; echo "Aguardando Postgres ($i/60)..."; sleep 2; done',
    'echo "Servicos para rebuild: $SERVICES"',
    'has_service() { case " $SERVICES " in *" $1 "*) return 0;; *) return 1;; esac; }',
    'remove_containers() {',
    '  if [ "$#" -eq 0 ]; then return 0; fi',
    '  echo "Removendo containers antigos: $*"',
    '  docker rm -f "$@" 2>/dev/null || true',
    '}',
    'remove_named_or_suffixed() {',
    '  base="$1"',
    '  names="$base $(docker ps -a --format "{{.Names}}" | awk -v base="$base" \'$0 == base || $0 ~ "_" base "$" { print }\')"',
    '  remove_containers $names',
    '}',
    'ensure_pm2() {',
    '  if command -v pm2 >/dev/null 2>&1; then return 0; fi',
    '  echo "PM2 nao encontrado; instalando globalmente..."',
    '  npm i -g pm2',
    '}',
    'cleanup_frontend_docker() {',
    '  echo "Garantindo que frontend nao rode mais em Docker..."',
    '  remove_named_or_suffixed hbx-frontend',
    '  remove_containers frontend',
    '}',
    'verify_frontend_pm2() {',
    '  for i in $(seq 1 30); do',
    '    if command -v curl >/dev/null 2>&1 && curl -fsSI http://127.0.0.1:3001 >/dev/null 2>&1; then echo "Frontend PM2 pronto em http://127.0.0.1:3001"; return 0; fi',
    '    if command -v wget >/dev/null 2>&1 && wget -q --spider http://127.0.0.1:3001 >/dev/null 2>&1; then echo "Frontend PM2 pronto em http://127.0.0.1:3001"; return 0; fi',
    '    echo "Aguardando frontend PM2 ($i/30)..."',
    '    sleep 2',
    '  done',
    '  echo "ERRO: frontend PM2 nao respondeu em http://127.0.0.1:3001."',
    '  pm2 logs hbx-frontend --lines 120 --nostream 2>/dev/null || true',
    '  exit 1',
    '}',
    'deploy_frontend_pm2() {',
    '  echo "Publicando frontend fora do Docker via PM2..."',
    '  cleanup_frontend_docker',
    '  ensure_pm2',
    '  cd "$APP_DIR/frontend"',
    '  npm ci',
    '  npm run build',
    '  if pm2 describe hbx-frontend >/dev/null 2>&1; then',
    '    pm2 restart hbx-frontend --update-env',
    '  else',
    '    pm2 start npm --name hbx-frontend -- run start',
    '  fi',
    '  pm2 save',
    '  cd "$APP_DIR"',
    '  verify_frontend_pm2',
    '}',
    'ensure_frontend_pm2_runtime() {',
    '  cleanup_frontend_docker',
    '  ensure_pm2',
    '  if [ ! -d "$APP_DIR/frontend" ]; then echo "Pasta frontend nao encontrada em $APP_DIR/frontend; pulando runtime PM2."; return 0; fi',
    '  cd "$APP_DIR/frontend"',
    '  if [ ! -f .next/prerender-manifest.json ]; then',
    '    echo "Build frontend ausente; reconstruindo antes de subir PM2..."',
    '    npm ci',
    '    npm run build',
    '  fi',
    '  cd "$APP_DIR"',
    '  if pm2 describe hbx-frontend >/dev/null 2>&1; then',
    '    pm2 restart hbx-frontend --update-env',
    '  else',
    '    cd "$APP_DIR/frontend"',
    '    pm2 start npm --name hbx-frontend -- run start',
    '    cd "$APP_DIR"',
    '  fi',
    '  pm2 save',
    '  verify_frontend_pm2',
    '}',
    'start_hbx_engines() {',
    '  echo "Buildando imagem dos motores HBX..."',
    '  run_filtered docker build -t hbx_hbx-scraping-engine:latest ./hbx-scraping-engine',
    '  mkdir -p /root/HBX/hbx-scraping-engine/data /root/HBX/hbx-scraping-engine/data-1 /root/HBX/hbx-scraping-engine/data-2 /root/HBX/hbx-scraping-engine/data-3 /root/HBX/hbx-scraping-engine/data-4',
    '  remove_containers hbx-scraping-engine hbx-engine-1 hbx-engine-2 hbx-engine-3 hbx-engine-4',
    '  echo "Subindo hbx-scraping-engine fallback..."',
    '  docker run -d --name hbx-scraping-engine --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '    -e HBX_SCRAPING_TIMEOUT_SECONDS=20 \\',
    '    -e HBX_SCRAPING_CONCURRENCY=3 \\',
    '    -e HBX_SCRAPING_CACHE_TTL_HOURS=24 \\',
    '    -e HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120 \\',
    '    -e HBX_AGENDA_MAX_PAGES=20 \\',
    '    -e HBX_AGENDA_REQUEST_DELAY_MS=700 \\',
    '    -v /root/HBX/hbx-scraping-engine/data:/app/data \\',
    '    hbx_hbx-scraping-engine:latest',
    '  for n in 1 2 3 4; do',
    '    echo "Subindo hbx-engine-$n..."',
    '    docker run -d --name "hbx-engine-$n" --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '      -e HBX_SCRAPING_TIMEOUT_SECONDS=20 \\',
    '      -e HBX_SCRAPING_CONCURRENCY=3 \\',
    '      -e HBX_SCRAPING_CACHE_TTL_HOURS=24 \\',
    '      -e HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120 \\',
    '      -e HBX_AGENDA_MAX_PAGES=20 \\',
    '      -e HBX_AGENDA_REQUEST_DELAY_MS=700 \\',
    '      -v "/root/HBX/hbx-scraping-engine/data-$n:/app/data" \\',
    '      hbx_hbx-scraping-engine:latest',
    '  done',
    '}',
    'start_hbx_backend() {',
    '  echo "Buildando imagem backend..."',
    '  run_filtered docker build -t hbx_backend:latest ./backend',
    '  remove_named_or_suffixed hbx-backend',
    '  remove_containers backend',
    '  echo "Subindo hbx-backend..."',
    '  docker run -d --name hbx-backend --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '    --env-file /root/HBX/backend/.env \\',
    '    -e HBX_SCRAPING_ENGINE_URL=http://hbx-scraping-engine:8001 \\',
    '    -e HBX_ENGINE_URLS=http://hbx-engine-1:8001,http://hbx-engine-2:8001,http://hbx-engine-3:8001,http://hbx-engine-4:8001 \\',
    '    -e HBX_CAPACITY_ENGINE_2_QUEUE_THRESHOLD=3 \\',
    '    -e HBX_CAPACITY_ENGINE_3_QUEUE_THRESHOLD=10 \\',
    '    -e HBX_CAPACITY_ENGINE_4_QUEUE_THRESHOLD=20 \\',
    '    -e HBX_GOOGLE_EMERGENCY_QUEUE_THRESHOLD=50 \\',
    '    -e HBX_GOOGLE_EMERGENCY_DAILY_LIMIT=500 \\',
    '    -e HBX_GOOGLE_EMERGENCY_MAX_PER_RUN=20 \\',
    '    -e HBX_QUEUE_STUCK_MINUTES=10 \\',
    '    -e HBX_ENGINE_MAX_BUSY_MINUTES=15 \\',
    '    -p 3000:3000 \\',
    '    -v /root/HBX/backend/public/uploads:/app/public/uploads \\',
    '    hbx_backend:latest',
    '}',
    'verify_hbx_engines() {',
    '  echo "Validando variaveis e healthchecks dos motores HBX..."',
    '  if ! docker exec hbx-backend printenv | grep HBX_ENGINE_URLS; then echo "ERRO: HBX_ENGINE_URLS nao esta configurado no hbx-backend."; exit 1; fi',
    '  for n in 1 2 3 4; do',
    '    ok=0',
    '    for attempt in $(seq 1 30); do',
    '      if docker exec hbx-backend wget -qO- "http://hbx-engine-$n:8001/health"; then ok=1; break; fi',
    '      echo "Aguardando hbx-engine-$n ($attempt/30)..."',
    '      sleep 2',
    '    done',
    '    if [ "$ok" != "1" ]; then echo "ERRO: healthcheck falhou para hbx-engine-$n em http://hbx-engine-$n:8001/health."; exit 1; fi',
    '    echo "Healthcheck OK: hbx-engine-$n"',
    '  done',
    '}',
    'if has_service hbx-scraping-engine; then start_hbx_engines; fi',
    'if has_service backend; then start_hbx_backend; fi',
    'if [ -n "$COMPOSE_SERVICES" ]; then',
    '  for s in $COMPOSE_SERVICES; do',
    '    case "$s" in',
    '      webscraping) remove_named_or_suffixed webscraping;;',
    '    esac',
    '  done',
    `  run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps ${composeServiceArgs}`,
    'fi',
    'if has_service frontend; then deploy_frontend_pm2; else ensure_frontend_pm2_runtime; fi',
    'if has_service backend || has_service hbx-scraping-engine; then verify_hbx_engines; fi',
    'echo "Runtime ativo:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-backend|webscraping|hbx-scraping-engine|hbx-engine-[1-4]|hbx-postgres" || true',
    'pm2 list | grep -E "hbx-frontend|App name|name|online" || true',
  ];

  return lines.join('\n');
}

function deployOnHostinger(config, services) {
  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const remoteScript = buildRemoteReleaseScript(config, services);
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
  console.log(`Servicos publicados: ${formatPublishedServices(services)}`);
  console.log('Frontend runtime: PM2 fora do Docker');
  console.log(`URL final verificada: ${finalUrl}`);
}

function expandPublishedServices(services) {
  const selected = new Set(services);
  const published = ['backend', 'frontend', 'webscraping']
    .filter((service) => selected.has(service))
    .map((service) => serviceLabels[service] || service);

  if (selected.has('hbx-scraping-engine')) {
    published.push('hbx-engine-1', 'hbx-engine-2', 'hbx-engine-3', 'hbx-engine-4', 'hbx-scraping-engine');
  }

  return published;
}

function formatPublishedServices(services) {
  const published = expandPublishedServices(services);
  return published.length ? published.join(', ') : 'Sem servicos para rebuild';
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
  let finalUrl = 'nao verificada';
  try {
    finalUrl = await verifyFinalUrl(config);
  } catch (err) {
    const skip = String(process.env.HOSTINGER_SKIP_FINAL_VERIFY || '').toLowerCase();
    if (skip === '1' || skip === 'true') {
      console.warn(`Verificacao final falhou, ignorando devido a HOSTINGER_SKIP_FINAL_VERIFY: ${err && err.message ? err.message : err}`);
      finalUrl = `nao verificada (falha: ${err && err.message ? err.message : err})`;
    } else {
      throw err;
    }
  }

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
