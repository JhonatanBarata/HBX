'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { formatTimestamp, repoRoot, requireEnv, resolveOperationsEnv, run } = require('./lib/runtime');

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveHostingerSshTarget(env) {
  const host = String(env.HOSTINGER_SSH_HOST || '').trim();
  const user = String(env.HOSTINGER_SSH_USER || '').trim();
  if (!host || !user) {
    throw new Error('Missing required environment variable: HOSTINGER_SSH_HOST or HOSTINGER_SSH_USER');
  }
  return `${user}@${host}`;
}

function createProductionBackup(inputEnv = resolveOperationsEnv()) {
  const env = inputEnv;
  const sshTarget = resolveHostingerSshTarget(env);
  const appDir = requireEnv(env, 'HOSTINGER_APP_DIR');

  const timestamp = formatTimestamp();
  const backupDir = path.join(repoRoot, 'backups', 'prod', timestamp);
  const dumpFileName = 'prod-backup.sql';
  const manifestFileName = 'manifest.json';

  fs.mkdirSync(backupDir, { recursive: true });

  try {
    const remoteScript = [
      'set -eu',
      `APP_DIR=${shellSingleQuote(appDir)}`,
      'if [ ! -f "$APP_DIR/backend/.env" ]; then echo "backend/.env ausente na VPS" >&2; exit 1; fi',
      'ENV_DB_LINES="$(awk -F= \'/^[[:space:]]*(DATABASE_URL|DIRECT_URL)[[:space:]]*=/{print $0}\' "$APP_DIR/backend/.env")"',
      'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx-postgres"; then echo "backend/.env precisa apontar para hbx-postgres" >&2; exit 1; fi',
      'if ! printf "%s\\n" "$ENV_DB_LINES" | grep -q "hbx_prod"; then echo "backend/.env precisa apontar para hbx_prod" >&2; exit 1; fi',
      'if ! docker inspect -f "{{.State.Running}}" hbx-postgres 2>/dev/null | grep -q true; then echo "container hbx-postgres nao esta running" >&2; exit 1; fi',
      'docker exec hbx-postgres sh -lc \'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"\'',
    ].join('\n');

    const dumpPath = path.join(backupDir, dumpFileName);
    const dumpFd = fs.openSync(dumpPath, 'w');
    const backupResult = spawnSync(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=20',
        sshTarget,
        remoteScript,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['inherit', dumpFd, 'pipe'],
      },
    );
    fs.closeSync(dumpFd);

    if (backupResult.error) {
      throw backupResult.error;
    }
    if (backupResult.status !== 0) {
      throw new Error(String(backupResult.stderr || '').trim() || `ssh exited with status ${backupResult.status}`);
    }
  } catch (error) {
    const reason = error && error.message ? error.message : String(error || 'docker unavailable');
    fs.writeFileSync(
      path.join(backupDir, manifestFileName),
      JSON.stringify(
        {
          status: 'skipped',
          createdAt: new Date().toISOString(),
          databaseHost: 'hbx-postgres',
          databaseName: 'hbx_prod',
          sshTarget,
          dumpFile: null,
          dumpBytes: 0,
          reason,
        },
        null,
        2,
      ),
      'utf8',
    );

    return {
      ok: false,
      backupSkipped: true,
      reason,
      backupDir,
      dumpFile: null,
      dumpBytes: 0,
    };
  }

  const dumpPath = path.join(backupDir, dumpFileName);
  const dumpStats = fs.statSync(dumpPath);

  fs.writeFileSync(
    path.join(backupDir, manifestFileName),
    JSON.stringify(
      {
        status: 'created',
        createdAt: new Date().toISOString(),
        databaseHost: 'hbx-postgres',
        databaseName: 'hbx_prod',
        sshTarget,
        dumpFile: dumpFileName,
        dumpBytes: dumpStats.size,
      },
      null,
      2,
    ),
    'utf8',
  );

  return { ok: true, backupDir, dumpFile: dumpPath, dumpBytes: dumpStats.size };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(createProductionBackup(), null, 2));
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  createProductionBackup,
};
