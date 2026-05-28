import test from 'node:test';
import assert from 'node:assert/strict';

import { InboxService } from './inbox.service';
import { WebwhatsProviderError } from '../messaging/webwhats-bridge.service';

function createBareService() {
  return Object.create(InboxService.prototype) as any;
}

function createService(overrides?: Partial<Record<string, any>>) {
  const auditCalls: Array<Record<string, unknown>> = [];
  const queueCalls: Array<Record<string, unknown>> = [];
  const conversationStateCalls: Array<Record<string, unknown>> = [];
  const baseConversation = {
    id: 42,
    companyId: 7,
    channel: 'whatsapp',
    whatsappConnectionSessionId: 'session-7',
    sourcePhoneNormalized: '5519998877766',
    sourceTenantKey: 'company-7',
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
    company: {
      findUnique: async () => ({
        id: 7,
        whatsappModalStatus: 'CONNECTED',
        whatsappModalPhone: '+5519998877766',
        whatsappModalConnectedAt: new Date('2026-03-18T09:00:00.000Z'),
        whatsappModalLastError: null,
        currentWhatsappConnectionSessionId: 'session-7',
        currentWhatsappConnectionSession: {
          id: 'session-7',
          companyId: 7,
          provider: 'webwhats',
          tenantKey: 'company-7',
          phoneNormalized: '5519998877766',
          displayPhone: '+5519998877766',
          status: 'active',
          connectedAt: new Date('2026-03-18T09:00:00.000Z'),
          disconnectedAt: null,
          createdAt: new Date('2026-03-18T09:00:00.000Z'),
          updatedAt: new Date('2026-03-18T09:00:00.000Z'),
          metadataJson: null,
        },
        whatsappStatus: null,
        whatsappStatusError: null,
      }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    whatsAppConnectionSession: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: any) => ({ id: 'session-7', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
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
    vendasAutomationJob: {
      findFirst: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
    },
    vendasLeadTimelineEvent: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'event-1', ...data }),
    },
    companyMessage: {
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => ({ id: 801, ...data }),
      delete: async ({ where }: any) => ({ id: where.id }),
      deleteMany: async () => ({ count: 0 }),
    },
    companyConversation: {
      findFirst: async ({ where }: any) => {
        if (Number(where?.id || 42) === 42 && Number(where?.companyId || 7) === 7) return { ...baseConversation };
        if (Number(where?.companyId || 7) === 7) return { ...baseConversation };
        return null;
      },
      findMany: async () => [{ ...baseConversation }],
      count: async () => 0,
      update: async ({ where, data }: any) => ({ ...baseConversation, id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
      delete: async ({ where }: any) => ({ id: where.id }),
    },
    hbxRecoveryCustomer: {
      findFirst: async () => ({ clientName: 'Carlos', name: 'Carlos' }),
      create: async ({ data }: any) => ({ id: 'rec-1', ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    hbxRecoveryFlowStage: {
      findFirst: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      create: async ({ data }: any) => ({ id: 'flow-stage-1', ...data }),
    },
    $queryRaw: async () => [],
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
    upsertProfile: async (input: Record<string, unknown>) => ({ id: 'profile-1', ...input }),
    upsertAtendimentoProfileState: async (input: Record<string, unknown>) => ({ id: 'profile-1', ...input }),
    ...(overrides?.customerProfileService || {}),
  } as any;

  const webwhatsBridge = {
    syncRecentChats: async () => 0,
    syncConversationMessages: async () => 0,
    syncConversationMessagesDetailed: async () => ({
      syncedMessages: 0,
      mediaMessages: 0,
      pagesFetched: 0,
      remoteJids: [],
      avatarUrl: null,
      displayName: null,
    }),
    listLiveChats: async () => [buildLiveConversationSnapshot()],
    getLiveConversation: async () => buildLiveConversationSnapshot(),
    isDispatchAvailable: () => true,
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

test('InboxService prefers conversation contact over conflicting WhatsApp alternate JID', () => {
  const service = createBareService();
  const conversation = { contact: '+5519996197927' };
  const metadata = {
    whatsappRemoteJid: '0@s.whatsapp.net',
    whatsappRemoteJidAlt: '5519997493700@s.whatsapp.net',
  };

  assert.equal(service.resolveConversationDisplayPhone(conversation, null, metadata), '+5519996197927');
  assert.equal(service.resolveConversationIdentityPhone({ ...conversation, metadata: JSON.stringify(metadata) }), '5519996197927');
  assert.equal(service.isConversationWhatsappIdentityConflicting(conversation, metadata), true);
});

test('InboxService can react using providerMessageId when raw payload key is missing', () => {
  const service = createBareService();

  assert.equal(
    service.extractWebwhatsRawMessageIdFromProviderMessageId('webwhats:company-11:ABC123'),
    'ABC123',
  );
});

test('inbox classifier keeps automatic prospection outbound in Prospecção without inbound response', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({}),
      flowResult: null,
      humanAssigned: false,
      messages: [
        {
          direction: 'OUTBOUND',
          sourceModule: 'vendas_prospeccao_bot',
          senderType: 'bot',
          timestamp: new Date(),
        },
      ],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
  assert.match(context.routeReason, /aguardando resposta/i);
});

test('listConversations repara Company CONNECTED sem sessao antes de listar Atendimento', async () => {
  const sessions: any[] = [];
  const companyUpdates: any[] = [];
  const { service } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'CONNECTED',
          whatsappModalPhone: null,
          whatsappModalConnectedAt: new Date('2026-05-09T12:00:00.000Z'),
          whatsappStatus: null,
          currentWhatsappConnectionSessionId: null,
          currentWhatsappConnectionSession: null,
        }),
        update: async ({ data }: any) => {
          companyUpdates.push(data);
          return { id: 7, ...data };
        },
      },
      whatsAppConnectionSession: {
        findFirst: async ({ where }: any) => sessions.find((session) => {
          if (where?.companyId !== undefined && Number(session.companyId) !== Number(where.companyId)) return false;
          if (where?.provider !== undefined && session.provider !== where.provider) return false;
          if (where?.tenantKey !== undefined && session.tenantKey !== where.tenantKey) return false;
          if (where?.status !== undefined && session.status !== where.status) return false;
          return true;
        }) || null,
        findMany: async () => [],
        create: async ({ data }: any) => {
          const session = { id: 'session-repaired', ...data };
          sessions.push(session);
          return session;
        },
        update: async ({ where, data }: any) => ({ id: where.id, ...data }),
        updateMany: async () => ({ count: 0 }),
      },
    },
  });

  await service.listConversations({ companyId: 7 }, { take: 10 });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].tenantKey, 'company-7');
  assert.equal(sessions[0].status, 'active');
  assert.equal(sessions[0].phoneNormalized, null);
  assert.equal(companyUpdates.at(-1).currentWhatsappConnectionSessionId, 'session-repaired');
});

