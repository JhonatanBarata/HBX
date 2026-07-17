'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const agentDir = __dirname;
const rootDir = path.resolve(agentDir, '..', '..');
const localLabDir = path.join(rootDir, 'hbx-local-lab');
const logsDir = path.join(agentDir, 'logs');
const stateDir = path.join(agentDir, 'state');
const tokenFile = path.join(agentDir, '.owner-token');
const stateFile = path.join(stateDir, 'local-deep-unclog-supervisor.json');

const OWNER_PORT = Number(process.env.HBX_OWNER_LOCAL_AGENT_PORT || 3107);
const LOCAL_LAB_PORT = Number(process.env.HBX_LOCAL_LAB_PORT || 3098);
const SUPERVISOR_PORT = Number(process.env.HBX_LOCAL_DEEP_RECOVERY_SUPERVISOR_PORT || 3110);
const POLL_MS = clampInt(process.env.HBX_LOCAL_DEEP_RECOVERY_POLL_MS, 30_000, 5_000, 5 * 60_000);
const STALE_MS = clampInt(process.env.HBX_LOCAL_DEEP_RECOVERY_STALE_MS, 5 * 60_000, 60_000, 60 * 60_000);
const WINDOW_MS = clampInt(process.env.HBX_LOCAL_DEEP_RECOVERY_WINDOW_MS, 30 * 60_000, 5 * 60_000, 24 * 60 * 60_000);
const MAX_RECOVERIES = clampInt(process.env.HBX_LOCAL_DEEP_RECOVERY_MAX, 3, 1, 20);

const state = {
  circuitOpen: false,
  circuitReason: null,
  circuitOpenedAt: null,
  recoveryEvents: [],
  lastRecoveryAt: null,
  lastRecoveryReport: null,
  lastError: null,
  observation: {
    jobId: null,
    signature: null,
    changedAt: null,
  },
};

let pollTimer = null;
let pollRunning = false;
let server = null;

function clampInt(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function compactText(value, max = 300) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function parseTime(value, fallback = 0) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pruneRecoveryEvents(events, nowMs = Date.now(), windowMs = WINDOW_MS) {
  return (Array.isArray(events) ? events : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= nowMs - windowMs && value <= nowMs + 60_000)
    .sort((left, right) => left - right);
}

function shouldOpenRecoveryCircuit(events, nowMs = Date.now(), maxRecoveries = MAX_RECOVERIES, windowMs = WINDOW_MS) {
  const next = [...pruneRecoveryEvents(events, nowMs, windowMs), nowMs];
  return {
    open: next.length >= Math.max(1, Number(maxRecoveries) || 1),
    events: next,
  };
}

function buildJobSignature(job) {
  const metrics = job?.metrics || {};
  return [
    String(job?.status || ''),
    String(job?.maintenanceState || ''),
    Number(metrics.sitesVisited || 0),
    Number(metrics.emailsFound || 0),
    Number(metrics.emailsAccepted || 0),
    Number(metrics.leads || 0),
    String(job?.lastProgressAt || ''),
    String(job?.error || ''),
  ].join('|');
}

function observationStaleMs(observation, job, nowMs = Date.now()) {
  const changedAt = parseTime(observation?.changedAt, nowMs);
  const jobProgressAt = parseTime(job?.lastProgressAt || job?.startedAt || job?.queuedAt || job?.createdAt, changedAt);
  return Math.max(0, nowMs - Math.max(changedAt, jobProgressAt));
}

function log(message, meta = null) {
  if (meta) console.log(`[local-deep-recovery] ${message}`, meta);
  else console.log(`[local-deep-recovery] ${message}`);
}

async function ensureStateDir() {
  await fsp.mkdir(stateDir, { recursive: true });
  await fsp.mkdir(logsDir, { recursive: true });
}

async function loadState() {
  await ensureStateDir();
  try {
    const parsed = JSON.parse(await fsp.readFile(stateFile, 'utf8'));
    state.circuitOpen = parsed?.circuitOpen === true;
    state.circuitReason = compactText(parsed?.circuitReason, 300) || null;
    state.circuitOpenedAt = parsed?.circuitOpenedAt || null;
    state.recoveryEvents = pruneRecoveryEvents(parsed?.recoveryEvents || []);
    state.lastRecoveryAt = parsed?.lastRecoveryAt || null;
    state.lastRecoveryReport = parsed?.lastRecoveryReport && typeof parsed.lastRecoveryReport === 'object'
      ? parsed.lastRecoveryReport
      : null;
    state.lastError = compactText(parsed?.lastError, 300) || null;
  } catch {
    // Primeiro boot ou arquivo inválido: inicia fechado.
  }
}

async function saveState() {
  await ensureStateDir();
  const temp = `${stateFile}.tmp`;
  const payload = {
    circuitOpen: state.circuitOpen,
    circuitReason: state.circuitReason,
    circuitOpenedAt: state.circuitOpenedAt,
    recoveryEvents: state.recoveryEvents,
    lastRecoveryAt: state.lastRecoveryAt,
    lastRecoveryReport: state.lastRecoveryReport,
    lastError: state.lastError,
    savedAt: nowIso(),
  };
  await fsp.writeFile(temp, JSON.stringify(payload, null, 2));
  await fsp.rename(temp, stateFile);
}

function requestJson({ port, path: requestPath, method = 'GET', body = null, headers = {}, timeoutMs = 10_000 }) {
  return new Promise((resolve) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const requestHeaders = { Accept: 'application/json', ...headers };
    if (data) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = data.length;
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: requestHeaders,
      timeout: timeoutMs,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        if (raw.length < 4_000_000) raw += chunk.toString('utf8');
      });
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        resolve({
          ok: Number(res.statusCode) >= 200 && Number(res.statusCode) < 300,
          statusCode: Number(res.statusCode || 0),
          data: parsed,
          raw,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => resolve({ ok: false, error: error.message, code: error.code || null }));
    if (data) req.write(data);
    req.end();
  });
}

