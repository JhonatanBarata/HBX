'use strict';

const path = require('path');
const {
  assertNonLocalHttpUrl,
  formatTimestamp,
  loadEnvFromFiles,
  repoRoot,
  run,
} = require('./lib/runtime');
const {
  isFalsey,
  isTruthy,
  isWebwhatsRepoAvailable,
  resolveWebwhatsRepoPath,
} = require('./lib/webwhats-release');

const remote = 'origin';
const branch = 'master';
const HBX_ENGINE_HARD_LIMIT = 200;
const HBX_DEFAULT_ENGINE_CAPACITY = 20;
const HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT = 1;
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

function formatElapsed(startedAt) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
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
    stdin: options.stdin,
  });
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function parsePositiveInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function parseNonNegativeInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function resolveHbxEngineCapacity(env) {
  const requested = parsePositiveInteger(
    env.HBX_PUBLISH_ENGINE_MAX_COUNT
      || env.HBX_ENGINE_MAX_COUNT
      || env.HBX_ENGINE_COUNT
      || env.HBX_ENGINE_DEFAULT_COUNT,
    HBX_DEFAULT_ENGINE_CAPACITY,
  );
  return Math.min(requested, HBX_ENGINE_HARD_LIMIT);
}

function resolveHbxEngineWarmCount(env, hbxEngineCapacity) {
  const requested = parsePositiveInteger(
    env.HBX_PUBLISH_ENGINE_COUNT
      || env.HBX_PUBLISH_WARM_ENGINE_COUNT
      || env.HBX_ENGINE_WARM_MAX,
    HBX_DEFAULT_PUBLISH_WARM_ENGINE_COUNT,
  );
  return Math.min(requested, hbxEngineCapacity);
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

  const hbxEngineCount = resolveHbxEngineCapacity(env);
  const hbxEngineWarmCount = resolveHbxEngineWarmCount(env, hbxEngineCount);
  const hbxEngineMaxCount = hbxEngineCount;
  const hbxClientReservedEngines = Math.min(
    parseNonNegativeInteger(env.HBX_CLIENT_RESERVED_ENGINES, 2),
    Math.max(0, hbxEngineCount - 1),
  );

  return {
    sshHost: String(env.HOSTINGER_SSH_HOST).trim(),
    sshUser: String(env.HOSTINGER_SSH_USER).trim(),
    appDir: String(env.HOSTINGER_APP_DIR).trim(),
    backendUrl,
    frontendUrl,
    forceReboot: isTruthy(env.FORCE_REBOOT_HOSTINGER),
    hbxEngineCount,
    hbxEngineWarmCount,
    hbxEngineMaxCount,
    hbxClientReservedEngines,
    googleClientId: String(
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      || loadEnvFromFiles([path.join(repoRoot, '.env')]).NEXT_PUBLIC_GOOGLE_CLIENT_ID
      || '',
    ).trim(),
    androidApkUrl: String(
      env.NEXT_PUBLIC_ANDROID_APK_URL
      || `${frontendUrl}/download/android`,
    ).trim(),
    webwhatsAppDir: String(env.WEBWHATS_APP_DIR || `${env.HOSTINGER_APP_DIR}/Webwhats`).trim(),
    webwhatsSystemdService: String(env.WEBWHATS_SYSTEMD_SERVICE || 'webwhats').trim(),
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

  throw new Error(`Commit automatico nao deixou a arvore ${label} limpa. Push/deploy abortado.`);
}

function getHead(cwd = repoRoot) {
  const result = runStep('git', ['rev-parse', 'HEAD'], { cwd, captureOutput: true });
  return String(result.stdout || '').trim();
}

function getLatestCommitLine(cwd = repoRoot) {
  const result = runStep('git', ['log', '-1', '--oneline'], { cwd, captureOutput: true });
  return String(result.stdout || '').trim();
}

function autoCommitLocalChanges(mode, label = 'publish') {
  if (mode === 'dry-run') {
    console.log('[dry-run] Commit automatico pulado; dry-run nao faz push.');
    return { created: false, commitLine: '' };
  }

  const headBefore = getHead();
  const message = `chore: ${label} ${formatTimestamp()}`;
  runStep('node', ['./scripts/commit.js', '--message', message], {
    env: quietToolEnv({ HUSKY: '0' }),
  });
  const headAfter = getHead();
  const created = headBefore !== headAfter;
  const commitLine = created ? getLatestCommitLine() : '';
  console.log(created ? `Commit criado antes do push: ${commitLine}` : 'Nenhuma mudanca local para commitar antes do push.');
  return { created, commitLine };
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
    'Aviso operacional: mudancas de frontend foram detectadas e entram no build Docker hbx-frontend na Hostinger.',
    `Frontend publicado em ${config.frontendUrl}.`,
    `Arquivos de frontend detectados neste publish: ${preview}${suffix}`,
  ].join('\n'));
}

