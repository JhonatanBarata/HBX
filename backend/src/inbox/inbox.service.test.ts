import test from 'node:test';
import assert from 'node:assert/strict';

import { InboxService } from './inbox.service';

function createService(overrides?: Partial<Record<string, any>>) {
  const auditCalls: Array<Record<string, unknown>> = [];
  const queueCalls: Array<Record<string, unknown>> = [];
  const conversationStateCalls: Array<Record<string, unknown>> = [];
  const baseConversation = {
    id: 42,
    companyId: 7,
    channel: 'whatsapp',
    contact: '+5519998877766',
    humanAssigned: false,
    botActive: true,
    flowResult: null,
    metadata: JSON.stringify({ cliente: 'Carlos' }),
    createdAt: new Date('2026-03-18T10:00:00.000Z'),
    updatedAt: new Date('2026-03-18T10:01:00.000Z'),
    messages: [],
  };

  const prisma = {
    atendimentoCustomer: {
      findMany: async () => [],
      findFirst: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    customerProfile: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'profile-new', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    debtCase: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'debt-1', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    companyConversation: {
      findFirst: async ({ where }: any) => {
        if (Number(where?.id || 42) === 42 && Number(where?.companyId || 7) === 7) return { ...baseConversation };
        if (Number(where?.companyId || 7) === 7) return { ...baseConversation };
        return null;
      },
      findMany: async () => [{ ...baseConversation }],
      update: async ({ where, data }: any) => ({ ...baseConversation, id: where.id, ...data }),
    },
    hbxRecoveryCustomer: {
      findFirst: async () => ({ clientName: 'Carlos', name: 'Carlos' }),
      create: async ({ data }: any) => ({ id: 'rec-1', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
    ...(overrides?.prisma || {}),
  } as any;

  const conversations = {
    queueOutboundForCompany: async (companyId: number, payload: Record<string, unknown>) => {
      queueCalls.push({ companyId, payload });
      return { id: 999 };
    },
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, unknown>) => {
      conversationStateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    recordInboundMessage: async () => ({ id: 77, conversationId: 42 }),
    ...(overrides?.conversations || {}),
  } as any;

  const audit = {
    log: async (payload: Record<string, unknown>) => {
      auditCalls.push(payload);
    },
    ...(overrides?.audit || {}),
  } as any;

  const cadastrosService = {
    ...(overrides?.cadastrosService || {}),
  } as any;

  const customerProfileService = {
    buildSharedContextRegistry: async () => ({
      byProfileId: new Map(),
      byPhoneNormalized: new Map(),
    }),
    ...(overrides?.customerProfileService || {}),
  } as any;

  const webwhatsBridge = {
    syncRecentChats: async () => 0,
    syncConversationMessages: async () => 0,
    ...(overrides?.webwhatsBridge || {}),
  } as any;

  const service = new InboxService(prisma, conversations, audit, cadastrosService, customerProfileService, webwhatsBridge);
  return { service, prisma, conversations, auditCalls, queueCalls, conversationStateCalls, cadastrosService };
}

test('sendMessage queues outbound on the real conversation with human flow state', async () => {
  const { service, queueCalls, auditCalls, conversationStateCalls } = createService();
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  const result = await service.sendMessage({ companyId: 7 }, 42, 'Olá, vamos continuar o atendimento');

  assert.equal(result.id, '42');
  assert.equal(queueCalls.length, 1);
  assert.deepEqual(queueCalls[0], {
    companyId: 7,
    payload: {
      conversationId: 42,
      to: '+5519998877766',
      body: 'Olá, vamos continuar o atendimento',
      messageType: 'text',
      sourceModule: 'atendimento_human',
      senderType: 'human',
      contactId: '+5519998877766',
      flowState: {
        humanAssigned: true,
        botActive: false,
        flowResult: null,
      },
    },
  });
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'manual_outbound_queued');
  assert.equal(conversationStateCalls.length, 0);
});

test('sendMessage clears pending Vendas agenda draft after queueing manual outbound', async () => {
  const { service, conversationStateCalls } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          contact: '+5519998877766',
          humanAssigned: false,
          botActive: true,
          flowResult: null,
          metadata: JSON.stringify({
            vendasAgendaQueue: {
              active: true,
              leadId: 'lead-1',
              draftMessage: 'Olá, Carlos. Estou retomando nosso contato pelo HBX Vendas.',
              draftPending: true,
            },
          }),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [],
        }),
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7 }, 42, 'Olá, vamos continuar o atendimento');

  assert.equal(conversationStateCalls.length, 1);
  assert.equal(conversationStateCalls[0].companyId, 7);
  assert.equal(conversationStateCalls[0].conversationId, 42);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftPending,
    false,
  );
  assert.ok((conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.lastManualSendAt);
});

