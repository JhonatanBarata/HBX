import test from 'node:test';
import assert from 'node:assert/strict';

import { InboxService } from './inbox.service';
import { WebwhatsProviderError } from '../messaging/webwhats-bridge.service';

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
    currentFlow: null,
    currentStep: null,
    flowResult: null,
    assignedUserId: null,
    metadata: JSON.stringify({ cliente: 'Carlos' }),
    createdAt: new Date('2026-03-18T10:00:00.000Z'),
    updatedAt: new Date('2026-03-18T10:01:00.000Z'),
    messages: [],
  };

  const buildLiveConversationState = () => ({
    id: baseConversation.id,
    contact: baseConversation.contact,
    metadata: baseConversation.metadata,
    currentFlow: baseConversation.currentFlow,
    currentStep: baseConversation.currentStep,
    flowResult: baseConversation.flowResult,
    botActive: baseConversation.botActive,
    humanAssigned: baseConversation.humanAssigned,
    assignedUserId: baseConversation.assignedUserId,
    createdAt: baseConversation.createdAt,
    updatedAt: baseConversation.updatedAt,
  });

  const buildLiveConversationSnapshot = () => ({
    conversation: buildLiveConversationState(),
    remoteJid: '5519998877766@s.whatsapp.net',
    remoteJidAlt: null,
    contact: baseConversation.contact,
    displayName: 'Carlos',
    avatarUrl: null,
    unreadCount: 0,
    archived: false,
    windowActive: null,
    lastMessageAt: baseConversation.updatedAt,
    lastMessage: null,
    messages: [],
  });

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
    vendasLead: {
      findFirst: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    vendasLeadTimelineEvent: {
      create: async ({ data }: any) => ({ id: 'event-1', ...data }),
    },
    companyConversation: {
      findFirst: async ({ where }: any) => {
        if (Number(where?.id || 42) === 42 && Number(where?.companyId || 7) === 7) return { ...baseConversation };
        if (Number(where?.companyId || 7) === 7) return { ...baseConversation };
        return null;
      },
      findMany: async () => [{ ...baseConversation }],
      update: async ({ where, data }: any) => ({ ...baseConversation, id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
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
    normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    upsertAtendimentoProfileState: async (input: Record<string, unknown>) => ({ id: 'profile-1', ...input }),
    ...(overrides?.customerProfileService || {}),
  } as any;

  const webwhatsBridge = {
    syncRecentChats: async () => 0,
    syncConversationMessages: async () => 0,
    listLiveChats: async () => [buildLiveConversationSnapshot()],
    getLiveConversation: async () => buildLiveConversationSnapshot(),
    ...(overrides?.webwhatsBridge || {}),
  } as any;

  const inboxRealtime = {
    publish: () => undefined,
    subscribe: () => () => undefined,
    ...(overrides?.inboxRealtime || {}),
  } as any;

  const commercialPlansService = {
    assertBotAiEntitlementForCompany: async () => true,
    ...(overrides?.commercialPlansService || {}),
  } as any;

  const service = new InboxService(
    prisma,
    conversations,
    audit,
    cadastrosService,
    customerProfileService,
    webwhatsBridge,
    inboxRealtime,
    commercialPlansService,
  );
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
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSent,
    true,
  );
  assert.ok((conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSentAt);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    false,
  );
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    true,
  );
});

test('sendMessage marks manual send metadata even when the inherited draft was already consumed', async () => {
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
              draftPending: false,
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

  await service.sendMessage({ companyId: 7 }, 42, 'Seguindo com seu atendimento');

  assert.equal(conversationStateCalls.length, 1);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSent,
    true,
  );
  assert.ok((conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSentAt);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    true,
  );
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

test('blockConversation persists BOT_OFF on CustomerProfile', async () => {
  const profileStateCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    prisma: {
      companyMessage: {
        create: async ({ data }: any) => ({ id: 801, ...data }),
      },
    },
    customerProfileService: {
      upsertAtendimentoProfileState: async (input: Record<string, unknown>) => {
        profileStateCalls.push(input);
        return { id: 'profile-1', ...input };
      },
    },
    webwhatsBridge: {
      updateBlockStatus: async () => undefined,
      archiveChat: async () => undefined,
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.blockConversation({ companyId: 7, id: 99 }, 42, 'Fila humana manual');

  assert.equal(profileStateCalls.length, 1);
  assert.equal(profileStateCalls[0].companyId, 7);
  assert.equal(profileStateCalls[0].phone, '+5519998877766');
  assert.equal(profileStateCalls[0].botOff, true);
  assert.equal(profileStateCalls[0].botOffReason, 'Fila humana manual');
  assert.ok(profileStateCalls[0].botOffAt instanceof Date);
});

test('unblockConversation clears BOT_OFF on CustomerProfile', async () => {
  const profileStateCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    prisma: {
      companyMessage: {
        create: async ({ data }: any) => ({ id: 802, ...data }),
      },
    },
    customerProfileService: {
      upsertAtendimentoProfileState: async (input: Record<string, unknown>) => {
        profileStateCalls.push(input);
        return { id: 'profile-1', ...input };
      },
    },
    webwhatsBridge: {
      updateBlockStatus: async () => undefined,
      archiveChat: async () => undefined,
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.unblockConversation({ companyId: 7, id: 99 }, 42);

  assert.equal(profileStateCalls.length, 1);
  assert.equal(profileStateCalls[0].companyId, 7);
  assert.equal(profileStateCalls[0].phone, '+5519998877766');
  assert.equal(profileStateCalls[0].botOff, false);
});

test('deleteConversation archives conversations with history locally', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 3,
        deleteMany: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { count: 3 };
        },
      },
      companyConversation: {
        findFirst: async () => ({
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
        }),
        delete: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { id: 42 };
        },
      },
    },
    webwhatsBridge: {
      deleteChat: async () => ({
        outcome: 'deleted',
        chatId: '5519998877766@s.whatsapp.net',
        message: 'Chat deleted',
        raw: { deleted: true },
      }),
    },
  });

  const result = await service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42);

  assert.equal(result.success, true);
  assert.equal(result.message, 'Conversa enviada para Excluídos apenas no HBX.');
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 1);
  assert.equal((conversationStateCalls[0].payload as any).flowResult, 'local_deleted');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_local_deleted');
});

