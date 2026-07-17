'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  formatTimestamp,
  repoRoot,
  requireEnv,
  resolveOperationsEnv,
  run,
} = require('../lib/runtime');

const remote = 'origin';
const branch = 'master';
const engineServices = Array.from({ length: 20 }, (_, index) => `hbx-engine-${index + 1}`);
const androidProjectDir = path.join(repoRoot, 'EntregaShell');
const androidApkPath = path.join(
  androidProjectDir,
  'app',
  'build',
  'outputs',
  'apk',
  'logistica',
  'release',
  'app-logistica-release.apk',
);

function runStep(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);
  return run(command, args, {
    cwd: options.cwd || repoRoot,
    captureOutput: options.captureOutput,
    allowFailure: options.allowFailure,
    stdin: options.stdin,
  });
}

function output(command, args) {
  return String(runStep(command, args, { captureOutput: true }).stdout || '').trim();
}

function lines(command, args) {
  return output(command, args).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function ensureMaster() {
  const currentBranch = output('git', ['branch', '--show-current']);
  if (currentBranch !== branch) {
    throw new Error(`Use somente o master. Branch atual: ${currentBranch || '(detached HEAD)'}.`);
  }
}

function workingTreeIsDirty() {
  return Boolean(output('git', ['status', '--short']));
}

function stashBeforePull() {
  if (!workingTreeIsDirty()) return false;
  runStep('git', ['stash', 'push', '--include-untracked', '--message', `hbx-deploy-${formatTimestamp()}`]);
  return true;
}

function restoreStash(stashed) {
  if (stashed) runStep('git', ['stash', 'pop']);
}

function removeNonMasterBranches() {
  const localBranches = lines('git', ['for-each-ref', 'refs/heads', '--format=%(refname:short)']);
  for (const localBranch of localBranches.filter((value) => value !== branch)) {
    runStep('git', ['branch', '-D', localBranch]);
  }

  const remoteBranches = lines('git', ['for-each-ref', `refs/remotes/${remote}`, '--format=%(refname:short)'])
    .filter((value) => value.startsWith(`${remote}/`))
    .map((value) => value.slice(remote.length + 1))
    .filter((value) => value && value !== 'HEAD' && value !== branch);

  for (const remoteBranch of remoteBranches) {
    runStep('git', ['push', remote, '--delete', remoteBranch]);
  }

  runStep('git', ['fetch', remote, '--prune']);
}

function syncMaster(cleanBranches) {
  ensureMaster();
  const stashed = stashBeforePull();
  try {
    runStep('git', ['fetch', remote, '--prune']);
    runStep('git', ['pull', '--ff-only', remote, branch]);
    if (cleanBranches) removeNonMasterBranches();
  } finally {
    restoreStash(stashed);
  }
}

function commitEverything(label) {
  runStep('git', ['add', '-A']);
  const staged = runStep('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.status === 0) {
    console.log('Nenhuma mudança local para commitar.');
    return false;
  }

  runStep('git', ['commit', '-m', `chore: ${label} ${formatTimestamp()}`]);
  return true;
}

function changedFilesAheadOfRemote() {
  return lines('git', ['diff', '--name-only', `${remote}/${branch}..HEAD`]);
}

function classifyServices(filePaths) {
  const services = new Set();
  const requiresFullDeploy = filePaths.some((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    return [
      'docker-compose.hostinger.yml',
      'docker-compose.frontend.yml',
      'docker-compose.yml',
      'frontend/Dockerfile',
      'backend/Dockerfile',
      'hbx-scraping-engine/Dockerfile',
    ].includes(normalized);
  });

  for (const filePath of filePaths) {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith('frontend/')) services.add('frontend');
    if (normalized.startsWith('backend/')) services.add('backend');
    if (normalized.startsWith('webscraping/')) services.add('webscraping');
    if (normalized.startsWith('hbx-scraping-engine/')) services.add('engines');
    if (normalized.startsWith('Webwhats/')) services.add('webwhats');
  }

  return {
    full: requiresFullDeploy,
    services: [...services],
  };
}

