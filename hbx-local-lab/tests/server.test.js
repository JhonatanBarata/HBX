'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const {
  cancelActiveJobs,
  createOwnerWatchdog,
  createServer,
  jobs,
  resolveLocalOnlyHost,
} = require('../server');

const CONTROL_TOKEN = 'test-owner-control-token';
const AUTH_HEADERS = { authorization: `Bearer ${CONTROL_TOKEN}` };

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function waitForCompleted(baseUrl, id) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${baseUrl}/local-lab/jobs/${id}`, { headers: AUTH_HEADERS });
    const body = await response.json();
    if (['completed', 'failed', 'canceled'].includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('job_timeout');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return response.json();
    } catch {
      // Processo ainda subindo.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('health_timeout');
}

function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('process_exit_timeout')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('controle do Local Lab falha fechado sem o token efêmero do Owner', async () => {
  const server = createServer({ controlToken: CONTROL_TOKEN });
  const address = await listen(server);
  try {
    assert.equal(address.address, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${address.port}/local-lab/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'owner_control_required' });
  } finally {
    await closeServer(server);
  }
});

test('server cria job local, consulta status e exporta JSONL com controle do Owner', async () => {
  const server = createServer({ controlToken: CONTROL_TOKEN });
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const createdResponse = await fetch(`${baseUrl}/local-lab/jobs`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({
        city: 'Rio Claro',
        state: 'SP',
        segment: 'clinicas',
        targetEmails: 2,
        providers: ['web_query'],
        candidates: [{
          name: 'Clinica Real',
          website: 'https://clinicareal.com.br',
          sourceUrl: 'https://clinicareal.com.br',
        }],
      }),
    });
    assert.equal(createdResponse.status, 202);
    const created = await createdResponse.json();
    assert.equal(created.status, 'queued');

    const completed = await waitForCompleted(baseUrl, created.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.exportReady, true);

    const leadsResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/export?file=leads`, { headers: AUTH_HEADERS });
    assert.equal(leadsResponse.status, 200);
    assert.match(leadsResponse.headers.get('content-type') || '', /application\/x-ndjson/);
    assert.match(await leadsResponse.text(), /Clinica Real/);

    const batchResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/export`, { headers: AUTH_HEADERS });
    const batch = await batchResponse.json();
    assert.equal(batch.batch.sourceMode, 'local_lab');
    assert.equal(batch.batch.leads.length, 1);

    const cancelResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/cancel`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    assert.equal(cancelResponse.status, 200);
  } finally {
    await closeServer(server);
  }
});

test('bind fora de 127.0.0.1 é rejeitado sem fallback', () => {
  assert.equal(resolveLocalOnlyHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => resolveLocalOnlyHost('0.0.0.0'), /HBX_LOCAL_LAB_HOST_BLOCKED:0\.0\.0\.0/);
  assert.throws(() => resolveLocalOnlyHost('::'), /HBX_LOCAL_LAB_HOST_BLOCKED/);
  assert.throws(() => resolveLocalOnlyHost('localhost'), /HBX_LOCAL_LAB_HOST_BLOCKED/);
});

test('watchdog encerra ao perder o processo pai do Owner', async () => {
  let watchdog;
  const reason = await new Promise((resolve) => {
    watchdog = createOwnerWatchdog({
      parentPid: 424242,
      checkIntervalMs: 100,
      heartbeatTimeoutMs: 500,
      processAlive: () => false,
      onOwnerLost: resolve,
    });
  });
  watchdog.stop();
  assert.equal(reason, 'owner_process_gone');
});

test('encerramento do Owner aborta e cancela todo crawl ativo', async () => {
  const id = `test-${randomUUID()}`;
  const abortController = new AbortController();
  jobs.set(id, {
    id,
    batchId: `local-lab-${id}`,
    status: 'running',
    city: '',
    state: '',
    segment: '',
    targetEmails: 1,
    mode: 'email_first',
    aggressive: false,
    providers: ['site_crawl'],
    metrics: {},
    warnings: [],
    error: null,
    exportReady: false,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    abortController,
  });
  try {
    assert.equal(await cancelActiveJobs('owner_process_gone'), 1);
    assert.equal(abortController.signal.aborted, true);
    assert.equal(jobs.get(id).status, 'canceled');
    assert.equal(jobs.get(id).error, 'owner_process_gone');
  } finally {
    jobs.delete(id);
    await fs.rm(path.join(__dirname, '..', 'storage', 'jobs', id), { recursive: true, force: true });
  }
});

test('processo Local Lab não sobrevive quando o HBX Owner é encerrado', { timeout: 12_000 }, async () => {
  const port = await reservePort();
  const token = `owner-${randomUUID()}`;
  const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const lab = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      HBX_LOCAL_LAB_HOST: '127.0.0.1',
      HBX_LOCAL_LAB_PORT: String(port),
      HBX_LOCAL_LAB_CONTROL_TOKEN: token,
      HBX_OWNER_PARENT_PID: String(owner.pid),
      HBX_OWNER_WATCHDOG_INTERVAL_MS: '100',
      HBX_OWNER_HEARTBEAT_TIMEOUT_MS: '5000',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    const health = await waitForHealth(port);
    assert.equal(health.ownerControlled, true);
    assert.equal(health.host, '127.0.0.1');

    const heartbeat = await fetch(`http://127.0.0.1:${port}/local-lab/owner-heartbeat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ parentPid: owner.pid }),
    });
    assert.equal(heartbeat.status, 200);

    owner.kill();
    await waitForExit(owner, 3000);
    const exited = await waitForExit(lab, 5000);
    assert.equal(exited.code, 0);
  } finally {
    if (owner.exitCode == null && owner.signalCode == null) owner.kill();
    if (lab.exitCode == null && lab.signalCode == null) lab.kill();
  }
});
