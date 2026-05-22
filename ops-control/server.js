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
const vpsHostRoot = process.env.OPS_CONTROL_VPS_HOST_ROOT || process.env.OPS_CONTROL_HOST_ROOT || '/root/HBX';
const localHostRoot = process.env.OPS_CONTROL_LOCAL_HOST_ROOT || path.resolve(__dirname, '..');
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

function hasSshConfig() {
  return Boolean(sshConfig.host && (sshConfig.password || sshConfig.privateKey));
}

function runForEnvironment(environment, command, args, options = {}) {
  if (environment === 'vps') {
    if (!hasSshConfig()) {
      return Promise.resolve({ ok: false, code: 1, stdout: '', stderr: 'VPS sem credenciais SSH configuradas no Ops Control.' });
    }
    const remoteCommand = [command, ...args].map(shellQuote).join(' ');
    return runSshCommand(remoteCommand, options);
  }
  return runLocal(command, args, options);
}

function environmentLabel(environment) {
  return environment === 'vps' ? 'VPS' : 'localhost';
}

function environmentRoot(environment) {
  return environment === 'vps' ? vpsHostRoot : localHostRoot;
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

async function getContainersForEnvironment(environment) {
  const [psResult, statsResult] = await Promise.all([
    runForEnvironment(environment, 'docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}'], { timeout: 20000 }),
    runForEnvironment(environment, 'docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'], { timeout: 30000 }),
  ]);

  if (!psResult.ok) {
    return { containers: [], errors: [psResult.stderr || 'Docker indisponivel.'] };
  }

  const statsByName = new Map();
  statsResult.stdout.split('\n').filter(Boolean).map(parseStats).forEach((item) => statsByName.set(item.name, item));

  return {
    containers: psResult.stdout.split('\n').filter(Boolean).map(parseDockerPs).map((container) => ({
      ...container,
      cpu: statsByName.get(container.name)?.cpu || '',
      memUsage: statsByName.get(container.name)?.memUsage || '',
      memPercent: statsByName.get(container.name)?.memPercent || '',
      pids: statsByName.get(container.name)?.pids || '',
    })),
    errors: statsResult.ok ? [] : [statsResult.stderr || 'Docker stats indisponivel.'],
  };
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

function findContainer(containers, candidates) {
  return containers.find((item) => candidates.includes(item.name)) || null;
}

function findEngineContainers(containers) {
  return containers.filter((item) => /^hbx-engine-\d+$/.test(item.name || '') || item.name === 'hbx-scraping-engine');
}

