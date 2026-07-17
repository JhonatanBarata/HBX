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
const STORAGE_DIR = path.resolve(process.env.HBX_LOCAL_LAB_STORAGE_DIR || path.join(__dirname, 'storage'));
const JOBS_DIR = path.join(STORAGE_DIR, 'jobs');
const MAINTENANCE_FILE = path.join(STORAGE_DIR, 'maintenance.json');
const ALLOWED_PROVIDERS = new Set(['web_query', 'site_crawl', 'directory_probe', 'social_probe']);
const DEFAULT_PROVIDERS = ['web_query', 'site_crawl'];
const MAX_BODY_BYTES = Math.max(512_000, Number(process.env.HBX_LOCAL_LAB_MAX_BODY_BYTES || 2_000_000) || 2_000_000);
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;
const LOCAL_DEEP_CONTRACT = 'local_deep_enrich_v1';

const WATCHDOG_INTERVAL_MS = clampInteger(process.env.HBX_LOCAL_LAB_WATCHDOG_INTERVAL_MS, 30_000, 5_000, 5 * 60_000);
const RUNNING_STALE_MS = clampInteger(process.env.HBX_LOCAL_LAB_RUNNING_STALE_MS, 3 * 60_000, 30_000, 60 * 60_000);
const QUEUED_STALE_MS = clampInteger(process.env.HBX_LOCAL_LAB_QUEUED_STALE_MS, 2 * 60_000, 30_000, 60 * 60_000);
const QUARANTINE_AGE_MS = clampInteger(process.env.HBX_LOCAL_LAB_QUARANTINE_AGE_MS, 24 * 60 * 60_000, 60 * 60_000, 30 * 24 * 60 * 60_000);

const jobs = new Map();
const pendingJobIds = [];
let schedulerRunning = false;
let schedulerToken = null;
let activeJobId = null;
let watchdogTimer = null;
let progressPersistTimer = null;

const maintenanceState = {
  circuitOpen: false,
  circuitReason: null,
  circuitOpenedAt: null,
  recoveryEvents: [],
  lastReport: null,
  updatedAt: null,
};

const INTERNAL_TERMINAL_STATES = new Set([
  'completed',
  'failed',
  'canceled',
  'failed_watchdog',
  'superseded',
  'quarantined',
  'circuit_open',
]);

function safeLog(message, meta = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    clean[key] = value;
  }
  console.log(`[local-lab] ${message}`, clean);
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...corsHeaders(),
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
    ...corsHeaders(),
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

