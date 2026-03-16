'use strict';

const path = require('path');
const readline = require('readline');
const fs = require('fs');
const { isLocalDatabaseUrl, parseEnvFile, repoRoot, resolveOperationsEnv, run } = require('./lib/runtime');
const { createProductionBackup } = require('./backup-prod');
const { verifyProduction } = require('./verify-prod');

const isDryRun = process.argv.includes('--dry-run');
const args = process.argv.slice(2);

function readArgValue(flagName) {
  const direct = args.find((arg) => arg.startsWith(`${flagName}=`));
  if (direct) {
    return direct.split('=', 2)[1] || '';
  }

  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return '';
}

const commitMessageArg = readArgValue('--message');
const skipPrompt = args.includes('--yes') || args.includes('--confirm');

function logStage(title) {
  console.log(`\n=== ${title} ===`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProdBackupsRoot() {
  return path.join(repoRoot, 'backups', 'prod');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function listProdBackupDirs() {
  const root = getProdBackupsRoot();
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort();
}

function getBackupManifestPath(backupDir) {
  return path.join(backupDir, 'manifest.json');
}

function markBackupStatus(backupDir, status, extra = {}) {
  const manifestPath = getBackupManifestPath(backupDir);
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = readJsonFile(manifestPath);
  writeJsonFile(manifestPath, {
    ...manifest,
    status,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
}

function rotateProductionBackups(latestBackupDir) {
  const backups = listProdBackupDirs();
  const deleted = [];

  for (const backupDir of backups) {
    if (path.resolve(backupDir) === path.resolve(latestBackupDir)) {
      continue;
    }
    fs.rmSync(backupDir, { recursive: true, force: true });
    deleted.push(backupDir);
  }

  return deleted;
}

async function verifyWithRetry(env) {
  const timeoutSeconds = Math.max(60, Number(process.env.PUBLISH_VERIFY_TIMEOUT_SECONDS || env.PUBLISH_VERIFY_TIMEOUT_SECONDS || '900'));
  const intervalSeconds = Math.max(5, Number(process.env.PUBLISH_VERIFY_INTERVAL_SECONDS || env.PUBLISH_VERIFY_INTERVAL_SECONDS || '20'));
  const startedAt = Date.now();
  let attempt = 0;
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutSeconds * 1000) {
    attempt += 1;
    console.log(`Verify attempt ${attempt}...`);
    try {
      return await verifyProduction(env);
    } catch (error) {
      lastError = error;
      console.log(`Verify attempt ${attempt} failed: ${error && error.message ? error.message : error}`);
      await sleep(intervalSeconds * 1000);
    }
  }

  throw lastError || new Error(`Production verify timed out after ${timeoutSeconds} seconds`);
}

function runStep(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(' ');
  console.log(`\n> ${printable}`);

  if (isDryRun && options.skipInDryRun) {
    console.log('[dry-run] skipped');
    return { status: 0, stdout: '', stderr: '' };
  }

  try {
    return run(command, commandArgs, {
      cwd: repoRoot,
      captureOutput: options.captureOutput,
      env: options.env,
    });
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

function validateBackendEnvironment() {
  const backendEnvPath = path.join(repoRoot, 'backend', '.env');
  if (!fs.existsSync(backendEnvPath)) {
    throw new Error('backend/.env is required for publish preflight');
  }

  const backendEnv = parseEnvFile(backendEnvPath);
  const databaseUrl = String(backendEnv.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('backend/.env must define DATABASE_URL');
  }
  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('Publish preflight requires backend/.env to target a local development database');
  }

  return {
    ...process.env,
    ...backendEnv,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: String(backendEnv.DIRECT_URL || databaseUrl).trim(),
  };
}

function validateFileExpectations() {
  const renderYamlPath = path.join(repoRoot, 'render.yaml');
  const renderYaml = fs.readFileSync(renderYamlPath, 'utf8');
  const requiredRenderKeys = ['DATABASE_URL', 'DIRECT_URL', 'FRONTEND_URL', 'CORS_ALLOWED_ORIGINS', 'BOOTSTRAP_SYSTEM_MASTER'];
  for (const key of requiredRenderKeys) {
    if (!renderYaml.includes(`key: ${key}`)) {
      throw new Error(`render.yaml is missing required env key ${key}`);
    }
  }
  if (!renderYaml.includes('value: "false"')) {
    throw new Error('render.yaml must keep BOOTSTRAP_SYSTEM_MASTER=false in production');
  }

  const frontendExamplePath = path.join(repoRoot, 'frontend', '.env.example');
  const frontendEnvExample = fs.existsSync(frontendExamplePath)
    ? fs.readFileSync(frontendExamplePath, 'utf8')
    : '';
  if (!frontendEnvExample.includes('NEXT_PUBLIC_API_URL')) {
    throw new Error('frontend/.env.example must document NEXT_PUBLIC_API_URL');
  }
}

function validateChangedFiles(changedFiles) {
  const lines = changedFiles.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const forbiddenPatterns = [
    /(^|\/)\.env$/i,
    /(^|\/)\.env\.(local|production\.local|ops\.local|operations\.local)$/i,
    /^backups\//i,
    /^postgres-data\//i,
  ];

  for (const line of lines) {
    const normalized = line.replace(/^\?\?\s+/, '').replace(/^[A-Z]{1,2}\s+/, '');
    if (forbiddenPatterns.some((pattern) => pattern.test(normalized))) {
      throw new Error(`Refusing publish with sensitive or local-only file in changes: ${normalized}`);
    }
  }
}

async function main() {
  logStage('Preflight Validation');

  const backendEnv = validateBackendEnvironment();
  validateFileExpectations();

  runStep('git', ['rev-parse', '--is-inside-work-tree']);
  runStep('git', ['diff', '--check']);

  const status = runStep('git', ['status', '--short'], { captureOutput: true });
  const changedFiles = String(status.stdout || '').trim();

  if (!changedFiles && !isDryRun) {
    console.error('No local changes to publish.');
    process.exit(1);
  }

  if (changedFiles) {
    console.log('\nChanged files:');
    console.log(changedFiles);
    validateChangedFiles(changedFiles);
  }

  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:generate'], { env: backendEnv });
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate'], { env: backendEnv });
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:migrate:status'], { env: backendEnv });
  runStep('node', ['backend/scripts/structural-seed.js', '--check'], { env: backendEnv });
  runStep('node', ['backend/node_modules/typescript/bin/tsc', '-p', 'backend/tsconfig.json']);
  runStep('npm', ['--prefix', 'frontend', 'run', 'build']);

  if (isDryRun) {
    console.log('\nDry run completed. No commit or push executed.');
    return;
  }

  if (!skipPrompt) {
    const confirmation = await ask('Type PUBLISH to commit and push: ');
    if (confirmation !== 'PUBLISH') {
      console.error('Publish cancelled.');
      process.exit(1);
    }
  }

  const commitMessage = String(commitMessageArg || await ask('Commit message: ')).trim();
  if (!commitMessage) {
    console.error('Publish cancelled: commit message is required.');
    process.exit(1);
  }

  const publishRemote = process.env.PUBLISH_REMOTE || 'origin';
  const publishBranch = process.env.PUBLISH_BRANCH || 'master';
  const operationsEnv = resolveOperationsEnv();

  logStage('Production Backup');
  const previousBackups = listProdBackupDirs();
  const backupResult = createProductionBackup(operationsEnv);
  markBackupStatus(backupResult.backupDir, 'created-before-publish', {
    previousBackupCount: previousBackups.length,
  });
  console.log(JSON.stringify(backupResult, null, 2));

  logStage('Git Publish');
  runStep('git', ['add', '-A']);
  runStep('git', ['commit', '-m', commitMessage]);
  runStep('git', ['push', publishRemote, `HEAD:${publishBranch}`]);

  logStage('Post-Deploy Verify');
  try {
    const verifyResult = await verifyWithRetry(operationsEnv);
    console.log(JSON.stringify(verifyResult, null, 2));
    markBackupStatus(backupResult.backupDir, 'verified-after-publish', {
      verifyResult,
    });

    logStage('Backup Rotation');
    const deletedBackups = rotateProductionBackups(backupResult.backupDir);
    console.log(JSON.stringify({
      keptBackup: backupResult.backupDir,
      deletedBackups,
    }, null, 2));
  } catch (error) {
    markBackupStatus(backupResult.backupDir, 'publish-failed-verification', {
      verifyError: error && error.message ? error.message : String(error),
    });
    console.error('\nPublish finished pushing code, but post-deploy verification failed.');
    console.error('Older backups were preserved for rollback safety.');
    throw error;
  }

  console.log('\nPublish completed. Backup created, code pushed, deploy verified, and old production backups rotated.');
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});