import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RadarPostDeliveryAiSaneamentoService,
  type RadarPostDeliveryAiSaneamentoHost,
} from './radar-post-delivery-ai-saneamento.service';
import type { AiSaneamentoService, AiSaneamentoComNotaResult } from '../03-enrichment/ai-saneamento.service';

function fakeAiSaneamento(result: AiSaneamentoComNotaResult): AiSaneamentoService {
  return { saneiaComNota: async () => result } as unknown as AiSaneamentoService;
}

function buildHost(overrides: Partial<RadarPostDeliveryAiSaneamentoHost> & { rows?: Record<string, any> } = {}) {
  const rows: Record<string, any> = overrides.rows || {};
  const updates: Array<{ id: string; metadataJson: string }> = [];
  const host: RadarPostDeliveryAiSaneamentoHost = {
    loadRadarLeadPoolRow: overrides.loadRadarLeadPoolRow || (async (id: string) => rows[id] || null),
    updateRadarLeadPoolMetadata: overrides.updateRadarLeadPoolMetadata || (async (id: string, metadataJson: string) => {
      updates.push({ id, metadataJson });
      rows[id] = { ...(rows[id] || {}), metadataJson };
    }),
  };
  return { host, rows, updates };
}

function withEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test('runOne e no-op (skipped/disabled) quando a flag esta OFF (default)', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', undefined, async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({ ok: true, nomeLimpo: 'X', segmento: 'Y', nota: 8, razao: 'z' }));
    const { host, updates } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: '{}' } } });
    const outcome = await service.runOne({ radarLeadId: 'lead-1', name: 'Empresa X' }, host);
    assert.equal(outcome.status, 'skipped');
    assert.equal(outcome.reason, 'disabled');
    assert.equal(updates.length, 0);
  });
});

test('runOne grava metadataJson.aiSaneamento SEM tocar em name/segment (aditivo estrito) quando a flag esta ON', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({
      ok: true,
      nomeLimpo: 'Padaria Real',
      segmento: 'Padaria',
      nota: 9,
      razao: 'Nome comercial claro',
    }));
    const { host, rows } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: JSON.stringify({ targetType: 'pj' }) } } });
    const outcome = await service.runOne({ radarLeadId: 'lead-1', name: 'PADARIA REAL LTDA', city: 'Fortaleza', state: 'CE' }, host);
    assert.equal(outcome.status, 'completed');
    assert.equal(outcome.nota, 9);
    const savedMeta = JSON.parse(rows['lead-1'].metadataJson);
    assert.equal(savedMeta.targetType, 'pj'); // campo anterior preservado
    assert.equal(savedMeta.aiSaneamento.nomeLimpo, 'Padaria Real');
    assert.equal(savedMeta.aiSaneamento.nota, 9);
    assert.equal(savedMeta.aiSaneamento.model, 'qwen3:4b-instruct');
    assert.equal(savedMeta.aiSaneamento.contractVersion, 'ai_saneamento_4b_v1');
    assert.equal(savedMeta.aiSaneamento.promptVersion, 1);
    assert.equal(savedMeta.aiSaneamento.attempt, 1);
    assert.ok(savedMeta.aiSaneamento.saneadoAt > 0);
    assert.equal(savedMeta.name, undefined);
    assert.equal(savedMeta.segment, undefined);
  });
});

test('runOne e idempotente: card ja saneado (aiSaneamento.saneadoAt presente) nao rechama a IA', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    let calls = 0;
    const aiSaneamento = { saneiaComNota: async () => { calls += 1; return { ok: true, nomeLimpo: 'A', segmento: 'B', nota: 5, razao: 'r' }; } } as unknown as AiSaneamentoService;
    const service = new RadarPostDeliveryAiSaneamentoService(aiSaneamento);
    const { host } = buildHost({
      rows: { 'lead-1': { id: 'lead-1', metadataJson: JSON.stringify({ aiSaneamento: { nota: 7, saneadoAt: Date.now() } }) } },
    });
    const outcome = await service.runOne({ radarLeadId: 'lead-1', name: 'Empresa X' }, host);
    assert.equal(outcome.status, 'skipped');
    assert.equal(outcome.reason, 'ja_saneado');
    assert.equal(calls, 0);
  });
});

test('runOne devolve partial_error (sem lancar) quando a IA degrada (Ollama offline)', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({ ok: false, nomeLimpo: null, segmento: null, nota: null, razao: null }));
    const { host, updates } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: '{}' } } });
    const outcome = await service.runOne({ radarLeadId: 'lead-1', name: 'Empresa X' }, host);
    assert.equal(outcome.status, 'partial_error');
    assert.equal(updates.length, 0);
  });
});

test('runOne skip quando o card nao existe mais no pool (nunca lanca)', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({ ok: true, nomeLimpo: 'A', segmento: 'B', nota: 5, razao: 'r' }));
    const { host } = buildHost({ rows: {} });
    const outcome = await service.runOne({ radarLeadId: 'lead-inexistente', name: 'Empresa X' }, host);
    assert.equal(outcome.status, 'skipped');
    assert.equal(outcome.reason, 'card_nao_encontrado');
  });
});

