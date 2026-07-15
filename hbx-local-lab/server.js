'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { runWebQueryProvider } = require('./providers/web-query.provider');
const { runSiteCrawlProvider, configurePacing, getPacingStats } = require('./providers/site-crawl.provider');
const { runDirectoryProbeProvider } = require('./providers/directory-probe.provider');
const { runSocialProbeProvider } = require('./providers/social-probe.provider');
const { writeBatchExport, buildBatchExport } = require('./exporters/hbx-jsonl-exporter');

const LOOPBACK_HOST = '127.0.0.1';

function resolveLocalOnlyHost(value = process.env.HBX_LOCAL_LAB_HOST) {
  const requested = String(value || LOOPBACK_HOST).trim();
  if (requested !== LOOPBACK_HOST) {
    throw new Error(`HBX_LOCAL_LAB_HOST_BLOCKED:${requested}`);
  }
  return LOOPBACK_HOST;
}

const HOST = resolveLocalOnlyHost();
const PORT = Number(process.env.HBX_LOCAL_LAB_PORT || 3098);
const STORAGE_DIR = path.resolve(__dirname, 'storage');
const JOBS_DIR = path.join(STORAGE_DIR, 'jobs');
const ALLOWED_PROVIDERS = new Set(['web_query', 'site_crawl', 'directory_probe', 'social_probe']);
const DEFAULT_PROVIDERS = ['web_query', 'site_crawl'];
const MAX_BODY_BYTES = Math.max(512_000, Number(process.env.HBX_LOCAL_LAB_MAX_BODY_BYTES || 2_000_000) || 2_000_000);
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;

const jobs = new Map();
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'canceled']);

function safeLog(message, meta = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    clean[key] = value;
  }
  console.log(`[local-lab] ${message}`, clean);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function isAuthorizedControlRequest(req, controlToken) {
  if (!controlToken) return false;
  return req.headers.authorization === `Bearer ${controlToken}`;
}

function parsePath(req) {
  return new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Payload muito grande.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('JSON invalido.');
    error.statusCode = 400;
    throw error;
  }
}

