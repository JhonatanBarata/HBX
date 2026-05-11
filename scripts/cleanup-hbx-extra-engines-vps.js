'use strict';

const { loadEnvFromFiles, repoRoot, run } = require('./lib/runtime');
const path = require('path');

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const env = {
  ...loadEnvFromFiles([
    path.join(repoRoot, '.env.production.local'),
    path.join(repoRoot, '.env.ops.local'),
    path.join(repoRoot, '.env.operations.local'),
  ]),
  ...process.env,
};

const host = String(env.HOSTINGER_SSH_HOST || '').trim();
const user = String(env.HOSTINGER_SSH_USER || '').trim();
const appDir = String(env.HOSTINGER_APP_DIR || '').trim();

if (!host || !user) {
  throw new Error('HOSTINGER_SSH_HOST/HOSTINGER_SSH_USER ausentes.');
}

const remote = [
  'set -eu',
  appDir ? `cd ${shellSingleQuote(appDir)}` : 'true',
  'for n in $(seq 51 200); do',
  '  name="hbx-engine-$n"',
  '  if docker ps -a --format "{{.Names}}" | grep -qx "$name"; then',
  '    echo "Stopping/removing $name"',
  '    docker stop "$name" >/dev/null 2>&1 || true',
  '    docker rm "$name" >/dev/null 2>&1 || true',
  '  fi',
  'done',
  'if [ -f .env ]; then',
  '  tmp="$(mktemp)"',
  '  awk \'BEGIN{c=0;mc=0;r=0;m=0} /^HBX_ENGINE_COUNT=/ {print "HBX_ENGINE_COUNT=50"; c=1; next} /^HBX_ENGINE_MAX_COUNT=/ {print "HBX_ENGINE_MAX_COUNT=50"; mc=1; next} /^HBX_CLIENT_RESERVED_ENGINES=/ {print "HBX_CLIENT_RESERVED_ENGINES=0"; r=1; next} /^HBX_FACTORY_MAX_ENGINES=/ {print "HBX_FACTORY_MAX_ENGINES=50"; m=1; next} {print} END{if(!c) print "HBX_ENGINE_COUNT=50"; if(!mc) print "HBX_ENGINE_MAX_COUNT=50"; if(!r) print "HBX_CLIENT_RESERVED_ENGINES=0"; if(!m) print "HBX_FACTORY_MAX_ENGINES=50"}\' .env > "$tmp"',
  '  cat "$tmp" > .env',
  '  rm -f "$tmp"',
  'fi',
  'docker ps -a --format "{{.Names}}" | grep -E "^hbx-engine-([5-9][1-9]|[1-9][0-9]{2})$" && exit 1 || true',
  'echo "Cleanup extra HBX engines done."',
].join('\n');

run('ssh', [`${user}@${host}`, remote], { cwd: repoRoot });