function radarAuditState(container) {
  if (!container) return { state: 'not_found', label: 'nao encontrado', className: 'status-not-found' };
  const state = String(container.state || '').toLowerCase();
  if (state === 'running') return { state, label: 'rodando', className: 'status-running' };
  if (state === 'restarting') return { state, label: 'reiniciando', className: 'status-restarting' };
  return { state: state || 'unknown', label: 'parado', className: 'status-exited' };
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function summarizeLogSignals(logText) {
  const lines = String(logText || '').split('\n').map(stripAnsi).filter(Boolean);
  const interesting = lines.filter((line) => /radar|webscraping|quota|limit|blocked|bloque|entitlement|vendas|engine|motor|duplicate|duplicado|negative|negativ|denied|denied|failed|erro|error/i.test(line));
  const socialLines = lines.filter((line) => /radar-social|social|instagram|facebook|enrichment|enriquec/i.test(line)).slice(-60);
  const last = interesting.slice(-80);
  const blockers = [];
  const addBlocker = (kind, message) => {
    if (!blockers.some((item) => item.kind === kind && item.message === message)) blockers.push({ kind, message });
  };

  for (const line of last) {
    if (/quota|limit|daily|card_limit|vendas_card_limit|vendas_stock_limit/i.test(line)) addBlocker('quota', 'Backend indicou limite, quota ou estoque comercial.');
    if (/entitlement|plano|plan|role_blocked|403|unauthorized|forbidden/i.test(line)) addBlocker('acesso', 'Backend indicou bloqueio de plano, permissao ou autorizacao.');
    if (/duplicate|duplicado/i.test(line)) addBlocker('duplicado', 'Resultados foram recusados por duplicidade.');
    if (/negative|negativ|denied|blocked|bloque|do_not_contact|opt_out/i.test(line)) addBlocker('negativo', 'Lead ou empresa caiu em regra negativa/bloqueada.');
    if (/motor HBX falhou|todos os motores tentados falharam|engine.*failed|timeout|ECONN|ENOTFOUND|offline/i.test(line)) addBlocker('motor', 'Motor HBX falhou, ficou offline ou estourou tempo.');
    if (/persist|RadarLeadPool|database|prisma|P20\d\d|salvar|save/i.test(line) && /erro|error|failed|falha/i.test(line)) addBlocker('banco', 'Backend pode ter recebido resultado, mas falhou ao persistir no banco.');
  }

  return {
    lines: last,
    socialLines,
    blockers: blockers.slice(0, 8),
  };
}

function inferDatabaseBlockers(dbAudit) {
  const blockers = [];
  const addBlocker = (blocker) => {
    if (!blockers.some((item) => item.kind === blocker.kind && item.message === blocker.message)) blockers.push(blocker);
  };
  const runs = dbAudit?.data?.recentRuns || [];
  for (const run of runs.slice(0, 8)) {
    const status = String(run?.status || '').toLowerCase();
    const batch = String(run?.lastBatchStatus || '').toLowerCase();
    const error = String(run?.errorMessage || run?.lastBatchError || '').toLowerCase();
    if (status === 'failed') addBlocker({ kind: 'motor', message: `Busca falhou: ${run.errorMessage || run.lastBatchError || 'sem detalhe'}` });
    if (batch.includes('vendas_stock_limit') || batch.includes('card_limit') || error.includes('vendas ja esta') || error.includes('vendas já está')) {
      addBlocker(buildRunImportExplanation(run));
    }
    if (error.includes('quota') || error.includes('limite') || error.includes('limit')) addBlocker({ kind: 'quota', message: run.errorMessage || 'Backend indicou limite comercial.' });
    if (Number(run?.duplicateCount || 0) > 0) addBlocker({ kind: 'duplicado', message: `Busca teve ${run.duplicateCount} duplicado(s) recusado(s).` });
    if (Number(run?.skippedCount || 0) > 0) addBlocker({ kind: 'negativo', message: `Busca teve ${run.skippedCount} item(ns) pulado(s) por regra de qualidade ou bloqueio.` });
  }
  if (Number(dbAudit?.data?.blocked24h || 0) > 0) addBlocker({ kind: 'quota', message: `${dbAudit.data.blocked24h} bloqueio(s) registrado(s) no WebscrapingUsageLog em 24h.` });
  if (Number(dbAudit?.data?.negativeStates || 0) > 0) addBlocker({ kind: 'negativo', message: `${dbAudit.data.negativeStates} estado(s) negativo(s) preservados no Radar.` });
  return blockers.slice(0, 8);
}

function countNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function parseVendasTargetMessage(message) {
  const match = String(message || '').match(/(\d+)\s+de\s+(\d+)\s+card/i);
  if (!match) return null;
  return {
    current: countNumber(match[1]),
    target: countNumber(match[2]),
  };
}

function buildRunImportExplanation(run) {
  const found = countNumber(run?.foundCount);
  const imported = countNumber(run?.importedCount);
  const duplicate = countNumber(run?.duplicateCount);
  const skipped = countNumber(run?.skippedCount);
  const requested = countNumber(run?.targetQuantity);
  const notImported = Math.max(0, found - imported);
  const explicitlyRejected = duplicate + skipped;
  const unexplained = Math.max(0, notImported - explicitlyRejected);
  const targetMessage = parseVendasTargetMessage(run?.errorMessage);
  const alreadyInVendas = targetMessage ? Math.max(0, targetMessage.current - imported) : Math.max(0, requested - imported);
  const details = [
    `Pedido: ${requested || '-'} card(s).`,
    `Motor/backend acharam: ${found} card(s).`,
    `Entraram em Vendas nesta tentativa: ${imported} card(s).`,
  ];

  if (duplicate) details.push(`Recusados por duplicidade: ${duplicate}.`);
  if (skipped) details.push(`Pulados por regra de qualidade/bloqueio: ${skipped}.`);

  if (targetMessage) {
    details.push(`Vendas terminou com ${targetMessage.current}/${targetMessage.target} card(s).`);
    if (alreadyInVendas > 0) details.push(`Isso indica ${alreadyInVendas} card(s) ja existentes em Vendas antes/durante a tentativa.`);
  }

  if (unexplained > 0 && targetMessage) {
    details.push(`${unexplained} card(s) encontrados nao foram negados; ficaram de fora porque o alvo de Vendas ja estava completo.`);
  } else if (unexplained > 0) {
    details.push(`${unexplained} card(s) ficaram sem motivo detalhado salvo no run; precisa abrir itens/logs da busca.`);
  }

  return {
    kind: 'quota',
    title: 'Conta da importacao',
    message: targetMessage
      ? `Nao parece que negou ${notImported}; importou ${imported} e parou porque Vendas ja estava em ${targetMessage.current}/${targetMessage.target}.`
      : `Achou ${found}, importou ${imported}; ${notImported} nao entraram nesta tentativa.`,
    details,
    numbers: {
      requested,
      found,
      imported,
      duplicate,
      skipped,
      notImported,
      explicitlyRejected,
      unexplained,
      alreadyInVendas,
      vendasCurrent: targetMessage?.current || null,
      vendasTarget: targetMessage?.target || null,
    },
  };
}

function buildRunBreakdown(run) {
  if (!run) return null;
  const explanation = buildRunImportExplanation(run);
  return {
    id: run.id,
    city: run.city || null,
    state: run.state || null,
    segment: run.segment || null,
    status: run.status || null,
    lastBatchStatus: run.lastBatchStatus || null,
    errorMessage: run.errorMessage || null,
    ...explanation,
  };
}

function humanizeJsonishText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join('; ');
    if (parsed && typeof parsed === 'object') return Object.values(parsed).filter(Boolean).join('; ');
  } catch (error) {
    // Keep the original text when it is not JSON.
  }
  return text.replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, '; ');
}