function assertNoSecrets(value, pathLabel = '$', depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${pathLabel}[${index}]`, depth + 1));
    return;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      const error = new Error(`Campo nao permitido no payload: ${pathLabel}.${key}`);
      error.statusCode = 400;
      throw error;
    }
    assertNoSecrets(rawValue, `${pathLabel}.${key}`, depth + 1);
  }
}

function compactText(value, maxLength = 300) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeProviders(value) {
  const rawProviders = Array.isArray(value) ? value : DEFAULT_PROVIDERS;
  const providers = rawProviders
    .map((provider) => compactText(provider, 80))
    .filter((provider) => ALLOWED_PROVIDERS.has(provider));
  return providers.length ? Array.from(new Set(providers)) : DEFAULT_PROVIDERS;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeJobInput(body) {
  const targetEmails = Math.max(1, Math.min(10_000, Math.trunc(Number(body.targetEmails || 50) || 50)));
  const aggressive = body.aggressive === true || String(body.mode || '').trim() === 'max_public';
  const maxCandidates = clampInteger(body.maxCandidates || process.env.HBX_LOCAL_LAB_MAX_CANDIDATES, aggressive ? 5000 : 500, 1, 5000);
  const maxPagesPerSite = clampInteger(body.maxPagesPerSite || process.env.HBX_LOCAL_LAB_MAX_PAGES_PER_SITE, aggressive ? 250 : 40, 1, 250);
  const maxDiscoveredLinks = clampInteger(body.maxDiscoveredLinks || process.env.HBX_LOCAL_LAB_MAX_DISCOVERED_LINKS, aggressive ? 1000 : 80, 0, 1000);
  const maxDirectoryUrls = clampInteger(body.maxDirectoryUrls || process.env.HBX_LOCAL_LAB_MAX_DIRECTORY_URLS, aggressive ? 5000 : 300, 0, 5000);
  const maxSocialUrls = clampInteger(body.maxSocialUrls || process.env.HBX_LOCAL_LAB_MAX_SOCIAL_URLS, aggressive ? 5000 : 300, 0, 5000);
  // Ritmo (protege o IP): pausa entre GETs + backoff em bloqueio. Volume infinito, velocidade lenta.
  const minDelayMs = clampInteger(body.minDelayMs ?? process.env.HBX_LOCAL_LAB_MIN_DELAY_MS, 1500, 0, 60_000);
  const maxDelayMs = clampInteger(body.maxDelayMs ?? process.env.HBX_LOCAL_LAB_MAX_DELAY_MS, 4000, minDelayMs, 120_000);
  const blockBackoffMs = clampInteger(body.blockBackoffMs ?? process.env.HBX_LOCAL_LAB_BLOCK_BACKOFF_MS, 60_000, 0, 600_000);
  return {
    city: compactText(body.city, 120),
    state: compactText(body.state, 2).toUpperCase(),
    segment: compactText(body.segment, 180),
    targetEmails,
    mode: ['email_first', 'public_email_only', 'enrich_missing_email', 'max_public'].includes(String(body.mode || ''))
      ? String(body.mode)
      : 'email_first',
    aggressive,
    providers: normalizeProviders(body.providers),
    requestedBy: compactText(body.requestedBy, 160) || null,
    seedUrls: Array.isArray(body.seedUrls) ? body.seedUrls.slice(0, maxCandidates) : [],
    websites: Array.isArray(body.websites) ? body.websites.slice(0, maxCandidates) : [],
    candidates: Array.isArray(body.candidates) ? body.candidates.slice(0, maxCandidates) : [],
    directoryUrls: Array.isArray(body.directoryUrls) ? body.directoryUrls.slice(0, maxDirectoryUrls) : [],
    socialUrls: Array.isArray(body.socialUrls) ? body.socialUrls.slice(0, maxSocialUrls) : [],
    maxCandidates,
    maxPagesPerSite,
    maxDiscoveredLinks,
    maxDirectoryUrls,
    maxSocialUrls,
    minDelayMs,
    maxDelayMs,
    blockBackoffMs,
  };
}

function serializeJob(job) {
  return {
    id: job.id,
    batchId: job.batchId,
    status: job.status,
    city: job.city,
    state: job.state,
    segment: job.segment,
    targetEmails: job.targetEmails,
    mode: job.mode,
    aggressive: Boolean(job.aggressive),
    providers: job.providers,
    maxCandidates: job.maxCandidates,
    maxPagesPerSite: job.maxPagesPerSite,
    maxDiscoveredLinks: job.maxDiscoveredLinks,
    minDelayMs: job.minDelayMs,
    maxDelayMs: job.maxDelayMs,
    blockBackoffMs: job.blockBackoffMs,
    metrics: job.metrics,
    warnings: job.warnings,
    error: job.error,
    exportReady: Boolean(job.exportReady),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

async function persistJob(job) {
  const dir = path.join(JOBS_DIR, job.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'job.json'), JSON.stringify(serializeJob(job), null, 2));
}

async function runProvider(provider, job, context) {
  if (provider === 'web_query') return runWebQueryProvider(job, context);
  if (provider === 'site_crawl') return runSiteCrawlProvider(job, context);
  if (provider === 'directory_probe') return runDirectoryProbeProvider(job, context);
  if (provider === 'social_probe') return runSocialProbeProvider(job, context);
  return {
    provider,
    leads: [],
    emails: [],
    stats: { provider },
    warnings: [`Provider ignorado: ${provider}`],
  };
}

async function processJob(job) {
  if (job.status === 'canceled') return;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  await persistJob(job);
  const abortController = new AbortController();
  job.abortController = abortController;
  const leads = [];
  const emails = [];
  const providerStats = {};
  configurePacing(job);
  try {
    for (const provider of job.providers) {
      if (job.status === 'canceled') break;
      // Progresso INCREMENTAL: o provider chama onProgress a cada página visitada para que o poller
      // (hbx-owner enricher, a cada 3s) veja sitesVisited/emailsFound subir AO VIVO em vez de ficar
      // em 0 até o provider inteiro terminar (lote de 50 sites × 40 páginas × ~2.7s = muitos minutos
      // com a barra parada em 0). As métricas são um snapshot do provider corrente somado ao acumulado.
      const baseSites = job.metrics.sitesVisited;
      const baseEmails = job.metrics.emailsFound;
      const result = await runProvider(provider, job, {
        signal: abortController.signal,
        isCanceled: () => job.status === 'canceled',
        onProgress: (snap) => {
          if (!snap) return;
          job.metrics.sitesVisited = baseSites + Number(snap.pagesVisited || 0);
          job.metrics.emailsFound = baseEmails + Number(snap.emailsFound || 0);
        },
      });
      leads.push(...(Array.isArray(result.leads) ? result.leads : []));
      emails.push(...(Array.isArray(result.emails) ? result.emails : []));
      providerStats[provider] = result.stats || {};
      if (Array.isArray(result.warnings)) job.warnings.push(...result.warnings);
      // Reconcilia com o total final reportado pelo provider (cobre providers sem onProgress).
      job.metrics.sitesVisited = baseSites + Number(result.stats?.pagesVisited || 0);
      job.metrics.emailsFound = baseEmails + Number(result.stats?.emailsFound || 0);
    }
    job.metrics.pacing = getPacingStats();
    if (job.status === 'canceled') {
      job.finishedAt = new Date().toISOString();
      await persistJob(job);
      return;
    }
    const outputDir = path.join(JOBS_DIR, job.id);
    const exported = await writeBatchExport(job, {
      leads,
      emails,
      stats: {
        ...job.metrics,
        providers: job.providers.length,
      },
    }, outputDir);
    job.metrics.leads = exported.leads.length;
    job.metrics.emailsAccepted = exported.emails.length;
    job.metrics.providerStats = providerStats;
    job.exportReady = true;
    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    job.result = {
      manifest: exported.manifest,
      files: exported.files,
    };
    await persistJob(job);
    safeLog('job_completed', { id: job.id, emails: exported.emails.length, leads: exported.leads.length });
  } catch (error) {
    job.status = job.status === 'canceled' ? 'canceled' : 'failed';
    job.error = String(error?.message || error);
    job.finishedAt = new Date().toISOString();
    await persistJob(job);
    safeLog('job_failed', { id: job.id, error: job.error });
  }
}

async function cancelActiveJobs(reason = 'owner_stopped') {
  let canceled = 0;
  for (const job of jobs.values()) {
    if (TERMINAL_JOB_STATUSES.has(job.status)) continue;
    job.status = 'canceled';
    job.error = reason;
    job.finishedAt = new Date().toISOString();
    if (job.abortController) job.abortController.abort();
    await persistJob(job).catch(() => undefined);
    canceled += 1;
  }
  return canceled;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createOwnerWatchdog(options) {
  const parentPid = Number(options?.parentPid);
  if (!Number.isInteger(parentPid) || parentPid <= 0 || parentPid === process.pid) {
    throw new Error('HBX_OWNER_PARENT_PID_REQUIRED');
  }
  const checkIntervalMs = Math.max(100, Number(options?.checkIntervalMs) || 1000);
  const heartbeatTimeoutMs = Math.max(500, Number(options?.heartbeatTimeoutMs) || 15_000);
  const processAlive = options?.processAlive || isProcessAlive;
  const onOwnerLost = options?.onOwnerLost;
  let lastHeartbeatAt = Date.now();
  let stopping = false;
  const timer = setInterval(() => {
    if (stopping) return;
    const parentAlive = processAlive(parentPid);
    const heartbeatFresh = Date.now() - lastHeartbeatAt <= heartbeatTimeoutMs;
    if (parentAlive && heartbeatFresh) return;
    stopping = true;
    Promise.resolve(onOwnerLost?.(parentAlive ? 'owner_heartbeat_expired' : 'owner_process_gone'))
      .catch(() => undefined);
  }, checkIntervalMs);
  timer.unref?.();
  return {
    parentPid,
    heartbeat(value) {
      if (Number(value) !== parentPid || stopping) return false;
      lastHeartbeatAt = Date.now();
      return true;
    },
    stop() {
      stopping = true;
      clearInterval(timer);
    },
    status() {
      return { parentAlive: processAlive(parentPid), heartbeatAgeMs: Date.now() - lastHeartbeatAt, stopping };
    },
  };
}

async function createJob(body) {
  assertNoSecrets(body);
  const input = normalizeJobInput(body || {});
  const id = randomUUID();
  const job = {
    id,
    batchId: `local-lab-${id}`,
    status: 'queued',
    ...input,
    metrics: {
      sitesVisited: 0,
      emailsFound: 0,
      emailsAccepted: 0,
      leads: 0,
    },
    warnings: [],
    error: null,
    exportReady: false,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    result: null,
    abortController: null,
  };
  jobs.set(id, job);
  await persistJob(job);
  setImmediate(() => void processJob(job));
  return serializeJob(job);
}

async function readExport(job, file) {
  const dir = path.join(JOBS_DIR, job.id);
  if (file === 'manifest') return { type: 'application/json; charset=utf-8', body: await fs.readFile(path.join(dir, 'batch-manifest.json'), 'utf8') };
  if (file === 'leads') return { type: 'application/x-ndjson; charset=utf-8', body: await fs.readFile(path.join(dir, 'leads.jsonl'), 'utf8') };
  if (file === 'emails') return { type: 'application/x-ndjson; charset=utf-8', body: await fs.readFile(path.join(dir, 'emails.jsonl'), 'utf8') };
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'batch-manifest.json'), 'utf8'));
  const leadsText = await fs.readFile(path.join(dir, 'leads.jsonl'), 'utf8');
  const emailsText = await fs.readFile(path.join(dir, 'emails.jsonl'), 'utf8');
  const leads = leadsText.trim() ? leadsText.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  const emails = emailsText.trim() ? emailsText.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  return {
    type: 'application/json; charset=utf-8',
    body: JSON.stringify({
      manifest,
      batch: {
        ...manifest,
        leads,
        emails,
      },
      files: {
        manifest: 'batch-manifest.json',
        leads: 'leads.jsonl',
        emails: 'emails.jsonl',
      },
      leadsJsonl: leadsText,
      emailsJsonl: emailsText,
    }, null, 2),
  };
}

async function handleRequest(req, res, options = {}) {
  const url = parsePath(req);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'hbx-local-lab',
        host: HOST,
        port: PORT,
        pid: process.pid,
        ownerControlled: Boolean(options.ownerWatchdog),
      });
    }
    if (!isAuthorizedControlRequest(req, options.controlToken)) {
      return sendJson(res, 401, { error: 'owner_control_required' });
    }
    if (req.method === 'POST' && url.pathname === '/local-lab/owner-heartbeat') {
      const body = await readJsonBody(req);
      if (!options.ownerWatchdog?.heartbeat(body.parentPid)) {
        return sendJson(res, 403, { error: 'owner_parent_mismatch' });
      }
      return sendJson(res, 200, { ok: true });
    }
    // Desligamento limpo, pedido pelo agent (HBX Owner). Responde primeiro e encerra
    // o processo logo depois — assim "Desligar Lab" para de verdade sem depender de
    // achar/matar o PID por fora (que falhava quando a CommandLine nao trazia o diretorio).
    if (req.method === 'POST' && url.pathname === '/local-lab/shutdown') {
      sendJson(res, 200, { ok: true, shuttingDown: true, pid: process.pid });
      setTimeout(() => void options.onShutdown?.('owner_requested'), 50);
      return undefined;
    }
    if (req.method === 'POST' && url.pathname === '/local-lab/jobs') {
      const body = await readJsonBody(req);
      const job = await createJob(body);
      return sendJson(res, 202, job);
    }
    if (parts[0] === 'local-lab' && parts[1] === 'jobs' && parts[2]) {
      const job = jobs.get(parts[2]);
      if (!job) return sendJson(res, 404, { error: 'job_not_found' });
      if (req.method === 'GET' && parts.length === 3) {
        return sendJson(res, 200, serializeJob(job));
      }
      if (req.method === 'POST' && parts[3] === 'cancel') {
        if (!TERMINAL_JOB_STATUSES.has(job.status)) {
          job.status = 'canceled';
          job.finishedAt = new Date().toISOString();
          if (job.abortController) job.abortController.abort();
          await persistJob(job);
        }
        return sendJson(res, 200, serializeJob(job));
      }
      if (req.method === 'GET' && parts[3] === 'export') {
        if (!job.exportReady || job.status !== 'completed') {
          return sendJson(res, 409, { error: 'export_not_ready', status: job.status });
        }
        const exported = await readExport(job, url.searchParams.get('file') || 'batch');
        return sendText(res, 200, exported.body, exported.type);
      }
    }
    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: String(error?.message || error) });
  }
}

function createServer(options = {}) {
  return http.createServer((req, res) => {
    void handleRequest(req, res, options);
  });
}

async function startServer(options = {}) {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const server = createServer(options);
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  safeLog('listening', { url: `http://${HOST}:${PORT}` });
  return server;
}