function parseTime(value, fallback = 0) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function normalizeJobInput(body) {
  const targetEmails = Math.max(1, Math.min(10_000, Math.trunc(Number(body.targetEmails || 50) || 50)));
  const aggressive = body.aggressive === true || String(body.mode || '').trim() === 'max_public';
  const maxCandidates = clampInteger(body.maxCandidates || process.env.HBX_LOCAL_LAB_MAX_CANDIDATES, aggressive ? 5000 : 500, 1, 5000);
  const maxPagesPerSite = clampInteger(body.maxPagesPerSite || process.env.HBX_LOCAL_LAB_MAX_PAGES_PER_SITE, aggressive ? 250 : 40, 1, 250);
  const maxDiscoveredLinks = clampInteger(body.maxDiscoveredLinks || process.env.HBX_LOCAL_LAB_MAX_DISCOVERED_LINKS, aggressive ? 1000 : 80, 0, 1000);
  const maxDirectoryUrls = clampInteger(body.maxDirectoryUrls || process.env.HBX_LOCAL_LAB_MAX_DIRECTORY_URLS, aggressive ? 5000 : 300, 0, 5000);
  const maxSocialUrls = clampInteger(body.maxSocialUrls || process.env.HBX_LOCAL_LAB_MAX_SOCIAL_URLS, aggressive ? 5000 : 300, 0, 5000);
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

function publicJobStatus(job) {
  if (['failed_watchdog', 'superseded', 'quarantined', 'circuit_open'].includes(String(job?.status || ''))) {
    return 'failed';
  }
  return String(job?.status || 'failed');
}

function serializeJob(job) {
  return {
    id: job.id,
    batchId: job.batchId,
    status: publicJobStatus(job),
    maintenanceState: ['failed_watchdog', 'superseded', 'quarantined', 'circuit_open'].includes(job.status)
      ? job.status
      : null,
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
    queuedAt: job.queuedAt || job.createdAt,
    startedAt: job.startedAt,
    lastProgressAt: job.lastProgressAt || job.startedAt || job.createdAt,
    finishedAt: job.finishedAt,
    supersededBy: job.supersededBy || null,
    quarantinedAt: job.quarantinedAt || null,
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
  const persisted = {
    ...serializeJob(job),
    status: job.status,
    resumableInput,
  };
  await fs.writeFile(temp, JSON.stringify(persisted, null, 2));
  await fs.rename(temp, target);
}

function scheduleProgressPersist(job) {
  const now = Date.now();
  if (now - Number(job.lastProgressPersistAt || 0) < 5_000) return;
  job.lastProgressPersistAt = now;
  if (progressPersistTimer) return;
  progressPersistTimer = setTimeout(() => {
    progressPersistTimer = null;
    const active = activeJobId ? jobs.get(activeJobId) : null;
    if (active) void persistJob(active).catch((error) => safeLog('progress_persist_failed', { id: active.id, error: String(error?.message || error) }));
  }, 50);
  progressPersistTimer.unref?.();
}

async function persistMaintenanceState() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const temp = `${MAINTENANCE_FILE}.tmp`;
  maintenanceState.updatedAt = nowIso();
  await fs.writeFile(temp, JSON.stringify(maintenanceState, null, 2));
  await fs.rename(temp, MAINTENANCE_FILE);
}

async function loadMaintenanceState() {
  try {
    const parsed = JSON.parse(await fs.readFile(MAINTENANCE_FILE, 'utf8'));
    maintenanceState.circuitOpen = parsed?.circuitOpen === true;
    maintenanceState.circuitReason = compactText(parsed?.circuitReason, 300) || null;
    maintenanceState.circuitOpenedAt = parsed?.circuitOpenedAt || null;
    maintenanceState.recoveryEvents = Array.isArray(parsed?.recoveryEvents)
      ? parsed.recoveryEvents.map(Number).filter(Number.isFinite).slice(-100)
      : [];
    maintenanceState.lastReport = parsed?.lastReport && typeof parsed.lastReport === 'object' ? parsed.lastReport : null;
    maintenanceState.updatedAt = parsed?.updatedAt || null;
  } catch {
    // Ausente/corrompido: começa fechado. O endpoint manual continua disponível.
  }
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

function markProgress(job, metricsPatch = null) {
  if (metricsPatch && typeof metricsPatch === 'object') Object.assign(job.metrics, metricsPatch);
  job.lastProgressAt = nowIso();
  job.progressVersion = Number(job.progressVersion || 0) + 1;
  scheduleProgressPersist(job);
}

async function processJob(job, drainToken) {
  if (!job || INTERNAL_TERMINAL_STATES.has(job.status)) return;
  activeJobId = job.id;
  job.status = 'running';
  job.startedAt = job.startedAt || nowIso();
  job.lastProgressAt = nowIso();
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
      if (INTERNAL_TERMINAL_STATES.has(job.status) || drainToken !== schedulerToken) break;
      const baseSites = Number(job.metrics.sitesVisited || 0);
      const baseEmails = Number(job.metrics.emailsFound || 0);
      const result = await runProvider(provider, job, {
        signal: abortController.signal,
        isCanceled: () => INTERNAL_TERMINAL_STATES.has(job.status) || drainToken !== schedulerToken,
        onProgress: (snap) => {
          if (!snap || INTERNAL_TERMINAL_STATES.has(job.status)) return;
          markProgress(job, {
            sitesVisited: baseSites + Number(snap.pagesVisited || 0),
            emailsFound: baseEmails + Number(snap.emailsFound || 0),
          });
        },
      });
      if (INTERNAL_TERMINAL_STATES.has(job.status) || drainToken !== schedulerToken) break;
      leads.push(...(Array.isArray(result.leads) ? result.leads : []));
      emails.push(...(Array.isArray(result.emails) ? result.emails : []));
      evidence.push(...(Array.isArray(result.evidence) ? result.evidence : []));
      providerStats[provider] = result.stats || {};
      if (Array.isArray(result.warnings)) job.warnings.push(...result.warnings);
      markProgress(job, {
        sitesVisited: baseSites + Number(result.stats?.pagesVisited || 0),
        emailsFound: baseEmails + Number(result.stats?.emailsFound || 0),
      });
    }

    if (INTERNAL_TERMINAL_STATES.has(job.status) || drainToken !== schedulerToken) {
      job.finishedAt = job.finishedAt || nowIso();
      await persistJob(job);
      return;
    }

    job.metrics.pacing = getPacingStats();
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
    job.finishedAt = nowIso();
    job.result = {
      manifest: exported.manifest,
      files: exported.files,
    };
    await persistJob(job);
    safeLog('job_completed', { id: job.id, emails: exported.emails.length, leads: exported.leads.length });
  } catch (error) {
    if (!INTERNAL_TERMINAL_STATES.has(job.status)) {
      job.status = 'failed';
      job.error = String(error?.message || error);
      job.finishedAt = nowIso();
    }
    await persistJob(job).catch(() => null);
    safeLog('job_failed', { id: job.id, status: job.status, error: job.error });
  } finally {
    job.abortController = null;
    if (activeJobId === job.id) activeJobId = null;
  }
}