function explainSocialEnrichment(row) {
  const status = String(row?.enrichmentStatus || '').trim().toLowerCase();
  const socialStatus = String(row?.socialStatus || '').trim().toLowerCase();
  const error = String(row?.enrichmentError || '').trim();
  const hasInstagram = Boolean(row?.hasInstagram || row?.instagramUrl);
  const hasFacebook = Boolean(row?.hasFacebook || row?.facebookUrl);
  const confidence = Number(row?.socialConfidence ?? row?.enrichmentSocialConfidence ?? 0) || 0;
  const websiteStatus = String(row?.enrichmentWebsiteStatus || row?.websiteStatus || '').trim().toLowerCase();
  const problems = humanizeJsonishText(row?.detectedProblems || row?.rejectReasons || row?.qualityReason || '');

  if (hasInstagram || hasFacebook || socialStatus === 'found') {
    return confidence > 0
      ? `Social encontrado com confianca ${confidence}.`
      : 'Social encontrado, mas sem score de confianca registrado.';
  }
  if (status === 'queued') return 'Ainda nao processou enriquecimento social.';
  if (status === 'running') return 'Enriquecimento ainda esta rodando.';
  if (status === 'failed') return error ? `Enriquecimento falhou: ${error}` : 'Enriquecimento falhou sem detalhe salvo.';
  if (websiteStatus === 'none' || websiteStatus === 'missing') return 'Sem site publico para procurar links sociais.';
  if (websiteStatus === 'unreachable' || websiteStatus === 'broken') return 'Site existe, mas nao abriu para extrair Instagram/Facebook.';
  if (socialStatus === 'weak') return 'Achou sinal social fraco, mas a confianca ficou baixa para aprovar.';
  if (problems) return `Sem social aprovado. Sinais do lead: ${problems}`;
  return 'Nao encontrou Instagram/Facebook publico com confianca suficiente.';
}

