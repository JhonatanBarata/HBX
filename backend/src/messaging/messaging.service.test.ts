import test from 'node:test';
import assert from 'node:assert/strict';

import { MessagingService } from './messaging.service';

function createService(overrides?: Partial<Record<string, any>>) {
  const prisma = {
    hasTable: async () => false,
    hasColumn: async () => false,
    company: {
      findFirst: async ({ where }: any) => {
        if (String(where?.whatsappPhoneNumberId || '') === 'phone-number-id') {
          return { id: 7, whatsappPhoneNumberId: 'phone-number-id' };
        }
        return null;
      },
    },
    ...(overrides?.prisma || {}),
  } as any;

  const service = new MessagingService(
    prisma,
    (overrides?.sessions || {}) as any,
    (overrides?.orchestrator || {}) as any,
    (overrides?.drafts || {}) as any,
    (overrides?.conversations || {}) as any,
    ({ log: async () => undefined, ...(overrides?.audit || {}) } as any),
    (overrides?.mercadoPagoClient || {}) as any,
    (overrides?.cadastrosService || {}) as any,
  );

  return { service, prisma };
}

test('handleInboundProxyMessage normalizes template inbound as text before persistence', async () => {
  const { service } = createService();
  let captured: Record<string, unknown> | null = null;
  (service as any).handleInboundMessage = async (input: Record<string, unknown>) => {
    captured = input;
    return { ok: true };
  };

  const result = await service.handleInboundProxyMessage({
    whatsappPhoneNumberId: 'phone-number-id',
    from: '+55 19 99887-7766',
    text: 'Cliente respondeu ao template',
    inboundType: 'template',
    rawPayload: { source: 'proxy' },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured?.companyId, 7);
  assert.equal(captured?.messageType, 'text');
  assert.equal(captured?.text, 'Cliente respondeu ao template');
});

test('handleInboundProxyMessage discards unmapped company without invoking persistence', async () => {
  const { service } = createService({
    prisma: {
      company: {
        findFirst: async () => null,
      },
    },
  });
  let called = false;
  (service as any).handleInboundMessage = async () => {
    called = true;
  };

  const result = await service.handleInboundProxyMessage({
    whatsappPhoneNumberId: 'missing-company',
    from: '+5519998877766',
    text: 'oi',
    inboundType: 'text',
  });

  assert.deepEqual(result, { ok: true, discarded: true });
  assert.equal(called, false);
});