function jobIdentity(job) {
  if (job?.missionId) return `mission:${job.contractVersion || ''}:${job.missionId}:${Number(job.workVersion) || 0}`;
  return `job:${job?.id || randomUUID()}`;
}

function isNonTerminal(job) {
  return Boolean(job) && !INTERNAL_TERMINAL_STATES.has(job.status);
}

function rebuildPendingQueue() {
  pendingJobIds.length = 0;
  if (maintenanceState.circuitOpen) return [];
  const queued = Array.from(jobs.values())
    .filter((job) => job.status === 'queued')
    .sort((left, right) => parseTime(left.queuedAt || left.createdAt) - parseTime(right.queuedAt || right.createdAt));
  for (const job of queued) pendingJobIds.push(job.id);
  return [...pendingJobIds];
}

function enqueueJob(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'queued' || maintenanceState.circuitOpen) return;
  if (!pendingJobIds.includes(jobId)) pendingJobIds.push(jobId);
  setImmediate(() => void drainJobQueue());
}

async function drainJobQueue() {
  if (schedulerRunning || maintenanceState.circuitOpen) return;
  schedulerRunning = true;
  const token = Symbol('local-lab-drain');
  schedulerToken = token;
  try {
    while (pendingJobIds.length && token === schedulerToken && !maintenanceState.circuitOpen) {
      const id = pendingJobIds.shift();
      const job = jobs.get(id);
      if (!job || job.status !== 'queued') continue;
      await processJob(job, token);
    }
  } catch (error) {
    safeLog('scheduler_error', { error: String(error?.message || error) });
  } finally {
    if (schedulerToken === token) {
      schedulerToken = null;
      schedulerRunning = false;
      if (pendingJobIds.length && !maintenanceState.circuitOpen) setImmediate(() => void drainJobQueue());
    }
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
      && !INTERNAL_TERMINAL_STATES.has(job.status)
    ));
    if (existing) return serializeJob(existing);
  }

  const id = randomUUID();
  const createdAt = nowIso();
  const job = {
    id,
    batchId: `local-lab-${id}`,
    status: maintenanceState.circuitOpen && input.missionId ? 'circuit_open' : 'queued',
    ...input,
    metrics: {
      sitesVisited: 0,
      emailsFound: 0,
      emailsAccepted: 0,
      leads: 0,
    },
    warnings: [],
    error: maintenanceState.circuitOpen && input.missionId
      ? maintenanceState.circuitReason || 'local_lab_recovery_circuit_open'
      : null,
    exportReady: false,
    createdAt,
    queuedAt: createdAt,
    startedAt: null,
    lastProgressAt: createdAt,
    finishedAt: maintenanceState.circuitOpen && input.missionId ? createdAt : null,
    result: null,
    abortController: null,
    supersededBy: null,
    quarantinedAt: null,
  };
  jobs.set(id, job);
  await persistJob(job);
  if (job.status === 'queued') enqueueJob(job.id);
  return serializeJob(job);
}

