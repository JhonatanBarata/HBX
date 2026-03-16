'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadEnvFromFiles(filePaths, options = {}) {
  const merged = {};

  for (const filePath of filePaths.filter(Boolean)) {
    Object.assign(merged, parseEnvFile(filePath));
  }

  if (options.applyToProcess) {
    for (const [key, value] of Object.entries(merged)) {
      if (options.overrideProcess || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  return merged;
}

function resolveOperationsEnv() {
  const candidateFiles = [
    path.join(repoRoot, '.env.production.local'),
    path.join(repoRoot, '.env.ops.local'),
    path.join(repoRoot, '.env.operations.local'),
    path.join(repoRoot, 'backend', '.env.production.local'),
  ];

  return {
    ...loadEnvFromFiles(candidateFiles),
    ...process.env,
  };
}

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(databaseUrl);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      host: parsed.host,
      pathname: parsed.pathname,
      databaseName: parsed.pathname.replace(/^\//, ''),
    };
  } catch (error) {
    return null;
  }
}

function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', 'db'].includes(String(hostname || '').toLowerCase());
}

function isLocalDatabaseUrl(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    return false;
  }

  return isLocalHostname(parsed.hostname);
}

function isLocalHttpUrl(targetUrl) {
  if (!targetUrl) {
    return false;
  }

  try {
    const parsed = new URL(targetUrl);
    return isLocalHostname(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function assertNonLocalDatabaseUrl(databaseUrl, label) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    throw new Error(`${label} is invalid`);
  }
  if (isLocalHostname(parsed.hostname)) {
    throw new Error(`${label} must point to a remote production database, not ${parsed.hostname}`);
  }
  return parsed;
}

function assertNonLocalHttpUrl(targetUrl, label) {
  if (!targetUrl) {
    throw new Error(`${label} is required`);
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (error) {
    throw new Error(`${label} is invalid`);
  }

  if (isLocalHostname(parsed.hostname)) {
    throw new Error(`${label} must point to a remote environment, not ${parsed.hostname}`);
  }

  return parsed;
}

function normalizeHostDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return databaseUrl;
  }

  return String(databaseUrl)
    .replace(/(@)db(?=[:/])/g, '$1localhost')
    .replace(/:\/\/db(?=[:/])/g, '://localhost');
}

function resolveExecutable(command) {
  if (process.platform === 'win32' && command === 'npm') {
    return 'npm.cmd';
  }
  return command;
}

function run(command, args, options = {}) {
  const executable = resolveExecutable(command);
  let spawnCommand = executable;
  let spawnArgs = args;
  const shouldUseShell = options.shell === true;

  if (process.platform === 'win32' && /\.cmd$/i.test(executable) && !shouldUseShell) {
    spawnCommand = process.env.comspec || 'cmd.exe';
    spawnArgs = ['/d', '/s', '/c', executable, ...args];
  }

  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: shouldUseShell,
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const printable = [executable, ...args].join(' ');
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(details ? `${printable}\n${details}` : `${printable} exited with status ${result.status}`);
  }

  return result;
}

function requireEnv(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

module.exports = {
  assertNonLocalDatabaseUrl,
  assertNonLocalHttpUrl,
  formatTimestamp,
  isLocalHostname,
  isLocalHttpUrl,
  isLocalDatabaseUrl,
  loadEnvFromFiles,
  normalizeHostDatabaseUrl,
  parseDatabaseUrl,
  parseEnvFile,
  repoRoot,
  requireEnv,
  resolveOperationsEnv,
  run,
};