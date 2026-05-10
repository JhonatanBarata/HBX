const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { Client } = require('ssh2');

const app = express();
const port = Number(process.env.OPS_CONTROL_PORT || 3099);
const token = process.env.OPS_CONTROL_TOKEN;
const targetMode = (process.env.OPS_CONTROL_TARGET || 'local').toLowerCase();
const hostRoot = process.env.OPS_CONTROL_HOST_ROOT || (targetMode === 'ssh' ? '/root/HBX' : '/host/hbx');
const safeNamePattern = /^[a-zA-Z0-9_.-]+$/;
const dockerActions = new Set(['start', 'stop', 'restart', 'kill']);

const sshConfig = {
  host: process.env.OPS_CONTROL_SSH_HOST,
  port: Number(process.env.OPS_CONTROL_SSH_PORT || 22),
  username: process.env.OPS_CONTROL_SSH_USER || 'root',
  password: process.env.OPS_CONTROL_SSH_PASSWORD,
  privateKey: process.env.OPS_CONTROL_SSH_PRIVATE_KEY,
  readyTimeout: 20000,
};

if (!token) {
  console.error('OPS_CONTROL_TOKEN e obrigatorio.');
  process.exit(1);
}

if (targetMode === 'ssh' && (!sshConfig.host || (!sshConfig.password && !sshConfig.privateKey))) {
  console.error('Modo SSH exige OPS_CONTROL_SSH_HOST e OPS_CONTROL_SSH_PASSWORD ou OPS_CONTROL_SSH_PRIVATE_KEY.');
  process.exit(1);
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', (req, res, next) => {
  const expected = `Bearer ${token}`;
  if (req.header('authorization') !== expected) {
    return res.status(401).json({ error: 'Token ausente ou invalido.' });
  }
  next();
});

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runLocal(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: options.timeout || 15000,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 4,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function runSshCommand(command, options = {}) {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        resolve({ ok: false, code: 124, stdout: '', stderr: 'Timeout SSH.' });
      }
    }, options.timeout || 15000);

    conn.on('ready', () => {
      conn.exec(command, { env: {} }, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          settled = true;
          conn.end();
          resolve({ ok: false, code: 1, stdout: '', stderr: error.message });
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        const maxBuffer = options.maxBuffer || 1024 * 1024 * 4;

        stream.on('close', (code) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          exitCode = typeof code === 'number' ? code : exitCode;
          conn.end();
          resolve({
            ok: exitCode === 0,
            code: exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        });

        stream.on('data', (data) => {
          if (stdout.length < maxBuffer) stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          if (stderr.length < maxBuffer) stderr += data.toString();
        });
      });
    });

    conn.on('error', (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ ok: false, code: 1, stdout: '', stderr: error.message });
    });

    conn.connect(sshConfig);
  });
}

function run(command, args, options = {}) {
  if (targetMode !== 'ssh') return runLocal(command, args, options);
  const remoteCommand = [command, ...args].map(shellQuote).join(' ');
  return runSshCommand(remoteCommand, options);
}

async function readText(filePath) {
  if (targetMode !== 'ssh') {
    return fs.readFile(filePath, 'utf8')
      .then((value) => ({ ok: true, stdout: value.trim(), stderr: '' }))
      .catch((error) => ({ ok: false, stdout: '', stderr: error.message }));
  }
  return run('cat', [filePath]);
}

function validateName(name) {
  return typeof name === 'string' && safeNamePattern.test(name);
}

function validateRange(from, to) {
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to <= 200 && from <= to && (to - from) <= 49;
}

function parseDockerPs(line) {
  const [name, image, status, state, ports] = line.split('\t');
  return { name, image, status, state, ports };
}

function parseStats(line) {
  const [name, cpu, memUsage, memPercent, pids] = line.split('\t');
  return { name, cpu, memUsage, memPercent, pids };
}