function hydratePersistedJob(record) {
  if (!record || typeof record !== 'object' || !record.id || !record.resumableInput) return null;
  const input = normalizeJobInput(record.resumableInput);
  const rawStatus = String(record.status || 'failed');
  return {
    id: String(record.id),
    batchId: String(record.batchId || `local-lab-${record.id}`),
    ...input,
    status: rawStatus,
    metrics: record.metrics && typeof record.metrics === 'object' ? record.metrics : {
      sitesVisited: 0,
      emailsFound: 0,
      emailsAccepted: 0,
      leads: 0,
    },
    warnings: Array.isArray(record.warnings) ? record.warnings.map(String).slice(0, 100) : [],
    error: record.error || null,
    exportReady: Boolean(record.exportReady && rawStatus === 'completed'),
    createdAt: record.createdAt || nowIso(),
    queuedAt: record.queuedAt || record.createdAt || nowIso(),
    startedAt: record.startedAt || null,
    lastProgressAt: record.lastProgressAt || record.startedAt || record.createdAt || nowIso(),
    finishedAt: record.finishedAt || null,
    result: null,
    abortController: null,
    supersededBy: record.supersededBy || null,
    quarantinedAt: record.quarantinedAt || null,
  };
}

function applyBootPolicy(records, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const circuitOpen = options.circuitOpen === true;
  const hydrated = (Array.isArray(records) ? records : []).map(hydratePersistedJob).filter(Boolean);
  const grouped = new Map();
  for (const job of hydrated) {
    const key = jobIdentity(job);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(job);
  }

  for (const group of grouped.values()) {
    group.sort((left, right) => parseTime(right.createdAt) - parseTime(left.createdAt));
    const newest = group[0];
    for (const duplicate of group.slice(1)) {
      if (isNonTerminal(duplicate)) {
        duplicate.status = 'superseded';
        duplicate.supersededBy = newest.id;
        duplicate.error = `superseded_by:${newest.id}`;
        duplicate.finishedAt = nowIso(nowMs);
      }
    }
  }

  for (const job of hydrated) {
    const ageMs = Math.max(0, nowMs - parseTime(job.createdAt, nowMs));
    if (job.status === 'running') {
      job.status = 'failed_watchdog';
      job.error = 'interrupted_previous_shutdown';
      job.finishedAt = nowIso(nowMs);
      job.warnings.push('Job interrompido no desligamento anterior; nova tentativa pertence ao Owner.');
    } else if (isNonTerminal(job) && ageMs >= QUARANTINE_AGE_MS) {
      job.status = 'quarantined';
      job.error = 'quarantined_stale_job';
      job.quarantinedAt = nowIso(nowMs);
      job.finishedAt = nowIso(nowMs);
    } else if (circuitOpen && isNonTerminal(job) && job.missionId) {
      job.status = 'circuit_open';
      job.error = maintenanceState.circuitReason || 'local_lab_recovery_circuit_open';
      job.finishedAt = nowIso(nowMs);
    }
  }
  return hydrated;
}

