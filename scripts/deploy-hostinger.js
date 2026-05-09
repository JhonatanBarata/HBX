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

function parsePositiveInteger(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function resolveHbxEngineCount(env) {
  const force100 = isTruthy(env.FORCE_100_ENGINES);
  const requested = parsePositiveInteger(
    env.HBX_ENGINE_COUNT || env.HBX_PUBLISH_ENGINE_COUNT,
    force100 ? 100 : 20,
  );
  if (requested >= 100 && !force100) {
    console.log('HBX_ENGINE_COUNT >= 100 ignorado sem FORCE_100_ENGINES=true; usando 20.');
    return 20;
  }
  return requested;
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

  const hbxEngineCount = resolveHbxEngineCount(env);
  const hbxEngineMaxCount = Math.max(
    hbxEngineCount,
    parsePositiveInteger(env.HBX_ENGINE_MAX_COUNT || env.HBX_PUBLISH_ENGINE_MAX_COUNT, 200),
  );

  return {
    sshHost: String(env.HOSTINGER_SSH_HOST).trim(),
    sshUser: String(env.HOSTINGER_SSH_USER).trim(),
    appDir: String(env.HOSTINGER_APP_DIR).trim(),
    backendUrl,
    frontendUrl,
    forceReboot: isTruthy(env.FORCE_REBOOT_HOSTINGER),
    hbxEngineCount,
    hbxEngineMaxCount,
    webwhatsAppDir: String(env.WEBWHATS_APP_DIR || '/opt/Webwhats').trim(),
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
    'Aviso operacional: mudancas de frontend foram detectadas e entram no build PM2 fora do Docker na Hostinger.',
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
    `BUILD_NO_CACHE_ARG=${shellSingleQuote(isForce ? '--no-cache' : '')}`,
    `FORCE_REBOOT_HOSTINGER=${shellSingleQuote(rebootValue)}`,
    `REQUESTED_HBX_ENGINE_COUNT=${shellSingleQuote(config.hbxEngineCount)}`,
    `REQUESTED_HBX_ENGINE_MAX_COUNT=${shellSingleQuote(config.hbxEngineMaxCount)}`,
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
    'WHATSAPP_MODAL_INTERNAL_URL_VALUE="$(awk -F= \'/^[[:space:]]*WHATSAPP_MODAL_INTERNAL_URL[[:space:]]*=/{print $2; exit}\' backend/.env)"',
    'if [ "$WHATSAPP_MODAL_INTERNAL_URL_VALUE" != "http://172.18.0.1:8080" ]; then echo "ERRO: backend/.env precisa manter WHATSAPP_MODAL_INTERNAL_URL=http://172.18.0.1:8080. Atual: $WHATSAPP_MODAL_INTERNAL_URL_VALUE"; exit 1; fi',
    'if [ ! -f .env ]; then echo "ERRO: .env raiz nao existe na VPS."; exit 1; fi',
    'upsert_root_env() { key="$1"; value="$2"; tmp="$(mktemp)"; awk -v key="$key" -v value="$value" \'BEGIN{done=0} $0 ~ "^" key "=" { print key "=" value; done=1; next } { print } END{ if (!done) print key "=" value }\' .env > "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; }',
    'upsert_root_env HBX_ENGINE_COUNT "$REQUESTED_HBX_ENGINE_COUNT"',
    'upsert_root_env HBX_ENGINE_MAX_COUNT "$REQUESTED_HBX_ENGINE_MAX_COUNT"',
    'upsert_root_env HBX_CLIENT_RESERVED_ENGINES "${HBX_CLIENT_RESERVED_ENGINES:-2}"',
    'upsert_root_env HBX_FACTORY_MIN_ENGINES "${HBX_FACTORY_MIN_ENGINES:-1}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_START_HOUR "${HBX_RADAR_CLIENT_PRIORITY_START_HOUR:-8}"',
    'upsert_root_env HBX_RADAR_CLIENT_PRIORITY_END_HOUR "${HBX_RADAR_CLIENT_PRIORITY_END_HOUR:-20}"',
    'upsert_root_env HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS "${HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS:-25000}"',
    'upsert_root_env HBX_RADAR_CLIENT_FALLBACK_TO_POOL "${HBX_RADAR_CLIENT_FALLBACK_TO_POOL:-true}"',
    'export POSTGRES_USER="$(awk -F= \'/^POSTGRES_USER=/{print substr($0, length("POSTGRES_USER")+2); exit}\' .env)"',
    'export POSTGRES_PASSWORD="$(awk -F= \'/^POSTGRES_PASSWORD=/{print substr($0, length("POSTGRES_PASSWORD")+2); exit}\' .env)"',
    'export POSTGRES_DB="$(awk -F= \'/^POSTGRES_DB=/{print substr($0, length("POSTGRES_DB")+2); exit}\' .env)"',
    'export POSTGRES_DATA_VOLUME="$(awk -F= \'/^POSTGRES_DATA_VOLUME=/{print substr($0, length("POSTGRES_DATA_VOLUME")+2); exit}\' .env)"',
    'export NEXT_PUBLIC_API_URL="$(awk -F= \'/^NEXT_PUBLIC_API_URL=/{print substr($0, length("NEXT_PUBLIC_API_URL")+2); exit}\' .env)"',
    'if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_DATA_VOLUME" ] || [ -z "$NEXT_PUBLIC_API_URL" ]; then echo "ERRO: .env raiz sem variaveis obrigatorias do docker-compose."; exit 1; fi',
    'export HBX_ENGINE_COUNT="$(awk -F= \'/^HBX_ENGINE_COUNT=/{print substr($0, length("HBX_ENGINE_COUNT")+2); exit}\' .env)"',
    'export HBX_ENGINE_MAX_COUNT="$(awk -F= \'/^HBX_ENGINE_MAX_COUNT=/{print substr($0, length("HBX_ENGINE_MAX_COUNT")+2); exit}\' .env)"',
    'if [ -z "$HBX_ENGINE_MAX_COUNT" ]; then export HBX_ENGINE_MAX_COUNT=200; fi',
    'case "$HBX_ENGINE_MAX_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_MAX_COUNT invalido no .env; usando 200."; export HBX_ENGINE_MAX_COUNT=200;; esac',
    'if [ -z "$HBX_ENGINE_COUNT" ]; then export HBX_ENGINE_COUNT=20; fi',
    'case "$HBX_ENGINE_COUNT" in *[!0-9]*|"") echo "Aviso: HBX_ENGINE_COUNT invalido no .env; usando 20."; export HBX_ENGINE_COUNT=20;; esac',
    'if [ "$HBX_ENGINE_COUNT" -lt 1 ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT abaixo do minimo; usando 1."; export HBX_ENGINE_COUNT=1; fi',
    'if [ "$HBX_ENGINE_COUNT" -gt "$HBX_ENGINE_MAX_COUNT" ]; then echo "Aviso: HBX_ENGINE_COUNT=$HBX_ENGINE_COUNT acima do limite; usando $HBX_ENGINE_MAX_COUNT."; export HBX_ENGINE_COUNT="$HBX_ENGINE_MAX_COUNT"; fi',
    'if docker network inspect hbx_net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx_net; elif docker network inspect hbx-net >/dev/null 2>&1; then export HBX_DOCKER_NETWORK=hbx-net; else docker network create hbx_net >/dev/null; export HBX_DOCKER_NETWORK=hbx_net; fi',
    'if docker compose version >/dev/null 2>&1; then DC="docker compose"; elif docker-compose --version >/dev/null 2>&1; then DC="docker-compose"; else echo "ERRO: docker-compose nao encontrado."; exit 1; fi',
    'run_filtered() { set +e; "$@" 2>&1 | sed \'/legacy builder is deprecated/d;/Install the buildx component/d;/docs.docker.com\\/go\\/buildx/d\'; status="${PIPESTATUS[0]}"; set -e; return "$status"; }',
    'hbx_engine_names() { for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf " hbx-engine-%s" "$n"; done; }',
    'hbx_engine_urls() { sep=""; for n in $(seq 1 "$HBX_ENGINE_COUNT"); do printf "%shttp://hbx-engine-%s:8001" "$sep" "$n"; sep=","; done; }',
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
    '  if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "ERRO: hbx-postgres nao esta running antes do deploy."; exit 1; fi',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "ERRO: hbx-backend nao esta running antes do deploy. Abortando para evitar deploy sobre API offline."; exit 1; fi',
    '  require_http_ok "$BACKEND_URL/health" "API publica /health pre-deploy"',
    '  webhook_code="$(http_status "$BACKEND_URL/webhooks/webwhats/events")"; if [ "$webhook_code" = "502" ] || [ "$webhook_code" = "000" ]; then echo "ERRO: webhook Webwhats publico indisponivel HTTP $webhook_code"; exit 1; fi; echo "Webhook Webwhats publico nao esta 502: HTTP $webhook_code"',
    '  validate_webwhats_runtime',
    '}',
    'final_healthchecks() {',
    '  require_http_ok "$BACKEND_URL/health" "API publica /health final"',
    '  require_http_ok "$FRONTEND_URL/" "Frontend / final"',
    '  require_http_ok "$FRONTEND_URL/atendimento" "Frontend /atendimento final"',
    '}',
    'echo "Banco esperado: hbx-postgres/hbx_prod"',
    'echo "Backend URL: $BACKEND_URL"',
    'echo "Frontend URL: $FRONTEND_URL"',
    'echo "Rede Docker: $HBX_DOCKER_NETWORK"',
    'echo "Motores HBX dedicados: $HBX_ENGINE_COUNT"',
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
    'predeploy_runtime_checks',
    'ensure_pm2() {',
    '  if command -v pm2 >/dev/null 2>&1; then return 0; fi',
    '  echo "PM2 nao encontrado; instalando globalmente..."',
    '  npm i -g pm2',
    '}',
    'cleanup_frontend_docker() {',
    '  echo "Garantindo frontend fora do Docker..."',
    '  docker rm -f hbx-frontend frontend 2>/dev/null || true',
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
    'verify_frontend_pm2() {',
    '  for i in $(seq 1 45); do',
    '    if command -v curl >/dev/null 2>&1 && curl -fsSI http://127.0.0.1:3001 >/dev/null 2>&1; then echo "Frontend PM2 pronto em http://127.0.0.1:3001"; return 0; fi',
    '    if command -v wget >/dev/null 2>&1 && wget -q --spider http://127.0.0.1:3001 >/dev/null 2>&1; then echo "Frontend PM2 pronto em http://127.0.0.1:3001"; return 0; fi',
    '    echo "Aguardando frontend PM2 ($i/45)..."',
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
    '  FRONTEND_DIR="$APP_DIR/frontend"',
    '  BUILD_DIR="$(mktemp -d "$APP_DIR/.frontend-build.XXXXXX")"',
    '  cleanup_build_dir() { rm -rf "$BUILD_DIR"; }',
    '  trap cleanup_build_dir EXIT',
    '  if command -v rsync >/dev/null 2>&1; then',
    '    rsync -a --delete --exclude .next --exclude node_modules "$FRONTEND_DIR/" "$BUILD_DIR/"',
    '  else',
    '    cp -a "$FRONTEND_DIR/." "$BUILD_DIR/"',
    '    rm -rf "$BUILD_DIR/.next" "$BUILD_DIR/node_modules"',
    '  fi',
    '  cd "$BUILD_DIR"',
    '  npm ci',
    '  npm run build',
    '  cd "$FRONTEND_DIR"',
    '  npm ci',
    '  NEXT_STAGE="$FRONTEND_DIR/.next.new.$$"',
    '  rm -rf "$NEXT_STAGE"',
    '  mv "$BUILD_DIR/.next" "$NEXT_STAGE"',
    '  rm -rf "$FRONTEND_DIR/.next.previous"',
    '  if [ -d "$FRONTEND_DIR/.next" ]; then mv "$FRONTEND_DIR/.next" "$FRONTEND_DIR/.next.previous"; fi',
    '  mv "$NEXT_STAGE" "$FRONTEND_DIR/.next"',
    '  if pm2 describe hbx-frontend >/dev/null 2>&1; then',
    '    pm2 restart hbx-frontend --update-env',
    '  else',
    '    pm2 start npm --name hbx-frontend -- run start',
    '  fi',
    '  pm2 save',
    '  cd "$APP_DIR"',
    '  verify_frontend_pm2',
    '  trap - EXIT',
    '  cleanup_build_dir',
    '}',
    'start_hbx_engines() {',
    '  echo "Buildando imagem dos motores HBX..."',
    '  run_filtered docker build $BUILD_NO_CACHE_ARG -t hbx_hbx-scraping-engine:latest ./hbx-scraping-engine',
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
    '    -e HBX_CLIENT_RESERVED_ENGINES="${HBX_CLIENT_RESERVED_ENGINES:-2}" \\',
    '    -e HBX_FACTORY_MIN_ENGINES="${HBX_FACTORY_MIN_ENGINES:-1}" \\',
    '    -e HBX_FACTORY_MAX_ENGINES="${HBX_FACTORY_MAX_ENGINES:-}" \\',
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
    '  for i in $(seq 1 60); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true && curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then echo "Backend local /health OK."; break; fi',
    '    echo "Aguardando backend/API ($i/60)..."',
    '    sleep 2',
    '  done',
    '  if ! docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then echo "ERRO: hbx-backend caiu durante o deploy."; docker logs --tail 120 hbx-backend 2>&1 || true; exit 1; fi',
    '  require_http_ok "http://127.0.0.1:3000/health" "API local /health"',
    '  require_http_ok "$BACKEND_URL/health" "API publica /health"',
    '}',
    'verify_hbx_engines() {',
    '  echo "Validando variaveis e healthchecks dos motores HBX..."',
    '  for i in $(seq 1 45); do',
    '    if docker inspect -f "{{.State.Running}}" hbx-backend 2>/dev/null | grep -q true; then break; fi',
    '    echo "Aguardando hbx-backend ($i/45)..."',
    '    sleep 2',
    '  done',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_COUNT)" != "$HBX_ENGINE_COUNT" ]; then echo "ERRO: HBX_ENGINE_COUNT nao esta configurado no hbx-backend."; exit 1; fi',
    '  if [ "$(docker exec hbx-backend printenv HBX_ENGINE_URLS)" != "$(hbx_engine_urls)" ]; then echo "ERRO: HBX_ENGINE_URLS nao contem todos os motores esperados."; exit 1; fi',
    '  for n in $(seq 1 "$HBX_ENGINE_COUNT"); do',
    '    ok=0',
    '    for attempt in $(seq 1 30); do',
    '      if docker exec hbx-backend wget -qO- "http://hbx-engine-$n:8001/health" >/dev/null; then ok=1; break; fi',
    '      echo "Aguardando hbx-engine-$n ($attempt/30)..."',
    '      sleep 2',
    '    done',
    '    if [ "$ok" != "1" ]; then echo "ERRO: healthcheck falhou para hbx-engine-$n em http://hbx-engine-$n:8001/health."; exit 1; fi',
    '    if [ "$n" -eq "$HBX_ENGINE_COUNT" ] || { [ "$HBX_ENGINE_COUNT" -gt 10 ] && [ $((n % 20)) -eq 0 ]; }; then echo "Healthcheck motores HBX: $n/$HBX_ENGINE_COUNT"; fi',
    '  done',
    '}',
  ];

  if (isForce) {
    lines.push(
      'ensure_pm2',
      'pm2 stop hbx-frontend 2>/dev/null || true',
      'remove_containers backend hbx-backend hbx-frontend webscraping hbx-scraping-engine $(hbx_engine_names) c7227f19b684_hbx-scraping-engine ab1704a260e6_hbx-frontend e22f61f3f5da_webscraping',
      'remove_compose_service_containers backend webscraping hbx-scraping-engine $(hbx_engine_names)',
      'start_hbx_engines',
      'start_hbx_backend',
      'verify_backend_api',
      'echo "Prisma migrate deploy roda dentro do container hbx-backend via backend/scripts/start-prod.sh, usando DATABASE_URL=hbx-postgres."',
      'run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps webscraping',
      'verify_hbx_engines',
      'deploy_frontend_pm2',
      'docker image prune -f',
      'docker builder prune -f || true',
      'if [ "$FORCE_REBOOT_HOSTINGER" = "true" ]; then echo "FORCE_REBOOT_HOSTINGER=true: reiniciando VPS."; (sudo reboot || reboot); else echo "Reboot da VPS ignorado. Defina FORCE_REBOOT_HOSTINGER=true para habilitar."; fi',
    );
  } else {
    lines.push('remove_containers backend hbx-backend hbx-frontend webscraping hbx-scraping-engine $(hbx_engine_names) c7227f19b684_hbx-scraping-engine ab1704a260e6_hbx-frontend e22f61f3f5da_webscraping');
    lines.push('remove_compose_service_containers backend webscraping hbx-scraping-engine $(hbx_engine_names)');
    lines.push('start_hbx_engines');
    lines.push('start_hbx_backend');
    lines.push('verify_backend_api');
    lines.push('echo "Prisma migrate deploy roda dentro do container hbx-backend via backend/scripts/start-prod.sh, usando DATABASE_URL=hbx-postgres."');
    lines.push('run_filtered $DC --env-file .env -f docker-compose.hostinger.yml up -d --build --no-deps webscraping');
    lines.push('verify_hbx_engines');
    lines.push('deploy_frontend_pm2');
  }

  lines.push(
    'final_healthchecks',
    'echo "Containers ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "NAMES|hbx-backend|webscraping|hbx-scraping-engine|hbx-engine-[0-9]+|hbx-postgres" || true',
    'echo "PM2 status:"',
    'pm2 list 2>/dev/null || true',
    'echo "Ultimos logs backend:"',
    'docker logs --tail 80 hbx-backend 2>&1 || true',
    'echo "Ultimos logs webscraping:"',
    'docker logs --tail 40 webscraping 2>&1 || true',
    'echo "Ultimos logs frontend PM2:"',
    'pm2 logs hbx-frontend --lines 80 --nostream 2>/dev/null || true',
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
  console.log('[dry-run] Would run Hostinger remote deploy: fetch/reset, validate env/db/docker, build hbx-engine-1..N + fallback, run backend with HBX_ENGINE_COUNT/HBX_ENGINE_URLS, run frontend via PM2, list containers.');
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

  const uploadProbeUrl = `${config.backendUrl}/master/email/attachment`;
  console.log(`\n> POST ${uploadProbeUrl} 2MB upload-limit probe`);
  const uploadProbeResponse = await fetch(uploadProbeUrl, {
    method: 'POST',
    headers: {
      Origin: config.frontendUrl,
      'Content-Type': 'application/octet-stream',
    },
    body: Buffer.alloc(2 * 1024 * 1024),
  });
  if (uploadProbeResponse.status === 413) {
    throw new Error('Upload limit check failed: Nginx returned 413 for a 2MB request. Set client_max_body_size above the master email upload size.');
  }
  const uploadAllowOrigin = uploadProbeResponse.headers.get('access-control-allow-origin') || '';
  if (!uploadAllowOrigin) {
    throw new Error('Upload limit check failed: missing CORS header on the upload probe response.');
  }
  console.log(`Upload limit OK: HTTP ${uploadProbeResponse.status}, allow-origin=${uploadAllowOrigin}`);
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