test('updateConversationStatus maps open and closed to real conversation flags', async () => {
  const updatedCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          contact: '+5519998877766',
          humanAssigned: false,
          botActive: true,
          flowResult: null,
          metadata: null,
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [],
        }),
        update: async (input: Record<string, unknown>) => {
          updatedCalls.push(input);
          return input;
        },
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', status: 'open', messages: [] });

  await service.updateConversationStatus({ companyId: 7 }, 42, 'open');
  await service.updateConversationStatus({ companyId: 7 }, 42, 'closed');

  assert.deepEqual(updatedCalls, [
    {
      where: { id: 42 },
      data: { botActive: false, humanAssigned: true, flowResult: null, metadata: '{}' },
    },
    {
      where: { id: 42 },
      data: {
        botActive: false,
        humanAssigned: false,
        flowResult: 'manual_closed',
        metadata: '{}',
      },
    },
  ]);
  assert.equal(auditCalls.length, 2);
  assert.equal(auditCalls[0].event, 'conversation_status_updated');
  assert.equal(auditCalls[1].event, 'conversation_status_updated');
});

test('getConversationById exposes customer identity fields from AtendimentoCustomer and CustomerProfile', async () => {
  const { service } = createService({
    prisma: {
      atendimentoCustomer: {
        findMany: async () => [
          {
            id: 'atc-42',
            companyId: 7,
            customerProfileId: 'profile-42',
            name: 'Carlos Atendimento',
            phone: '+5519998877766',
            phoneNormalized: '5519998877766',
            registrationOrigin: 'whatsapp_bot',
            registrationStatus: 'pending_confirmation',
            route: 'atendimento',
            customerProfile: {
              id: 'profile-42',
              name: 'Carlos Eduardo',
              email: 'carlos@example.com',
              document: '12345678900',
              externalSource: 'manual',
              status: 'active',
              sourceConnectionId: 'conn-1',
            },
          },
        ],
      },
      hbxRecoveryFlowStage: {
        findFirst: async () => null,
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const conversation = await service.getConversationById({ companyId: 7 }, 42);

  assert.equal(conversation.customer.id, 'atc-42');
  assert.equal(conversation.customer.name, 'Carlos Atendimento');
  assert.equal(conversation.customer.customerProfileId, 'profile-42');
  assert.equal(conversation.customer.email, 'carlos@example.com');
  assert.equal(conversation.customer.document, '12345678900');
  assert.equal(conversation.customer.customerProfileStatus, 'active');
  assert.equal(conversation.customer.customerProfileSource, 'manual');
  assert.equal(conversation.customer.registrationOrigin, 'whatsapp_bot');
  assert.equal(conversation.customer.registrationStatus, 'pending_confirmation');
});

test('promoteToRecovery creates debt case and propagates customerProfileId into recovery customer', async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const debtCaseCalls: Array<Record<string, unknown>> = [];
  const atendimentoUpdates: Array<Record<string, unknown>> = [];
  const syncCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    prisma: {
      atendimentoCustomer: {
        findMany: async () => [],
        findFirst: async () => ({
          id: 'atc-1',
          companyId: 7,
          customerProfileId: 'profile-77',
          phone: '+5519998877766',
          phoneNormalized: '5519998877766',
          name: 'Carlos',
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
        }),
        update: async (input: Record<string, unknown>) => {
          atendimentoUpdates.push(input);
          return input;
        },
      },
      customerProfile: {
        findFirst: async () => ({
          id: 'profile-77',
          companyId: 7,
          phone: '+5519998877766',
          phoneNormalized: '5519998877766',
          name: 'Carlos',
          status: 'active',
        }),
      },
      debtCase: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          debtCaseCalls.push(data);
          return { id: 'debt-77', ...data };
        },
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          createCalls.push(data);
          return { id: 'rec-77', ...data };
        },
      },
    },
    cadastrosService: {
      syncCustomerRegistryFromRecovery: async (companyId: number, payload: Record<string, unknown>) => {
        syncCalls.push({ companyId, payload });
        return { ok: true };
      },
    },
  });

  const result = await service.promoteToRecovery(
    { companyId: 7 },
    'atc-1',
    { openAmount: 123.45, saleDate: '2026-03-28', companyName: 'HBX Cliente' },
  );

  assert.deepEqual(result, {
    ok: true,
    recoveryCustomerId: 'rec-77',
    debtCaseId: 'debt-77',
    customerProfileId: 'profile-77',
  });
  assert.equal(debtCaseCalls.length, 1);
  assert.equal(debtCaseCalls[0].customerProfileId, 'profile-77');
  assert.equal(Number(debtCaseCalls[0].amount), 123.45);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].customerProfileId, 'profile-77');
  assert.equal(createCalls[0].name, 'HBX Cliente');
  assert.equal(atendimentoUpdates.length, 1);
  const atendimentoUpdate = atendimentoUpdates[0] as any;
  assert.deepEqual(atendimentoUpdates[0], {
    where: { id: 'atc-1' },
    data: {
      customerProfileId: 'profile-77',
      route: 'recovery',
      updatedAt: atendimentoUpdate.data.updatedAt,
    },
  });
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0].companyId, 7);
});