async function loadPersistedJobs() {
  let entries = [];
  try {
    entries = await fs.readdir(JOBS_DIR, { withFileTypes: true });
  } catch {
    return { loaded: 0, resumed: 0, superseded: 0, quarantined: 0, interrupted: 0 };
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      records.push(JSON.parse(await fs.readFile(path.join(JOBS_DIR, entry.name, 'job.json'), 'utf8')));
    } catch (error) {
      safeLog('job_restore_skipped', { id: entry.name, error: String(error?.message || error) });
    }
  }

  const restoredJobs = applyBootPolicy(records, { circuitOpen: maintenanceState.circuitOpen });
  let resumed = 0;
  let superseded = 0;
  let quarantined = 0;
  let interrupted = 0;
  for (const job of restoredJobs) {
    jobs.set(job.id, job);
    if (job.status === 'queued') resumed += 1;
    if (job.status === 'superseded') superseded += 1;
    if (job.status === 'quarantined') quarantined += 1;
    if (job.status === 'failed_watchdog' && job.error === 'interrupted_previous_shutdown') interrupted += 1;
    await persistJob(job).catch((error) => safeLog('job_restore_persist_failed', { id: job.id, error: String(error?.message || error) }));
  }
  rebuildPendingQueue();
  if (pendingJobIds.length) setImmediate(() => void drainJobQueue());
  return { loaded: restoredJobs.length, resumed, superseded, quarantined, interrupted };
}

function blockerSnapshot(nowMs = Date.now()) {
  const running = activeJobId ? jobs.get(activeJobId) : Array.from(jobs.values()).find((job) => job.status === 'running');
  if (running) {
    return {
      id: running.id,
      status: publicJobStatus(running),
      maintenanceState: running.status,
      missionId: running.missionId || null,
      workVersion: running.workVersion || null,
      ageMs: Math.max(0, nowMs - parseTime(running.lastProgressAt || running.startedAt || running.createdAt, nowMs)),
      lastProgressAt: running.lastProgressAt || null,
    };
  }
  const queued = Array.from(jobs.values())
    .filter((job) => job.status === 'queued')
    .sort((left, right) => parseTime(left.queuedAt || left.createdAt) - parseTime(right.queuedAt || right.createdAt))[0];
  if (!queued) return null;
  return {
    id: queued.id,
    status: 'queued',
    maintenanceState: null,
    missionId: queued.missionId || null,
    workVersion: queued.workVersion || null,
    ageMs: Math.max(0, nowMs - parseTime(queued.queuedAt || queued.createdAt, nowMs)),
    lastProgressAt: queued.lastProgressAt || null,
  };
}