test('inbox classifier keeps prospection with customer inbound in Prospecção', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => ({ id: 901 }),
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          manualSentAt: '2026-05-05T10:00:00.000Z',
        },
      }),
      flowResult: null,
      humanAssigned: false,
      messages: [
        {
          direction: 'INBOUND',
          sourceModule: 'whatsapp_webhook',
          senderType: 'client',
          timestamp: new Date('2026-05-05T10:30:00.000Z'),
        },
      ],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
});

test('inbox classifier keeps replied_positive job state in Prospecção summary rows', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
      vendasAutomationJob: {
        findFirst: async () => ({
          id: 'job-1',
          status: 'replied_positive',
          lead: { id: 'lead-1', status: 'qualificado' },
          updatedAt: new Date('2026-05-05T10:35:00.000Z'),
          createdAt: new Date('2026-05-05T10:00:00.000Z'),
        }),
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAutomation: {
          jobId: 'job-1',
          status: 'replied_positive',
        },
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          leadId: 'lead-1',
        },
      }),
      flowResult: null,
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
});

test('inbox classifier moves expired prospection without response to Excluídos', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAutomation: {
          status: 'sent',
          sentAt: '2026-05-01T10:00:00.000Z',
        },
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
        },
      }),
      flowResult: null,
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'excluidos');
  assert.equal(context.routeReason, 'Sem resposta em 24h.');
});

test('inbox classifier moves bot closed conversations to Encerrado', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({
        sourceModule: 'atendimento_bot',
      }),
      flowResult: 'manual_closed',
      humanAssigned: false,
      botActive: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'excluidos');
  assert.match(context.routeReason, /arquivado|descartado|encerrado/i);
});

