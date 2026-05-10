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
  frontend: 'frontend (Docker)',
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

function parsePositiveInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function resolveHbxEngineCount(env) {
  const requested = parsePositiveInteger(
    env.HBX_ENGINE_COUNT || env.HBX_PUBLISH_ENGINE_COUNT,
    50,
  );
  return Math.min(requested, 50);
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

  const hbxEngineCount = resolveHbxEngineCount(env);
  const hbxEngineMaxCount = Math.max(
    hbxEngineCount,
    parsePositiveInteger(env.HBX_ENGINE_MAX_COUNT || env.HBX_PUBLISH_ENGINE_MAX_COUNT, 200),
  );

  return {
    sshHost: String(env.HOSTINGER_SSH_HOST).trim(),
    sshUser: String(env.HOSTINGER_SSH_USER).trim(),
    appDir: String(env.HOSTINGER_APP_DIR).trim(),
    frontendUrl,
    backendUrl: normalizeBaseUrl(env.PROD_BACKEND_URL || ''),
    hbxEngineCount,
    hbxEngineMaxCount,
    webwhatsAppDir: String(env.WEBWHATS_APP_DIR || '/opt/Webwhats').trim(),
    webwhatsSystemdService: String(env.WEBWHATS_SYSTEMD_SERVICE || 'webwhats').trim(),
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
    `REQUESTED_HBX_ENGINE_COUNT=${shellSingleQuote(config.hbxEngineCount)}`,
    `REQUESTED_HBX_ENGINE_MAX_COUNT=${shellSingleQuote(config.hbxEngineMaxCount)}`,
    `BACKEND_URL=${shellSingleQuote(config.backendUrl)}`,
    `FRONTEND_URL=${shellSingleQuote(config.frontendUrl)}`,
    'FRONTEND_VERIFY_ATTEMPTS=20',
    'BACKEND_VERIFY_ATTEMPTS=30',
    `WEBWHATS_APP_DIR=${shellSingleQuote(config.webwhatsAppDir)}`,
    `WEBWHATS_SYSTEMD_SERVICE=${shellSingleQuote(config.webwhatsSystemdService)}`,
    'export GIT_SSH_COMMAND="ssh -o BatchMode=yes"',
    'cd "$APP_DIR"',
    `git fetch ${remote} ${branch}`,
    `git reset --hard ${remote}/${branch}`,
    'if [ ! -f .env ]; then echo "ERRO: .env raiz nao existe na VPS."; exit 1; fi',
    'if [ ! -f backend/.env ]; then echo "ERRO: backend/.env nao existe na VPS."; exit 1; fi',
    'WHATSAPP_MODAL_INTERNAL_URL_VALUE="$(awk -F= \'/^[[:space:]]*WHATSAPP_MODAL_INTERNAL_URL[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'if [ "$WHATSAPP_MODAL_INTERNAL_URL_VALUE" != "http://172.18.0.1:8080" ]; then echo "ERRO: backend/.env precisa manter WHATSAPP_MODAL_INTERNAL_URL=http://172.18.0.1:8080. Atual: $WHATSAPP_MODAL_INTERNAL_URL_VALUE"; exit 1; fi',
    'upsert_root_env() { key="$1"; value="$2"; tmp="$(mktemp)"; awk -v key="$key" -v value="$value" \'BEGIN{done=0} $0 ~ "^" key "=" { print key "=" value; done=1; next } { print } END{ if (!done) print key "=" value }\' .env > "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; }',
    'upsert_root_env HBX_ENGINE_COUNT "$REQUESTED_HBX_ENGINE_COUNT"',
    'upsert_root_env HBX_ENGINE_MAX_COUNT "$REQUESTED_HBX_ENGINE_MAX_COUNT"',
    'upsert_root_env HBX_CLIENT_RESERVED_ENGINES "${HBX_CLIENT_RESERVED_ENGINES:-0}"',
    'upsert_root_env HBX_FACTORY_MIN_ENGINES "${HBX_FACTORY_MIN_ENGINES:-1}"',
    'upsert_root_env HBX_FACTORY_MAX_ENGINES "${HBX_FACTORY_MAX_ENGINES:-50}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_START_HOUR "${HBX_RADAR_CLIENT_PRIORITY_START_HOUR:-8}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_END_HOUR "${HBX_RADAR_CLIENT_PRIORITY_END_HOUR:-20}"',
    'upsert_root_env HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS "${HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS:-25000}"',
    'upsert_root_env HBX_RADAR_CLIENT_FALLBACK_TO_POOL "${HBX_RADAR_CLIENT_FALLBACK_TO_POOL:-true}"',
    'export HBX_ENGINE_COUNT="$(awk -F= \'/^HBX_ENGINE_COUNT=/{print substr($0, length("HBX_ENGINE_COUNT")+2); exit}\' .env)"',
    'export HBX_ENGINE_MAX_COUNT="$(awk -F= \'/^HBX_ENGINE_MAX_COUNT=/{print substr($0, length("HBX_ENGINE_MAX_COUNT")+2); exit}\' .env)"',
    'if [ -z "$HBX_ENGINE_MAX_COUNT" ]; then export HBX_ENGINE_MAX_COUNT=200; fi',
    'case "$HBX_ENGINE_MAX_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_MAX_COUNT invalido no .env; usando 200."; export HBX_ENGINE_MAX_COUNT=200;; esac',
    'if [ -z "$HBX_ENGINE_COUNT" ]; then export HBX_ENGINE_COUNT=50; fi',
    'case "$HBX_ENGINE_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_COUNT invalido no .env; usando 50."; export HBX_ENGINE_COUNT=50;; esac',
    'if [ "$HBX_ENGINE_COUNT" -lt 1 ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT abaixo do minimo; usando 1."; export HBX_ENGINE_COUNT=1; fi',
    'if [ "$HBX_ENGINE_COUNT" -gt 50 ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT acima da frota oficial; usando 50."; export HBX_ENGINE_COUNT=50; fi',
    'if [ "$HBX_ENGINE_COUNT" -gt "$HBX_ENGINE_MAX_COUNT" ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT acima do limite; usando $HBX_ENGINE_MAX_COUNT."; export HBX_ENGINE_COUNT="$HBX_ENGINE_MAX_COUNT"; fi',
    'export POSTGRES_USER="$(awk -F= \'/^POSTGRES_USER=/{print substr($0, length("POSTGRES_USER")+2); exit}\' .env)"',
    'export POSTGRES_PASSWORD="$(awk -F= \'/^POSTGRES_PASSWORD=/{print substr($0, length("POSTGRES_PASSWORD")+2); exit}\' .env)"',
    'export POSTGRES_DB="$(awk -F= \'/^POSTGRES_DB=/{print substr($0, length("POSTGRES_DB")+2); exit}\' .env)"',
    'export POSTGRES_DATA_VOLUME="$(awk -F= \'/^POSTGRES_DATA_VOLUME=/{print substr($0, length("POSTGRES_DATA_VOLUME")+2); exit}\' .env)"',
    'export NEXT_PUBLIC_API_URL="$(awk -F= \'/^NEXT_PUBLIC_API_URL=/{print substr($0, length("NEXT_PUBLIC_API_URL")+2); exit}\' .env)"',
    'if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_DATA_VOLUME" ] || [ -z "$NEXT_PUBLIC_API_URL" ]; then echo "ERRO: .env raiz sem variaveis obrigatorias do docker-compose."; exit 1; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'if ! docker network inspect hbx_net >/dev/null 2>&1; then docker network create hbx_net >/dev/null; fi',
    'export HBX_DOCKER_NETWORK=hbx_net',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'hbx_engine_names() { for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf " hbx-engine-%s" "$n"; done; }',
    'hbx_engine_urls() { sep=""; for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf "%shttp://hbx-engine-%s:8001" "$sep" "$n"; sep=","; done; }',
    'cleanup_extra_hbx_engines() {',
    '  echo "Limpando motores HBX excedentes hbx-engine-51..hbx-engine-100..."',
    '  for n in $(seq 51 100); do',
    '    name="hbx-engine-$n"',
    '    if docker ps -a --format "{{.Names}}" | grep -qx "$name"; then',
    '      docker stop "$name" >/dev/null 2>&1 || true',
    '      docker rm "$name" >/dev/null 2>&1 || true',
    '    fi',
    '  done',
    '}',
    'http_status() { code="$(curl -ksS --max-time 20 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || true)"; [ -n "$code" ] || code=000; printf "%s" "$code"; }',
    'require_http_ok() { url="$1"; label="$2"; code="$(http_status "$url")"; case "$code" in 2*|3*) echo "Health OK: $label HTTP $code";; *) echo "ERRO: $label falhou em $url HTTP $code"; exit 1;; esac; }',
    'validate_webwhats_runtime() {',
    '  echo "Validando Webwhats/Evolution..."',
    '  if [ -d /opt/webwhats ] && [ ! -d "$WEBWHATS_APP_DIR" ]; then WEBWHATS_APP_DIR=/opt/webwhats; fi',
    '  webwhats_running=0',
    '  if [ -n "$WEBWHATS_SYSTEMD_SERVICE" ] && command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$WEBWHATS_SYSTEMD_SERVICE"; then webwhats_running=1; fi',
    '  if command -v pm2 >/dev/null 2>&1 && pm2 describe webwhats >/dev/null 2>&1; then webwhats_running=1; fi',
    '  if docker ps --format "{{.Names}}" | grep -Eiq "webwhats|evolution|waha"; then webwhats_running=1; fi',
    '  if [ "$webwhats_running" != "1" ]; then echo "ERRO: Webwhats/Evolution nao esta rodando via systemd, PM2 ou Docker."; exit 1; fi',
    '  code="$(http_status "$WHATSAPP_MODAL_INTERNAL_URL_VALUE")"; if [ "$code" = "000" ] || [ "$code" = "502" ]; then echo "ERRO: Webwhats indisponivel em $WHATSAPP_MODAL_INTERNAL_URL_VALUE HTTP $code"; exit 1; fi',
    '  if [ ! -f "$WEBWHATS_APP_DIR/.env" ]; then echo "ERRO: .env do Webwhats nao encontrado em $WEBWHATS_APP_DIR/.env; nao da para validar storage persistente."; exit 1; fi',
    '  db_save="$(awk -F= \'/^[[:space:]]*DATABASE_SAVE_DATA_INSTANCE[[:space:]]*=/{print tolower($2); exit}\' "$WEBWHATS_APP_DIR/.env")"',
    '  db_uri="$(awk -F= \'/^[[:space:]]*DATABASE_CONNECTION_URI[[:space:]]*=/{print $2; exit}\' "$WEBWHATS_APP_DIR/.env")"',
    '  redis_enabled="$(awk -F= \'/^[[:space:]]*CACHE_REDIS_ENABLED[[:space:]]*=/{print tolower($2); exit}\' "$WEBWHATS_APP_DIR/.env")"',
    '  redis_save="$(awk -F= \'/^[[:space:]]*CACHE_REDIS_SAVE_INSTANCES[[:space:]]*=/{print tolower($2); exit}\' "$WEBWHATS_APP_DIR/.env")"',
    '  provider_enabled="$(awk -F= \'/^[[:space:]]*PROVIDER_ENABLED[[:space:]]*=/{print tolower($2); exit}\' "$WEBWHATS_APP_DIR/.env")"',
    '  if [ "$db_save" = "true" ] && [ -n "$db_uri" ]; then echo "Storage Webwhats persistente via banco habilitado."; return 0; fi',
    '  if [ "$provider_enabled" = "true" ]; then echo "Storage Webwhats persistente via provider de sessoes habilitado."; return 0; fi',
    '  if [ "$redis_enabled" = "true" ] && [ "$redis_save" = "true" ]; then',
    '    if ! docker inspect redis >/dev/null 2>&1; then echo "ERRO: Webwhats salva sessoes no Redis, mas container redis nao foi encontrado para validar volume."; exit 1; fi',
    '    mounts="$(docker inspect redis --format "{{range .Mounts}}{{.Destination}}:{{.Type}}:{{.Name}} {{end}}")"',
    '    if printf "%s" "$mounts" | grep -q "/data:"; then echo "Storage Redis persistente validado: $mounts"; return 0; fi',
    '    echo "ERRO: Redis do Webwhats sem mount persistente em /data. Mounts: $mounts"; exit 1',
    '  fi',
    '  echo "ERRO: Webwhats sem storage persistente validado. Habilite DATABASE_SAVE_DATA_INSTANCE, PROVIDER_ENABLED ou Redis persistente."; exit 1',
    '}',
    'predeploy_runtime_checks() {',
    '  echo "Preflight runtime HBX..."',
    '  docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-backend|hbx-postgres" || true',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: hbx-postgres nao esta running antes do release."; exit 1; fi',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "ERRO: hbx-backend nao esta running antes do release. Abortando para evitar deploy sobre API offline."; exit 1; fi',
    '  echo "Preflight rapido: containers essenciais running."',
    '}',
    'final_healthchecks() {',
    '  if [ -n "$BACKEND_URL" ]; then require_http_ok "$BACKEND_URL/health" "API publica /health final"; fi',
    '  require_http_ok "$FRONTEND_URL/" "Frontend / final"',
    '}',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker start hbx-postgres >/dev/null; else run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d hbx-postgres; fi',
    'docker network connect "$HBX_DOCKER_NETWORK" hbx-postgres 2>/dev/null || true',
    'for i in $(seq 1 60); do if docker exec hbx-postgres sh -lc \'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\' >/dev/null 2>&1; then echo "Postgres pronto."; break; fi; echo "Aguardando Postgres ($i/60)..."; sleep 2; done',
    'predeploy_runtime_checks',
    'cleanup_extra_hbx_engines',
    'echo "Servicos para rebuild: $SERVICES"',
    'has_service() { case " $SERVICES " in *" $1 "*) return 0;; *) return 1;; esac; }',
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
    'remove_named_or_suffixed() {',
    '  base="$1"',
    '  names="$base $(docker ps -a --format "{{.Names}}" | awk -v base="$base" \'$0 == base || $0 ~ "_" base "$" { print }\')"',
    '  remove_containers $names',
    '}',
    'disable_frontend_pm2() {',
    '  echo "Removendo somente hbx-frontend do PM2, sem afetar outros apps PM2..."',
    '  if command -v pm2 >/dev/null 2>&1; then',
    '    pm2 resurrect >/dev/null 2>&1 || true',
    '    pm2 stop hbx-frontend 2>/dev/null || true',
    '    pm2 delete hbx-frontend 2>/dev/null || true',
    '    pm2 save --force >/dev/null 2>&1 || true',
    '  fi',
    '}',
    'ensure_frontend_compose_file() {',
    '  cat > docker-compose.frontend.yml <<\'YAML\'',
    'services:',
    '  frontend:',
    '    container_name: hbx-frontend',
    '    build:',
    '      context: ./frontend',
    '      dockerfile: Dockerfile',
    '    restart: unless-stopped',
    '    environment:',
    '      NODE_ENV: production',
    '      NEXT_TELEMETRY_DISABLED: "1"',
    '      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}',
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
    'verify_frontend_docker() {',
    '  for i in $(seq 1 "$FRONTEND_VERIFY_ATTEMPTS"); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-frontend 2>/dev/null | grep -q true && command -v curl >/dev/null 2>&1 && curl -fsSI http://127.0.0.1:3001/login >/dev/null 2>&1; then echo "Frontend Docker pronto em http://127.0.0.1:3001"; return 0; fi',
    '    if docker inspect -f "{{.State.Running}}" hbx-frontend 2>/dev/null | grep -q true && command -v wget >/dev/null 2>&1 && wget -q --spider http://127.0.0.1:3001/login >/dev/null 2>&1; then echo "Frontend Docker pronto em http://127.0.0.1:3001"; return 0; fi',
    '    echo "Aguardando frontend Docker ($i/$FRONTEND_VERIFY_ATTEMPTS)..."',
    '    sleep 2',
    '  done',
    '  echo "ERRO: frontend Docker nao respondeu em http://127.0.0.1:3001/login."',
    '  docker ps -a --filter "name=^/hbx-frontend$" --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true',
    '  docker logs --tail 120 hbx-frontend 2>&1 || true',
    '  exit 1',
    '}',
    'deploy_frontend_docker() {',
    '  echo "Publicando frontend em Docker como hbx-frontend..."',
    '  disable_frontend_pm2',
    '  ensure_frontend_compose_file',
    '  run_filtered $DC --env-file .env -f docker-compose.frontend.yml build frontend',
    '  remove_named_or_suffixed hbx-frontend',
    '  remove_containers frontend',
    '  free_frontend_port',
    '  run_filtered $DC --env-file .env -f docker-compose.frontend.yml up -d frontend',
    '  verify_frontend_docker',
    '}',
    'ensure_frontend_docker_runtime() {',
    '  disable_frontend_pm2',
    '  ensure_frontend_compose_file',
    '  if [ ! -d "$APP_DIR/frontend" ]; then echo "Pasta frontend nao encontrada em $APP_DIR/frontend; pulando runtime Docker."; return 0; fi',
    '  if ! docker inspect hbx-frontend >/dev/null 2>&1; then',
    '    echo "Container hbx-frontend ausente; reconstruindo frontend Docker..."',
    '    deploy_frontend_docker',
    '    return 0',
    '  fi',
    '  run_filtered $DC --env-file .env -f docker-compose.frontend.yml up -d frontend',
    '  verify_frontend_docker',
    '}',
    'start_hbx_engines() {',
    '  cleanup_extra_hbx_engines',
    '  echo "Buildando imagem dos motores HBX..."',
    '  run_filtered docker build -t hbx_hbx-scraping-engine:latest ./hbx-scraping-engine',
    '  mkdir -p "$APP_DIR/hbx-scraping-engine/data"',
    '  for n in $(seq 1 "$HBX_ENGINE_COUNT"); do mkdir -p "$APP_DIR/hbx-scraping-engine/data-$n"; done',
    '  remove_compose_service_containers hbx-scraping-engine $(hbx_engine_names)',
    '  remove_containers hbx-scraping-engine $(hbx_engine_names)',
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
    '  echo "Subindo motores HBX: hbx-engine-1..hbx-engine-${HBX_ENGINE_COUNT}"',
    '  echo "Total solicitado: ${HBX_ENGINE_COUNT}"',
    '  for n in $(seq 1 "$HBX_ENGINE_COUNT"); do',
    '    docker run -d --name "hbx-engine-$n" --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '      -e HBX_SCRAPING_TIMEOUT_SECONDS=20 \\',
    '      -e HBX_SCRAPING_CONCURRENCY=3 \\',
    '      -e HBX_SCRAPING_CACHE_TTL_HOURS=24 \\',
    '      -e HBX_SCRAPING_MAX_DISCOVERY_RESULTS=120 \\',
    '      -e HBX_AGENDA_MAX_PAGES=20 \\',
    '      -e HBX_AGENDA_REQUEST_DELAY_MS=700 \\',
    '      -v "$APP_DIR/hbx-scraping-engine/data-$n:/app/data" \\',
    '      hbx_hbx-scraping-engine:latest',
    '    if [ "$n" -eq "$HBX_ENGINE_COUNT" ] || { [ "$HBX_ENGINE_COUNT" -gt 10 ] && [ $((n % 20)) -eq 0 ]; }; then echo "Progresso motores HBX: $n/$HBX_ENGINE_COUNT"; fi',
    '  done',
    '  running_count="$(docker ps --filter "name=^/hbx-engine-[0-9]+$" --filter "status=running" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  unhealthy_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d " " || true)"',
    '  exited_count="$(docker ps -a --filter "name=^/hbx-engine-[0-9]+$" --filter "status=exited" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  offline_count=$((unhealthy_count + exited_count))',
    '  echo "Resumo motores HBX: esperados=$HBX_ENGINE_COUNT running=$running_count unhealthy/offline=$offline_count"',
    '  cleanup_extra_hbx_engines',
    '}',
    'start_hbx_backend() {',
    '  echo "Buildando imagem backend..."',
    '  run_filtered docker build -t hbx_backend:latest ./backend',
    '  remove_named_or_suffixed hbx-backend',
    '  remove_containers backend',
    '  echo "Subindo hbx-backend..."',
    '  docker run -d --name hbx-backend --restart unless-stopped --network "$HBX_DOCKER_NETWORK" \\',
    '    --env-file "$APP_DIR/backend/.env" \\',
    '    -e HBX_SCRAPING_ENGINE_URL=http://hbx-scraping-engine:8001 \\',
    '    -e HBX_ENGINE_COUNT="$HBX_ENGINE_COUNT" \\',
    '    -e HBX_ENGINE_MAX_COUNT="$HBX_ENGINE_MAX_COUNT" \\',
    '    -e HBX_ENGINE_URLS="$(hbx_engine_urls)" \\',
    '    -e HBX_CLIENT_RESERVED_ENGINES="${HBX_CLIENT_RESERVED_ENGINES:-0}" \\',
    '    -e HBX_FACTORY_MIN_ENGINES="${HBX_FACTORY_MIN_ENGINES:-1}" \\',
    '    -e HBX_FACTORY_MAX_ENGINES="${HBX_FACTORY_MAX_ENGINES:-50}" \\',
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
    '    -p 3000:3000 \\',
    '    -v "$APP_DIR/backend/public/uploads:/app/public/uploads" \\',
    '    hbx_backend:latest',
    '}',
    'verify_backend_api() {',
    '  echo "Validando backend/API..."',
    '  for i in $(seq 1 "$BACKEND_VERIFY_ATTEMPTS"); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true && curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then echo "Backend local /health OK."; break; fi',
    '    echo "Aguardando backend/API ($i/$BACKEND_VERIFY_ATTEMPTS)..."',
    '    sleep 2',
    '  done',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "ERRO: hbx-backend caiu durante o release."; docker logs --tail 120 hbx-backend 2>&1 || true; exit 1; fi',
    '  require_http_ok "http://127.0.0.1:3000/health" "API local /health"',
    '  if [ -n "$BACKEND_URL" ]; then require_http_ok "$BACKEND_URL/health" "API publica /health"; fi',
    '}',
    'verify_hbx_engines() {',
    '  echo "Validando variaveis dos motores HBX..."',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_COUNT)" != "$HBX_ENGINE_COUNT" ]; then echo "ERRO: HBX_ENGINE_COUNT nao esta configurado no hbx-backend."; exit 1; fi',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_URLS)" != "$(hbx_engine_urls)" ]; then echo "ERRO: HBX_ENGINE_URLS nao contem todos os motores esperados."; exit 1; fi',
    '  running_count="$(docker ps --filter "name=^/hbx-engine-[0-9]+$" --filter "status=running" --format "{{.Names}}" | wc -l | tr -d " ")"',
    '  if [ "$running_count" -lt "$HBX_ENGINE_COUNT" ]; then echo "ERRO: motores HBX running=$running_count esperados=$HBX_ENGINE_COUNT"; exit 1; fi',
    '  for n in 1 "$HBX_ENGINE_COUNT"; do',
    '    if ! docker exec hbx-backend wget -qO- "http://hbx-engine-$n:8001/health" >/dev/null; then echo "ERRO: healthcheck rapido falhou para hbx-engine-$n."; exit 1; fi',
    '  done',
    '  echo "Healthcheck rapido motores HBX: running=$running_count esperados=$HBX_ENGINE_COUNT."',
    '}',
    'if has_service hbx-scraping-engine; then start_hbx_engines; fi',
    'if has_service backend; then start_hbx_backend; verify_backend_api; fi',
    'if [ -n "$COMPOSE_SERVICES" ]; then',
    '  for s in $COMPOSE_SERVICES; do',
    '    case "$s" in',
    '      webscraping) remove_named_or_suffixed webscraping;;',
    '    esac',
    '  done',
    `  run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps ${composeServiceArgs}`,
    'fi',
    'if has_service frontend; then deploy_frontend_docker; else ensure_frontend_docker_runtime; fi',
    'if has_service backend || has_service hbx-scraping-engine; then verify_hbx_engines; fi',
    'final_healthchecks',
    'echo "Runtime ativo:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-frontend|hbx-backend|webscraping|hbx-scraping-engine|hbx-engine-[0-9]+|hbx-postgres" || true',
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
  console.log('Frontend runtime: Docker hbx-frontend');
  console.log(`URL final verificada: ${finalUrl}`);
}

function expandPublishedServices(services) {
  const selected = new Set(services);
  const published = ['backend', 'frontend', 'webscraping']
    .filter((service) => selected.has(service))
    .map((service) => serviceLabels[service] || service);

  if (selected.has('hbx-scraping-engine')) {
    const engineCount = 20;
    published.push(...Array.from({ length: engineCount }, (_, index) => `hbx-engine-${index + 1}`), 'hbx-scraping-engine');
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
