'use strict';

const path = require('path');
const {
  loadEnvFromFiles,
  repoRoot,
  requireEnv,
  run,
} = require('../lib/runtime');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function loadOperationsEnv() {
  return {
    ...loadEnvFromFiles([
      path.join(repoRoot, '.env.production.local'),
      path.join(repoRoot, '.env.ops.local'),
      path.join(repoRoot, '.env.operations.local'),
    ]),
    ...process.env,
  };
}

function parseTimeoutMs(env) {
  const raw = String(env.HBX_DOCKER_CLEAN_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.trunc(parsed);
}

function buildSshArgs(env, remoteScript) {
  const sshHost = requireEnv(env, 'HOSTINGER_SSH_HOST');
  const sshUser = requireEnv(env, 'HOSTINGER_SSH_USER');
  const sshPort = String(env.HOSTINGER_SSH_PORT || '').trim();
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
  ];

  if (sshPort) {
    args.push('-p', sshPort);
  }

  args.push(`${sshUser}@${sshHost}`, 'bash', '-lc', shellSingleQuote(remoteScript));
  return args;
}

function buildRemoteScript(env) {
  const requireBackend = String(env.HBX_DOCKER_CLEAN_REQUIRE_BACKEND || 'true').toLowerCase() !== 'false';
  const builderPruneUntil = String(env.HBX_DOCKER_CLEAN_BUILDER_UNTIL || '24h').trim() || '24h';

  return [
    'set -eu',
    'echo "Docker disk antes:"',
    'docker system df || true',
    'echo ""',
    'echo "Containers HBX ativos:"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}" | grep -E "NAMES|hbx-backend|hbx-frontend|webscraping|hbx-postgres|hbx-scraping-engine|hbx-engine-[0-9]+" || true',
    requireBackend
      ? 'if ! docker ps --format "{{.Names}}" | grep -qx "hbx-backend"; then echo "ERRO: hbx-backend nao esta rodando. Abortando limpeza para nao remover rollback durante incidente."; exit 1; fi'
      : 'echo "HBX_DOCKER_CLEAN_REQUIRE_BACKEND=false: limpeza liberada mesmo sem hbx-backend running."',
    'echo ""',
    'echo "Limpando imagens Docker nao usadas. Volumes/Postgres NAO sao removidos."',
    'docker image prune -af',
    'echo ""',
    `echo "Limpando cache de build antigo (until=${builderPruneUntil}). Volumes/Postgres NAO sao removidos."`,
    `docker builder prune -f --filter "until=${builderPruneUntil}" || true`,
    'echo ""',
    'echo "Docker disk depois:"',
    'docker system df || true',
    'echo ""',
    'echo "Volumes preservados:"',
    'docker volume ls | grep -E "DRIVER|postgres|hbx" || true',
  ].join('\n');
}

function main() {
  const env = loadOperationsEnv();
  const timeout = parseTimeoutMs(env);
  const remoteScript = buildRemoteScript(env);
  const args = buildSshArgs(env, remoteScript);

  console.log('Limpando imagens/cache Docker nao usados na VPS. Volumes e banco nao serao removidos.');
  run('ssh', args, { timeout });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
