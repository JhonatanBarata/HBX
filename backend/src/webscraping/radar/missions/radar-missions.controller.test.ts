import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarMissionsController } from './radar-missions.controller';

test('lease HTTP explicito com enrich_search_item responde vazio sem tocar a fila', async () => {
  let captured: any = null;
  const queue = {
    lease: async (input: any) => { captured = input; return { supported: true, paused: false, missions: [] }; },
  };
  const controller = new RadarMissionsController(queue as any, {} as any);

  const result = await controller.lease({ workerId: 'ponte', stages: ['enrich_search_item'], batchSize: 5 });

  assert.equal(captured, null);
  assert.deepEqual(result, { supported: true, paused: false, missions: [] });
});

test('lease HTTP sem stages usa somente os stages publicos da PONTE', async () => {
  let captured: any = null;
  const queue = {
    lease: async (input: any) => { captured = input; return { supported: true, paused: false, missions: [] }; },
  };
  const controller = new RadarMissionsController(queue as any, {} as any);

  await controller.lease({ workerId: 'ponte', batchSize: 5 });

  assert.deepEqual(captured.stages, ['local_deep_enrich_v1']);
});

test('complete HTTP recusa local_deep_enrich_v1: conclusão pertence à função transacional do banco', async () => {
  let completeCalled = false;
  const queue = {
    getLeasedContext: async () => ({ ok: true, stage: 'local_deep_enrich_v1', payload: {} }),
    complete: async () => { completeCalled = true; return { ok: true }; },
  };
  const resultApply = { apply: async () => { throw new Error('não deve aplicar no backend'); } };
  const controller = new RadarMissionsController(queue as any, resultApply as any);

  const result = await controller.complete('m-local', { leaseId: 'lease-local', result: { qualquer: true } });

  assert.deepEqual(result, { ok: false, reason: 'direct_db_commit_required', retryable: false });
  assert.equal(completeCalled, false);
});