async function maintenanceUnclog(options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const source = compactText(options.source || 'manual', 80) || 'manual';
  const force = options.force === true;
  const startScheduler = options.startScheduler !== false;
  const blockerBefore = blockerSnapshot(nowMs);
  const changed = [];
  const canceled = [];
  const superseded = [];
  const quarantined = [];

  if (options.resetCircuit === true) {
    maintenanceState.circuitOpen = false;
    maintenanceState.circuitReason = null;
    maintenanceState.circuitOpenedAt = null;
    maintenanceState.recoveryEvents = [];
  }
  if (options.openCircuit === true) {
    maintenanceState.circuitOpen = true;
    maintenanceState.circuitReason = compactText(options.reason, 300) || 'owner_recovery_circuit_open';
    maintenanceState.circuitOpenedAt = nowIso(nowMs);
  }

  const currentJobs = Array.from(jobs.values());
  for (const job of currentJobs) {
    if (job.status !== 'running') continue;
    const staleMs = Math.max(0, nowMs - parseTime(job.lastProgressAt || job.startedAt || job.createdAt, nowMs));
    if (!force && staleMs < RUNNING_STALE_MS) continue;
    job.status = options.openCircuit === true ? 'circuit_open' : 'failed_watchdog';
    job.error = options.openCircuit === true
      ? maintenanceState.circuitReason
      : `failed_watchdog:no_progress_${Math.round(staleMs / 1000)}s`;
    job.finishedAt = nowIso(nowMs);
    if (job.abortController) {
      try { job.abortController.abort(); } catch { /* já abortado */ }
    }
    canceled.push(job.id);
    changed.push(job);
  }

  const byIdentity = new Map();
  for (const job of currentJobs) {
    const key = jobIdentity(job);
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(job);
  }
  for (const group of byIdentity.values()) {
    group.sort((left, right) => parseTime(right.createdAt) - parseTime(left.createdAt));
    const newest = group[0];
    for (const duplicate of group.slice(1)) {
      if (!isNonTerminal(duplicate)) continue;
      duplicate.status = 'superseded';
      duplicate.supersededBy = newest.id;
      duplicate.error = `superseded_by:${newest.id}`;
      duplicate.finishedAt = nowIso(nowMs);
      if (duplicate.abortController) {
        try { duplicate.abortController.abort(); } catch { /* ignore */ }
      }
      superseded.push(duplicate.id);
      changed.push(duplicate);
    }
  }

  for (const job of currentJobs) {
    if (!isNonTerminal(job)) continue;
    const ageMs = Math.max(0, nowMs - parseTime(job.createdAt, nowMs));
    if (ageMs < QUARANTINE_AGE_MS) continue;
    job.status = 'quarantined';
    job.error = 'quarantined_stale_job';
    job.quarantinedAt = nowIso(nowMs);
    job.finishedAt = nowIso(nowMs);
    if (job.abortController) {
      try { job.abortController.abort(); } catch { /* ignore */ }
    }
    quarantined.push(job.id);
    changed.push(job);
  }

  if (maintenanceState.circuitOpen) {
    for (const job of currentJobs) {
      if (!isNonTerminal(job) || !job.missionId) continue;
      job.status = 'circuit_open';
      job.error = maintenanceState.circuitReason || 'local_lab_recovery_circuit_open';
      job.finishedAt = nowIso(nowMs);
      if (job.abortController) {
        try { job.abortController.abort(); } catch { /* ignore */ }
      }
      changed.push(job);
    }
  }

  schedulerToken = null;
  schedulerRunning = false;
  if (activeJobId && !isNonTerminal(jobs.get(activeJobId))) activeJobId = null;
  const rebuilt = rebuildPendingQueue();

  const uniqueChanged = Array.from(new Map(changed.map((job) => [job.id, job])).values());
  await Promise.all(uniqueChanged.map((job) => persistJob(job).catch((error) => {
    safeLog('maintenance_persist_failed', { id: job.id, error: String(error?.message || error) });
  })));

  const report = {
    ok: true,
    source,
    at: nowIso(nowMs),
    blockerBefore,
    canceled,
    superseded,
    quarantined,
    pendingRebuilt: rebuilt,
    schedulerRestarted: Boolean(startScheduler && rebuilt.length && !maintenanceState.circuitOpen),
    circuit: {
      open: maintenanceState.circuitOpen,
      reason: maintenanceState.circuitReason,
      openedAt: maintenanceState.circuitOpenedAt,
    },
  };
  maintenanceState.lastReport = report;
  await persistMaintenanceState().catch((error) => safeLog('maintenance_state_persist_failed', { error: String(error?.message || error) }));

  if (startScheduler && rebuilt.length && !maintenanceState.circuitOpen) {
    setImmediate(() => void drainJobQueue());
  }
  safeLog('maintenance_unclog', {
    source,
    canceled: canceled.length,
    superseded: superseded.length,
    quarantined: quarantined.length,
    pending: rebuilt.length,
    circuitOpen: maintenanceState.circuitOpen,
  });
  return report;
}

