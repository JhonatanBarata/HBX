import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarCoreSearchLoopMixin } from './radar-core-search-loop.mixin';

function input() {
  return { targetType: 'pj', city: 'Campinas', state: 'SP', segment: 'restaurante' } as any;
}

test('pos-save duravel deduplica ids e separa web/social por dedupeKey', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  const enqueued: any[] = [];
  instance.getMissionQueue = () => ({
    enabled: () => true,
    supportsMissionPersistence: async () => true,
    isQueuePaused: async () => false,
    enqueue: async (job: any) => { enqueued.push(job); return { created: true, missionId: `m${enqueued.length}` }; },
  });
  instance.drainRadarPostSaveEnrichmentQueue = async () => undefined;

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 1, userId: 2 },
    'run-1',
    input(),
    ['a', 'a'],
    ['a', 'b', 'b'],
  );

  assert.deepEqual(enqueued.map((job) => job.dedupeKey), [
    'run:run-1:item:a:web',
    'run:run-1:item:b:web',
    'run:run-1:item:a:social',
  ]);
  assert.ok(enqueued.every((job) => job.stage === 'enrich_search_item'));
  assert.ok(enqueued.every((job) => job.payload.companyId === 1 && job.payload.userId === 2));
  assert.ok(enqueued.every((job) => !('context' in job.payload)));
});

test('payload duravel nao persiste usuario, tokens, senha ou telefones do input', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let payload: any = null;
  instance.getMissionQueue = () => ({
    enabled: () => true,
    supportsMissionPersistence: async () => true,
    isQueuePaused: async () => true,
    enqueue: async (job: any) => { payload = job.payload; return { created: true, missionId: 'm-safe' }; },
  });

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 7, userId: 9, user: { password: 'senha-super-secreta', token: 'jwt-secreto', phone: '11999990000' } },
    'run-safe',
    {
      ...input(),
      excludePhoneDigits: ['11999990000'],
      password: 'senha-no-input',
      accessToken: 'token-no-input',
      phone: '11888880000',
    },
    [],
    ['lead-safe'],
  );

  const serialized = JSON.stringify(payload);
  assert.equal(payload.companyId, 7);
  assert.equal(payload.userId, 9);
  assert.equal(payload.context, undefined);
  assert.equal(payload.user, undefined);
  for (const forbidden of ['password', 'token', 'phone', 'excludePhoneDigits', '11999990000', '11888880000', 'jwt-secreto']) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `payload não deve conter ${forbidden}`);
  }
});

test('falha parcial da persistencia cai para memoria somente no item que falhou', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  const durable: string[] = [];
  const memory: string[] = [];
  instance.logger = { warn: () => undefined };
  instance.getMissionQueue = () => ({
    enabled: () => true,
    supportsMissionPersistence: async () => true,
    isQueuePaused: async () => false,
    enqueue: async (job: any) => {
      if (job.payload.leadId === 'b') throw new Error('db offline');
      durable.push(job.payload.leadId);
      return { created: true, missionId: `m-${job.payload.leadId}` };
    },
  });
  instance.enqueueRadarWebEnrichmentForSavedLeads = (_context: any, _run: string, _input: any, ids: string[]) => memory.push(...ids);
  instance.enqueueRadarSocialLookupForSavedLeads = () => undefined;
  instance.drainRadarPostSaveEnrichmentQueue = async () => undefined;

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 1, userId: 2 },
    'run-2',
    input(),
    [],
    ['a', 'b'],
  );

  assert.deepEqual(durable, ['a']);
  assert.deepEqual(memory, ['b']);
});

test('flag da fila OFF usa fallback legado quando PARAR TUDO esta liberado', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let touched = false;
  instance.getMissionQueue = () => ({ enabled: () => false, isQueuePaused: async () => false });
  instance.enqueueRadarWebEnrichmentForSavedLeads = () => { touched = true; };
  instance.enqueueRadarSocialLookupForSavedLeads = () => undefined;

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 1, userId: 2 }, 'run-off', input(), [], ['a'],
  );

  assert.equal(touched, true);
});

test('flag da fila OFF nao usa fallback quando PARAR TUDO esta pausado', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let touched = false;
  instance.getMissionQueue = () => ({ enabled: () => false, isQueuePaused: async () => true });
  instance.enqueueRadarWebEnrichmentForSavedLeads = () => { touched = true; };

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 1, userId: 2 }, 'run-off-paused', input(), [], ['a'],
  );

  assert.equal(touched, false);
});