async function getContainerLogsForEnvironment(environment, containerName, tail = 260) {
  if (!containerName || !validateName(containerName)) return { ok: false, stdout: '', stderr: 'Container invalido.' };
  return runForEnvironment(environment, 'docker', ['logs', '--tail', String(tail), containerName], { timeout: 20000, maxBuffer: 1024 * 1024 * 5 });
}

async function collectPostgresRadarAudit(environment, containers) {
  const candidates = ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'];
  const container = findContainer(containers, candidates);
  if (!container) return { available: false, message: 'Postgres nao encontrado nos containers deste ambiente.' };

  const sql = `
SELECT json_build_object(
  'recentRuns', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
    SELECT id,status,city,state,segment,engine,"targetQuantity","foundCount","importedCount","duplicateCount","skippedCount","assignedEngineId","lastBatchStatus","lastBatchError","errorMessage","lastQueryUsed","createdAt","updatedAt"
    FROM "WebscrapingSearchRun"
    ORDER BY "createdAt" DESC
    LIMIT 8
  ) t), '[]'::json),
  'usageLogs', COALESCE((SELECT json_agg(row_to_json(u)) FROM (
    SELECT "eventType",source,city,segment,quantity,"resultCount","reusedCount","fetchedCount",message,"createdAt"
    FROM "WebscrapingUsageLog"
    ORDER BY "createdAt" DESC
    LIMIT 8
  ) u), '[]'::json),
  'itemsByStatus24h', COALESCE((SELECT json_object_agg(status,total) FROM (
    SELECT status, count(*)::int AS total
    FROM "WebscrapingSearchRunItem"
    WHERE "createdAt" >= now() - interval '24 hours'
    GROUP BY status
  ) s), '{}'::json),
  'socialSummary', COALESCE((SELECT json_build_object(
    'totalLeads', count(*)::int,
    'withInstagram', count(*) FILTER (WHERE COALESCE("instagramUrl", '') <> '')::int,
    'withFacebook', count(*) FILTER (WHERE COALESCE("facebookUrl", '') <> '')::int,
    'socialFound', count(*) FILTER (WHERE COALESCE("socialStatus", '') = 'found')::int,
    'socialMissing', count(*) FILTER (WHERE COALESCE("socialStatus", '') IN ('missing', 'unknown', ''))::int,
    'weakSocial', count(*) FILTER (WHERE COALESCE("socialStatus", '') = 'weak')::int,
    'enriched24h', (SELECT count(*)::int FROM "RadarLeadEnrichment" WHERE "updatedAt" >= now() - interval '24 hours'),
    'failed24h', (SELECT count(*)::int FROM "RadarLeadEnrichment" WHERE "enrichmentStatus" = 'failed' AND "updatedAt" >= now() - interval '24 hours')
  ) FROM "RadarLeadPool"), '{}'::json),
  'recentEnrichments', COALESCE((SELECT json_agg(row_to_json(e)) FROM (
    SELECT
      enr."radarLeadId",
      pool.name,
      pool.city,
      pool.state,
      pool.segment,
      pool."socialStatus",
      pool."socialConfidence",
      pool."instagramUrl",
      pool."facebookUrl",
      pool."websiteStatus",
      pool."qualityReason",
      pool."rejectReasons",
      enr."enrichmentStatus",
      enr."enrichmentError",
      enr."checkedAt",
      enr."websiteUrl",
      enr."websiteStatus" AS "enrichmentWebsiteStatus",
      enr."hasWebsite",
      enr."hasInstagram",
      enr."hasFacebook",
      enr."detectedProblems",
      enr."detectedAssets",
      enr."opportunityReason",
      enr."miniAuditSummary",
      enr."updatedAt"
    FROM "RadarLeadEnrichment" enr
    LEFT JOIN "RadarLeadPool" pool ON pool.id = enr."radarLeadId"
    ORDER BY enr."updatedAt" DESC
    LIMIT 10
  ) e), '[]'::json),
  'blocked24h', COALESCE((SELECT count(*)::int FROM "WebscrapingUsageLog" WHERE "eventType" ILIKE 'BLOCKED%' AND "createdAt" >= now() - interval '24 hours'), 0),
  'negativeStates', COALESCE((SELECT count(*)::int FROM "RadarLeadCompanyState" WHERE status IN ('negative','denied','blocked','opt_out','discarded','complaint','no_answer','no_whatsapp','invalid_whatsapp','hidden')), 0)
)::text;
`.trim().replace(/\s+/g, ' ');

  const script = `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc ${shellQuote(sql)}`;
  const result = await runForEnvironment(environment, 'docker', ['exec', container.name, 'sh', '-lc', script], { timeout: 20000, maxBuffer: 1024 * 1024 * 4 });
  if (!result.ok) {
    return {
      available: false,
      container: container.name,
      message: result.stderr || 'Nao foi possivel consultar o Postgres pelo container.',
    };
  }

  try {
    return {
      available: true,
      container: container.name,
      data: JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      available: false,
      container: container.name,
      message: 'Postgres respondeu, mas o JSON de auditoria nao pode ser lido.',
      raw: result.stdout.slice(0, 1000),
    };
  }
}