async function startOwnerControlledServer(env = process.env) {
  const controlToken = String(env.HBX_LOCAL_LAB_CONTROL_TOKEN || '').trim();
  const parentPid = Number(env.HBX_OWNER_PARENT_PID);
  if (!controlToken) throw new Error('HBX_LOCAL_LAB_CONTROL_TOKEN_REQUIRED');
  if (!Number.isInteger(parentPid) || parentPid <= 0 || parentPid === process.pid) {
    throw new Error('HBX_OWNER_PARENT_PID_REQUIRED');
  }

  let server;
  let watchdog;
  let shuttingDown = false;
  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    watchdog?.stop();
    const canceled = await cancelActiveJobs(reason);
    safeLog('shutdown', { reason, canceled });
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    process.exitCode = exitCode;
    setTimeout(() => process.exit(exitCode), 20).unref?.();
  };

  const options = {
    controlToken,
    get ownerWatchdog() { return watchdog; },
    onShutdown: (reason) => shutdown(reason, 0),
  };
  server = await startServer(options);
  watchdog = createOwnerWatchdog({
    parentPid,
    checkIntervalMs: Number(env.HBX_OWNER_WATCHDOG_INTERVAL_MS) || 1000,
    heartbeatTimeoutMs: Number(env.HBX_OWNER_HEARTBEAT_TIMEOUT_MS) || 15_000,
    onOwnerLost: (reason) => shutdown(reason, 0),
  });
  return { server, watchdog, shutdown };
}

if (require.main === module) {
  startOwnerControlledServer().catch((error) => {
    safeLog('fatal', { error: String(error?.message || error) });
    process.exit(1);
  });
}

module.exports = {
  buildBatchExport,
  cancelActiveJobs,
  createOwnerWatchdog,
  createJob,
  createServer,
  isProcessAlive,
  jobs,
  normalizeJobInput,
  resolveLocalOnlyHost,
  startOwnerControlledServer,
  startServer,
};