function parseMemory(output) {
  const line = output.split('\n').find((item) => item.toLowerCase().startsWith('mem:'));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const total = Number(parts[1]);
  const used = Number(parts[2]);
  const free = Number(parts[3]);
  return {
    raw: output,
    totalMb: total,
    usedMb: used,
    freeMb: free,
    usedPercent: total ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

function parseDisk(output) {
  const lines = output.trim().split('\n');
  const parts = (lines[1] || '').trim().split(/\s+/);
  return {
    raw: output,
    filesystem: parts[0] || '',
    size: parts[1] || '',
    used: parts[2] || '',
    available: parts[3] || '',
    usedPercent: parts[4] || '',
    mounted: parts[5] || '',
  };
}

function parseTopProcesses(output) {
  return output.trim().split('\n').slice(1).filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/, 5);
    const rssKb = Number(parts[3] || 0);
    return {
      pid: parts[0],
      cpu: parts[1],
      ram: parts[2],
      rssMb: Math.round((rssKb / 1024) * 10) / 10,
      command: parts[4] || '',
    };
  });
}

async function getContainers() {
  const [psResult, statsResult] = await Promise.all([
    run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}'], { timeout: 20000 }),
    run('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'], { timeout: 30000 }),
  ]);

  const statsByName = new Map();
  statsResult.stdout.split('\n').filter(Boolean).map(parseStats).forEach((item) => statsByName.set(item.name, item));

  return psResult.stdout.split('\n').filter(Boolean).map(parseDockerPs).map((container) => ({
    ...container,
    cpu: statsByName.get(container.name)?.cpu || '',
    memUsage: statsByName.get(container.name)?.memUsage || '',
    memPercent: statsByName.get(container.name)?.memPercent || '',
    pids: statsByName.get(container.name)?.pids || '',
  }));
}

async function dockerAction(name, action) {
  if (!validateName(name) || !dockerActions.has(action)) {
    return { status: 'rejected', stdout: '', stderr: 'Nome ou acao invalida.' };
  }
  const result = await run('docker', [action, name], { timeout: 30000 });
  return {
    status: result.ok ? 'ok' : 'error',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function resolveContainerByCandidates(candidates) {
  for (const name of candidates) {
    if (!validateName(name)) continue;
    const exists = await run('docker', ['inspect', name], { timeout: 8000 });
    if (exists.ok) return { status: 'found', name };
  }
  return { status: 'not_found', name: candidates[0], stderr: `Nenhum container encontrado: ${candidates.join(', ')}` };
}

async function firstExistingAction(names, action) {
  const resolved = await resolveContainerByCandidates(names);
  if (resolved.status === 'found') return { name: resolved.name, ...(await dockerAction(resolved.name, action)) };
  return { name: resolved.name, status: 'not_found', stdout: '', stderr: resolved.stderr };
}

async function getHostFolders() {
  if (targetMode !== 'ssh') {
    const entries = await fs.readdir(hostRoot, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const folderPath = path.join(hostRoot, entry.name);
      const files = await fs.readdir(folderPath).catch(() => []);
      return {
        name: entry.name,
        hasPackageJson: files.includes('package.json'),
        hasDockerfile: files.includes('Dockerfile'),
        hasDockerCompose: files.some((file) => /^docker-compose.*\.ya?ml$/.test(file)),
      };
    }));
  }

  const script = [
    `root=${shellQuote(hostRoot)};`,
    'for d in "$root"/*; do',
    '  [ -d "$d" ] || continue;',
    '  name=$(basename "$d");',
    '  pkg=0; dockerfile=0; compose=0;',
    '  [ -f "$d/package.json" ] && pkg=1;',
    '  [ -f "$d/Dockerfile" ] && dockerfile=1;',
    '  ls "$d"/docker-compose*.yml "$d"/docker-compose*.yaml >/dev/null 2>&1 && compose=1;',
    '  printf "%s\\t%s\\t%s\\t%s\\n" "$name" "$pkg" "$dockerfile" "$compose";',
    'done',
  ].join(' ');
  const result = await runSshCommand(script, { timeout: 15000 });
  if (!result.ok) throw new Error(result.stderr || 'Falha ao listar pastas da VPS.');
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [name, hasPackageJson, hasDockerfile, hasDockerCompose] = line.split('\t');
    return {
      name,
      hasPackageJson: hasPackageJson === '1',
      hasDockerfile: hasDockerfile === '1',
      hasDockerCompose: hasDockerCompose === '1',
    };
  });
}

