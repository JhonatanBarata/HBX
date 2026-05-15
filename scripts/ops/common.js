'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  formatTimestamp,
  loadEnvFromFiles,
  repoRoot,
  run,
} = require('../lib/runtime');

const remote = 'origin';
const branch = 'master';

function logStage(title) {
  console.log(`\n=== ${title} ===`);
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

function runOptionalStep(command, args, options = {}) {
  const result = runStep(command, args, { ...options, allowFailure: true });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    console.log(`Aviso: comando opcional falhou (${[command, ...args].join(' ')}).`);
    if (details) console.log(details);
  }
  return result;
}

function powershellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stopLocalWorkspaceNodeProcesses() {
  if (process.platform !== 'win32') return;

  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$repo = ${powershellSingleQuote(repoRoot)}`,
    '$repoPattern = [regex]::Escape($repo)',
    '$targets = Get-CimInstance Win32_Process | Where-Object {',
    '  $_.Name -eq "node.exe" -and',
    '  $_.CommandLine -and',
    '  $_.CommandLine -match $repoPattern -and',
    '  ($_.CommandLine -match "\\\\backend\\\\" -or $_.CommandLine -match "\\\\frontend\\\\" -or $_.CommandLine -match "\\\\.next\\\\" -or $_.CommandLine -match "ts-node-dev" -or $_.CommandLine -match "next\\\\dist")',
    '}',
    'foreach ($target in $targets) {',
    '  Write-Host ("Stopping local workspace node process pid={0}" -f $target.ProcessId)',
    '  Stop-Process -Id $target.ProcessId -Force',
    '}',
  ].join('\n');

  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (output) console.log(output);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Falha ao liberar processos Node locais antes do build: ${output || `status ${result.status}`}`);
  }
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

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getStatusShort() {
  const result = runStep('git', ['status', '--short'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function printStatus() {
  const result = runStep('git', ['status', '--short', '--branch'], { captureOutput: true });
  const output = String(result.stdout || '').trim();
  console.log(output || 'Working tree clean.');
  return output;
}

function printChangedFiles() {
  const status = getStatusShort();
  if (!status) {
    console.log('Arquivos alterados: nenhum.');
    return [];
  }
  const files = status
    .split(/\r?\n/)
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  console.log('Arquivos alterados:');
  for (const file of files) console.log(`- ${file}`);
  return files;
}

function printDiffSummary() {
  const result = runStep('git', ['diff', '--stat'], { captureOutput: true, allowFailure: true });
  const output = String(result.stdout || '').trim();
  console.log(output || 'Sem diff unstaged/staged.');
}

function ensureMasterBranch() {
  const result = runStep('git', ['branch', '--show-current'], { captureOutput: true });
  const current = String(result.stdout || '').trim();
  if (current !== branch) {
    throw new Error(`Operacao permitida apenas em ${branch}. Branch atual: ${current || '(detached HEAD)'}`);
  }
}

function getHead() {
  const result = runStep('git', ['rev-parse', 'HEAD'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function getLatestCommitLine() {
  const result = runStep('git', ['log', '-1', '--oneline'], { captureOutput: true });
  return String(result.stdout || '').trim();
}

function autoCommitIfNeeded(label) {
  const headBefore = getHead();
  const message = `chore: ${label} ${formatTimestamp()}`;
  runStep('node', ['./scripts/commit.js', '--message', message], { env: quietToolEnv() });
  const headAfter = getHead();
  return {
    created: headBefore !== headAfter,
    message,
    commitLine: headBefore !== headAfter ? getLatestCommitLine() : '',
  };
}

function ensureCleanWorkingTree(label = 'HBX') {
  const result = runStep('git', ['status', '--short'], { captureOutput: true });
  const status = String(result.stdout || '').trim();

  if (!status) {
    console.log(`${label} working tree clean after automatic commit.`);
    return;
  }

  console.log(status);
  throw new Error(`Commit automatico nao deixou a arvore ${label} limpa. Push/deploy abortado.`);
}

function pushMaster() {
  runStep('git', ['push', remote, branch], { env: quietToolEnv() });
}

function validatePackageJsonFiles() {
  const files = ['package.json', 'backend/package.json', 'frontend/package.json'];
  for (const file of files) {
    JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  }
  console.log(`package.json validos: ${files.join(', ')}`);
}

function runQuickValidations() {
  logStage('Validacoes rapidas');
  validatePackageJsonFiles();
  const env = quietToolEnv();
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate'], { env });
  runOptionalStep('docker', ['compose', '-f', 'docker-compose.yml', 'config', '--quiet']);
  runOptionalStep('docker', ['compose', '-f', 'docker-compose.hostinger.yml', 'config', '--quiet']);
}

function runBuildValidations() {
  logStage('Build local');
  stopLocalWorkspaceNodeProcesses();
  const env = quietToolEnv();
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:generate'], { env });
  runStep('npm', ['--prefix', 'backend', 'run', 'prisma:validate'], { env });
  runStep('npm', ['--prefix', 'backend', 'run', 'build'], { env });
  runStep('npm', ['--prefix', 'frontend', 'run', 'build'], { env });
}

async function requestWithRetry(url, options = {}) {
  const timeoutSeconds = Math.max(20, Number(process.env.HBX_OPS_VERIFY_TIMEOUT_SECONDS || '120'));
  const intervalMs = Math.max(1000, Number(process.env.HBX_OPS_VERIFY_INTERVAL_MS || '5000'));
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutSeconds * 1000) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} em ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw lastError || new Error(`Timeout verificando ${url}`);
}

async function verifyBasicHealth(env = loadOperationsEnv()) {
  logStage('Health final');
  const backendUrl = normalizeUrl(env.PROD_BACKEND_URL);
  const frontendUrl = normalizeUrl(env.PROD_FRONTEND_URL);
  if (!backendUrl || !frontendUrl) {
    throw new Error('Defina PROD_BACKEND_URL e PROD_FRONTEND_URL em .env.production.local/.env.ops.local para validar o servidor.');
  }

  const healthUrl = `${backendUrl}/health`;
  console.log(`> GET ${healthUrl}`);
  const backend = await requestWithRetry(healthUrl, { method: 'GET' });
  console.log(`Backend OK: HTTP ${backend.status}`);

  console.log(`> GET ${frontendUrl}`);
  const frontend = await requestWithRetry(frontendUrl, { method: 'GET' });
  console.log(`Frontend OK: HTTP ${frontend.status}`);

  const loginUrl = `${frontendUrl}/login`;
  console.log(`> GET ${loginUrl}`);
  const login = await requestWithRetry(loginUrl, { method: 'GET' });
  const loginHtml = await login.text();
  if (!loginHtml.includes('login-card') || loginHtml.includes('Ocorreu um erro')) {
    throw new Error(`Login check failed: /login respondeu HTTP ${login.status}, mas nao renderizou o markup esperado.`);
  }
  console.log(`Login OK: HTTP ${login.status}`);

  return { backendUrl, frontendUrl, healthUrl, loginUrl };
}

function verifyHostingerRuntime(env = loadOperationsEnv()) {
  const sshHost = String(env.HOSTINGER_SSH_HOST || '').trim();
  const sshUser = String(env.HOSTINGER_SSH_USER || '').trim();
  const appDir = String(env.HOSTINGER_APP_DIR || '').trim();
  if (!sshHost || !sshUser || !appDir) {
    console.log('Hostinger runtime check pulado: HOSTINGER_SSH_HOST, HOSTINGER_SSH_USER ou HOSTINGER_APP_DIR ausente.');
    return null;
  }

  logStage('Runtime Hostinger');
  const remoteScript = [
    'set -eu',
    `APP_DIR=${shellSingleQuote(appDir)}`,
    'cd "$APP_DIR"',
    'docker inspect hbx-frontend >/dev/null 2>&1 || { echo "ERRO: container Docker hbx-frontend nao encontrado."; exit 1; }',
    'docker inspect -f "{{.State.Running}}" hbx-frontend | grep -q true || { echo "ERRO: container Docker hbx-frontend nao esta running."; docker logs --tail 80 hbx-frontend 2>&1 || true; exit 1; }',
    'curl -fsSI http://127.0.0.1:3001/login >/dev/null || { echo "ERRO: frontend local /login nao respondeu."; docker logs --tail 80 hbx-frontend 2>&1 || true; exit 1; }',
    'curl -fsSI http://127.0.0.1:3001 >/dev/null || { echo "ERRO: frontend local / nao respondeu."; docker logs --tail 80 hbx-frontend 2>&1 || true; exit 1; }',
    'if docker inspect hbx-backend >/dev/null 2>&1; then docker inspect -f "{{.State.Running}}" hbx-backend | grep -q true || { echo "ERRO: hbx-backend existe mas nao esta running."; exit 1; }; fi',
    'if docker inspect hbx-postgres >/dev/null 2>&1; then docker inspect -f "{{.State.Running}}" hbx-postgres | grep -q true || { echo "ERRO: hbx-postgres existe mas nao esta running."; exit 1; }; fi',
    'echo "Hostinger runtime OK: Docker hbx-frontend running, /login local respondendo."',
  ].join('\n');

  runStep('ssh', [`${sshUser}@${sshHost}`, 'bash', '-lc', shellSingleQuote(remoteScript)], {
    label: `ssh ${sshUser}@${sshHost} runtime health`,
  });
  return true;
}

function copyIfExists(source, targetDir) {
  const absolute = path.join(repoRoot, source);
  if (!fs.existsSync(absolute)) return null;
  const target = path.join(targetDir, source.replace(/[\\/]/g, '__'));
  fs.copyFileSync(absolute, target);
  return target;
}

function findEnvFiles() {
  const candidates = [
    '.env',
    '.env.local',
    '.env.production.local',
    '.env.ops.local',
    '.env.operations.local',
    'backend/.env',
    'backend/.env.local',
    'backend/.env.production.local',
    'frontend/.env.local',
    'frontend/.env.production.local',
  ];
  return candidates.filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

function createLocalOpsBackup() {
  const timestamp = formatTimestamp();
  const backupDir = path.join(repoRoot, 'backups', 'ops', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const diffPath = path.join(backupDir, 'git-diff.patch');
  const diffResult = spawnSync('git', ['diff', '--binary'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fs.writeFileSync(diffPath, diffResult.stdout || '', 'utf8');
  if (diffResult.status !== 0) {
    fs.writeFileSync(path.join(backupDir, 'git-diff.error.log'), diffResult.stderr || '', 'utf8');
  }

  const copied = [];
  for (const file of [
    'package.json',
    'package-lock.json',
    'backend/package.json',
    'backend/package-lock.json',
    'frontend/package.json',
    'frontend/package-lock.json',
    'docker-compose.yml',
    'docker-compose.hostinger.yml',
  ]) {
    const copiedPath = copyIfExists(file, backupDir);
    if (copiedPath) copied.push(path.basename(copiedPath));
  }

  for (const file of findEnvFiles()) {
    const copiedPath = copyIfExists(file, backupDir);
    if (copiedPath) copied.push(path.basename(copiedPath));
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    diff: path.basename(diffPath),
    copiedFiles: copied,
    envFilesStored: findEnvFiles(),
    secretsPrinted: false,
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Backup local criado em ${backupDir}`);
  console.log(`Arquivos .env copiados para backup local: ${manifest.envFilesStored.length}. Segredos nao foram impressos.`);
  return backupDir;
}

function createDatabaseBackupIfAvailable() {
  try {
    const { createProductionBackup } = require('../backup-prod');
    const result = createProductionBackup();
    if (result.ok) {
      console.log(`Dump de banco criado: ${result.backupDir} (${result.dumpBytes} bytes)`);
    } else {
      console.log(`Dump de banco pulado: ${result.reason}`);
    }
    return result;
  } catch (error) {
    console.log(`Dump de banco indisponivel: ${error && error.message ? error.message : error}`);
    return null;
  }
}

function printFinalStatus(extra = {}) {
  logStage('Status final');
  const commit = getLatestCommitLine();
  console.log(`Commit HEAD: ${commit}`);
  if (extra.commitCreated !== undefined) {
    console.log(`Commit criado: ${extra.commitCreated ? 'sim' : 'nao'}`);
  }
  if (extra.backendUrl) console.log(`API health: ${extra.healthUrl || `${extra.backendUrl}/health`}`);
  if (extra.frontendUrl) console.log(`Frontend: ${extra.frontendUrl}`);
  printStatus();
}

module.exports = {
  autoCommitIfNeeded,
  createDatabaseBackupIfAvailable,
  createLocalOpsBackup,
  ensureCleanWorkingTree,
  ensureMasterBranch,
  loadOperationsEnv,
  logStage,
  printChangedFiles,
  printDiffSummary,
  printFinalStatus,
  printStatus,
  pushMaster,
  quietToolEnv,
  remote,
  repoRoot,
  runBuildValidations,
  runQuickValidations,
  runStep,
  verifyBasicHealth,
  verifyHostingerRuntime,
};
