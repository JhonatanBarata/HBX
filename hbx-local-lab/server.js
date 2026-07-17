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

const HOST = process.env.HBX_LOCAL_LAB_HOST || '127.0.0.1';
const PORT = Number(process.env.HBX_LOCAL_LAB_PORT || 3098);
const STORAGE_DIR = path.resolve(__dirname, 'storage');
const JOBS_DIR = path.join(STORAGE_DIR, 'jobs');
const ALLOWED_PROVIDERS = new Set(['web_query', 'site_crawl', 'directory_probe', 'social_probe']);
const DEFAULT_PROVIDERS = ['web_query', 'site_crawl'];
const MAX_BODY_BYTES = Math.max(512_000, Number(process.env.HBX_LOCAL_LAB_MAX_BODY_BYTES || 2_000_000) || 2_000_000);
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;
const LOCAL_DEEP_CONTRACT = 'local_deep_enrich_v1';

const jobs = new Map();
const pendingJobIds = [];
let schedulerRunning = false;

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
    contractVersion: compactText(body.contractVersion, 80) || null,
    missionId: compactText(body.missionId, 160) || null,
    radarLeadId: compactText(body.radarLeadId, 160) || null,
    workVersion: clampInteger(body.workVersion, 1, 1, 2_147_483_647),
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
    contractVersion: job.contractVersion || null,
    missionId: job.missionId || null,
    radarLeadId: job.radarLeadId || null,
    workVersion: job.workVersion || null,
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
  const resumableInput = {
    contractVersion: job.contractVersion,
    missionId: job.missionId,
    radarLeadId: job.radarLeadId,
    workVersion: job.workVersion,
    city: job.city,
    state: job.state,
    segment: job.segment,
    targetEmails: job.targetEmails,
    mode: job.mode,
    aggressive: job.aggressive,
    providers: job.providers,
    requestedBy: job.requestedBy,
    seedUrls: job.seedUrls,
    websites: job.websites,
    candidates: job.candidates,
    directoryUrls: job.directoryUrls,
    socialUrls: job.socialUrls,
    maxCandidates: job.maxCandidates,
    maxPagesPerSite: job.maxPagesPerSite,
    maxDiscoveredLinks: job.maxDiscoveredLinks,
    maxDirectoryUrls: job.maxDirectoryUrls,
    maxSocialUrls: job.maxSocialUrls,
    minDelayMs: job.minDelayMs,
    maxDelayMs: job.maxDelayMs,
    blockBackoffMs: job.blockBackoffMs,
  };
  const target = path.join(dir, 'job.json');
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ ...serializeJob(job), resumableInput }, null, 2));
  await fs.rename(temp, target);
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
  const evidence = [];
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
      evidence.push(...(Array.isArray(result.evidence) ? result.evidence : []));
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
      evidence,
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

async function createJob(body) {
  assertNoSecrets(body);
  const input = normalizeJobInput(body || {});
  if (input.missionId && input.contractVersion !== LOCAL_DEEP_CONTRACT) {
    const error = new Error('Contrato local_deep_enrich_v1 obrigatorio para job de missao.');
    error.statusCode = 400;
    throw error;
  }
  if (input.missionId) {
    const existing = Array.from(jobs.values()).find((job) => (
      job.contractVersion === input.contractVersion
      && job.missionId === input.missionId
      && Number(job.workVersion) === Number(input.workVersion)
      && !['failed', 'canceled'].includes(job.status)
    ));
    if (existing) return serializeJob(existing);
  }
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
  enqueueJob(job.id);
  return serializeJob(job);
}

function enqueueJob(jobId) {
  if (!pendingJobIds.includes(jobId)) pendingJobIds.push(jobId);
  setImmediate(() => void drainJobQueue());
}

async function drainJobQueue() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    while (pendingJobIds.length) {
      const id = pendingJobIds.shift();
      const job = jobs.get(id);
      if (!job || ['completed', 'failed', 'canceled'].includes(job.status)) continue;
      await processJob(job);
    }
  } finally {
    schedulerRunning = false;
  }
}

