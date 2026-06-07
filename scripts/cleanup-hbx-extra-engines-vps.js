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
const rewriteEnv = ['1', 'true', 'yes', 'on'].includes(String(env.HBX_ENGINE_CLEANUP_REWRITE_ENV || '').trim().toLowerCase());
const keepCount = Math.min(
  Math.max(
    Number.parseInt(String(env.HBX_ENGINE_CLEANUP_KEEP_COUNT || env.HBX_ENGINE_MAX_COUNT || env.HBX_ENGINE_HARD_LIMIT || '200'), 10) || 200,
    1,
  ),
  200,
);
const scanLimit = Math.max(
  keepCount,
  Math.min(Number.parseInt(String(env.HBX_ENGINE_CLEANUP_SCAN_LIMIT || '400'), 10) || 400, 400),
);

if (!host || !user) {
  throw new Error('HOSTINGER_SSH_HOST/HOSTINGER_SSH_USER ausentes.');
}

const remote = [
  'set -eu',
  appDir ? `cd ${shellSingleQuote(appDir)}` : 'true',
  `KEEP_COUNT=${shellSingleQuote(keepCount)}`,
  `SCAN_LIMIT=${shellSingleQuote(scanLimit)}`,
  `HBX_ENGINE_CLEANUP_REWRITE_ENV=${shellSingleQuote(rewriteEnv ? 'true' : 'false')}`,
  'START_REMOVE=$((KEEP_COUNT + 1))',
  'if [ "$START_REMOVE" -le "$SCAN_LIMIT" ]; then',
  'for n in $(seq "$START_REMOVE" "$SCAN_LIMIT"); do',
  '  name="hbx-engine-$n"',
  '  if docker ps -a --format "{{.Names}}" | grep -qx "$name"; then',
  '    echo "Stopping/removing $name"',
  '    docker stop "$name" >/dev/null 2>&1 || true',
  '    docker rm "$name" >/dev/null 2>&1 || true',
  '  fi',
  'done',
  'fi',
  'if [ "${HBX_ENGINE_CLEANUP_REWRITE_ENV:-false}" = "true" ] && [ -f .env ]; then',
  '  tmp="$(mktemp)"',
  '  awk -v keep="$KEEP_COUNT" \'BEGIN{c=0;mc=0;m=0} /^HBX_ENGINE_COUNT=/ {print "HBX_ENGINE_COUNT=" keep; c=1; next} /^HBX_ENGINE_MAX_COUNT=/ {print "HBX_ENGINE_MAX_COUNT=" keep; mc=1; next} /^HBX_FACTORY_MAX_ENGINES=/ {print "HBX_FACTORY_MAX_ENGINES=" keep; m=1; next} {print} END{if(!c) print "HBX_ENGINE_COUNT=" keep; if(!mc) print "HBX_ENGINE_MAX_COUNT=" keep; if(!m) print "HBX_FACTORY_MAX_ENGINES=" keep}\' .env > "$tmp"',
  '  cat "$tmp" > .env',
  '  rm -f "$tmp"',
  'fi',
  'docker ps -a --format "{{.Names}}" | awk -v keep="$KEEP_COUNT" \'/^hbx-engine-[0-9]+$/ { split($0, p, "-"); if ((p[3] + 0) > keep) { print; found=1 } } END { exit found ? 1 : 0 }\'',
  'echo "Cleanup extra HBX engines done. keep=$KEEP_COUNT scan=$SCAN_LIMIT"',
].join('\n');

run('ssh', [`${user}@${host}`, remote], { cwd: repoRoot });