test('fila pausada persiste o job mas nao dispara drain nem fallback', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let enqueued = 0;
  let drained = 0;
  let memory = 0;
  instance.getMissionQueue = () => ({
    enabled: () => true,
    supportsMissionPersistence: async () => true,
    isQueuePaused: async () => true,
    enqueue: async () => { enqueued += 1; return { created: true, missionId: 'm1' }; },
  });
  instance.drainRadarPostSaveEnrichmentQueue = async () => { drained += 1; };
  instance.enqueueRadarWebEnrichmentForSavedLeads = () => { memory += 1; };

  await instance.enqueueRadarPostSaveEnrichmentForSavedLeads(
    { companyId: 1, userId: 2 }, 'run-pausado', input(), [], ['a'],
  );
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(enqueued, 1);
  assert.equal(drained, 0);
  assert.equal(memory, 0);
});

test('drain reconstrui contexto minimo e input sem contatos a partir do payload seguro', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let leased = false;
  let captured: any = null;
  let completed = 0;
  let heartbeats = 0;
  let timerStarted = 0;
  let timerCleared = 0;
  instance.getMissionQueue = () => ({
    enabled: () => true,
    lease: async () => {
      if (leased) return { supported: true, paused: false, missions: [] };
      leased = true;
      return {
        supported: true,
        paused: false,
        missions: [{
          id: 'm1', leaseId: 'lease1', heartbeatSeconds: 10,
          payload: { mode: 'web', companyId: 3, userId: 4, runId: 'r1', leadId: 'l1', input: input() },
        }],
      };
    },
    heartbeat: async () => { heartbeats += 1; return { ok: true }; },
    complete: async () => { completed += 1; return { ok: true }; },
    fail: async () => ({ ok: true }),
  });
  instance.runRadarWebEnrichmentForSavedLead = async (context: any, leadId: string, normalized: any, engineUrl: any) => {
    captured = { context, leadId, normalized, engineUrl };
  };

  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  (global as any).setInterval = () => { timerStarted += 1; return { unref: () => undefined }; };
  (global as any).clearInterval = () => { timerCleared += 1; };
  try {
    await instance.drainRadarPostSaveEnrichmentQueue();
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }

  assert.deepEqual(captured.context, { companyId: 3, userId: 4, user: null });
  assert.equal(captured.leadId, 'l1');
  assert.deepEqual(captured.normalized.excludePhoneDigits, []);
  assert.equal(captured.normalized.salesProfile, null);
  assert.equal(captured.engineUrl, undefined);
  assert.equal(heartbeats, 1, 'heartbeat inicial prova o lease antes do trabalho');
  assert.equal(timerStarted, 1, 'heartbeat periódico é iniciado durante o trabalho');
  assert.equal(timerCleared, 1, 'timer é sempre limpo ao terminar');
  assert.equal(completed, 1);
});

test('drain nao processa nem completa missao com lease stale no heartbeat inicial', async () => {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  let workerCalls = 0;
  let completeCalls = 0;
  instance.getMissionQueue = () => ({
    enabled: () => true,
    lease: async () => ({
      supported: true,
      paused: false,
      missions: [{
        id: 'm-stale', leaseId: 'lease-stale', heartbeatSeconds: 10,
        payload: { mode: 'web', companyId: 3, userId: 4, runId: 'r1', leadId: 'l1', input: input() },
      }],
    }),
    heartbeat: async () => ({ ok: false, reason: 'stale_lease' }),
    complete: async () => { completeCalls += 1; return { ok: false }; },
    fail: async () => ({ ok: false }),
  });
  instance.runRadarWebEnrichmentForSavedLead = async () => { workerCalls += 1; };
  // Uma única rodada: após detectar stale, o próximo lease devolve vazio.
  let leases = 0;
  const queue = instance.getMissionQueue();
  const firstLease = queue.lease;
  queue.lease = async () => {
    leases += 1;
    return leases === 1 ? firstLease() : { supported: true, paused: false, missions: [] };
  };
  instance.getMissionQueue = () => queue;

  await instance.drainRadarPostSaveEnrichmentQueue();

  assert.equal(workerCalls, 0);
  assert.equal(completeCalls, 0);
});
