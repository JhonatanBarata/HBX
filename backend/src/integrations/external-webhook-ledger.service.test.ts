import test from 'node:test';
import assert from 'node:assert/strict';

import { ExternalWebhookLedgerService, externalWebhookPayloadHash, retryBackoffMs } from './external-webhook-ledger.service';

function createPrismaStub() {
  const rows: any[] = [];
  function keyOf(where: any) {
    return where?.provider_eventId || {};
  }
  function findByUnique(where: any) {
    const key = keyOf(where);
    return rows.find((row) => row.provider === key.provider && row.eventId === key.eventId) || null;
  }
  function matches(row: any, where: any): boolean {
    for (const [k, v] of Object.entries(where || {})) {
      if (k === 'OR') {
        const ok = (v as any[]).some((clause) => matches(row, clause));
        if (!ok) return false;
        continue;
      }
      const cur = row[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in (v as any) && !(v as any).in.includes(cur)) return false;
        if ('lte' in (v as any) && !(cur != null && cur <= (v as any).lte)) return false;
        if ('not' in (v as any) && cur === (v as any).not) return false;
      } else if (cur !== v) {
        return false;
      }
    }
    return true;
  }
  return {
    rows,
    externalWebhookEvent: {
      findUnique: async ({ where }: any) => findByUnique(where),
      findMany: async ({ where, take, orderBy }: any) => {
        let out = rows.filter((row) => matches(row, where));
        if (orderBy?.createdAt === 'asc') out = out.slice().sort((a, b) => a.createdAt - b.createdAt);
        if (typeof take === 'number') out = out.slice(0, take);
        return out.map((r) => ({ ...r }));
      },
      updateMany: async ({ where, data }: any) => {
        const affected = rows.filter((row) => matches(row, where));
        for (const row of affected) Object.assign(row, data, { updatedAt: new Date('2026-06-04T00:02:00.000Z') });
        return { count: affected.length };
      },
      create: async ({ data }: any) => {
        const existing = rows.find((row) => row.provider === data.provider && row.eventId === data.eventId);
        if (existing) {
          const error: any = new Error('unique constraint');
          error.code = 'P2002';
          throw error;
        }
        const row = {
          id: `evt_${rows.length + 1}`,
          attempts: 0,
          nextRetryAt: null,
          lastError: null,
          payload: null,
          processedAt: null,
          createdAt: new Date(`2026-06-04T00:00:0${rows.length}.000Z`),
          updatedAt: new Date('2026-06-04T00:00:00.000Z'),
          ...data,
        };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = findByUnique(where);
        if (!row) throw new Error('row not found');
        Object.assign(row, data, { updatedAt: new Date('2026-06-04T00:01:00.000Z') });
        return row;
      },
    },
  };
}

test('payload hash e estavel com chaves fora de ordem', () => {
  const left = externalWebhookPayloadHash({ b: 2, a: { d: 4, c: 3 } });
  const right = externalWebhookPayloadHash({ a: { c: 3, d: 4 }, b: 2 });
  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/);
});

test('recordReceived cria evento e duplicado nao duplica', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);

  const first = await service.recordReceived('MercadoPago', 'payment_123', { id: 123 }, {
    companyId: 7,
    eventType: 'payment.updated',
    signatureStatus: 'unchecked',
  });
  const duplicate = await service.recordReceived('mercadopago', 'payment_123', { id: 123 }, {
    companyId: 7,
    eventType: 'payment.updated',
    signatureStatus: 'unchecked',
  });

  assert.equal(first?.duplicate, false);
  assert.equal(first?.provider, 'mercadopago');
  assert.equal(first?.companyId, 7);
  assert.equal(first?.eventType, 'payment.updated');
  assert.equal(first?.signatureStatus, 'unchecked');
  assert.match(String(first?.payloadHash), /^[a-f0-9]{64}$/);
  assert.equal(duplicate?.duplicate, true);
  assert.equal(prisma.rows.length, 1);
});

test('wasProcessed e markProcessed usam chave provider/eventId', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  await service.recordReceived('whatsapp', 'wamid.1', { entry: [] });

  assert.equal(await service.wasProcessed('whatsapp', 'wamid.1'), false);
  const processedAt = new Date('2026-06-04T01:00:00.000Z');
  const processed = await service.markProcessed('whatsapp', 'wamid.1', processedAt);

  assert.equal(processed?.status, 'processed');
  assert.equal(processed?.processedAt, processedAt);
  assert.equal(await service.wasProcessed('whatsapp', 'wamid.1'), true);
});

