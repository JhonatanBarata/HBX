import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasConversationService } from './vendas-conversation.service';

const USER = {
  id: 9,
  companyId: 7,
  role: 'ADMIN',
  isSystemMaster: false,
};

function createHarness() {
  let writes = 0;
  let rebuilds = 0;
  const sends: any[] = [];
  const conversation = {
    id: 44,
    companyId: 7,
    channel: 'whatsapp',
    contact: '+5511999990000',
    vendasLeadId: 'lead-1',
    vendasLeadLinkedAt: new Date('2026-07-13T12:00:00.000Z'),
    vendasLeadLinkSource: 'explicit_create',
    lastMessageAt: new Date('2026-07-13T12:01:00.000Z'),
    updatedAt: new Date('2026-07-13T12:01:00.000Z'),
  };
  const snapshot = {
    conversation: { id: '44', exists: true },
    engagement: {
      state: 'awaiting_reply',
      hasSuccessfulOutbound: true,
      hasInboundMessage: false,
      hasInboundReply: false,
      firstSuccessfulOutboundAt: '2026-07-13T12:01:00.000Z',
      lastOutboundAt: '2026-07-13T12:01:00.000Z',
      lastOutboundStatus: 'SENT',
      lastInboundAt: null,
      lastMessageAt: '2026-07-13T12:01:00.000Z',
      lastMessageDirection: 'outbound',
      lastMessageStatus: 'SENT',
      lastMessagePreview: 'Oi',
      failureReason: null,
    },
  };

  const prisma = {
    user: {
      findUnique: async () => ({
        ...USER,
        isActive: true,
        deactivatedAt: null,
        company: { id: 7, name: 'Empresa', companyKind: 'tenant' },
      }),
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 9,
        createdByUserId: 9,
        name: 'Lead',
        phone: '+5511999990000',
        phoneNormalized: '5511999990000',
      }),
      findMany: async () => [{ id: 'lead-1' }],
    },
    companyConversation: {
      findFirst: async ({ where }: any) => where?.vendasLeadId === 'lead-1' ? conversation : null,
      findMany: async () => [],
      update: async () => {
        writes += 1;
        return conversation;
      },
      create: async () => {
        writes += 1;
        return conversation;
      },
    },
    vendasLeadCockpitState: { findUnique: async () => null },
    vendasAutomationJob: { findFirst: async () => null },
    companyMessage: { findMany: async () => [] },
  } as any;
  const inbox = {
    sendMessage: async (...args: any[]) => {
      sends.push(args);
      return {};
    },
  } as any;
  const projector = {
    getCockpitStatesForLeads: async () => new Map([['lead-1', snapshot]]),
    rebuildLead: async () => {
      rebuilds += 1;
      return snapshot;
    },
  } as any;

  return {
    service: new VendasConversationService(prisma, inbox, projector),
    get writes() { return writes; },
    get rebuilds() { return rebuilds; },
    sends,
  };
}

test('abrir conversa vinculada e uma leitura pura', async () => {
  const harness = createHarness();
  const result = await harness.service.getConversationForUser({ ...USER }, 'lead-1');

  assert.equal(result.conversation.id, '44');
  assert.equal(result.engagement.state, 'awaiting_reply');
  assert.equal(harness.writes, 0);
  assert.equal(harness.rebuilds, 0);
  assert.equal(harness.sends.length, 0);
});

test('envio pelo Vendas permanece humano e entra pela outbox do Inbox', async () => {
  const harness = createHarness();
  await harness.service.sendMessageForUser({ ...USER }, 'lead-1', '  Olá  ');

  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0][1], 44);
  assert.equal(harness.sends[0][2], 'Olá');
  assert.equal(harness.sends[0][3].sourceModule, 'vendas_human');
  assert.equal(harness.sends[0][3].variables.purpose, 'human_reply');
  assert.equal(harness.rebuilds, 1);
});