app.get('/api/overview', async (req, res) => {
  const [memory, load, disk, dockerSystemDf, topProcesses, dockerStats, dockerPs, containers] = await Promise.all([
    run('free', ['-m']),
    readText('/proc/loadavg'),
    run('df', ['-h', '/']),
    run('docker', ['system', 'df']),
    run('ps', ['-eo', 'pid,pcpu,pmem,rss,comm', '--sort=-rss']),
    run('docker', ['stats', '--no-stream']),
    run('docker', ['ps', '-a']),
    getContainers(),
  ]);

  res.json({
    targetMode,
    targetHost: targetMode === 'ssh' ? sshConfig.host : 'local',
    generatedAt: new Date().toISOString(),
    memory: parseMemory(memory.stdout),
    load: load.stdout,
    disk: parseDisk(disk.stdout),
    dockerSystemDf: dockerSystemDf.stdout,
    topProcesses: parseTopProcesses(topProcesses.stdout).slice(0, 15),
    containers,
    runningContainers: containers.filter((item) => item.state === 'running').length,
    dockerStats: dockerStats.stdout,
    dockerPs: dockerPs.stdout,
    errors: [memory, load, disk, dockerSystemDf, topProcesses, dockerStats, dockerPs].filter((item) => !item.ok).map((item) => item.stderr),
  });
});

app.get('/api/containers', async (req, res) => {
  res.json({ generatedAt: new Date().toISOString(), containers: await getContainers() });
});

app.get('/api/logs/:name', async (req, res) => {
  const { name } = req.params;
  if (!validateName(name)) return res.status(400).json({ error: 'Nome de container invalido.' });
  const result = await run('docker', ['logs', '--tail', '200', name], { maxBuffer: 1024 * 1024 * 6 });
  res.json({ name, logs: result.stdout, stderr: result.stderr, status: result.ok ? 'ok' : 'error' });
});

for (const action of dockerActions) {
  app.post(`/api/containers/:name/${action}`, async (req, res) => {
    const { name } = req.params;
    if (!validateName(name)) return res.status(400).json({ error: 'Nome de container invalido.' });
    res.json({ name, action, ...(await dockerAction(name, action)) });
  });
}

for (const action of dockerActions) {
  app.post(`/api/engines/${action}-range`, async (req, res) => {
    const from = Number(req.body.from);
    const to = Number(req.body.to);
    if (!validateRange(from, to)) return res.status(400).json({ error: 'Intervalo invalido. Use from/to entre 1 e 200, com no maximo 50 por chamada.' });
    const results = [];
    for (let index = from; index <= to; index += 1) {
      const name = `hbx-engine-${index}`;
      results.push({ name, action, ...(await dockerAction(name, action)) });
    }
    res.json({ from, to, action, results });
  });
}

for (const action of ['start', 'stop', 'restart']) {
  app.post(`/api/watchdog/${action}`, async (req, res) => {
    res.json({ action, ...(await firstExistingAction(['hbx-engine-watchdog', 'hbx-watchdog', 'watchdog'], action)) });
  });
}

const quickTargets = {
  frontend: ['hbx-frontend', 'frontend'],
  backend: ['hbx-backend', 'backend'],
  postgres: ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'],
  webscraping: ['webscraping', 'hbx-webscraping'],
  scrapingEngine: ['hbx-scraping-engine'],
};

app.post('/api/quick/:target/:action', async (req, res) => {
  const target = quickTargets[req.params.target];
  const action = req.params.action;
  if (!target) return res.status(404).json({ error: 'Acao rapida inexistente.' });
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Acao rapida invalida.' });
  res.json({ target: req.params.target, action, ...(await firstExistingAction(target, action)) });
});

app.get('/api/host/folders', async (req, res) => {
  try {
    res.json({ root: hostRoot, folders: await getHostFolders() });
  } catch (error) {
    res.json({ root: hostRoot, folders: [], warning: error.message || 'Raiz do host nao montada ou indisponivel.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  const target = targetMode === 'ssh' ? `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}` : 'local';
  console.log(`HBX Ops Control em http://127.0.0.1:${port} controlando ${target}`);
});