function buildHumanDecision(input) {
  const { services, dbAudit, blockers, engineContainers } = input;
  const backendRunning = services.backend.state === 'running';
  const motorRunning = engineContainers.some((item) => item.state === 'running');
  const recentRuns = dbAudit?.data?.recentRuns || [];
  const latestRun = recentRuns[0] || null;

  if (!backendRunning) return 'Backend parado: o Radar pode ate ter motor ligado, mas a decisao final nao acontece.';
  if (!motorRunning) return 'Sem motor rodando: o backend pode receber a busca, mas nao tem executor para pesquisar.';
  if (latestRun?.status === 'failed') return 'Ultima busca falhou: verifique erro do run, motor atribuido e logs do backend.';
  if (latestRun?.errorMessage) return `Backend decidiu parar: ${latestRun.errorMessage}`;
  if (Number(dbAudit?.data?.blocked24h || 0) > 0) return 'Existem bloqueios nas ultimas 24h: olhar quota/plano/permissao antes de culpar o motor.';
  if (blockers.some((item) => item.kind === 'motor')) return 'Logs ou banco indicam falha de motor: o backend tentou acionar, mas a execucao quebrou.';
  if (blockers.some((item) => ['quota', 'acesso', 'negativo', 'duplicado'].includes(item.kind))) return 'Backend esta barrando por regra de negocio: motor nao e o principal suspeito.';
  return 'Sem bloqueio critico detectado agora. Use o diagnostico se uma busca especifica barrar.';
}