function loadConfig() {
  const env = resolveOperationsEnv();
  return {
    sshHost: requireEnv(env, 'HOSTINGER_SSH_HOST'),
    sshUser: requireEnv(env, 'HOSTINGER_SSH_USER'),
    sshPort: String(env.HOSTINGER_SSH_PORT || '').trim(),
    appDir: requireEnv(env, 'HOSTINGER_APP_DIR'),
    androidApkRemotePath: String(
      env.HOSTINGER_ANDROID_LOGISTICA_APK_PATH || '/var/www/hbx-downloads/hbx-logistica.apk',
    ).trim(),
    androidApkUrl: String(
      env.NEXT_PUBLIC_ANDROID_APK_URL || 'https://www.hbxsystem.com.br/download/android-logistica',
    ).trim(),
  };
}

function buildAndroidApk() {
  if (process.platform === 'win32') {
    // gradlew.bat pelo CAMINHO ABSOLUTO: ambientes com NoDefaultCurrentDirectoryInExePath=1
    // (sandbox/hardening) fazem o cmd.exe ignorar o diretório atual, então o nome puro
    // "gradlew.bat" não é encontrado mesmo com cwd correto. Caminho absoluto resolve sempre.
    runStep(
      process.env.comspec || 'cmd.exe',
      ['/d', '/s', '/c', path.join(androidProjectDir, 'gradlew.bat'), ':app:assembleLogisticaRelease', '--stacktrace'],
      { cwd: androidProjectDir },
    );
  } else {
    runStep('./gradlew', [':app:assembleLogisticaRelease', '--stacktrace'], { cwd: androidProjectDir });
  }

  if (!fs.existsSync(androidApkPath)) {
    throw new Error(`APK Android não foi gerado em ${androidApkPath}.`);
  }

  const stat = fs.statSync(androidApkPath);
  if (!stat.isFile() || stat.size < 100_000) {
    throw new Error(`APK Android inválido: ${androidApkPath} (${stat.size} bytes).`);
  }

  const sha256 = sha256File(androidApkPath);
  console.log(`APK Android pronto: ${stat.size} bytes, SHA-256 ${sha256}.`);
  return { filePath: androidApkPath, sha256, size: stat.size };
}

function buildRemoteScript(config, fullDeploy, services) {
  const compose = 'docker compose --env-file .env -f docker-compose.hostinger.yml';
  const frontendCompose = 'docker compose --env-file .env -f docker-compose.frontend.yml';
  const engineArgs = ['hbx-scraping-engine', ...engineServices].join(' ');
  const lines = [
    'set -euo pipefail',
    `APP_DIR=${shellQuote(config.appDir)}`,
    'cd "$APP_DIR"',
    'git fetch origin master',
    'git checkout master',
    'git reset --hard origin/master',
    'wait_backend() { for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3000/health >/dev/null; then return 0; fi; sleep 3; done; docker logs --tail 120 hbx-backend 2>&1 || true; return 1; }',
    'wait_frontend() { for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:3001/ >/dev/null; then return 0; fi; sleep 2; done; docker logs --tail 120 hbx-frontend 2>&1 || true; return 1; }',
    'deploy_webwhats() { if [ -f "$APP_DIR/Webwhats/package.json" ]; then cd "$APP_DIR/Webwhats"; npm ci --no-audit --no-fund --loglevel=error; npm run build -- --silent; node runWithProvider.js "npx prisma generate --schema ./prisma/DATABASE_PROVIDER-schema.prisma --no-hints"; npm run db:deploy; cd "$APP_DIR"; fi; systemctl restart webwhats; systemctl is-active --quiet webwhats; }',
  ];

  if (fullDeploy) {
    lines.push(
      `${compose} build`,
      `docker rm -f hbx-backend webscraping hbx-scraping-engine ${engineServices.join(' ')} 2>/dev/null || true`,
      `${compose} up -d --force-recreate`,
      `${frontendCompose} build frontend`,
      'docker rm -f hbx-frontend frontend 2>/dev/null || true',
      `${frontendCompose} up -d --force-recreate frontend`,
      'deploy_webwhats',
      'systemctl restart nginx',
      'wait_backend',
      'wait_frontend',
    );
  } else {
    if (services.includes('backend')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps backend`, 'wait_backend');
    }
    if (services.includes('webscraping')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps webscraping`);
    }
    if (services.includes('engines')) {
      lines.push(`${compose} up -d --build --force-recreate --no-deps ${engineArgs}`);
    }
    if (services.includes('frontend')) {
      lines.push(`${frontendCompose} up -d --build --force-recreate --no-deps frontend`, 'wait_frontend');
    }
    if (services.includes('webwhats')) {
      lines.push('deploy_webwhats');
    }
    if (!services.length) {
      lines.push('echo "Nenhum serviço de produção foi alterado."');
    }
  }

  lines.push('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
  return lines.join('\n');
}