test('deleteConversation keeps local archive success without WhatsApp command', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 2,
        deleteMany: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { count: 2 };
        },
      },
      companyConversation: {
        findFirst: async () => ({
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
        }),
        delete: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { id: 42 };
        },
      },
    },
    webwhatsBridge: {
      deleteChat: async () => ({
        outcome: 'already_deleted',
        chatId: '5519998877766@s.whatsapp.net',
        message: 'Chat not found',
        raw: { notFound: true },
      }),
    },
  });

  const result = await service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42);

  assert.equal(result.success, true);
  assert.equal(result.message, 'Conversa enviada para Excluídos apenas no HBX.');
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 1);
  assert.equal((conversationStateCalls[0].payload as any).flowResult, 'local_deleted');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_local_deleted');
});

test('deleteConversation ignores disconnected WhatsApp session and archives locally', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 2,
        deleteMany: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { count: 0 };
        },
      },
      companyConversation: {
        findFirst: async () => ({
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
        }),
        delete: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { id: 42 };
        },
      },
    },
    webwhatsBridge: {
      deleteChat: async () => {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'Sessao do WhatsApp desconectada. Reconecte o dispositivo antes de excluir a conversa.',
        );
      },
    },
  });

  const result = await service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42);

  assert.equal(result.success, true);
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 1);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_local_deleted');
});

test('purgeConversationFromTrash removes one archived conversation locally without WhatsApp command', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  let whatsappDeleteCalls = 0;
  const { service, auditCalls } = createService({
    prisma: {
      companyMessage: {
        deleteMany: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { count: 2 };
        },
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          contact: '+5519998877766',
          flowResult: 'local_deleted',
          metadata: JSON.stringify({
            inboxLocalDeleted: true,
            inboxManualQueueOverride: 'archived',
          }),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
        }),
        deleteMany: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { count: 1 };
        },
      },
    },
    webwhatsBridge: {
      deleteChat: async () => {
        whatsappDeleteCalls += 1;
        return { outcome: 'deleted' };
      },
    },
  });

  const result = await service.purgeConversationFromTrash({ companyId: 7, role: 'ADMIN' }, 42);

  assert.equal(result.success, true);
  assert.equal(result.localOnly, true);
  assert.equal(whatsappDeleteCalls, 0);
  assert.equal(messageDeleteCalls.length, 1);
  assert.equal(conversationDeleteCalls.length, 1);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_trash_purged_local');
});

test('emptyTrash removes only empty archived conversations locally', async () => {
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls } = createService({
    prisma: {
      companyConversation: {
        findMany: async () => [
          {
            id: 44,
            contact: '+5519998112233',
            flowResult: 'local_deleted',
            metadata: JSON.stringify({
              inboxLocalDeleted: true,
              inboxManualQueueOverride: 'archived',
            }),
          },
        ],
        deleteMany: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { count: 1 };
        },
      },
    },
  });

  const result = await service.emptyTrash({ companyId: 7, role: 'ADMIN' });

  assert.equal(result.success, true);
  assert.equal(result.localOnly, true);
  assert.equal(result.deleted, 1);
  assert.deepEqual(result.deletedIds, ['44']);
  assert.equal(conversationDeleteCalls.length, 1);
  assert.deepEqual((conversationDeleteCalls[0] as any).where.id, { in: [44] });
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_empty_trash_purged_local');
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
