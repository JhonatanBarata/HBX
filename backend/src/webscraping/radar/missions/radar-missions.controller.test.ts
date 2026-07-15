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

  assert.deepEqual(captured.stages, ['enrich_lead', 'xray_note']);
});
