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
    (overrides?.customerProfileService || {}) as any,
    ({ sendText: async () => undefined, ...(overrides?.webwhatsBridge || {}) } as any),
  );

  return { service, prisma };
}

test('upsertAtendimentoCustomerLocal reuses known customer profile before syncing atendimento projection', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-1' };
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({
        id: 'profile-existing',
        name: 'Cliente conhecido',
        status: 'active',
      }),
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Cliente conhecido',
    conversationId: 42,
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, 'profile-existing');
  assert.equal(upsertCalls[0].route, 'atendimento');
});

test('upsertAtendimentoCustomerLocal creates provisional profile for unknown inbound number', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const profileCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-2' };
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async (input: Record<string, unknown>) => {
        profileCalls.push(input);
        return { id: 'profile-new', status: 'provisional', name: input.name ?? null };
      },
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99811-2233',
    name: 'Contato novo',
    conversationId: 99,
  });

  assert.equal(profileCalls.length, 1);
  assert.equal(profileCalls[0].status, 'provisional');
  assert.equal(profileCalls[0].externalSource, 'whatsapp_bot');
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, 'profile-new');
});

test('upsertAtendimentoCustomerLocal preserves atendimento sync when profile resolution fails', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-3' };
      },
    },
    customerProfileService: {
      normalizePhone: () => '5519998000000',
      upsertProfile: async () => {
        throw new Error('db temporarily unavailable');
      },
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99800-0000',
    name: 'Sem regressao',
    conversationId: 77,
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, null);
  assert.equal(upsertCalls[0].route, 'atendimento');
});

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