function deploy(config, fullDeploy, services) {
  const sshArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) sshArgs.push('-p', config.sshPort);
  sshArgs.push(`${config.sshUser}@${config.sshHost}`, 'bash', '-s');
  runStep('ssh', sshArgs, { stdin: buildRemoteScript(config, fullDeploy, services) });
}

function publishAndroidApk(config, apk) {
  const remoteDirectory = path.posix.dirname(config.androidApkRemotePath);
  const remoteFileName = path.posix.basename(config.androidApkRemotePath);
  const remoteTemporaryPath = path.posix.join(
    remoteDirectory,
    `.${remoteFileName}.${formatTimestamp()}.tmp`,
  );
  const remoteTarget = `${config.sshUser}@${config.sshHost}`;
  const scpArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) scpArgs.push('-P', config.sshPort);
  scpArgs.push(apk.filePath, `${remoteTarget}:${remoteTemporaryPath}`);
  runStep('scp', scpArgs);

  const sshArgs = ['-o', 'BatchMode=yes'];
  if (config.sshPort) sshArgs.push('-p', config.sshPort);
  sshArgs.push(remoteTarget, 'bash', '-s');

  const verificationUrl = new URL(config.androidApkUrl);
  verificationUrl.searchParams.set('sha256', apk.sha256.slice(0, 12));
  const remoteScript = [
    'set -euo pipefail',
    `APK_TMP=${shellQuote(remoteTemporaryPath)}`,
    `APK_TARGET=${shellQuote(config.androidApkRemotePath)}`,
    `EXPECTED_SHA256=${shellQuote(apk.sha256)}`,
    `EXPECTED_SIZE=${shellQuote(apk.size)}`,
    `APK_URL=${shellQuote(verificationUrl.toString())}`,
    'cleanup() { rm -f "$APK_TMP"; }',
    'trap cleanup EXIT',
    'test "$(stat -c %s "$APK_TMP")" = "$EXPECTED_SIZE"',
    'test "$(sha256sum "$APK_TMP" | awk \'{print $1}\')" = "$EXPECTED_SHA256"',
    'chmod 0644 "$APK_TMP"',
    'mv -f "$APK_TMP" "$APK_TARGET"',
    'trap - EXIT',
    'PUBLIC_SHA256="$(curl -fsSL --retry 3 --retry-delay 2 "$APK_URL" | sha256sum | awk \'{print $1}\')"',
    'test "$PUBLIC_SHA256" = "$EXPECTED_SHA256"',
    'echo "APK Android publicado e validado: $EXPECTED_SIZE bytes, SHA-256 $EXPECTED_SHA256"',
  ].join('\n');
  runStep('ssh', sshArgs, { stdin: remoteScript });
}

function main(requestedMode) {
  const mode = requestedMode || process.argv[2];
  if (!['full', 'selective'].includes(mode)) {
    throw new Error('Use: node scripts/ops/deploy-vps.js full|selective [--dry-run].');
  }

  const dryRun = process.argv.includes('--dry-run');
  ensureMaster();
  const config = loadConfig();

  if (dryRun) {
    const plan = classifyServices(changedFilesAheadOfRemote());
    console.log(JSON.stringify({
      mode,
      full: mode === 'full' || plan.full,
      services: plan.services,
      androidApk: true,
    }, null, 2));
    return;
  }

  syncMaster(mode === 'full');
  commitEverything(mode === 'full' ? 'publish' : 'new');
  const changedFiles = changedFilesAheadOfRemote();
  const plan = classifyServices(changedFiles);
  const androidApk = buildAndroidApk();
  runStep('git', ['push', remote, branch]);
  deploy(config, mode === 'full' || plan.full, plan.services);
  publishAndroidApk(config, androidApk);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = { main };