function readOwnerToken() {
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return '';
  }
}

async function readOwnerStatus() {
  const token = readOwnerToken();
  if (!token) return { ok: false, error: 'owner_token_ausente' };
  const response = await requestJson({
    port: OWNER_PORT,
    path: '/owner/local-deep-enrich/status',
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 5_000,
  });
  const status = response?.data?.localDeepEnrich;
  return response.ok && status ? { ok: true, status } : { ok: false, error: response.error || `owner_http_${response.statusCode || '?'}` };
}

async function readLabJob(jobId) {
  const response = await requestJson({
    port: LOCAL_LAB_PORT,
    path: `/local-lab/jobs/${encodeURIComponent(jobId)}`,
    timeoutMs: 8_000,
  });
  return response.ok && response.data
    ? { ok: true, job: response.data }
    : { ok: false, error: response.error || `lab_http_${response.statusCode || '?'}`, statusCode: response.statusCode };
}

async function callLabUnclog(body) {
  return requestJson({
    port: LOCAL_LAB_PORT,
    path: '/local-lab/maintenance/unclog',
    method: 'POST',
    body,
    timeoutMs: 15_000,
  });
}

async function waitForLabDown(timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await requestJson({ port: LOCAL_LAB_PORT, path: '/health', timeoutMs: 700 });
    if (!health.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function waitForLabUp(timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await requestJson({ port: LOCAL_LAB_PORT, path: '/health', timeoutMs: 900 });
    if (health.ok && health.data?.ok === true) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function spawnLocalLab() {
  const serverPath = path.join(localLabDir, 'server.js');
  if (!fs.existsSync(serverPath)) throw new Error(`local_lab_server_ausente:${serverPath}`);
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'hbx-local-lab.log');
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: localLabDir,
    detached: true,
    shell: false,
    stdio: ['ignore', out, out],
    windowsHide: true,
    env: {
      ...process.env,
      HBX_LOCAL_LAB_HOST: '127.0.0.1',
      HBX_LOCAL_LAB_PORT: String(LOCAL_LAB_PORT),
    },
  });
  child.unref();
  return { pid: child.pid, logPath };
}

async function restartOnlyLocalLab() {
  await requestJson({
    port: LOCAL_LAB_PORT,
    path: '/local-lab/shutdown',
    method: 'POST',
    body: {},
    timeoutMs: 4_000,
  }).catch(() => null);
  await waitForLabDown();
  const spawned = spawnLocalLab();
  const up = await waitForLabUp();
  return { ...spawned, up };
}

function resetObservation() {
  state.observation = { jobId: null, signature: null, changedAt: null };
}

async function resetRecoveryCircuit() {
  state.circuitOpen = false;
  state.circuitReason = null;
  state.circuitOpenedAt = null;
  state.recoveryEvents = [];
  state.lastError = null;
  resetObservation();
  const lab = await callLabUnclog({ source: 'owner_supervisor_reset', resetCircuit: true, force: false }).catch(() => null);
  await saveState();
  return { ok: true, lab: lab?.data || null };
}