async function collectRadarAudit(environment) {
  const startedAt = new Date();
  if (!['vps', 'localhost'].includes(environment)) {
    const error = new Error('Ambiente invalido.');
    error.statusCode = 400;
    throw error;
  }
  if (environment === 'vps' && !hasSshConfig()) {
    return {
      environment,
      label: environmentLabel(environment),
      available: false,
      generatedAt: startedAt.toISOString(),
      message: 'Configure OPS_CONTROL_SSH_HOST e senha/chave para auditar a VPS.',
    };
  }

  const { containers, errors } = await getContainersForEnvironment(environment);
  const services = {
    backend: radarAuditState(findContainer(containers, ['hbx-backend', 'backend'])),
    webscraping: radarAuditState(findContainer(containers, ['webscraping', 'hbx-webscraping'])),
    scrapingEngine: radarAuditState(findContainer(containers, ['hbx-scraping-engine'])),
    postgres: radarAuditState(findContainer(containers, ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'])),
  };

  const backendContainer = findContainer(containers, ['hbx-backend', 'backend']);
  const webscrapingContainer = findContainer(containers, ['webscraping', 'hbx-webscraping']);
  const engineContainers = findEngineContainers(containers);
  const [backendLogs, webscrapingLogs, dbAudit] = await Promise.all([
    backendContainer ? getContainerLogsForEnvironment(environment, backendContainer.name) : Promise.resolve({ ok: false, stdout: '', stderr: 'Backend nao encontrado.' }),
    webscrapingContainer ? getContainerLogsForEnvironment(environment, webscrapingContainer.name) : Promise.resolve({ ok: false, stdout: '', stderr: 'Webscraping nao encontrado.' }),
    collectPostgresRadarAudit(environment, containers),
  ]);
  const logSignals = summarizeLogSignals([backendLogs.stdout, backendLogs.stderr, webscrapingLogs.stdout, webscrapingLogs.stderr].filter(Boolean).join('\n'));
  const dbBlockers = inferDatabaseBlockers(dbAudit);
  const runBreakdowns = (dbAudit?.data?.recentRuns || []).slice(0, 6).map(buildRunBreakdown).filter(Boolean);
  const blockers = [...dbBlockers, ...logSignals.blockers].filter((item, index, list) => (
    index === list.findIndex((other) => other.kind === item.kind && other.message === item.message)
  )).slice(0, 8);
  const decision = buildHumanDecision({ services, dbAudit, blockers, engineContainers });
  const runningEngines = engineContainers.filter((item) => item.state === 'running').length;
  const latestRun = dbAudit?.data?.recentRuns?.[0] || null;

  const diagnostic = {
    area: 'radar',
    ambiente: environment,
    alvo: environment === 'vps' ? sshConfig.host : 'localhost',
    root: environmentRoot(environment),
    generatedAt: startedAt.toISOString(),
    services,
    engines: {
      total: engineContainers.length,
      running: runningEngines,
    },
    latestRun,
    runBreakdowns: runBreakdowns.slice(0, 3),
    blockers,
    enrichment: {
      summary: dbAudit?.data?.socialSummary || {},
      recent: (dbAudit?.data?.recentEnrichments || []).slice(0, 5).map((row) => ({
        radarLeadId: row.radarLeadId,
        name: row.name || null,
        enrichmentStatus: row.enrichmentStatus || null,
        socialStatus: row.socialStatus || null,
        instagramUrl: row.instagramUrl || null,
        facebookUrl: row.facebookUrl || null,
        reason: explainSocialEnrichment(row),
      })),
    },
    postgres: dbAudit.available ? {
      container: dbAudit.container,
      blocked24h: dbAudit.data.blocked24h,
      itemsByStatus24h: dbAudit.data.itemsByStatus24h,
      negativeStates: dbAudit.data.negativeStates,
    } : {
      available: false,
      message: dbAudit.message,
    },
    decision,
  };

  return {
    environment,
    label: environmentLabel(environment),
    target: environment === 'vps' ? sshConfig.host : 'localhost',
    root: environmentRoot(environment),
    available: errors.length === 0 || containers.length > 0,
    generatedAt: startedAt.toISOString(),
    services,
    engineSummary: {
      total: engineContainers.length,
      running: runningEngines,
      stopped: engineContainers.filter((item) => item.state !== 'running').length,
    },
    latestRun,
    recentRuns: dbAudit?.data?.recentRuns || [],
    runBreakdowns,
    usageLogs: dbAudit?.data?.usageLogs || [],
    socialSummary: dbAudit?.data?.socialSummary || {},
    recentEnrichments: (dbAudit?.data?.recentEnrichments || []).map((row) => ({
      ...row,
      socialReason: explainSocialEnrichment(row),
    })),
    itemsByStatus24h: dbAudit?.data?.itemsByStatus24h || {},
    blocked24h: Number(dbAudit?.data?.blocked24h || 0),
    negativeStates: Number(dbAudit?.data?.negativeStates || 0),
    dbAvailable: Boolean(dbAudit?.available),
    dbMessage: dbAudit?.available ? 'Postgres consultado com sucesso.' : dbAudit?.message,
    blockers: blockers.length ? blockers : [{ kind: 'ok', message: 'Sem bloqueio claro nos logs recentes.' }],
    logLines: logSignals.lines,
    socialLogLines: logSignals.socialLines,
    decision,
    errors,
    diagnostic,
  };
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

app.get('/api/radar-audit/:environment', async (req, res) => {
  try {
    res.json(await collectRadarAudit(req.params.environment));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao auditar Radar.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  const target = targetMode === 'ssh' ? `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}` : 'local';
  console.log(`HBX Ops Control em http://127.0.0.1:${port} controlando ${target}`);
});
