import test from 'node:test';
import assert from 'node:assert/strict';

import { InboxService } from './inbox.service';

function createService(overrides?: Partial<Record<string, any>>) {
  const auditCalls: Array<Record<string, unknown>> = [];
  const queueCalls: Array<Record<string, unknown>> = [];
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
    },
    ...(overrides?.prisma || {}),
  } as any;

  const conversations = {
    queueOutboundForCompany: async (companyId: number, payload: Record<string, unknown>) => {
      queueCalls.push({ companyId, payload });
      return { id: 999 };
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

  const service = new InboxService(prisma, conversations, audit);
  return { service, prisma, conversations, auditCalls, queueCalls };
}

test('sendMessage queues outbound on the real conversation with human flow state', async () => {
  const { service, queueCalls, auditCalls } = createService();
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
