'use strict';

const fs = require('fs');
const path = require('path');
const { assertNonLocalDatabaseUrl, formatTimestamp, repoRoot, requireEnv, resolveOperationsEnv, run } = require('./lib/runtime');

function createProductionBackup(inputEnv = resolveOperationsEnv()) {
  const env = inputEnv;
  const databaseUrl = requireEnv(env, 'PROD_DATABASE_URL');
  const parsed = assertNonLocalDatabaseUrl(databaseUrl, 'PROD_DATABASE_URL');

  const timestamp = formatTimestamp();
  const backupDir = path.join(repoRoot, 'backups', 'prod', timestamp);
  const dumpFileName = 'prod-backup.sql';
  const manifestFileName = 'manifest.json';

  fs.mkdirSync(backupDir, { recursive: true });

  try {
    run('docker', [
      'run',
      '--rm',
      '-v',
      `${backupDir}:/backup`,
      'postgres:17-alpine',
      'sh',
      '-lc',
      `pg_dump --clean --if-exists --no-owner --no-privileges '${databaseUrl}' -f /backup/${dumpFileName}`,
    ]);
  } catch (error) {
    const reason = error && error.message ? error.message : String(error || 'docker unavailable');
    fs.writeFileSync(
      path.join(backupDir, manifestFileName),
      JSON.stringify(
        {
          status: 'skipped',
          createdAt: new Date().toISOString(),
          databaseHost: parsed.host,
          databaseName: parsed.databaseName,
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
        databaseHost: parsed.host,
        databaseName: parsed.databaseName,
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