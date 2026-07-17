'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');

const storageDir = path.join(os.tmpdir(), `hbx-local-lab-maintenance-${process.pid}-${Date.now()}`);
process.env.HBX_LOCAL_LAB_STORAGE_DIR = storageDir;

const lab = require('../server');
const recovery = require('../../hbx-owner/local-agent/local-deep-unclog-supervisor');

function fakeJob(overrides = {}) {
  const createdAt = overrides.createdAt || new Date(Date.now() - 10_000).toISOString();
  return {
    id: overrides.id || `job-${Math.random().toString(16).slice(2)}`,
    batchId: overrides.batchId || 'batch-test',
    status: overrides.status || 'queued',
    contractVersion: 'local_deep_enrich_v1',
    missionId: overrides.missionId || 'mission-test',
    radarLeadId: overrides.radarLeadId || 'lead-test',
    workVersion: overrides.workVersion || 1,
    city: 'Campinas',
    state: 'SP',
    segment: 'Teste',
    targetEmails: 3,
    mode: 'enrich_missing_email',
    aggressive: false,
    providers: ['site_crawl'],
    requestedBy: 'test',
    seedUrls: [],
    websites: [],
    candidates: [],
    directoryUrls: [],
    socialUrls: [],
    maxCandidates: 1,
    maxPagesPerSite: 12,
    maxDiscoveredLinks: 24,
    maxDirectoryUrls: 0,
    maxSocialUrls: 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    blockBackoffMs: 0,
    metrics: { sitesVisited: 0, emailsFound: 0, emailsAccepted: 0, leads: 0 },
    warnings: [],
    error: null,
    exportReady: false,
    createdAt,
    queuedAt: createdAt,
    startedAt: overrides.startedAt || null,
    lastProgressAt: overrides.lastProgressAt || createdAt,
    finishedAt: null,
    result: null,
    abortController: overrides.abortController || null,
    supersededBy: null,
    quarantinedAt: null,
    ...overrides,
  };
}

function persisted(job) {
  return {
    ...job,
    resumableInput: {
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
    },
  };
}

test.afterEach(async () => {
  lab.resetInMemoryStateForTests();
  await fs.rm(storageDir, { recursive: true, force: true });
});

test('watchdog aborta running sem progresso e publica failed', async () => {
  const nowMs = Date.now();
  let aborted = false;
  const job = fakeJob({
    id: 'running-stale',
    status: 'running',
    startedAt: new Date(nowMs - 4 * 60_000).toISOString(),
    lastProgressAt: new Date(nowMs - 4 * 60_000).toISOString(),
    abortController: { abort() { aborted = true; } },
  });
  lab.jobs.set(job.id, job);

  const report = await lab.maintenanceUnclog({
    source: 'watchdog',
    nowMs,
    force: false,
    startScheduler: false,
  });

  assert.equal(aborted, true);
  assert.equal(job.status, 'failed_watchdog');
  assert.equal(lab.publicJobStatus(job), 'failed');
  assert.deepEqual(report.canceled, ['running-stale']);
  assert.match(job.error, /failed_watchdog:no_progress/);
});

test('desentupidor mantém apenas o job mais recente por missão e reconstrói fila', async () => {
  const nowMs = Date.now();
  const older = fakeJob({
    id: 'duplicate-old',
    createdAt: new Date(nowMs - 60_000).toISOString(),
    queuedAt: new Date(nowMs - 60_000).toISOString(),
  });
  const newer = fakeJob({
    id: 'duplicate-new',
    createdAt: new Date(nowMs - 10_000).toISOString(),
    queuedAt: new Date(nowMs - 10_000).toISOString(),
  });
  lab.jobs.set(older.id, older);
  lab.jobs.set(newer.id, newer);

  const report = await lab.maintenanceUnclog({
    source: 'manual',
    nowMs,
    startScheduler: false,
  });

  assert.equal(older.status, 'superseded');
  assert.equal(older.supersededBy, newer.id);
  assert.equal(newer.status, 'queued');
  assert.deepEqual(report.pendingRebuilt, [newer.id]);
});

test('boot não ressuscita running, quarentena job antigo e elimina duplicado', () => {
  const nowMs = Date.now();
  const interrupted = fakeJob({
    id: 'interrupted-new',
    status: 'running',
    missionId: 'mission-a',
    createdAt: new Date(nowMs - 60_000).toISOString(),
  });
  const duplicate = fakeJob({
    id: 'duplicate-old',
    status: 'queued',
    missionId: 'mission-a',
    createdAt: new Date(nowMs - 120_000).toISOString(),
  });
  const stale = fakeJob({
    id: 'stale-old',
    status: 'queued',
    missionId: 'mission-b',
    createdAt: new Date(nowMs - 2 * 24 * 60 * 60_000).toISOString(),
  });

  const restored = lab.applyBootPolicy(
    [persisted(interrupted), persisted(duplicate), persisted(stale)],
    { nowMs, circuitOpen: false },
  );
  const byId = new Map(restored.map((job) => [job.id, job]));

  assert.equal(byId.get('interrupted-new').status, 'failed_watchdog');
  assert.equal(byId.get('duplicate-old').status, 'superseded');
  assert.equal(byId.get('stale-old').status, 'quarantined');
});

test('disjuntor abre na terceira recuperação dentro de 30 minutos', () => {
  const nowMs = Date.now();
  const first = recovery.shouldOpenRecoveryCircuit([], nowMs, 3, 30 * 60_000);
  const second = recovery.shouldOpenRecoveryCircuit(first.events, nowMs + 60_000, 3, 30 * 60_000);
  const third = recovery.shouldOpenRecoveryCircuit(second.events, nowMs + 120_000, 3, 30 * 60_000);

  assert.equal(first.open, false);
  assert.equal(second.open, false);
  assert.equal(third.open, true);
  assert.equal(third.events.length, 3);
});

test('assinatura de progresso muda quando o crawler avança', () => {
  const baseJob = {
    status: 'running',
    lastProgressAt: '2026-07-17T10:00:00.000Z',
    metrics: { sitesVisited: 0, emailsFound: 0, emailsAccepted: 0, leads: 0 },
  };
  const nextJob = {
    ...baseJob,
    lastProgressAt: '2026-07-17T10:00:30.000Z',
    metrics: { ...baseJob.metrics, sitesVisited: 1 },
  };

  assert.notEqual(recovery.buildJobSignature(baseJob), recovery.buildJobSignature(nextJob));
});