async function performRecovery(ownerStatus, labJob, nowMs = Date.now()) {
  const decision = shouldOpenRecoveryCircuit(state.recoveryEvents, nowMs);
  state.recoveryEvents = decision.events;
  state.lastRecoveryAt = nowIso(nowMs);

  if (decision.open) {
    state.circuitOpen = true;
    state.circuitReason = `owner_recovery_circuit_open:${MAX_RECOVERIES}_recoveries_in_${Math.round(WINDOW_MS / 60_000)}m`;
    state.circuitOpenedAt = nowIso(nowMs);
    const labResult = await callLabUnclog({
      source: 'owner_recovery',
      force: true,
      openCircuit: true,
      reason: state.circuitReason,
    });
    state.lastRecoveryReport = {
      at: state.lastRecoveryAt,
      action: 'circuit_open',
      missionId: ownerStatus?.telemetry?.currentMissionId || null,
      jobId: ownerStatus?.telemetry?.currentLabJobId || null,
      lab: labResult?.data || null,
    };
    state.lastError = state.circuitReason;
    await saveState();
    log('disjuntor aberto', { reason: state.circuitReason });
    return state.lastRecoveryReport;
  }

  // Não toca na missão/lease. O Owner continua renovando heartbeat durante a limpeza e o restart.
  const unclog = await callLabUnclog({
    source: 'owner_recovery',
    force: true,
    resetCircuit: false,
  });
  const restarted = await restartOnlyLocalLab();
  state.lastRecoveryReport = {
    at: state.lastRecoveryAt,
    action: 'local_lab_restarted',
    missionId: ownerStatus?.telemetry?.currentMissionId || null,
    jobId: ownerStatus?.telemetry?.currentLabJobId || null,
    labJobStatus: labJob?.status || null,
    unclog: unclog?.data || null,
    restarted,
  };
  state.lastError = restarted.up ? null : 'local_lab_nao_reabriu';
  await saveState();
  resetObservation();
  log('Local Lab reiniciado', {
    jobId: state.lastRecoveryReport.jobId,
    up: restarted.up,
    recoveriesInWindow: state.recoveryEvents.length,
  });
  return state.lastRecoveryReport;
}

async function pollOnce(nowMs = Date.now()) {
  if (state.circuitOpen) return { ok: true, action: 'circuit_open' };
  const owner = await readOwnerStatus();
  if (!owner.ok) {
    state.lastError = owner.error;
    return { ok: false, action: 'owner_unavailable', error: owner.error };
  }

  const telemetry = owner.status?.telemetry || {};
  const jobId = compactText(telemetry.currentLabJobId, 200);
  if (String(telemetry.phase || '') !== 'crawling' || !jobId) {
    resetObservation();
    state.lastError = null;
    return { ok: true, action: 'idle' };
  }

  const lab = await readLabJob(jobId);
  if (!lab.ok) {
    if (lab.statusCode === 404) {
      resetObservation();
      return { ok: true, action: 'job_missing_owner_will_recreate' };
    }
    state.lastError = lab.error;
    return { ok: false, action: 'lab_unavailable', error: lab.error };
  }

  const signature = buildJobSignature(lab.job);
  if (state.observation.jobId !== jobId || state.observation.signature !== signature) {
    state.observation = { jobId, signature, changedAt: nowIso(nowMs) };
    state.lastError = null;
    return { ok: true, action: 'progress_observed', jobId };
  }

  const staleMs = observationStaleMs(state.observation, lab.job, nowMs);
  if (staleMs < STALE_MS) {
    return { ok: true, action: 'waiting', jobId, staleMs };
  }

  const report = await performRecovery(owner.status, lab.job, nowMs);
  return { ok: true, action: report.action, report };
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

function createControlServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${SUPERVISOR_PORT}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'hbx-local-deep-unclog-supervisor',
        port: SUPERVISOR_PORT,
        pollMs: POLL_MS,
        staleMs: STALE_MS,
        maxRecoveries: MAX_RECOVERIES,
        windowMs: WINDOW_MS,
        state,
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/reset') {
      void resetRecoveryCircuit()
        .then((result) => sendJson(res, 200, result))
        .catch((error) => sendJson(res, 500, { ok: false, error: compactText(error?.message || error, 300) }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/poll-now') {
      void pollOnce()
        .then((result) => sendJson(res, 200, result))
        .catch((error) => sendJson(res, 500, { ok: false, error: compactText(error?.message || error, 300) }));
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not_found' });
  });
}

function schedulePoll() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (pollRunning) return;
    pollRunning = true;
    void pollOnce()
      .catch((error) => {
        state.lastError = compactText(error?.message || error, 300);
        log('poll falhou', { error: state.lastError });
      })
      .finally(() => {
        pollRunning = false;
      });
  }, POLL_MS);
  pollTimer.unref?.();
  setTimeout(() => {
    if (pollRunning) return;
    pollRunning = true;
    void pollOnce().finally(() => { pollRunning = false; });
  }, 1_000).unref?.();
}

async function start() {
  await loadState();
  server = createControlServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(SUPERVISOR_PORT, '127.0.0.1', resolve);
  });
  schedulePoll();
  log('supervisor no ar', { port: SUPERVISOR_PORT, staleMs: STALE_MS, maxRecoveries: MAX_RECOVERIES });
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    if (error?.code === 'EADDRINUSE') process.exit(0);
    log('fatal', { error: compactText(error?.message || error, 300) });
    process.exit(1);
  });
}

module.exports = {
  buildJobSignature,
  observationStaleMs,
  pollOnce,
  pruneRecoveryEvents,
  shouldOpenRecoveryCircuit,
  start,
  state,
};
