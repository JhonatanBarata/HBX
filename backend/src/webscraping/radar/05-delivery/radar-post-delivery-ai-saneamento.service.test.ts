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

test('enqueue + drain processam o job em fila sem bloquear o caller (fire-and-forget)', async () => {
  await withEnv('HBX_RADAR_AI_SANEAMENTO_ENABLED', 'true', async () => {
    const service = new RadarPostDeliveryAiSaneamentoService(fakeAiSaneamento({ ok: true, nomeLimpo: 'Padaria Real', segmento: 'Padaria', nota: 9, razao: 'ok' }));
    const { host, rows } = buildHost({ rows: { 'lead-1': { id: 'lead-1', metadataJson: '{}' } } });
    service.enqueue({ radarLeadId: 'lead-1', name: 'Padaria Real' }, host);
    // enqueue agenda via setTimeout(...,0) — aguarda o drain assincrono completar.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await service.drain();
    assert.ok(rows['lead-1'].metadataJson.includes('aiSaneamento'));
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