test('markRejected grava status sem marcar processedAt', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  await service.recordReceived('whatsapp', 'bad_signature_1', { entry: [] }, {
    signatureStatus: 'invalid',
  });

  const rejected = await service.markRejected('whatsapp', 'bad_signature_1', 'invalid');

  assert.equal(rejected?.status, 'rejected');
  assert.equal(rejected?.signatureStatus, 'invalid');
  assert.equal(rejected?.processedAt, null);
  assert.equal(await service.wasProcessed('whatsapp', 'bad_signature_1'), false);
});

// ---- ARQ11 S1: fila durável (payload, claim de lote, retry, dead-letter) ----

test('recordReceived guarda o payload completo para replay', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  const payload = { leadgenId: 'lead-1', pageId: 'page-9', formId: 'form-3', createdTime: null };
  const rec = await service.recordReceived('meta_lead_ads', 'lead-1', payload, { eventType: 'leadgen' });
  assert.deepEqual(rec?.payload, payload);
  assert.equal(rec?.status, 'received');
  assert.equal(rec?.attempts, 0);
});

test('claimBatchForProcessing move para processing e devolve só o que reclamou', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  await service.recordReceived('meta_lead_ads', 'e1', { leadgenId: 'e1' });
  await service.recordReceived('meta_lead_ads', 'e2', { leadgenId: 'e2' });
  await service.recordReceived('outro', 'x1', { leadgenId: 'x1' }); // provider diferente: não entra

  const claimed = await service.claimBatchForProcessing('meta_lead_ads', 10);
  assert.equal(claimed.length, 2);
  assert.ok(claimed.every((c) => c?.status === 'processing'));
  // Reclamar de novo não devolve nada (já saíram de received/retry).
  const again = await service.claimBatchForProcessing('meta_lead_ads', 10);
  assert.equal(again.length, 0);
});

test('claimBatchForProcessing respeita nextRetryAt (só reclama o que já está pronto)', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  const now = new Date('2026-07-03T12:00:00.000Z');
  await service.recordReceived('meta_lead_ads', 'ready', { leadgenId: 'ready' });
  await service.recordReceived('meta_lead_ads', 'later', { leadgenId: 'later' });
  // 'later' agendado para o futuro:
  await service.markRetry('meta_lead_ads', 'later', 'transitório', now);

  const claimed = await service.claimBatchForProcessing('meta_lead_ads', 10, now);
  const ids = claimed.map((c) => c?.eventId).sort();
  assert.deepEqual(ids, ['ready'], 'apenas o evento sem nextRetryAt futuro é reclamado');
});

test('markRetry: backoff cresce e vai a dead_letter na 8ª tentativa', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  const now = new Date('2026-07-03T00:00:00.000Z');
  await service.recordReceived('meta_lead_ads', 'r1', { leadgenId: 'r1' });

  let res: any = null;
  for (let i = 1; i <= 7; i++) {
    res = await service.markRetry('meta_lead_ads', 'r1', `falha ${i}`, now);
    assert.equal(res.attempts, i);
    assert.equal(res.deadLettered, false, `tentativa ${i} não deve morrer ainda`);
    assert.equal(res.row.status, 'retry');
    assert.ok(res.row.nextRetryAt instanceof Date);
  }
  // 8ª → dead_letter
  res = await service.markRetry('meta_lead_ads', 'r1', 'falha 8', now);
  assert.equal(res.attempts, 8);
  assert.equal(res.deadLettered, true);
  assert.equal(res.row.status, 'dead_letter');
  assert.equal(res.row.nextRetryAt, null);
  // não é mais reclamado
  const claimed = await service.claimBatchForProcessing('meta_lead_ads', 10, new Date('2030-01-01T00:00:00.000Z'));
  assert.equal(claimed.length, 0);
});

test('markDeadLetter descarta na hora sem consumir tentativas', async () => {
  const prisma = createPrismaStub();
  const service = new ExternalWebhookLedgerService(prisma as any);
  await service.recordReceived('meta_lead_ads', 'perm', { leadgenId: 'perm' });
  const dead = await service.markDeadLetter('meta_lead_ads', 'perm', 'lead sem contato');
  assert.equal(dead?.status, 'dead_letter');
  assert.equal(dead?.attempts, 0, 'dead-letter permanente não incrementa attempts');
  assert.equal(dead?.lastError, 'lead sem contato');
});

test('retryBackoffMs segue a escada [1min,5min,30min,2h,12h] e satura', () => {
  assert.equal(retryBackoffMs(0), 60_000);
  assert.equal(retryBackoffMs(1), 5 * 60_000);
  assert.equal(retryBackoffMs(4), 12 * 60 * 60_000);
  assert.equal(retryBackoffMs(99), 12 * 60 * 60_000);
});
