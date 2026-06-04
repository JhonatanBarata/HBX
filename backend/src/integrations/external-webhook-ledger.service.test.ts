import test from 'node:test';
import assert from 'node:assert/strict';

import { ExternalWebhookLedgerService, externalWebhookPayloadHash } from './external-webhook-ledger.service';

function createPrismaStub() {
  const rows: any[] = [];
  function keyOf(where: any) {
    return where?.provider_eventId || {};
  }
  function findByUnique(where: any) {
    const key = keyOf(where);
    return rows.find((row) => row.provider === key.provider && row.eventId === key.eventId) || null;
  }
  return {
    rows,
    externalWebhookEvent: {
      findUnique: async ({ where }: any) => findByUnique(where),
      create: async ({ data }: any) => {
        const existing = rows.find((row) => row.provider === data.provider && row.eventId === data.eventId);
        if (existing) {
          const error: any = new Error('unique constraint');
          error.code = 'P2002';
          throw error;
        }
        const row = {
          id: `evt_${rows.length + 1}`,
          processedAt: null,
          createdAt: new Date('2026-06-04T00:00:00.000Z'),
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