function buildRemoteDeployScript(config, mode) {
  const isForce = mode === 'force';
  const rebootValue = isForce && config.forceReboot ? 'true' : 'false';
  const backendVerifyAttempts = isForce ? '60' : '30';

  const lines = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(config.appDir)}`,
    `BACKEND_URL=${shellSingleQuote(config.backendUrl)}`,
    `FRONTEND_URL=${shellSingleQuote(config.frontendUrl)}`,
    `BUILD_NO_CACHE_ARG=${shellSingleQuote(isForce ? '--no-cache' : '')}`,
    `FORCE_REBOOT_HOSTINGER=${shellSingleQuote(rebootValue)}`,
    `BACKEND_VERIFY_ATTEMPTS=${shellSingleQuote(backendVerifyAttempts)}`,
    `REQUESTED_HBX_ENGINE_COUNT=${shellSingleQuote(config.hbxEngineCount)}`,
    `REQUESTED_HBX_ENGINE_WARM_COUNT=${shellSingleQuote(config.hbxEngineWarmCount)}`,
    `REQUESTED_HBX_ENGINE_MAX_COUNT=${shellSingleQuote(config.hbxEngineMaxCount)}`,
    `REQUESTED_HBX_CLIENT_RESERVED_ENGINES=${shellSingleQuote(config.hbxClientReservedEngines)}`,
    `REQUESTED_NEXT_PUBLIC_GOOGLE_CLIENT_ID=${shellSingleQuote(config.googleClientId)}`,
    `REQUESTED_NEXT_PUBLIC_ANDROID_APK_URL=${shellSingleQuote(config.androidApkUrl)}`,
    `HBX_ENGINE_HARD_LIMIT=${shellSingleQuote(HBX_ENGINE_HARD_LIMIT)}`,
    `WEBWHATS_APP_DIR=${shellSingleQuote(config.webwhatsAppDir)}`,
    `WEBWHATS_SYSTEMD_SERVICE=${shellSingleQuote(config.webwhatsSystemdService)}`,
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f backend/.env ]; then echo "ERRO: backend/.env nao existe na VPS."; exit 1; fi',
    'ENV_DB_LINES="$(awk -F= \'/^[[:space:]]*(DATABASE_URL|DIRECT_URL)[[:space:]]*=/{print $0}\' backend/.env)"',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx-postgres"; then echo "ERRO: backend/.env precisa apontar para hbx-postgres."; exit 1; fi',
    'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx_prod"; then echo "ERRO: backend/.env precisa apontar para o banco hbx_prod."; exit 1; fi',
    'BACKEND_NODE_ENV_VALUE="$(awk -F= \'/^[[:space:]]*NODE_ENV[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'BACKEND_PAYMENTS_PROVIDER_VALUE="$(awk -F= \'/^[[:space:]]*PAYMENTS_PROVIDER[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'if [ "$BACKEND_NODE_ENV_VALUE" != "production" ]; then echo "ERRO: backend/.env da VPS deve usar NODE_ENV=production. Atual: $BACKEND_NODE_ENV_VALUE"; exit 1; fi',
    'if [ "$BACKEND_PAYMENTS_PROVIDER_VALUE" = "mock" ]; then echo "ERRO: PAYMENTS_PROVIDER=mock e exclusivo do localhost e nao pode subir na VPS."; exit 1; fi',
    'WHATSAPP_MODAL_INTERNAL_URL_VALUE="$(awk -F= \'/^[[:space:]]*WHATSAPP_MODAL_INTERNAL_URL[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'if [ "$WHATSAPP_MODAL_INTERNAL_URL_VALUE" != "http://172.18.0.1:8080" ]; then echo "ERRO: backend/.env precisa manter WHATSAPP_MODAL_INTERNAL_URL=http://172.18.0.1:8080. Atual: $WHATSAPP_MODAL_INTERNAL_URL_VALUE"; exit 1; fi',
    'if [ ! -f .env ]; then echo "ERRO: .env raiz nao existe na VPS."; exit 1; fi',
    'upsert_root_env() { key="$1"; value="$2"; tmp="$(mktemp)"; awk -v key="$key" -v value="$value" \'BEGIN{done=0} $0 ~ "^" key "=" { print key "=" value; done=1; next } { print } END{ if (!done) print key "=" value }\' .env > "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; }',
    'remove_root_env() { key="$1"; tmp="$(mktemp)"; awk -v key="$key" \'$0 !~ "^" key "=" { print }\' .env > "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; }',
    'upsert_backend_env() { key="$1"; value="$2"; tmp="$(mktemp)"; awk -v key="$key" -v value="$value" \'BEGIN{done=0} $0 ~ "^" key "=" { print key "=" value; done=1; next } { print } END{ if (!done) print key "=" value }\' backend/.env > "$tmp"; cat "$tmp" > backend/.env; rm -f "$tmp"; }',
    'remove_root_env_prefix() { prefix="$1"; tmp="$(mktemp)"; awk -v prefix="$prefix" \'index($0, prefix) != 1 { print }\' .env > "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; }',
    'remove_backend_env_prefix() { prefix="$1"; tmp="$(mktemp)"; awk -v prefix="$prefix" \'index($0, prefix) != 1 { print }\' backend/.env > "$tmp"; cat "$tmp" > backend/.env; rm -f "$tmp"; }',
    'upsert_root_env HBX_ENGINE_COUNT "$REQUESTED_HBX_ENGINE_COUNT"',
    'upsert_root_env HBX_ENGINE_MAX_COUNT "$REQUESTED_HBX_ENGINE_MAX_COUNT"',
    'upsert_root_env HBX_ENGINE_WARM_MIN "${HBX_ENGINE_WARM_MIN:-1}"',
    'upsert_root_env HBX_ENGINE_WARM_MAX "$REQUESTED_HBX_ENGINE_WARM_COUNT"',
    'upsert_root_env HBX_CLIENT_RESERVED_ENGINES "$REQUESTED_HBX_CLIENT_RESERVED_ENGINES"',
    'upsert_root_env HBX_ENGINE_GOVERNOR_ENABLED "${HBX_ENGINE_GOVERNOR_ENABLED:-true}"',
    'remove_root_env_prefix HBX_FACTORY_',
    'remove_backend_env_prefix HBX_FACTORY_',
    'upsert_root_env HBX_ENGINE_DOCKER_CLI_PATH "${HBX_ENGINE_DOCKER_CLI_PATH:-/usr/bin/docker}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_START_HOUR "${HBX_RADAR_CLIENT_PRIORITY_START_HOUR:-8}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_END_HOUR "${HBX_RADAR_CLIENT_PRIORITY_END_HOUR:-20}"',
    'upsert_root_env HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS "${HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS:-25000}"',
    'upsert_root_env HBX_RADAR_CLIENT_FALLBACK_TO_POOL "${HBX_RADAR_CLIENT_FALLBACK_TO_POOL:-true}"',
    'if [ -n "$REQUESTED_NEXT_PUBLIC_GOOGLE_CLIENT_ID" ]; then upsert_root_env NEXT_PUBLIC_GOOGLE_CLIENT_ID "$REQUESTED_NEXT_PUBLIC_GOOGLE_CLIENT_ID"; fi',
    'upsert_root_env NEXT_PUBLIC_ANDROID_APK_URL "$REQUESTED_NEXT_PUBLIC_ANDROID_APK_URL"',
    'export POSTGRES_USER="$(awk -F= \'/^POSTGRES_USER=/{print substr($0, length("POSTGRES_USER")+2); exit}\' .env)"',
    'export POSTGRES_PASSWORD="$(awk -F= \'/^POSTGRES_PASSWORD=/{print substr($0, length("POSTGRES_PASSWORD")+2); exit}\' .env)"',
    'export POSTGRES_DB="$(awk -F= \'/^POSTGRES_DB=/{print substr($0, length("POSTGRES_DB")+2); exit}\' .env)"',
    'export POSTGRES_DATA_VOLUME="$(awk -F= \'/^POSTGRES_DATA_VOLUME=/{print substr($0, length("POSTGRES_DATA_VOLUME")+2); exit}\' .env)"',
    'export NEXT_PUBLIC_API_URL="$(awk -F= \'/^NEXT_PUBLIC_API_URL=/{print substr($0, length("NEXT_PUBLIC_API_URL")+2); exit}\' .env)"',
    'export NEXT_PUBLIC_GOOGLE_CLIENT_ID="$(awk -F= \'/^NEXT_PUBLIC_GOOGLE_CLIENT_ID=/{print substr($0, length("NEXT_PUBLIC_GOOGLE_CLIENT_ID")+2); exit}\' .env)"',
    'export NEXT_PUBLIC_ANDROID_APK_URL="$(awk -F= \'/^NEXT_PUBLIC_ANDROID_APK_URL=/{print substr($0, length("NEXT_PUBLIC_ANDROID_APK_URL")+2); exit}\' .env)"',
    'if [ -n "$NEXT_PUBLIC_GOOGLE_CLIENT_ID" ]; then upsert_backend_env GOOGLE_CLIENT_ID "$NEXT_PUBLIC_GOOGLE_CLIENT_ID"; fi',
    'upsert_backend_env HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED true',
    'upsert_backend_env HBX_RADAR_WEB_ENRICHMENT_ENABLED true',
    'upsert_backend_env HBX_RADAR_WEB_ENRICHMENT_WEBSITE_CRAWL_ENABLED true',
    'upsert_backend_env HBX_RADAR_CNPJ_DISCOVERY_ENABLED true',
    'upsert_backend_env HBX_RADAR_WHATSAPP_CHECK_MODE enrich',
    'upsert_backend_env HBX_RADAR_AI_SANEAMENTO_ENABLED false',
    'if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_DATA_VOLUME" ] || [ -z "$NEXT_PUBLIC_API_URL" ]; then echo "ERRO: .env raiz sem variaveis obrigatorias do docker-compose."; exit 1; fi',
    'export HBX_ENGINE_COUNT="$(awk -F= \'/^HBX_ENGINE_COUNT=/{print substr($0, length("HBX_ENGINE_COUNT")+2); exit}\' .env)"',
    'export HBX_ENGINE_MAX_COUNT="$(awk -F= \'/^HBX_ENGINE_MAX_COUNT=/{print substr($0, length("HBX_ENGINE_MAX_COUNT")+2); exit}\' .env)"',
    'if [ -z "$HBX_ENGINE_MAX_COUNT" ]; then export HBX_ENGINE_MAX_COUNT="$HBX_ENGINE_HARD_LIMIT"; fi',
    'case "$HBX_ENGINE_MAX_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_MAX_COUNT invalido no .env; usando $HBX_ENGINE_HARD_LIMIT."; export HBX_ENGINE_MAX_COUNT="$HBX_ENGINE_HARD_LIMIT";; esac',
    'if [ "$HBX_ENGINE_MAX_COUNT" -gt "$HBX_ENGINE_HARD_LIMIT" ]; then echo "Aviso: HBX_ENGINE_MAX_COUNT=$HBX_ENGINE_MAX_COUNT acima do hard limit; usando $HBX_ENGINE_HARD_LIMIT."; export HBX_ENGINE_MAX_COUNT="$HBX_ENGINE_HARD_LIMIT"; fi',
    'if [ -z "$HBX_ENGINE_COUNT" ]; then export HBX_ENGINE_COUNT="$REQUESTED_HBX_ENGINE_COUNT"; fi',
    'case "$HBX_ENGINE_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_COUNT invalido no .env; usando $REQUESTED_HBX_ENGINE_COUNT."; export HBX_ENGINE_COUNT="$REQUESTED_HBX_ENGINE_COUNT";; esac',
    'if [ "$HBX_ENGINE_COUNT" -lt 1 ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT abaixo do minimo; usando 1."; export HBX_ENGINE_COUNT=1; fi',
    'if [ "$HBX_ENGINE_COUNT" -gt "$HBX_ENGINE_HARD_LIMIT" ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT acima do hard limit; usando $HBX_ENGINE_HARD_LIMIT."; export HBX_ENGINE_COUNT="$HBX_ENGINE_HARD_LIMIT"; fi',
    'if [ "$HBX_ENGINE_COUNT" -gt "$HBX_ENGINE_MAX_COUNT" ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT acima do limite; usando $HBX_ENGINE_MAX_COUNT."; export HBX_ENGINE_COUNT="$HBX_ENGINE_MAX_COUNT"; fi',
    'export HBX_ENGINE_WARM_MAX="$(awk -F= \'/^HBX_ENGINE_WARM_MAX=/{print substr($0, length("HBX_ENGINE_WARM_MAX")+2); exit}\' .env)"',
    'export HBX_ENGINE_WARM_MIN="$(awk -F= \'/^HBX_ENGINE_WARM_MIN=/{print substr($0, length("HBX_ENGINE_WARM_MIN")+2); exit}\' .env)"',
    'if [ -z "$HBX_ENGINE_WARM_MAX" ]; then export HBX_ENGINE_WARM_MAX="$REQUESTED_HBX_ENGINE_WARM_COUNT"; fi',
    'if [ -z "$HBX_ENGINE_WARM_MIN" ]; then export HBX_ENGINE_WARM_MIN=1; fi',
    'case "$HBX_ENGINE_WARM_MAX" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_WARM_MAX invalido no .env; usando $REQUESTED_HBX_ENGINE_WARM_COUNT."; export HBX_ENGINE_WARM_MAX="$REQUESTED_HBX_ENGINE_WARM_COUNT";; esac',
    'case "$HBX_ENGINE_WARM_MIN" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_WARM_MIN invalido no .env; usando 1."; export HBX_ENGINE_WARM_MIN=1;; esac',
    'if [ "$HBX_ENGINE_WARM_MIN" -lt 1 ]; then export HBX_ENGINE_WARM_MIN=1; fi',
    'if [ "$HBX_ENGINE_WARM_MAX" -lt 1 ]; then export HBX_ENGINE_WARM_MAX=1; fi',
    'if [ "$HBX_ENGINE_WARM_MIN" -gt "$HBX_ENGINE_COUNT" ]; then export HBX_ENGINE_WARM_MIN="$HBX_ENGINE_COUNT"; fi',
    'if [ "$HBX_ENGINE_WARM_MAX" -gt "$HBX_ENGINE_COUNT" ]; then export HBX_ENGINE_WARM_MAX="$HBX_ENGINE_COUNT"; fi',
    'if [ "$HBX_ENGINE_WARM_MAX" -lt "$HBX_ENGINE_WARM_MIN" ]; then export HBX_ENGINE_WARM_MAX="$HBX_ENGINE_WARM_MIN"; fi',
    'export HBX_CLIENT_RESERVED_ENGINES="$(awk -F= \'/^HBX_CLIENT_RESERVED_ENGINES=/{print substr($0, length("HBX_CLIENT_RESERVED_ENGINES")+2); exit}\' .env)"',
    'if [ -z "$HBX_CLIENT_RESERVED_ENGINES" ]; then export HBX_CLIENT_RESERVED_ENGINES="$REQUESTED_HBX_CLIENT_RESERVED_ENGINES"; fi',
    'case "$HBX_CLIENT_RESERVED_ENGINES" in *[!0-9]*|"") echo "Aviso: HBX_CLIENT_RESERVED_ENGINES invalido no .env; usando $REQUESTED_HBX_CLIENT_RESERVED_ENGINES."; export HBX_CLIENT_RESERVED_ENGINES="$REQUESTED_HBX_CLIENT_RESERVED_ENGINES";; esac',
    'if [ "$HBX_CLIENT_RESERVED_ENGINES" -ge "$HBX_ENGINE_COUNT" ]; then export HBX_CLIENT_RESERVED_ENGINES=$((HBX_ENGINE_COUNT - 1)); fi',
    'if [ "$HBX_CLIENT_RESERVED_ENGINES" -lt 0 ]; then export HBX_CLIENT_RESERVED_ENGINES=0; fi',
    'export HBX_ENGINE_GOVERNOR_ENABLED="$(awk -F= \'/^HBX_ENGINE_GOVERNOR_ENABLED=/{print substr($0, length("HBX_ENGINE_GOVERNOR_ENABLED")+2); exit}\' .env)"',
    'export HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS="$(awk -F= \'/^HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS=/{print substr($0, length("HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS")+2); exit}\' .env)"',
    'export HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS="$(awk -F= \'/^HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS=/{print substr($0, length("HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS")+2); exit}\' .env)"',
    'export HBX_ENGINE_DRAIN_TIMEOUT_SECONDS="$(awk -F= \'/^HBX_ENGINE_DRAIN_TIMEOUT_SECONDS=/{print substr($0, length("HBX_ENGINE_DRAIN_TIMEOUT_SECONDS")+2); exit}\' .env)"',
    'export HBX_ENGINE_DOCKER_CLI_PATH="$(awk -F= \'/^HBX_ENGINE_DOCKER_CLI_PATH=/{print substr($0, length("HBX_ENGINE_DOCKER_CLI_PATH")+2); exit}\' .env)"',
    'if [ -z "$HBX_ENGINE_DOCKER_CLI_PATH" ]; then export HBX_ENGINE_DOCKER_CLI_PATH=/usr/bin/docker; fi',
    'export HBX_HOST_DOCKER_CLI_PATH="$(command -v docker || true)"',
    'if [ -z "$HBX_HOST_DOCKER_CLI_PATH" ]; then echo "ERRO: docker CLI host nao encontrado para montar no hbx-backend."; exit 1; fi',
    'if [ ! -S /var/run/docker.sock ]; then echo "ERRO: /var/run/docker.sock nao encontrado; governor nao conseguira controlar motores."; exit 1; fi',
    'if docker network inspect hbx_net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx_net; elif docker network inspect hbx-net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx-net; else docker network create hbx_net >/dev/null; export HBX_DOCKER_NETWORK=hbx_net; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'hbx_engine_names() { for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf " hbx-engine-%s" "$n"; done; }',
    'hbx_engine_urls() { sep=""; for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf "%shttp://hbx-engine-%s:8001" "$sep" "$n"; sep=","; done; }',
    'hbx_extra_engine_names() { docker ps -a --format "{{.Names}}" | awk -v keep="$HBX_ENGINE_COUNT" \'/^hbx-engine-[0-9]+$/ { split($0, p, "-"); if ((p[3] + 0) > keep) print $0 }\' | sort -V; }',
    'predeploy_runtime_checks() {',
    '  echo "Preflight runtime HBX..."',
    '  docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-backend|hbx-postgres" || true',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: hbx-postgres nao esta running antes do deploy."; exit 1; fi',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "Aviso: hbx-backend nao esta running antes do deploy; seguindo em modo recuperacao para reconstruir a API."; return 0; fi',
    '  echo "Preflight rapido: containers essenciais running; sem chamada HTTP."',
    '}',
    'final_runtime_summary() {',
    '  echo "Verificacao HTTP final desativada neste fluxo."',
    '}',
    'echo "Banco esperado: hbx-postgres/hbx_prod"',
    'echo "Backend URL: $BACKEND_URL"',
    'echo "Frontend URL: $FRONTEND_URL"',
    'echo "Rede Docker: $HBX_DOCKER_NETWORK"',
    'echo "Motores HBX dedicados: capacidade=$HBX_ENGINE_COUNT warm=$HBX_ENGINE_WARM_MAX"',
    'if command -v python3 >/dev/null 2>&1 && [ -d /etc/nginx/sites-available ]; then',
    'python3 - <<\'PY\'',
    'from datetime import datetime',
    'from pathlib import Path',
    'paths = [Path("/etc/nginx/sites-available/hbx-api"), Path("/etc/nginx/sites-available/hbx-frontend")]',
    'limit_line = "    client_max_body_size 80m;"',
    'stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")',
    'for path in paths:',
    '    if not path.exists():',
    '        print(f"Aviso: {path} nao encontrado; pulando limite de upload Nginx.")',
    '        continue',
    '    text = path.read_text()',
    '    lines = text.splitlines()',
    '    out = []',
    '    in_first_server = False',
    '    changed = False',
    '    limit_written = False',
    '    depth = 0',
    '    for line in lines:',
    '        stripped = line.strip()',
    '        if stripped.startswith("server {") and not changed and not in_first_server:',
    '            in_first_server = True',
    '            depth = 1',
    '            out.append(line)',
    '            continue',
    '        if in_first_server:',
    '            depth += line.count("{") - line.count("}")',
    '            if stripped.startswith("client_max_body_size"):',
    '                if not limit_written:',
    '                    out.append(limit_line)',
    '                    limit_written = True',
    '                changed = True',
    '                continue',
    '            out.append(line)',
    '            if stripped.startswith("server_name") and not limit_written:',
    '                out.append(limit_line)',
    '                limit_written = True',
    '                changed = True',
    '            if depth <= 0:',
    '                in_first_server = False',
    '            continue',
    '        out.append(line)',
    '    next_text = "\\n".join(out).rstrip() + "\\n"',
    '    if next_text != text:',
    '        path.with_name(f"{path.name}.bak-{stamp}").write_text(text)',
    '        path.write_text(next_text)',
    '        print(f"Nginx upload limit aplicado em {path}.")',
    '    else:',
    '        print(f"Nginx upload limit ja estava correto em {path}.")',
    'PY',
    'if command -v nginx >/dev/null 2>&1; then nginx -t; if command -v systemctl >/dev/null 2>&1; then systemctl reload nginx; else service nginx reload; fi; fi',
    'else echo "Aviso: python3 ou /etc/nginx/sites-available indisponivel; limite de upload Nginx nao foi ajustado automaticamente."; fi',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker start hbx-postgres >/dev/null; else run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d hbx-postgres; fi',
    'docker network connect "$HBX_DOCKER_NETWORK" hbx-postgres 2>/dev/null || true',
    'for i in $(seq 1 60); do if docker exec hbx-postgres sh -lc \'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\' >/dev/null 2>&1; then echo "Postgres pronto."; break; fi; echo "Aguardando Postgres ($i/60)..."; sleep 2; done',
    'if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: container hbx-postgres nao esta running."; exit 1; fi',
    'POSTGRES_DB_VALUE="$(docker exec hbx-postgres sh -lc \'printf "%s" "$POSTGRES_DB"\')"',
    'if [ "$POSTGRES_DB_VALUE" != "hbx_prod" ]; then echo "ERRO: POSTGRES_DB inesperado: $POSTGRES_DB_VALUE"; exit 1; fi',
    isForce
      ? 'echo "Force mode: pulando checagem predeploy do hbx-backend existente; backend sera reconstruido neste deploy."'
      : 'predeploy_runtime_checks',
    'ensure_frontend_compose_file() {',
    '  cat > docker-compose.frontend.yml <<\'YAML\'',
    'services:',
    '  frontend:',
    '    container_name: hbx-frontend',
    '    build:',
    '      context: ./frontend',
    '      dockerfile: Dockerfile',
    '      args:',
    '        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}',
    '        NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}',
    '        NEXT_PUBLIC_ANDROID_APK_URL: ${NEXT_PUBLIC_ANDROID_APK_URL:-}',
    '        NEXT_PUBLIC_PAYMENTS_PROVIDER: ${NEXT_PUBLIC_PAYMENTS_PROVIDER:-mercadopago}',
    '        NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: ${NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:-}',
    '    restart: unless-stopped',
    '    environment:',
    '      NODE_ENV: production',
    '      NEXT_TELEMETRY_DISABLED: "1"',
    '      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}',
    '      NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}',
    '      NEXT_PUBLIC_ANDROID_APK_URL: ${NEXT_PUBLIC_ANDROID_APK_URL:-}',
    '      NEXT_PUBLIC_PAYMENTS_PROVIDER: ${NEXT_PUBLIC_PAYMENTS_PROVIDER:-mercadopago}',
    '      NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: ${NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:-}',
    '    ports:',
    '      - "127.0.0.1:3001:3001"',
    '    networks:',
    '      - hbx_net',
    'networks:',
    '  hbx_net:',
    '    name: ${HBX_DOCKER_NETWORK:-hbx_net}',
    '    external: true',
    'YAML',
    '}',
    'free_frontend_port() {',
    '  if command -v fuser >/dev/null 2>&1; then fuser -k 3001/tcp 2>/dev/null || true; fi',
    '}',
    'remove_containers() {',
    '  if [ "$#" -eq 0 ]; then return 0; fi',
    '  echo "Removendo containers antigos: $*"',
    '  docker rm -f "$@" 2>/dev/null || true',
    '}',
    'remove_compose_service_containers() {',
    '  for service in "$@"; do',
    '    ids="$(docker ps -aq --filter "label=com.docker.compose.service=$service" | xargs || true)"',
    '    if [ -n "$ids" ]; then echo "Removendo containers compose antigos de $service: $ids"; docker rm -f $ids 2>/dev/null || true; fi',
    '  done',
    '}',
    'remove_extra_hbx_engines() {',
    '  names="$(hbx_extra_engine_names | xargs || true)"',
    '  if [ -z "$names" ]; then echo "Sem motores HBX excedentes acima de $HBX_ENGINE_COUNT."; return 0; fi',
    '  echo "Removendo motores HBX excedentes acima de $HBX_ENGINE_COUNT: $names"',
    '  remove_containers $names',
    '}',
    'deploy_frontend_docker() {',
    '  echo "Publicando frontend em Docker como hbx-frontend..."',
    '  ensure_frontend_compose_file',
    '  run_filtered $DC --env-file .env -f docker-compose.frontend.yml build $BUILD_NO_CACHE_ARG frontend',
    '  docker rm -f hbx-frontend frontend 2>/dev/null || true',
    // Limpa tambem containers frontend renomeados com hash pelo compose v2 num recreate
    // anterior falho (ex: 6708d8b5b9e2_hbx-frontend) — senao o proximo up da name conflict.
    '  docker ps -aq --filter "name=hbx-frontend" | xargs -r docker rm -f 2>/dev/null || true',
    '  free_frontend_port',
    '  run_filtered $DC --env-file .env -f docker-compose.frontend.yml up -d frontend',
    '  echo "Frontend Docker iniciado; verificacao HTTP pulada no publish normal."',
    '}',
    'start_hbx_engines() {',
    '  echo "Buildando imagem dos motores HBX..."',
    '  run_filtered docker build $BUILD_NO_CACHE_ARG -t hbx_hbx-scraping-engine:latest ./hbx-scraping-engine',
    '  mkdir -p "$APP_DIR/hbx-scraping-engine/data"',
    '  for n in $(seq 1 "$HBX_ENGINE_COUNT"); do mkdir -p "$APP_DIR/hbx-scraping-engine/data-$n"; done',
    '  remove_compose_service_containers hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names)',
    '  remove_containers hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names)',
    '  remove_extra_hbx_engines',
    '  echo "Subindo hbx-scraping-engine fallback..."',
    '  docker run -d --name hbx-scraping-engine --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '    -e HBX_SCRAPING_TIMEOUT_SECONDS=20 \\',
    '    -e HBX_SCRAPING_CONCURRENCY=3 \\',
    '    -e HBX_SCRAPING_CACHE_TTL_HOURS=24 \\',
    '    -e HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120 \\',
    '    -e HBX_AGENDA_MAX_PAGES=20 \\',
    '    -e HBX_AGENDA_REQUEST_DELAY_MS=700 \\',
    '    -v "$APP_DIR/hbx-scraping-engine/data:/app/data" \\',
    '    hbx_hbx-scraping-engine:latest',
    '  echo "Preparando motores HBX: hbx-engine-1..hbx-engine-${HBX_ENGINE_COUNT}"',
    '  echo "Capacidade declarada: ${HBX_ENGINE_COUNT}; warm inicial: ${HBX_ENGINE_WARM_MAX}"',
    '  for n in $(seq 1 "$HBX_ENGINE_COUNT"); do',
    '    if [ "$n" -le "$HBX_ENGINE_WARM_MAX" ]; then mode=run; docker_cmd=run; detach_arg=-d; else mode=create; docker_cmd=create; detach_arg=; fi',
    '    docker $docker_cmd $detach_arg --name "hbx-engine-$n" --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '      -e HBX_SCRAPING_TIMEOUT_SECONDS=20 \\',
    '      -e HBX_SCRAPING_CONCURRENCY=3 \\',
    '      -e HBX_SCRAPING_CACHE_TTL_HOURS=24 \\',
    '      -e HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120 \\',
    '      -e HBX_AGENDA_MAX_PAGES=20 \\',
    '      -e HBX_AGENDA_REQUEST_DELAY_MS=700 \\',
    '      -v "$APP_DIR/hbx-scraping-engine/data-$n:/app/data" \\',
    '      hbx_hbx-scraping-engine:latest >/dev/null',
    '    if [ "$n" -eq "$HBX_ENGINE_COUNT" ] || { [ "$HBX_ENGINE_COUNT" -gt 10 ] && [ $((n % 20)) -eq 0 ]; }; then echo "Progresso motores HBX: $n/$HBX_ENGINE_COUNT"; fi',
    '  done',
    '  created_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  running_count="$(docker ps --filter "name=^/hbx-engine-[0-9]+$" --filter "status=running" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  unhealthy_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d " " || true)"',
    '  exited_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --filter "status=exited" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  offline_count=$((unhealthy_count + exited_count))',
    '  echo "Resumo motores HBX: capacidade=$HBX_ENGINE_COUNT criados=$created_count running=$running_count warm=$HBX_ENGINE_WARM_MAX unhealthy/offline=$offline_count"',
    '}',
    'start_hbx_backend() {',
    '  echo "Buildando imagem backend..."',
    '  run_filtered docker build $BUILD_NO_CACHE_ARG -t hbx_backend:latest ./backend',
    '  remove_compose_service_containers backend',
    '  remove_containers backend hbx-backend',
    '  echo "Subindo hbx-backend..."',
    '  docker run -d --name hbx-backend --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '    --env-file "$APP_DIR/backend/.env" \\',
    '    -e HBX_SCRAPING_ENGINE_URL=http://hbx-scraping-engine:8001 \\',
    '    -e HBX_ENGINE_COUNT="$HBX_ENGINE_COUNT" \\',
    '    -e HBX_ENGINE_MAX_COUNT="$HBX_ENGINE_MAX_COUNT" \\',
    '    -e HBX_ENGINE_URLS="$(hbx_engine_urls)" \\',
    '    -e HBX_CLIENT_RESERVED_ENGINES="${HBX_CLIENT_RESERVED_ENGINES:-$REQUESTED_HBX_CLIENT_RESERVED_ENGINES}" \\',
    '    -e HBX_ENGINE_WARM_MIN="${HBX_ENGINE_WARM_MIN:-1}" \\',
    '    -e HBX_ENGINE_WARM_MAX="${HBX_ENGINE_WARM_MAX:-$REQUESTED_HBX_ENGINE_WARM_COUNT}" \\',
    '    -e HBX_ENGINE_GOVERNOR_ENABLED="${HBX_ENGINE_GOVERNOR_ENABLED:-true}" \\',
    '    -e HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS="${HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS:-30}" \\',
    '    -e HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS="${HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS:-120}" \\',
    '    -e HBX_ENGINE_DRAIN_TIMEOUT_SECONDS="${HBX_ENGINE_DRAIN_TIMEOUT_SECONDS:-90}" \\',
    '    -e HBX_ENGINE_DOCKER_CLI_PATH="${HBX_ENGINE_DOCKER_CLI_PATH:-/usr/bin/docker}" \\',
    '    -e HBX_RADAR_CLIENT_PRIORITY_START_HOUR="${HBX_RADAR_CLIENT_PRIORITY_START_HOUR:-8}" \\',
    '    -e HBX_RADAR_CLIENT_PRIORITY_END_HOUR="${HBX_RADAR_CLIENT_PRIORITY_END_HOUR:-20}" \\',
    '    -e HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS="${HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS:-25000}" \\',
    '    -e HBX_RADAR_CLIENT_FALLBACK_TO_POOL="${HBX_RADAR_CLIENT_FALLBACK_TO_POOL:-true}" \\',
    '    -e HBX_CAPACITY_ENGINE_2_QUEUE_THRESHOLD=3 \\',
    '    -e HBX_CAPACITY_ENGINE_3_QUEUE_THRESHOLD=10 \\',
    '    -e HBX_CAPACITY_ENGINE_4_QUEUE_THRESHOLD=20 \\',
    '    -e HBX_GOOGLE_EMERGENCY_QUEUE_THRESHOLD=50 \\',
    '    -e HBX_GOOGLE_EMERGENCY_DAILY_LIMIT=500 \\',
    '    -e HBX_GOOGLE_EMERGENCY_MAX_PER_RUN=20 \\',
    '    -e HBX_QUEUE_STUCK_MINUTES=10 \\',
    '    -e HBX_ENGINE_MAX_BUSY_MINUTES=15 \\',
    // Bind SÓ em loopback: nginx faz proxy p/ 127.0.0.1:3000 e webwhats/front entram pelo domínio
    // HTTPS — expor 0.0.0.0 deixava a API inteira atingível em VPS_IP:3000 fora do TLS/rate-limit
    // (docker -p fura ufw via NAT; o bind local é o freio real).
    '    -p 127.0.0.1:3000:3000 \\',
    '    -v "$HBX_HOST_DOCKER_CLI_PATH:/usr/bin/docker:ro" \\',
    '    -v /var/run/docker.sock:/var/run/docker.sock \\',
    '    -v "$APP_DIR/backend/public/uploads:/app/public/uploads" \\',
    // P1.3: mídia do inbox mora em storage privado (fora do public) — sem este volume o dir é efêmero
    // e anexos novos somem no próximo recreate do container.
    '    -v "$APP_DIR/backend/storage:/app/storage" \\',
    '    hbx_backend:latest',
    '}',
    'verify_backend_api() {',
    '  echo "Validando container backend sem chamada HTTP..."',
    '  for i in $(seq 1 "$BACKEND_VERIFY_ATTEMPTS"); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "Backend container running."; break; fi',
    '    echo "Aguardando backend/API ($i/$BACKEND_VERIFY_ATTEMPTS)..."',
    '    sleep 2',
    '  done',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "ERRO: hbx-backend caiu durante o deploy."; docker logs --tail 120 hbx-backend 2>&1 || true; exit 1; fi',
    '  if docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" hbx-backend | grep -q "^HBX_FACTORY_"; then echo "ERRO: Night Factory detectada no ambiente do backend/VPS."; exit 1; fi',
    '  for flag in HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED HBX_RADAR_WEB_ENRICHMENT_ENABLED HBX_RADAR_WEB_ENRICHMENT_WEBSITE_CRAWL_ENABLED HBX_RADAR_CNPJ_DISCOVERY_ENABLED; do value="$(docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" hbx-backend | awk -F= -v key="$flag" \'$1 == key { print $2; exit }\')"; if [ "$value" != "true" ]; then echo "ERRO: $flag precisa estar true no backend/VPS. Atual: $value"; exit 1; fi; done',
    '  whatsapp_mode="$(docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" hbx-backend | awk -F= \'$1 == "HBX_RADAR_WHATSAPP_CHECK_MODE" { print $2; exit }\')"; if [ "$whatsapp_mode" != "enrich" ]; then echo "ERRO: HBX_RADAR_WHATSAPP_CHECK_MODE precisa estar enrich no backend/VPS. Atual: $whatsapp_mode"; exit 1; fi',
    '  ai_saneamento="$(docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" hbx-backend | awk -F= \'$1 == "HBX_RADAR_AI_SANEAMENTO_ENABLED" { print $2; exit }\')"; if [ "$ai_saneamento" != "false" ]; then echo "ERRO: Ollama local nao pode rodar no backend/VPS. HBX_RADAR_AI_SANEAMENTO_ENABLED=$ai_saneamento"; exit 1; fi',
    '}',
    // FIX REAL da race: State.Running=true acontece ANTES do Node subir, porque start-prod.sh roda
    // "prisma migrate deploy" DENTRO do container apos wait_for_database. Se a migration falha ou o
    // Node entra em restart-loop, o container fica "running" mas /health nunca responde 200 — e o
    // deploy passava falsamente. Aqui batemos HTTP de verdade no backend (127.0.0.1:3000/health via
    // curl) e REPROVAMOS o deploy (exit 1) se nunca vier 200. Assim migration falha = deploy falha.
    'verify_backend_http() {',
    '  echo "Validando backend via HTTP em http://127.0.0.1:3000/health (migration/boot real)..."',
    '  for i in $(seq 1 "$BACKEND_VERIFY_ATTEMPTS"); do',
    '    if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then echo "Backend HTTP OK: /health respondeu 200 (tentativa $i/$BACKEND_VERIFY_ATTEMPTS)."; return 0; fi',
    '    echo "Aguardando backend HTTP /health ($i/$BACKEND_VERIFY_ATTEMPTS)..."',
    '    sleep 3',
    '  done',
    '  echo "ERRO: backend nao respondeu 200 em /health apos $BACKEND_VERIFY_ATTEMPTS tentativas (migration falhou ou restart-loop). Deploy reprovado."; docker logs --tail 150 hbx-backend 2>&1 || true; exit 1',
    '}',
    'verify_hbx_engines() {',
    '  echo "Validando variaveis dos motores HBX..."',
    '  for i in $(seq 1 "$BACKEND_VERIFY_ATTEMPTS"); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then break; fi',
    '    echo "Aguardando hbx-backend ($i/$BACKEND_VERIFY_ATTEMPTS)..."',
    '    sleep 2',
    '  done',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_COUNT)" != "$HBX_ENGINE_COUNT" ]; then echo "ERRO: HBX_ENGINE_COUNT nao esta configurado no hbx-backend."; exit 1; fi',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_MAX_COUNT)" != "$HBX_ENGINE_MAX_COUNT" ]; then echo "ERRO: HBX_ENGINE_MAX_COUNT nao esta configurado no hbx-backend."; exit 1; fi',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_GOVERNOR_ENABLED)" != "true" ]; then echo "ERRO: governor elastico nao esta habilitado no hbx-backend."; exit 1; fi',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_URLS)" != "$(hbx_engine_urls)" ]; then echo "ERRO: HBX_ENGINE_URLS nao contem todos os motores esperados."; exit 1; fi',
    '  docker exec hbx-backend sh -lc \'test -x "$HBX_ENGINE_DOCKER_CLI_PATH" && test -S /var/run/docker.sock && "$HBX_ENGINE_DOCKER_CLI_PATH" ps >/dev/null\' || { echo "ERRO: hbx-backend sem acesso ao Docker host; governor nao controla motores."; exit 1; }',
    '  created_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  running_count="$(docker ps --filter "name=^/hbx-engine-[0-9]+$" --filter "status=running" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  extra_count="$(hbx_extra_engine_names | wc -l | tr -d " ")"',
    '  if [ "$extra_count" -gt 0 ]; then echo "ERRO: ainda existem motores HBX excedentes acima de $HBX_ENGINE_COUNT:"; hbx_extra_engine_names; exit 1; fi',
    '  if [ "$created_count" -ne "$HBX_ENGINE_COUNT" ]; then echo "ERRO: motores HBX criados=$created_count capacidade=$HBX_ENGINE_COUNT"; exit 1; fi',
    '  if [ "$running_count" -lt "$HBX_ENGINE_WARM_MIN" ]; then echo "ERRO: motores HBX running=$running_count warm_min=$HBX_ENGINE_WARM_MIN"; exit 1; fi',
    '  if [ "$running_count" -gt "$HBX_ENGINE_COUNT" ]; then echo "ERRO: motores HBX running=$running_count acima da capacidade=$HBX_ENGINE_COUNT"; exit 1; fi',
    '  echo "Motores HBX capacidade=$HBX_ENGINE_COUNT criados=$created_count running=$running_count warm=$HBX_ENGINE_WARM_MAX; chamada HTTP desativada."',
    '}',
  ];

  if (isForce) {
    lines.push(
      'remove_containers backend hbx-backend webscraping hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names) c7227f19b684_hbx-scraping-engine e22f61f3f5da_webscraping',
      'remove_compose_service_containers backend webscraping hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names)',
      'start_hbx_engines',
      'start_hbx_backend',
      'verify_backend_api',
      'verify_backend_http',
      'echo "Prisma migrate deploy roda dentro do container hbx-backend via backend/scripts/start-prod.sh, usando DATABASE_URL=hbx-postgres."',
      'run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps webscraping',
      'verify_hbx_engines',
      'deploy_frontend_docker',
      'docker image prune -f',
      'docker builder prune -f || true',
      'if [ "$FORCE_REBOOT_HOSTINGER" = "true" ]; then echo "FORCE_REBOOT_HOSTINGER=true: reiniciando VPS."; (sudo reboot || reboot); else echo "Reboot da VPS ignorado. Defina FORCE_REBOOT_HOSTINGER=true para habilitar."; fi',
    );
  } else {
    lines.push('remove_containers backend hbx-backend webscraping hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names) c7227f19b684_hbx-scraping-engine e22f61f3f5da_webscraping');
    lines.push('remove_compose_service_containers backend webscraping hbx-scraping-engine hbx-engine-watchdog $(hbx_engine_names)');
    lines.push('start_hbx_engines');
    lines.push('start_hbx_backend');
    lines.push('verify_backend_http');
    lines.push('echo "Prisma migrate deploy roda dentro do container hbx-backend via backend/scripts/start-prod.sh, usando DATABASE_URL=hbx-postgres."');
    lines.push('run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps webscraping');
    lines.push('verify_hbx_engines');
    lines.push('deploy_frontend_docker');
  }

  if (isForce) {
    lines.push('final_runtime_summary');
  }

  lines.push(
    'echo "Containers ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-frontend|hbx-backend|webscraping|hbx-scraping-engine|hbx-engine-[0-9]+|hbx-postgres" || true',
    'echo "Ultimos logs backend:"',
    'docker logs --tail 80 hbx-backend 2>&1 || true',
    'echo "Ultimos logs webscraping:"',
    'docker logs --tail 40 webscraping 2>&1 || true',
    'echo "Ultimos logs frontend Docker:"',
    'docker logs --tail 80 hbx-frontend 2>&1 || true',
  );

  return lines.join('\n');
}

function resolveWebwhatsDeployConfig(env, hostingerConfig) {
  const sourcePath = resolveWebwhatsRepoPath(env);

  if (isFalsey(env.WEBWHATS_DEPLOY_ENABLED)) {
    console.log('Webwhats deploy skipped: WEBWHATS_DEPLOY_ENABLED=false.');
    return null;
  }

  if (!isWebwhatsRepoAvailable(sourcePath)) {
    throw new Error(`WEBWHATS_DEPLOY_ENABLED is enabled, but Webwhats source was not found at: ${sourcePath}`);
  }

  const sshHost = String(env.WEBWHATS_SSH_HOST || hostingerConfig.sshHost || '').trim();
  const sshUser = String(env.WEBWHATS_SSH_USER || hostingerConfig.sshUser || '').trim();
  if (!sshHost || !sshUser) {
    throw new Error('Missing Webwhats SSH config. Define WEBWHATS_SSH_HOST/WEBWHATS_SSH_USER or HOSTINGER_SSH_HOST/HOSTINGER_SSH_USER.');
  }

  return {
    sourcePath,
    sshHost,
    sshUser,
    sshPort: String(env.WEBWHATS_SSH_PORT || '').trim(),
    appDir: String(env.WEBWHATS_APP_DIR || `${hostingerConfig.appDir}/Webwhats`).trim(),
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
    'export HUSKY=0',
    'export NPM_CONFIG_AUDIT=false',
    'export NPM_CONFIG_FUND=false',
    'export NPM_CONFIG_LOGLEVEL=error',
    'export NPM_CONFIG_UPDATE_NOTIFIER=false',
    'export PRISMA_HIDE_UPDATE_MESSAGE=true',
    'cd "$APP_DIR"',
    'if [ ! -f package.json ]; then echo "ERRO: package.json do Webwhats nao encontrado em $APP_DIR."; exit 1; fi',
    'if [ ! -f .env ] && [ "$APP_DIR" != "/opt/Webwhats" ] && [ -f /opt/Webwhats/.env ]; then cp /opt/Webwhats/.env .env; echo "Webwhats .env migrado de /opt/Webwhats para $APP_DIR."; fi',
    'if [ ! -f .env ]; then echo "ERRO: .env do Webwhats nao existe no servidor."; exit 1; fi',
    'run_as_service_user() { if [ -n "$RUN_USER" ] && [ "$RUN_USER" != "root" ] && id "$RUN_USER" >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then sudo -u "$RUN_USER" "$@"; else "$@"; fi; }',
    'run_systemctl() { if command -v sudo >/dev/null 2>&1; then sudo systemctl "$@"; else systemctl "$@"; fi; }',
    'ensure_systemd_targets_app_dir() { unit_text="$(systemctl cat "$SERVICE_NAME" 2>/dev/null || true)"; if ! printf "%s" "$unit_text" | grep -F "$APP_DIR" >/dev/null 2>&1; then echo "ERRO: $SERVICE_NAME.service nao aponta para $APP_DIR. Ajuste WEBWHATS_APP_DIR ou o systemd antes do deploy."; printf "%s\\n" "$unit_text" | grep -E "WorkingDirectory=|ExecStart=" || true; exit 1; fi; }',
    'restart_with_pm2() { pm2 restart webwhats --update-env; pm2 save >/dev/null 2>&1 || true; pm2 describe webwhats >/dev/null; echo "Webwhats PM2 ativo: webwhats"; }',
    'find_webwhats_pids() { for pid in $(pgrep -f "node .*dist/main.js|node dist/main.js" || true); do comm="$(cat "/proc/$pid/comm" 2>/dev/null || true)"; cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"; cmd="$(tr "\\0" " " < "/proc/$pid/cmdline" 2>/dev/null || true)"; if [ "$cwd" = "$APP_DIR" ] && { [ "$comm" = "node" ] || [ "$comm" = "sh" ]; } && printf "%s" "$cmd" | grep -q "node dist/main.js"; then echo "$pid"; fi; done; }',
    'restart_without_systemd() { mkdir -p logs; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -n "$old_pids" ]; then echo "Parando Webwhats antigo: $old_pids"; kill $old_pids 2>/dev/null || true; fi; for i in 1 2 3 4 5; do sleep 1; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; [ -z "$old_pids" ] && break; done; old_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -n "$old_pids" ]; then kill -9 $old_pids 2>/dev/null || true; fi; run_as_service_user sh -lc "cd \\"$APP_DIR\\" && nohup node dist/main.js > logs/webwhats.log 2>&1 &"; sleep 3; new_pids="$(find_webwhats_pids | tr "\\n" " " | xargs || true)"; if [ -z "$new_pids" ]; then echo "ERRO: Webwhats nao iniciou."; tail -80 logs/webwhats.log 2>/dev/null || true; exit 1; fi; echo "Webwhats process ativo: $new_pids"; }',
    'run_as_service_user env HUSKY=0 NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_LOGLEVEL=error NPM_CONFIG_UPDATE_NOTIFIER=false npm ci --no-audit --no-fund --loglevel=error',
    'run_as_service_user env NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_LOGLEVEL=error NPM_CONFIG_UPDATE_NOTIFIER=false npm run build -- --silent',
    'run_as_service_user env PRISMA_HIDE_UPDATE_MESSAGE=true node runWithProvider.js "npx prisma generate --schema ./prisma/DATABASE_PROVIDER-schema.prisma --no-hints"',
    'run_as_service_user env PRISMA_HIDE_UPDATE_MESSAGE=true npm run db:deploy',
    'if [ -n "$SERVICE_NAME" ] && command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files --type=service | grep -q "^$SERVICE_NAME.service"; then ensure_systemd_targets_app_dir; run_systemctl restart "$SERVICE_NAME"; run_systemctl is-active --quiet "$SERVICE_NAME"; echo "Webwhats service ativo: $SERVICE_NAME"; elif command -v pm2 >/dev/null 2>&1 && pm2 describe webwhats >/dev/null 2>&1; then restart_with_pm2; else echo "Webwhats sem systemd/PM2 configurado; reiniciando processo node direto."; restart_without_systemd; fi',
  ];

  return lines.join('\n');
}

function printWebwhatsDryRun(config) {
  if (!config) return;

  console.log(`[dry-run] Would validate local Webwhats source: ${config.sourcePath}`);
  console.log(`[dry-run] Would SSH into Webwhats runtime: ${config.sshUser}@${config.sshHost}:${config.appDir}`);
  console.log('[dry-run] Would run Webwhats remote deploy from HBX checkout: npm ci, build, db generate/deploy, restart.');
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
  console.log(`Webwhats source: ${config.sourcePath}`);
  console.log(`Webwhats remoto: ${config.sshUser}@${config.sshHost}:${config.appDir}`);
  const env = quietToolEnv();
  runStep('npm', ['run', 'typecheck'], { cwd: config.sourcePath, env });
  runStep('npm', ['run', 'build', '--', '--silent'], { cwd: config.sourcePath, env });
  runStep('npm', ['run', 'lint:check'], { cwd: config.sourcePath, env });
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
  console.log('[dry-run] Would run Hostinger remote deploy: fetch/reset, validate env/db/docker, create elastic hbx-engine capacity with a small warm pool + fallback, run backend with HBX_ENGINE_COUNT/HBX_ENGINE_URLS/governor, run frontend via Docker hbx-frontend, list containers.');
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
  runStep('ssh', [sshTarget, 'bash', '-ls'], {
    label: `ssh ${sshTarget} Hostinger deploy (${mode})`,
    stdin: remoteScript,
  });
}

function printAsapSummary(config, webwhatsConfig, mode) {
  logStage('Deploy ASAP');
  console.log(`Modo: ${mode}`);
  console.log(`Destino Hostinger: ${config.sshUser}@${config.sshHost}:${config.appDir}`);
  console.log(`Backend: ${config.backendUrl}`);
  console.log(`Frontend: ${config.frontendUrl}`);
  console.log(`Motores HBX: capacidade ${config.hbxEngineCount}, warm inicial ${config.hbxEngineWarmCount}, max configurado ${config.hbxEngineMaxCount}.`);
  console.log(`Webwhats deploy: ${webwhatsConfig ? `${webwhatsConfig.sshUser}@${webwhatsConfig.sshHost}:${webwhatsConfig.appDir}` : 'off'}.`);
  console.log('Escopo pesado preservado: build local backend/frontend, build remoto backend/frontend/motores e migrations dentro do backend.');
  console.log('Atalho seguro para rotina: npm run new faz publish seletivo quando a mudanca nao exige rebuild completo.');
}

async function verifyProduction(config, options = {}) {
  void config;
  void options;
  console.log('Production Verify desativado neste fluxo. Use npm run verify:prod quando quiser checagem HTTP separada.');
}

async function main() {
  const startedAt = Date.now();
  const mode = parseMode();
  const env = loadOperationsEnv();
  const config = ensureRequiredEnv(env);
  const webwhatsConfig = resolveWebwhatsDeployConfig(env, config);

  printAsapSummary(config, webwhatsConfig, mode);

  logStage(`Local Preflight (${mode})`);
  console.log('Banco esperado: hbx-postgres/hbx_prod');
  console.log(`Backend URL: ${config.backendUrl}`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  ensureGitBranch(branch);
  autoCommitLocalChanges(mode, 'publish');
  ensureCleanWorkingTree(mode);
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

  logStage('Commit final antes do push');
  autoCommitLocalChanges(mode, 'publish');
  ensureCleanWorkingTree(mode);
  const changedFilesAheadOfRemote = listChangedFilesAheadOfRemote();
  const commitsAheadOfRemote = listCommitsAheadOfRemote();

  logStage('Git Push');
  runStep('git', ['push', remote, branch]);

  logStage(`Hostinger Deploy (${mode})`);
  deployOnHostinger(config, mode);

  logStage('Webwhats Deploy');
  deployWebwhats(webwhatsConfig);

  if (mode === 'force') {
    logStage('Production Verify');
    await verifyProduction(config);
  } else {
    console.log('\nProduction Verify pulado no publish normal.');
  }
  printPublishedChanges(commitsAheadOfRemote, changedFilesAheadOfRemote);
  printFrontendDeployNotice(config, changedFilesAheadOfRemote);

  console.log(`\nHostinger deploy completed em ${formatElapsed(startedAt)}.`);
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