test('operational conversation lookup includes bot closed flow results', async () => {
  let findManyInput: any = null;
  const { service } = createService({
    prisma: {
      companyConversation: {
        findMany: async (input: any) => {
          findManyInput = input;
          return [{ id: 42 }];
        },
      },
    },
  });

  const ids = await (service as any).listOperationalConversationIdsByMetadata(7, 120);

  assert.deepEqual(ids, [42]);
  assert.ok(
    findManyInput.where.OR.some(
      (clause: any) => Array.isArray(clause.flowResult?.in) && clause.flowResult.in.includes('manual_closed'),
    ),
  );
});

test('inbox classifier keeps segment mismatch review in Prospecção', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
      hbxRecoveryCustomer: {
        findFirst: async () => null,
      },
    },
  });

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '+5519998877766',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasProspeccao: {
          stage: 'needs_review',
          leadSegment: 'Pet Shop',
          campaignSegment: 'Refrigeração',
          mismatchReason: 'segment_mismatch',
        },
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          status: 'needs_review',
        },
      }),
      flowResult: null,
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
});

test('inbox classifier keeps WhatsApp groups outside operational funnels', async () => {
  const { service } = createService();

  const context = await (service as any).resolveRecoveryRoutingContext(
    7,
    {
      id: 42,
      contact: '5511999999999-123456@g.us',
      metadata: JSON.stringify({
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        inboxLocalDeleted: true,
      }),
      flowResult: 'local_deleted',
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'groups');
});

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

test('retryConversationMessage reopens failed outbound in the dispatch queue', async () => {
  const outboundUpdates: Array<Record<string, any>> = [];
  const messageUpdates: Array<Record<string, any>> = [];
  const { service, auditCalls } = createService({
    prisma: {
      outboundMessage: {
        update: async (input: Record<string, any>) => {
          outboundUpdates.push(input);
          return { id: input.where.id, ...input.data };
        },
      },
      companyMessage: {
        findFirst: async () => ({
          id: 901,
          companyId: 7,
          conversationId: 42,
          direction: 'OUTBOUND',
          status: 'FAILED',
          error: 'Timeout no Webwhats',
          outboundMessageId: 777,
          messageType: 'text',
          outboundMessage: {
            id: 777,
            status: 'FAILED',
            deliveryStatus: 'failed',
            failedAt: new Date('2026-05-27T12:00:00.000Z'),
            to: '+5519998877766',
            sourceModule: 'atendimento_human',
          },
        }),
        update: async (input: Record<string, any>) => {
          messageUpdates.push(input);
          return { id: input.where.id, ...input.data };
        },
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [{ id: '901', status: 'QUEUED' }] });

  const result = await service.retryConversationMessage({ companyId: 7 }, 42, 901);

  assert.equal(result.id, '42');
  assert.equal(outboundUpdates.length, 1);
  assert.equal(outboundUpdates[0].where.id, 777);
  assert.equal(outboundUpdates[0].data.status, 'PENDING');
  assert.equal(outboundUpdates[0].data.attemptCount, 0);
  assert.equal(outboundUpdates[0].data.failedAt, null);
  assert.equal(outboundUpdates[0].data.deliveryStatus, null);
  assert.equal(outboundUpdates[0].data.lastError, null);
  assert.equal(outboundUpdates[0].data.providerMessageId, null);
  assert.equal(messageUpdates.length, 1);
  assert.deepEqual(messageUpdates[0], {
    where: { id: 901 },
    data: {
      status: 'QUEUED',
      error: null,
      providerMessageId: null,
    },
  });
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'manual_outbound_retry_queued');
  assert.equal((auditCalls[0].metadata as any).outboundMessageId, 777);
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

test('updateConversationQueue marks Pessoais as personal contact and disables bot', async () => {
  const profileStateCalls: Array<Record<string, unknown>> = [];
  const { service, conversationStateCalls } = createService({
    customerProfileService: {
      upsertAtendimentoProfileState: async (input: Record<string, unknown>) => {
        profileStateCalls.push(input);
        return { id: 'profile-1', ...input };
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.updateConversationQueue({ companyId: 7, id: 99 }, 42, 'all');

  assert.equal(conversationStateCalls.length, 1);
  const payload = conversationStateCalls[0].payload as any;
  assert.equal(payload.botActive, false);
  assert.equal(payload.humanAssigned, true);
  assert.equal(payload.flowResult, 'personal_contact');
  assert.equal(payload.metadata.queueTarget, 'conversas');
  assert.equal(payload.metadata.routeTarget, 'conversas');
  assert.equal(payload.metadata.inboxPersonalContact, true);
  assert.equal(payload.metadata.personalContact, true);
  assert.equal(payload.metadata.whatsappPersonalContact, true);
  assert.equal(payload.metadata.botOff, true);

  assert.equal(profileStateCalls.length, 1);
  assert.equal(profileStateCalls[0].companyId, 7);
  assert.equal(profileStateCalls[0].phone, '+5519998877766');
  assert.equal(profileStateCalls[0].botOff, true);
  assert.equal(profileStateCalls[0].botOffReason, 'Contato marcado como pessoal em Pessoais.');
  assert.ok(profileStateCalls[0].botOffAt instanceof Date);
});

test('deleteConversation removes conversations with history from local backend', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 3,
        findMany: async () => [{ id: 901 }, { id: 902 }, { id: 903 }],
        delete: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { id: (input as any).where.id };
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
        findMany: async () => [{ id: 42 }],
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
  assert.equal(result.message, 'Conversa removida do backend local do HBX.');
  assert.equal(result.deleted, true);
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 3);
  assert.equal(conversationDeleteCalls.length, 1);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_backend_deleted');
});

test('deleteConversation removes local backend row without WhatsApp command', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 2,
        findMany: async () => [{ id: 901 }, { id: 902 }],
        delete: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { id: (input as any).where.id };
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
        findMany: async () => [{ id: 42 }],
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
  assert.equal(result.message, 'Conversa removida do backend local do HBX.');
  assert.equal(result.deleted, true);
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 2);
  assert.equal(conversationDeleteCalls.length, 1);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_backend_deleted');
});

test('deleteConversation ignores disconnected WhatsApp session and deletes locally', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        count: async () => 2,
        findMany: async () => [{ id: 901 }, { id: 902 }],
        delete: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { id: (input as any).where.id };
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
        findMany: async () => [{ id: 42 }],
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
  assert.equal(result.deleted, true);
  assert.equal(result.localOnly, true);
  assert.equal(messageDeleteCalls.length, 2);
  assert.equal(conversationDeleteCalls.length, 1);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_backend_deleted');
});

test('purgeConversationFromTrash is disabled', async () => {
  const messageDeleteCalls: Array<Record<string, unknown>> = [];
  const conversationDeleteCalls: Array<Record<string, unknown>> = [];
  const { service, auditCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'ready',
          whatsappModalLastError: null,
          whatsappTemporaryStatus: null,
          whatsappTemporaryStatusError: null,
          whatsappStatus: null,
          whatsappStatusError: null,
        }),
      },
      companyMessage: {
        findMany: async () => [{ id: 901 }, { id: 902 }],
        delete: async (input: Record<string, unknown>) => {
          messageDeleteCalls.push(input);
          return { id: (input as any).where.id };
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
          lastMessageAt: new Date('2026-03-17T10:01:00.000Z'),
          lastInteractionAt: new Date('2026-03-17T10:01:00.000Z'),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [
            {
              direction: 'INBOUND',
              senderType: 'client',
              body: 'Não tenho interesse',
              timestamp: new Date('2026-03-17T10:01:00.000Z'),
              messageType: 'text',
              variablesJson: null,
              rawPayload: null,
            },
          ],
        }),
        delete: async (input: Record<string, unknown>) => {
          conversationDeleteCalls.push(input);
          return { id: (input as any).where.id };
        },
      },
    },
  });

  await assert.rejects(
    () => service.purgeConversationFromTrash({ companyId: 7, role: 'ADMIN' }, 42),
    /Exclusao permanente removida do HBX/,
  );
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(auditCalls.length, 0);
});

test('emptyTrash legacy endpoint is blocked because permanent delete was removed', async () => {
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
  assert.equal(result.deleted, 0);
  assert.deepEqual(result.deletedIds, []);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'conversation_empty_trash_legacy_blocked');
  assert.match(result.message, /Exclusao permanente foi removida/);
});

test('startMeticulousTrashPurge blocks real permanent delete jobs', async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.startMeticulousTrashPurge({ companyId: 7, role: 'ADMIN' }, { dryRun: false }),
    /Exclusao permanente removida do HBX/,
  );
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