test('enqueue materializa job durável sem bloquear o caller', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    const calls: any[] = [];
    const queue = { enqueueAiSaneamento4b: async (input: any) => { calls.push(input); return { created: true, missionId: 'm1' }; } };
    const service = new RadarPostDeliveryAiSaneamentoService(
      fakeAiSaneamento({ ok: true, nomeLimpo: 'Padaria Real', segmento: 'Padaria', nota: 9, razao: 'ok' }),
      queue as any,
    );
    const { host } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: '{}' } } });
    service.enqueue({ radarLeadId: 'lead-1', name: 'Padaria Real' }, host);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].radarLeadId, 'lead-1');
    assert.equal(calls[0].priority, 100);
  });
});

test('enqueue e no-op quando a flag esta OFF — nunca enfileira', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', undefined, async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({ ok: true, nomeLimpo: 'A', segmento: 'B', nota: 9, razao: 'r' }));
    const { host, rows } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: '{}' } } });
    service.enqueue({ radarLeadId: 'lead-1', name: 'Empresa X' }, host);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(rows['lead-1'].metadataJson, '{}');
  });
});

test('worker 4B durável leaseia allowlist explícita, pulsa heartbeat e completa com modelo observável', async () => {
  await withEnv('HBX_MISSION_QUEUE_ENABLED', 'true', async () => {
    await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
      const rows: Record<string, any> = { 'lead-1': { id: 'lead-1', metadataJson: JSON.stringify({ localDeepEnrich: { keep: true } }) } };
      let leased = false;
      const leaseRequests: any[] = [];
      const completed: any[] = [];
      const queue = {
        lease: async (input: any) => {
          leaseRequests.push(input);
          if (leased) return { supported: true, paused: false, missions: [] };
          leased = true;
          return {
            supported: true,
            paused: false,
            missions: [{
              id: 'm-4b',
              stage: 'ai_saneamento_4b_v1',
              payloadVersion: 1,
              payload: {
                model: 'qwen3:4b-instruct',
                promptVersion: 1,
                radarLeadId: 'lead-1',
                name: 'Empresa Um',
              },
              attempts: 1,
              maxAttempts: 3,
              leaseId: 'lease-4b',
              leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
              heartbeatSeconds: 10,
            }],
          };
        },
        heartbeat: async () => ({ ok: true }),
        complete: async (...args: any[]) => { completed.push(args); return { ok: true }; },
        fail: async () => ({ ok: true }),
      };
      const prisma = {
        hasTable: async () => true,
        radarLeadPool: {
          findUnique: async ({ where }: any) => rows[where.id] || null,
          update: async ({ where, data }: any) => { rows[where.id] = { ...rows[where.id], ...data }; return rows[where.id]; },
        },
      };
      const service = new RadarPostDeliveryAiSaneamentoService(
        fakeAiSaneamento({ ok: true, nomeLimpo: 'Empresa Um', segmento: 'Serviços', nota: 8, razao: 'empresa real' }),
        queue as any,
        prisma as any,
      );

      await service.drain();

      assert.ok(leaseRequests.every((request) => request.stages?.length === 1 && request.stages[0] === 'ai_saneamento_4b_v1'));
      assert.equal(completed.length, 1);
      assert.equal(completed[0][2].outcome, 'completed');
      assert.equal(completed[0][2].model, 'qwen3:4b-instruct');
      const saved = JSON.parse(rows['lead-1'].metadataJson);
      assert.deepEqual(saved.localDeepEnrich, { keep: true });
      assert.equal(saved.aiSaneamento.model, 'qwen3:4b-instruct');
    });
  });
});

test('worker 4B manda indisponibilidade para retry/dead-letter sem completar', async () => {
  await withEnv('HBX_MISSION_QUEUE_ENABLED', 'true', async () => {
    await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
      let leased = false;
      const failures: any[] = [];
      const queue = {
        lease: async () => leased
          ? { supported: true, paused: false, missions: [] }
          : (leased = true, {
              supported: true,
              paused: false,
              missions: [{
                id: 'm-fail', stage: 'ai_saneamento_4b_v1', payloadVersion: 1,
                payload: { model: 'qwen3:4b-instruct', promptVersion: 1, radarLeadId: 'lead-1', name: 'Empresa' },
                attempts: 2, maxAttempts: 3, leaseId: 'lease-fail', leaseExpiresAt: new Date().toISOString(), heartbeatSeconds: 10,
              }],
            }),
        heartbeat: async () => ({ ok: true }),
        complete: async () => { throw new Error('não deve completar'); },
        fail: async (...args: any[]) => { failures.push(args); return { ok: true, status: 'queued' }; },
      };
      const prisma = {
        hasTable: async () => true,
        radarLeadPool: {
          findUnique: async () => ({ id: 'lead-1', metadataJson: '{}' }),
          update: async () => { throw new Error('não deve gravar'); },
        },
      };
      const service = new RadarPostDeliveryAiSaneamentoService(
        fakeAiSaneamento({ ok: false, nomeLimpo: null, segmento: null, nota: null, razao: null }),
        queue as any,
        prisma as any,
      );

      await service.drain();

      assert.equal(failures.length, 1);
      assert.equal(failures[0][3], true);
      assert.match(failures[0][2], /model=qwen3:4b-instruct/);
    });
  });
});
