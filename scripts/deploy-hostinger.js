'use strict';

const path = require('path');
const {
  assertNonLocalHttpUrl,
  loadEnvFromFiles,
  repoRoot,
  run,
} = require('./lib/runtime');
const {
  isTruthy,
  isWebwhatsRepoAvailable,
  resolveWebwhatsRepoPath,
  shouldUseWebwhats,
} = require('./lib/webwhats-release');

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

function logStage(title) {
  console.log(`\n=== ${title} ===`);
}

function quietToolEnv(extra = {}) {
  return {
    ...process.env,
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
  console.log(`\n> ${options.label || [command, ...args].join(' ')}`);

  return run(command, args, {
    cwd: options.cwd || repoRoot,
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

function ensureGitBranch(expectedBranch, cwd = repoRoot, label = 'HBX') {
  const result = runStep('git', ['branch', '--show-current'], { cwd, captureOutput: true });
  const currentBranch = String(result.stdout || '').trim();
  if (currentBranch !== expectedBranch) {
    throw new Error(`Publish ${label} only runs from ${expectedBranch}. Current branch: ${currentBranch || '(detached HEAD)'}`);
  }
}

function ensureCleanWorkingTree(mode, cwd = repoRoot, label = 'HBX') {
  const result = runStep('git', ['status', '--short'], { cwd, captureOutput: true });
  const status = String(result.stdout || '').trim();

  if (!status) {
    console.log(`${label} working tree clean.`);
    return;
  }

  console.log(status);
  if (mode === 'dry-run') {
    console.log(`[dry-run] ${label} working tree is dirty. Normal/force publish would stop here.`);
    return;
  }

  throw new Error(`Publish requires a clean ${label} working tree. Run npm run commit first, then npm run publish.`);
}

function listChangedFilesAheadOfRemote(cwd = repoRoot, gitRemote = remote, gitBranch = branch) {
  const result = runStep('git', ['diff', '--name-only', `${gitRemote}/${gitBranch}..HEAD`], {
    cwd,
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

function listCommitsAheadOfRemote(cwd = repoRoot, gitRemote = remote, gitBranch = branch) {
  const result = runStep('git', ['log', '--oneline', `${gitRemote}/${gitBranch}..HEAD`], {
    cwd,
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

function printPublishedChanges(commits, changedFiles) {
  if (!commits.length && !changedFiles.length) {
    console.log('\nMudancas publicadas: nenhum commit local novo; deploy reaplicou o HEAD atual.');
    return;
  }

  const commitPreview = commits.slice(0, 5);
  const commitSuffix = commits.length > 5 ? ` (+${commits.length - 5} commit(s))` : '';
  const filePreview = changedFiles.slice(0, 8);
  const fileSuffix = changedFiles.length > 8 ? ` (+${changedFiles.length - 8} arquivo(s))` : '';

  console.log('\nMudancas publicadas:');
  if (commitPreview.length) {
    console.log(`Commits: ${commitPreview.join(' | ')}${commitSuffix}`);
  }
  if (filePreview.length) {
    console.log(`Arquivos: ${filePreview.join(', ')}${fileSuffix}`);
  }
}

function printFrontendDeployNotice(config, changedFiles) {
  const frontendFiles = changedFiles.filter((value) => value.startsWith('frontend/'));
  if (!frontendFiles.length) return;

  const preview = frontendFiles.slice(0, 5).join(', ');
  const suffix = frontendFiles.length > 5 ? ` (+${frontendFiles.length - 5} arquivo(s))` : '';

  console.log([
    '',
    'Aviso operacional: mudancas de frontend foram detectadas e entram no build do servico hbx-frontend na Hostinger.',
    `Frontend publicado em ${config.frontendUrl}.`,
    `Arquivos de frontend detectados neste publish: ${preview}${suffix}`,
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
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f backend/.env ]; then echo "ERRO: backend/.env nao existe na VPS."; exit 1; fi',
    'ENV_DB_LINES="$(awk -F= \'/^[[:space:]]*(DATABASE_URL|DIRECT_URL)[[:space:]]*=/{print $0}\' backend/.env)"',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx-postgres"; then echo "ERRO: backend/.env precisa apontar para hbx-postgres."; exit 1; fi',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx_prod"; then echo "ERRO: backend/.env precisa apontar para o banco hbx_prod."; exit 1; fi',
    'WHATSAPP_MODAL_INTERNAL_URL_VALUE="$(awk -F= \'/^[[:space:]]*WHATSAPP_MODAL_INTERNAL_URL[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'if [ "$WHATSAPP_MODAL_INTERNAL_URL_VALUE" != "http://172.18.0.1:8080" ]; then echo "ERRO: backend/.env precisa manter WHATSAPP_MODAL_INTERNAL_URL=http://172.18.0.1:8080. Atual: $WHATSAPP_MODAL_INTERNAL_URL_VALUE"; exit 1; fi',
    'if docker network inspect hbx_net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx_net; elif docker network inspect hbx-net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx-net; else docker network create hbx_net >/dev/null; export HBX_DOCKER_NETWORK=hbx_net; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'echo "Banco esperado: hbx-postgres/hbx_prod"',
    'echo "Backend URL: $BACKEND_URL"',
    'echo "Frontend URL: $FRONTEND_URL"',
    'echo "Rede Docker: $HBX_DOCKER_NETWORK"',
    'HBX_POSTGRES_SERVICE_ARGS="hbx-postgres"',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker start hbx-postgres >/dev/null; HBX_POSTGRES_SERVICE_ARGS=""; else run_filtered $DC -f docker-compose.hostinger.yml up -d hbx-postgres; fi',
    'docker network connect "$HBX_DOCKER_NETWORK" hbx-postgres 2>/dev/null || true',
    'for i in $(seq 1 60); do if docker exec hbx-postgres sh -lc \'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\' >/dev/null 2>&1; then echo "Postgres pronto."; break; fi; echo "Aguardando Postgres ($i/60)..."; sleep 2; done',
    'if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: container hbx-postgres nao esta running."; exit 1; fi',
    'POSTGRES_DB_VALUE="$(docker exec hbx-postgres sh -lc \'printf "%s" "$POSTGRES_DB"\')"',
    'if [ "$POSTGRES_DB_VALUE" != "hbx_prod" ]; then echo "ERRO: POSTGRES_DB inesperado: $POSTGRES_DB_VALUE"; exit 1; fi',
  ];

  if (isForce) {
    lines.push(
      'docker rm -f backend hbx-backend hbx-frontend webscraping hbx-scraping-engine c7227f19b684_hbx-scraping-engine ab1704a260e6_hbx-frontend e22f61f3f5da_webscraping 2>/dev/null || true',
      'run_filtered $DC -f docker-compose.hostinger.yml build --no-cache backend webscraping hbx-scraping-engine frontend || echo "Aviso: build --no-cache falhou; tentando up -d --build."',
      'run_filtered $DC -f docker-compose.hostinger.yml up -d --build $HBX_POSTGRES_SERVICE_ARGS backend webscraping hbx-scraping-engine frontend',
      'docker restart hbx-backend hbx-frontend webscraping hbx-scraping-engine',
      'docker image prune -f',
      'docker builder prune -f || true',
      'if [ "$FORCE_REBOOT_HOSTINGER" = "true" ]; then echo "FORCE_REBOOT_HOSTINGER=true: reiniciando VPS."; (sudo reboot || reboot); else echo "Reboot da VPS ignorado. Defina FORCE_REBOOT_HOSTINGER=true para habilitar."; fi',
    );
  } else {
    lines.push('docker rm -f backend hbx-backend hbx-frontend webscraping hbx-scraping-engine c7227f19b684_hbx-scraping-engine ab1704a260e6_hbx-frontend e22f61f3f5da_webscraping 2>/dev/null || true');
    lines.push('run_filtered $DC -f docker-compose.hostinger.yml up -d --build $HBX_POSTGRES_SERVICE_ARGS backend webscraping hbx-scraping-engine frontend');
  }

  lines.push(
    'echo "Containers ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-frontend|hbx-backend|webscraping|hbx-scraping-engine|hbx-postgres" || true',
  );

  return lines.join('\n');
}

function resolveWebwhatsDeployConfig(env, hostingerConfig) {
  const repoPath = resolveWebwhatsRepoPath(env);
  const includeWebwhats = shouldUseWebwhats(env, 'WEBWHATS_DEPLOY_ENABLED', repoPath);

  if (!includeWebwhats) {
    console.log(`Webwhats deploy skipped. Repository not found at ${repoPath} or WEBWHATS_DEPLOY_ENABLED=false.`);
    return null;
  }

  if (!isWebwhatsRepoAvailable(repoPath)) {
    throw new Error(`WEBWHATS_DEPLOY_ENABLED is enabled, but no Webwhats git repository was found at: ${repoPath}`);
  }

  const sshHost = String(env.WEBWHATS_SSH_HOST || hostingerConfig.sshHost || '').trim();
  const sshUser = String(env.WEBWHATS_SSH_USER || hostingerConfig.sshUser || '').trim();
  if (!sshHost || !sshUser) {
    throw new Error('Missing Webwhats SSH config. Define WEBWHATS_SSH_HOST/WEBWHATS_SSH_USER or HOSTINGER_SSH_HOST/HOSTINGER_SSH_USER.');
  }

  return {
    repoPath,
    gitRemote: String(env.WEBWHATS_GIT_REMOTE || remote).trim(),
    gitBranch: String(env.WEBWHATS_GIT_BRANCH || branch).trim(),
    sshHost,
    sshUser,
    sshPort: String(env.WEBWHATS_SSH_PORT || '').trim(),
    appDir: String(env.WEBWHATS_APP_DIR || '/opt/Webwhats').trim(),
    runUser: String(env.WEBWHATS_RUN_USER || 'root').trim(),
    serviceName: String(env.WEBWHATS_SYSTEMD_SERVICE || 'webwhats').trim(),
  };
}

function buildSshArgs(config, remoteScript) {
  const sshArgs = [];
  if (config.sshPort) {
    sshArgs.push('-p', config.sshPort);
  }
  sshArgs.push(`${config.sshUser}@${config.sshHost}`, 'bash', '-lc', shellSingleQuote(remoteScript));
  return sshArgs;
}

function buildWebwhatsRemoteDeployScript(config) {
  const lines = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    `RUN_USER=${shellSingleQuote(config.runUser)}`,
    `SERVICE_NAME=${shellSingleQuote(config.serviceName)}`,
    `GIT_REMOTE=${shellSingleQuote(config.gitRemote)}`,
    `GIT_BRANCH=${shellSingleQuote(config.gitBranch)}`,
    'export HUSKY=0',
    'export NPM_CONFIG_AUDIT=false',
    'export NPM_CONFIG_FUND=false',
    'export NPM_CONFIG_LOGLEVEL=error',
    'export NPM_CONFIG_UPDATE_NOTIFIER=false',
    'export PRISMA_HIDE_UPDATE_MESSAGE=true',
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    'if [ ! -f package.json ]; then echo "ERRO: package.json do Webwhats nao encontrado em $APP_DIR."; exit 1; fi',
    'if [ ! -f .env ]; then echo "ERRO: .env do Webwhats nao existe no servidor."; exit 1; fi',
    'run_as_service_user() { if [ -n "$RUN_USER" ] && [ "$RUN_USER" != "root" ] && id "$RUN_USER" >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then sudo -u "$RUN_USER" "$@"; else "$@"; fi; }',
    'run_systemctl() { if command -v sudo >/dev/null 2>&1; then sudo systemctl "$@"; else systemctl "$@"; fi; }',
    'restart_with_pm2() { pm2 restart webwhats --update-env; pm2 save >/dev/null 2>&1 || true; pm2 describe webwhats >/dev/null; echo "Webwhats PM2 ativo: webwhats"; }',
    'find_webwhats_pids() { for pid in $(pgrep -f "node .*dist/main.js|node dist/main.js" || true); do comm="$(cat "/proc/$pid/comm" 2>/dev/null || true)"; cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"; cmd="$(tr "\\0" " " < "/proc/$pid/cmdline" 2>/dev/null || true)"; if [ "$cwd" = "$APP_DIR" ] && { [ "$comm" = "node" ] || [ "$comm" = "sh" ]; } && printf "%s" "$cmd" | grep -q "node dist/main.js"; then echo "$pid"; fi; done; }',
    'restart_without_systemd() { mkdir -p logs; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -n "$old_pids" ]; then echo "Parando Webwhats antigo: $old_pids"; kill $old_pids 2>/dev/null || true; fi; for i in 1 2 3 4 5; do sleep 1; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; [ -z "$old_pids" ] && break; done; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -n "$old_pids" ]; then kill -9 $old_pids 2>/dev/null || true; fi; run_as_service_user sh -lc "cd \\"$APP_DIR\\" && nohup node dist/main.js > logs/webwhats.log 2>&1 &"; sleep 3; new_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -z "$new_pids" ]; then echo "ERRO: Webwhats nao iniciou."; tail -80 logs/webwhats.log 2>/dev/null || true; exit 1; fi; echo "Webwhats process ativo: $new_pids"; }',
    'run_as_service_user git fetch "$GIT_REMOTE" "$GIT_BRANCH"',
    'run_as_service_user git checkout "$GIT_BRANCH"',
    'run_as_service_user git reset --hard "$GIT_REMOTE/$GIT_BRANCH"',
    'run_as_service_user env HUSKY=0 NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_LOGLEVEL=error NPM_CONFIG_UPDATE_NOTIFIER=false npm ci --no-audit --no-fund --loglevel=error',
    'run_as_service_user env NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_LOGLEVEL=error NPM_CONFIG_UPDATE_NOTIFIER=false npm run build -- --silent',
    'run_as_service_user env PRISMA_HIDE_UPDATE_MESSAGE=true node runWithProvider.js "npx prisma generate --schema ./prisma/DATABASE_PROVIDER-schema.prisma --no-hints"',
    'run_as_service_user env PRISMA_HIDE_UPDATE_MESSAGE=true npm run db:deploy',
    'if [ -n "$SERVICE_NAME" ] && systemctl list-unit-files --type=service | grep -q "^$SERVICE_NAME.service"; then run_systemctl restart "$SERVICE_NAME"; run_systemctl is-active --quiet "$SERVICE_NAME"; echo "Webwhats service ativo: $SERVICE_NAME"; elif command -v pm2 >/dev/null 2>&1 && pm2 describe webwhats >/dev/null 2>&1; then restart_with_pm2; else echo "Webwhats sem systemd/PM2 configurado; reiniciando processo node direto."; restart_without_systemd; fi',
  ];

  return lines.join('\n');
}

function printWebwhatsDryRun(config) {
  if (!config) return;

  console.log('[dry-run] Would run: git push ' + `${config.gitRemote} ${config.gitBranch} from ${config.repoPath}`);
  console.log(`[dry-run] Would SSH into Webwhats: ${config.sshUser}@${config.sshHost}`);
  console.log('[dry-run] Would run Webwhats remote deploy: fetch/reset, npm ci, build, db generate/deploy, restart.');
  if (isTruthy(process.env.PUBLISH_VERBOSE_DRY_RUN)) {
    console.log('--- webwhats remote script start ---');
    console.log(buildWebwhatsRemoteDeployScript(config));
    console.log('--- webwhats remote script end ---');
  } else {
    console.log('[dry-run] Set PUBLISH_VERBOSE_DRY_RUN=true to print the full Webwhats remote script.');
  }
}

function validateWebwhatsLocal(config, mode) {
  if (!config) return;

  logStage(`Webwhats Local Preflight (${mode})`);
  console.log(`Webwhats repo: ${config.repoPath}`);
  console.log(`Webwhats branch: ${config.gitBranch}`);
  console.log(`Webwhats remoto: ${config.sshUser}@${config.sshHost}:${config.appDir}`);
  runStep('git', ['rev-parse', '--is-inside-work-tree'], { cwd: config.repoPath });
  ensureGitBranch(config.gitBranch, config.repoPath, 'Webwhats');
  ensureCleanWorkingTree(mode, config.repoPath, 'Webwhats');
  const env = quietToolEnv();
  runStep('npm', ['run', 'typecheck'], { cwd: config.repoPath, env });
  runStep('npm', ['run', 'build', '--', '--silent'], { cwd: config.repoPath, env });
  runStep('npm', ['run', 'lint:check'], { cwd: config.repoPath, env });
}

function pushWebwhats(config) {
  if (!config) return;

  runStep('git', ['push', config.gitRemote, config.gitBranch], {
    cwd: config.repoPath,
    env: quietToolEnv({ HUSKY: '0' }),
  });
}

function deployWebwhats(config) {
  if (!config) return;

  const remoteScript = buildWebwhatsRemoteDeployScript(config);
  runStep('ssh', buildSshArgs(config, remoteScript), {
    label: `ssh ${config.sshUser}@${config.sshHost} Webwhats deploy`,
  });
}

function printDryRun(config, mode) {
  console.log('\n[dry-run] No git push, no SSH execution, no docker-compose down/up on Hostinger.');
  console.log('[dry-run] Would run: git push origin master');
  console.log(`[dry-run] Would SSH into: ${config.sshUser}@${config.sshHost}`);
  console.log('[dry-run] Would run Hostinger remote deploy: fetch/reset, validate env/db/docker, build/up frontend/backend/postgres/scraping services, list containers.');
  if (isTruthy(process.env.PUBLISH_VERBOSE_DRY_RUN)) {
    console.log('--- remote script start ---');
    console.log(buildRemoteDeployScript(config, mode));
    console.log('--- remote script end ---');
  } else {
    console.log('[dry-run] Set PUBLISH_VERBOSE_DRY_RUN=true to print the full Hostinger remote script.');
  }
}

function deployOnHostinger(config, mode) {
  const sshTarget = `${config.sshUser}@${config.sshHost}`;
  const remoteScript = buildRemoteDeployScript(config, mode);
  runStep('ssh', [sshTarget, 'bash', '-lc', shellSingleQuote(remoteScript)], {
    label: `ssh ${sshTarget} Hostinger deploy (${mode})`,
  });
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

  console.log(`\n> GET ${config.frontendUrl}`);
  const frontendResponse = await requestWithRetry(config.frontendUrl, { method: 'GET' });
  console.log(`Frontend OK: HTTP ${frontendResponse.status}`);
}

async function main() {
  const mode = parseMode();
  const env = loadOperationsEnv();
  const config = ensureRequiredEnv(env);
  const webwhatsConfig = resolveWebwhatsDeployConfig(env, config);

  logStage(`Local Preflight (${mode})`);
  console.log('Banco esperado: hbx-postgres/hbx_prod');
  console.log(`Backend URL: ${config.backendUrl}`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureGitBranch(branch);
  ensureCleanWorkingTree(mode);
  const changedFilesAheadOfRemote = listChangedFilesAheadOfRemote();
  const commitsAheadOfRemote = listCommitsAheadOfRemote();
  const toolEnv = quietToolEnv();
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:generate'], { env: toolEnv });
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate'], { env: toolEnv });
  runStep('npm', ['--prefix', 'backend', 'run', 'build'], { env: toolEnv });
  runStep('npm', ['--prefix', 'frontend', 'run', 'build'], { env: toolEnv });
  validateWebwhatsLocal(webwhatsConfig, mode);

  if (mode === 'dry-run') {
    logStage('Dry Run Plan');
    printWebwhatsDryRun(webwhatsConfig);
    printDryRun(config, 'normal');
    return;
  }

  logStage('Git Push');
  runStep('git', ['push', remote, branch]);
  pushWebwhats(webwhatsConfig);

  logStage('Webwhats Deploy');
  deployWebwhats(webwhatsConfig);

  logStage(`Hostinger Deploy (${mode})`);
  deployOnHostinger(config, mode);

  logStage('Production Verify');
  await verifyProduction(config);
  printPublishedChanges(commitsAheadOfRemote, changedFilesAheadOfRemote);
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