function hydratePersistedJob(record) {
  if (!record || typeof record !== 'object' || !record.id || !record.resumableInput) return null;
  const input = normalizeJobInput(record.resumableInput);
  const wasInterrupted = record.status === 'running' || record.status === 'queued';
  return {
    id: String(record.id),
    batchId: String(record.batchId || `local-lab-${record.id}`),
    ...input,
    status: wasInterrupted ? 'queued' : String(record.status || 'failed'),
    metrics: record.metrics && typeof record.metrics === 'object' ? record.metrics : {
      sitesVisited: 0,
      emailsFound: 0,
      emailsAccepted: 0,
      leads: 0,
    },
    warnings: [
      ...(Array.isArray(record.warnings) ? record.warnings.map(String).slice(0, 100) : []),
      ...(wasInterrupted ? ['Job retomado desde o inicio apos reinicio do Local Lab.'] : []),
    ],
    error: wasInterrupted ? null : (record.error || null),
    exportReady: Boolean(record.exportReady && record.status === 'completed'),
    createdAt: record.createdAt || new Date().toISOString(),
    startedAt: wasInterrupted ? null : (record.startedAt || null),
    finishedAt: wasInterrupted ? null : (record.finishedAt || null),
    result: null,
    abortController: null,
  };
}

async function loadPersistedJobs() {
  let entries = [];
  try { entries = await fs.readdir(JOBS_DIR, { withFileTypes: true }); } catch { return { loaded: 0, resumed: 0 }; }
  let loaded = 0;
  let resumed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, entry.name, 'job.json'), 'utf8');
      const job = hydratePersistedJob(JSON.parse(raw));
      if (!job) continue;
      jobs.set(job.id, job);
      loaded += 1;
      if (job.status === 'queued') { enqueueJob(job.id); resumed += 1; }
    } catch (error) {
      safeLog('job_restore_skipped', { id: entry.name, error: String(error?.message || error) });
    }
  }
  return { loaded, resumed };
}

async function readExport(job, file) {
  const dir = path.join(JOBS_DIR, job.id);
  if (file === 'manifest') return { type: 'application/json; charset=utf-8', body: await fs.readFile(path.join(dir, 'batch-manifest.json'), 'utf8') };
  if (file === 'leads') return { type: 'application/x-ndjson; charset=utf-8', body: await fs.readFile(path.join(dir, 'leads.jsonl'), 'utf8') };
  if (file === 'emails') return { type: 'application/x-ndjson; charset=utf-8', body: await fs.readFile(path.join(dir, 'emails.jsonl'), 'utf8') };
  if (file === 'evidence') return { type: 'application/x-ndjson; charset=utf-8', body: await fs.readFile(path.join(dir, 'evidence.jsonl'), 'utf8') };
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'batch-manifest.json'), 'utf8'));
  const leadsText = await fs.readFile(path.join(dir, 'leads.jsonl'), 'utf8');
  const emailsText = await fs.readFile(path.join(dir, 'emails.jsonl'), 'utf8');
  const evidenceText = await fs.readFile(path.join(dir, 'evidence.jsonl'), 'utf8').catch(() => '');
  const leads = leadsText.trim() ? leadsText.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  const emails = emailsText.trim() ? emailsText.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  const evidence = evidenceText.trim() ? evidenceText.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  return {
    type: 'application/json; charset=utf-8',
    body: JSON.stringify({
      manifest,
      batch: {
        ...manifest,
        leads,
        emails,
        evidence,
      },
      files: {
        manifest: 'batch-manifest.json',
        leads: 'leads.jsonl',
        emails: 'emails.jsonl',
        evidence: 'evidence.jsonl',
      },
      leadsJsonl: leadsText,
      emailsJsonl: emailsText,
      evidenceJsonl: evidenceText,
    }, null, 2),
  };
}

async function handleRequest(req, res) {
  const url = parsePath(req);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'hbx-local-lab', host: HOST, port: PORT, pid: process.pid });
    }
    // Desligamento limpo, pedido pelo agent (HBX Owner). Responde primeiro e encerra
    // o processo logo depois — assim "Desligar Lab" para de verdade sem depender de
    // achar/matar o PID por fora (que falhava quando a CommandLine nao trazia o diretorio).
    if (req.method === 'POST' && url.pathname === '/local-lab/shutdown') {
      sendJson(res, 200, { ok: true, shuttingDown: true, pid: process.pid });
      setTimeout(() => process.exit(0), 150);
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
        if (!['completed', 'failed', 'canceled'].includes(job.status)) {
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

function createServer() {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}

async function startServer() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const restored = await loadPersistedJobs();
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  safeLog('listening', { url: `http://${HOST}:${PORT}`, restored: restored.loaded, resumed: restored.resumed });
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    safeLog('fatal', { error: String(error?.message || error) });
    process.exit(1);
  });
}

module.exports = {
  buildBatchExport,
  createJob,
  createServer,
  drainJobQueue,
  hydratePersistedJob,
  jobs,
  loadPersistedJobs,
  normalizeJobInput,
  startServer,
};