async function watchdogTick() {
  const nowMs = Date.now();
  const running = activeJobId ? jobs.get(activeJobId) : Array.from(jobs.values()).find((job) => job.status === 'running');
  if (running) {
    const staleMs = Math.max(0, nowMs - parseTime(running.lastProgressAt || running.startedAt || running.createdAt, nowMs));
    if (staleMs >= RUNNING_STALE_MS) {
      await maintenanceUnclog({ source: 'watchdog', force: false, nowMs });
      return;
    }
  }

  if (!activeJobId) {
    const oldestQueued = Array.from(jobs.values())
      .filter((job) => job.status === 'queued')
      .sort((left, right) => parseTime(left.queuedAt || left.createdAt) - parseTime(right.queuedAt || right.createdAt))[0];
    if (oldestQueued) {
      const queuedMs = Math.max(0, nowMs - parseTime(oldestQueued.queuedAt || oldestQueued.createdAt, nowMs));
      if (queuedMs >= QUEUED_STALE_MS || (!schedulerRunning && pendingJobIds.length === 0)) {
        rebuildPendingQueue();
        if (!maintenanceState.circuitOpen) setImmediate(() => void drainJobQueue());
      }
    }
  }
}

function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    void watchdogTick().catch((error) => safeLog('watchdog_error', { error: String(error?.message || error) }));
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref?.();
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
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return undefined;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'hbx-local-lab',
        host: HOST,
        port: PORT,
        pid: process.pid,
        schedulerRunning,
        activeJobId,
        queued: Array.from(jobs.values()).filter((job) => job.status === 'queued').length,
        maintenance: {
          circuitOpen: maintenanceState.circuitOpen,
          circuitReason: maintenanceState.circuitReason,
          lastReport: maintenanceState.lastReport,
        },
      });
    }
    if (req.method === 'GET' && url.pathname === '/local-lab/maintenance/status') {
      return sendJson(res, 200, {
        ok: true,
        blocker: blockerSnapshot(),
        schedulerRunning,
        activeJobId,
        pendingJobIds: [...pendingJobIds],
        maintenance: maintenanceState,
      });
    }
    if (req.method === 'POST' && url.pathname === '/local-lab/maintenance/unclog') {
      const body = await readJsonBody(req);
      const report = await maintenanceUnclog({
        source: body.source || 'manual',
        force: body.force === true,
        resetCircuit: body.resetCircuit === true,
        openCircuit: body.openCircuit === true,
        reason: body.reason,
      });
      return sendJson(res, 200, report);
    }
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
        if (!INTERNAL_TERMINAL_STATES.has(job.status)) {
          job.status = 'canceled';
          job.error = compactText((await readJsonBody(req).catch(() => ({}))).reason, 300) || 'canceled_by_request';
          job.finishedAt = nowIso();
          if (job.abortController) job.abortController.abort();
          await persistJob(job);
        }
        return sendJson(res, 200, serializeJob(job));
      }
      if (req.method === 'GET' && parts[3] === 'export') {
        if (!job.exportReady || job.status !== 'completed') {
          return sendJson(res, 409, { error: 'export_not_ready', status: publicJobStatus(job), maintenanceState: job.status });
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
  await loadMaintenanceState();
  const restored = await loadPersistedJobs();
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  startWatchdog();
  safeLog('listening', {
    url: `http://${HOST}:${PORT}`,
    restored: restored.loaded,
    resumed: restored.resumed,
    superseded: restored.superseded,
    quarantined: restored.quarantined,
    interrupted: restored.interrupted,
  });
  return server;
}

function resetInMemoryStateForTests() {
  jobs.clear();
  pendingJobIds.length = 0;
  schedulerRunning = false;
  schedulerToken = null;
  activeJobId = null;
  maintenanceState.circuitOpen = false;
  maintenanceState.circuitReason = null;
  maintenanceState.circuitOpenedAt = null;
  maintenanceState.recoveryEvents = [];
  maintenanceState.lastReport = null;
  maintenanceState.updatedAt = null;
}

if (require.main === module) {
  startServer().catch((error) => {
    safeLog('fatal', { error: String(error?.message || error) });
    process.exit(1);
  });
}

module.exports = {
  applyBootPolicy,
  buildBatchExport,
  createJob,
  createServer,
  drainJobQueue,
  hydratePersistedJob,
  jobs,
  loadPersistedJobs,
  maintenanceState,
  maintenanceUnclog,
  normalizeJobInput,
  pendingJobIds,
  publicJobStatus,
  resetInMemoryStateForTests,
  startServer,
  watchdogTick,
};
