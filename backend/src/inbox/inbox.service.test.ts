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
    isDispatchAvailable: () => true,
    ...(overrides?.webwhatsBridge || {}),
  } as any;

  const inboxRealtime = {
    publish: () => undefined,
    subscribe: () => () => undefined,
    ...(overrides?.inboxRealtime || {}),
  } as any;

  const commercialPlansService = {
    ...(overrides?.commercialPlansService || {}),
  } as any;

  const whatsappModal = {} as any;

  const service = new InboxService(
    prisma,
    conversations,
    audit,
    cadastrosService,
    customerProfileService,
    webwhatsBridge,
    inboxRealtime,
    commercialPlansService,
    whatsappModal,
  );
  return { service, prisma, conversations, auditCalls, queueCalls, conversationStateCalls, cadastrosService };
}

test('getBootstrap light returns summaries without loading selected conversation detail', async () => {
  const { service } = createService();
  const listCalls: Array<Record<string, any>> = [];
  let selectedDetailCalls = 0;
  let backgroundSyncCalls = 0;

  (service as any).resolveInboxWhatsappSessionScope = async () => ({
    accessible: true,
    reason: 'webwhats_active',
    currentSessionId: 'session-7',
    currentSession: {
      id: 'session-7',
      provider: 'webwhats',
      phoneNormalized: '5519998877766',
      displayPhone: '+5519998877766',
      connectedAt: new Date('2026-03-18T09:00:00.000Z'),
    },
    mode: 'current',
  });
  (service as any).getWhatsAppProviderHealth = async () => ({ connected: true, status: 'connected' });
  (service as any).buildWhatsappSessionCleanupState = async () => ({
    required: false,
    currentSessionId: 'session-7',
    oldSessionCount: 0,
    oldConversationCount: 0,
    oldMessageCount: 0,
    latestOldSession: null,
  });
  (service as any).triggerBackgroundInboxIndexSync = () => {
    backgroundSyncCalls += 1;
  };
  (service as any).getPersistedConversationByIdForCompany = async () => {
    selectedDetailCalls += 1;
    return { id: '11', messages: [{ id: 'm-1' }] };
  };
  (service as any).listPersistedConversationSummariesForCompany = async (
    companyId: number,
    options: Record<string, any>,
  ) => {
    listCalls.push({ companyId, options });
    return [
      { id: '11', messages: [{ id: 'summary-only' }] },
      { id: '12', messages: [] },
    ];
  };

  const payload = await service.getBootstrap({ companyId: 7 }, 1, { light: true });

  assert.equal(payload.bootstrapMode, 'light');
  assert.equal(payload.selectedConversation, null);
  assert.equal(payload.selectedConversationId, '11');
  assert.equal(payload.conversations.length, 1);
  assert.equal(payload.hasMoreConversations, true);
  assert.equal(payload.nextSkip, 1);
  assert.equal(selectedDetailCalls, 0);
  // store-on-arrival: o bootstrap NÃO re-puxa do motor (sem sync de índice). Lê só do banco.
  assert.equal(backgroundSyncCalls, 0);
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].companyId, 7);
  assert.equal(listCalls[0].options.take, 2);
  assert.equal(listCalls[0].options.sessionScope.currentSessionId, 'session-7');
});

test('getConversationPresence returns unknown when Webwhats presence fails', async () => {
  const { service } = createService({
    webwhatsBridge: {
      fetchPresence: async () => {
        throw new Error('Webwhats offline');
      },
    },
  });

  const presence = await service.getConversationPresence({ companyId: 7 }, 42);

  assert.equal(presence.remoteJid, '5519998877766@s.whatsapp.net');
  assert.equal(presence.presence, 'unknown');
  assert.equal(presence.online, false);
  assert.equal(presence.typing, false);
  assert.equal(presence.recording, false);
  assert.equal(presence.providerStatus, 'unknown');
});

test('listConversationMessages applies limit and before cursor to message page query', async () => {
  const messageQueryCalls: Array<Record<string, any>> = [];
  const rows = [
    {
      id: 902,
      direction: 'INBOUND',
      messageType: 'text',
      body: 'Mensagem mais nova no recorte',
      senderType: 'client',
      status: 'RECEIVED',
      error: null,
      timestamp: new Date('2026-05-20T11:59:00.000Z'),
      sourceModule: 'webwhats',
      outboundMessageId: null,
      providerMessageId: 'provider-902',
      rawPayload: null,
      variablesJson: null,
    },
    {
      id: 901,
      direction: 'INBOUND',
      messageType: 'text',
      body: 'Mensagem mais antiga no recorte',
      senderType: 'client',
      status: 'RECEIVED',
      error: null,
      timestamp: new Date('2026-05-20T11:58:00.000Z'),
      sourceModule: 'webwhats',
      outboundMessageId: null,
      providerMessageId: 'provider-901',
      rawPayload: null,
      variablesJson: null,
    },
  ];
  const { service } = createService({
    prisma: {
      companyMessage: {
        findMany: async (input: Record<string, any>) => {
          messageQueryCalls.push(input);
          return rows;
        },
      },
    },
  });

  const page = await service.listConversationMessages(
    { companyId: 7 },
    42,
    { limit: 2, before: '2026-05-20T12:00:00.000Z' },
  );

  assert.equal(messageQueryCalls.length, 1);
  assert.equal(messageQueryCalls[0].take, 2);
  assert.deepEqual(messageQueryCalls[0].orderBy, [{ timestamp: 'desc' }, { id: 'desc' }]);
  assert.equal(messageQueryCalls[0].where.companyId, 7);
  assert.equal(messageQueryCalls[0].where.conversationId, 42);
  assert.equal(messageQueryCalls[0].where.timestamp.lt.toISOString(), '2026-05-20T12:00:00.000Z');
  assert.equal(page.messages.length, 2);
  assert.deepEqual(page.messages.map((message: any) => message.id), ['901', '902']);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextBefore.toISOString(), '2026-05-20T11:58:00.000Z');
});

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

test('inbox classifier keeps automatic prospection outbound neutral without manual route', async () => {
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

  assert.equal(context.routeTarget, 'conversas');
  assert.match(context.routeReason, /neutra/i);
});

test('listConversations é READ-ONLY ao resolver sessão (não cria/relabela — isolamento por número)', async () => {
  // O inbox só LÊ a sessão atual. Era a 3ª cópia do bug que criava/relabelava sessão e
  // vazava chat entre chips. CONNECTED sem sessão ativa = inbox vazio, jamais fabricar.
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
        findFirst: async () => null,
        findMany: async () => [],
        create: async ({ data }: any) => {
          const session = { id: 'session-should-not-be-created', ...data };
          sessions.push(session);
          return session;
        },
        update: async ({ where, data }: any) => ({ id: where.id, ...data }),
        updateMany: async () => ({ count: 0 }),
      },
    },
  });

  // CONNECTED sem sessão = recusa segura (503 "revalide"), NUNCA fabrica sessão nem
  // mostra tudo. Provar read-only: nada criado, ponteiro não escrito.
  await assert.rejects(
    () => service.listConversations({ companyId: 7 }, { take: 10 }),
    /sessão operacional do Atendimento não foi criada/,
  );

  assert.equal(sessions.length, 0);
  assert.equal(companyUpdates.length, 0);
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

test('inbox classifier keeps active prospection when lead was previously closed but reopened', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => ({ id: 901 }),
      },
      vendasAutomationJob: {
        findFirst: async () => ({
          id: 'job-1',
          status: 'sent',
          classification: 'low_confidence',
          lead: { id: 'lead-1', status: 'retorno', wasClosedBefore: true, closedAt: null },
          updatedAt: new Date('2026-05-27T20:24:00.000Z'),
          createdAt: new Date('2026-05-27T20:20:00.000Z'),
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
      contact: '+551935229955',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        inboxManualQueueOverride: 'bot',
        vendasAutomation: {
          jobId: 'job-1',
          leadId: 'lead-1',
          status: 'neutral',
        },
        vendasProspeccao: {
          stage: 'reply_received',
        },
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          leadId: 'lead-1',
        },
      }),
      flowResult: 'prospection_neutral',
      currentStep: 'menu_principal',
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
});

test('inbox classifier keeps auto-reply prospection in Prospecção despite atendimento_humano step', async () => {
  const { service } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => ({ id: 901 }),
      },
      vendasAutomationJob: {
        findFirst: async () => ({
          id: 'job-1',
          status: 'sent',
          classification: 'bot_menu_detected',
          lead: { id: 'lead-1', status: 'retorno', wasClosedBefore: false, closedAt: null },
          updatedAt: new Date('2026-05-28T11:42:00.000Z'),
          createdAt: new Date('2026-05-28T11:41:00.000Z'),
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
      id: 43,
      contact: '+551935240328',
      metadata: JSON.stringify({
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        inboxManualQueueOverride: 'bot',
        vendasAutomation: {
          jobId: 'job-1',
          leadId: 'lead-1',
          status: 'bot_menu_detected',
          awaitingHuman: true,
        },
        vendasProspeccao: {
          stage: 'reply_received',
        },
        vendasAgendaQueue: {
          active: true,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          status: 'awaiting_human',
          leadId: 'lead-1',
        },
      }),
      flowResult: 'prospection_auto_reply',
      currentStep: 'atendimento_humano',
      humanAssigned: false,
      messages: [],
    },
    { preferRecoveryForDebtors: true },
  );

  assert.equal(context.routeTarget, 'prospeccao');
});

test('inbox classifier keeps expired prospection without response in Prospecção', async () => {
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

  assert.equal(context.routeTarget, 'prospeccao');
  assert.match(context.routeReason, /ação manual\/card/i);
});

test('inbox classifier keeps bot closed conversations neutral without excluded queue', async () => {
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

  assert.equal(context.routeTarget, 'conversas');
  assert.match(context.routeReason, /neutra/i);
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
        queueTarget: 'groups',
        routeTarget: 'groups',
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

test('reactToConversationMessage resolves by DB id and sends provider key from rawPayload.key.id', async () => {
  const reactionCalls: Array<Record<string, any>> = [];
  const messageQueries: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      companyMessage: {
        // Resolve a mensagem pelo ID REAL do banco (ex.: 1079), igual ao retry.
        findFirst: async (input: Record<string, any>) => {
          messageQueries.push(input);
          return {
            id: 1079,
            companyId: 7,
            conversationId: 42,
            direction: 'INBOUND',
            messageType: 'text',
            body: 'Oi',
            senderType: 'client',
            providerMessageId: 'webwhats:company-7:RAWFALLBACK',
            variablesJson: null,
            rawPayload: JSON.stringify({
              key: {
                id: 'WHATSAPP_KEY_ID_ABC',
                remoteJid: '5519998877766@s.whatsapp.net',
                fromMe: false,
              },
            }),
            timestamp: new Date('2026-06-19T10:00:00.000Z'),
          };
        },
      },
    },
    webwhatsBridge: {
      sendReaction: async (companyId: number, payload: Record<string, any>) => {
        reactionCalls.push({ companyId, payload });
        return undefined;
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  const result = await service.reactToConversationMessage({ companyId: 7 }, 42, 1079, '👍');

  assert.equal(result.id, '42');
  // Procurou a mensagem pelo ID do banco (não por hash sintético).
  assert.equal(messageQueries.length, 1);
  assert.equal(messageQueries[0].where.id, 1079);
  assert.equal(messageQueries[0].where.companyId, 7);
  assert.equal(messageQueries[0].where.conversationId, 42);
  // Enviou a reação com o providerKeyId extraído de rawPayload.key.id.
  assert.equal(reactionCalls.length, 1);
  assert.equal(reactionCalls[0].companyId, 7);
  assert.equal(reactionCalls[0].payload.messageId, 'WHATSAPP_KEY_ID_ABC');
  assert.equal(reactionCalls[0].payload.remoteJid, '5519998877766@s.whatsapp.net');
  assert.equal(reactionCalls[0].payload.reaction, '👍');
  assert.equal(reactionCalls[0].payload.fromMe, false);
  assert.equal(reactionCalls[0].payload.conversationId, 42);
});

test('reactToConversationMessage falls back to metadata whatsappRemoteJid when rawPayload lacks remoteJid', async () => {
  const reactionCalls: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      companyConversation: {
        findFirst: async ({ where }: any) => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          whatsappConnectionSessionId: 'session-7',
          contact: '+5519998877766',
          metadata: JSON.stringify({ whatsappRemoteJid: '5519990001111@s.whatsapp.net' }),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [],
          ...(where?.select ? {} : {}),
        }),
      },
      companyMessage: {
        findFirst: async () => ({
          id: 1080,
          companyId: 7,
          conversationId: 42,
          direction: 'OUTBOUND',
          messageType: 'text',
          body: 'Resposta',
          senderType: 'human',
          providerMessageId: null,
          variablesJson: null,
          // rawPayload tem key.id mas SEM remoteJid → cai na metadata da conversa.
          rawPayload: JSON.stringify({ key: { id: 'KEY_NO_JID' } }),
          timestamp: new Date('2026-06-19T10:05:00.000Z'),
        }),
      },
    },
    webwhatsBridge: {
      sendReaction: async (companyId: number, payload: Record<string, any>) => {
        reactionCalls.push({ companyId, payload });
        return undefined;
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.reactToConversationMessage({ companyId: 7 }, 42, 1080, '❤️');

  assert.equal(reactionCalls.length, 1);
  assert.equal(reactionCalls[0].payload.remoteJid, '5519990001111@s.whatsapp.net');
  assert.equal(reactionCalls[0].payload.messageId, 'KEY_NO_JID');
  // direction OUTBOUND e key.fromMe ausente → fromMe derivado da direção.
  assert.equal(reactionCalls[0].payload.fromMe, true);
});

test('reactToConversationMessage throws BadRequest (not 404) when message has no valid key', async () => {
  const reactionCalls: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      companyMessage: {
        // Mensagem existe no banco, mas sem key.id e sem providerMessageId.
        findFirst: async () => ({
          id: 1081,
          companyId: 7,
          conversationId: 42,
          direction: 'INBOUND',
          messageType: 'text',
          body: 'Sem chave',
          senderType: 'client',
          providerMessageId: null,
          variablesJson: null,
          rawPayload: null,
          timestamp: new Date('2026-06-19T10:10:00.000Z'),
        }),
      },
    },
    webwhatsBridge: {
      sendReaction: async (companyId: number, payload: Record<string, any>) => {
        reactionCalls.push({ companyId, payload });
        return undefined;
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await assert.rejects(
    () => service.reactToConversationMessage({ companyId: 7 }, 42, 1081, '👍'),
    /chave valida para reagir/,
  );
  // Nunca chamou o motor (guard antes do envio) e não foi 404.
  assert.equal(reactionCalls.length, 0);
});

test('refreshConversationAvatar persists motor photo into metadata.whatsappAvatarUrl', async () => {
  const conversationUpdates: Array<Record<string, any>> = [];
  const bridgeCalls: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          whatsappConnectionSessionId: 'session-7',
          contact: '+5519998877766',
          metadata: JSON.stringify({ whatsappRemoteJid: '5519998877766@s.whatsapp.net', cliente: 'Carlos' }),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [],
        }),
        update: async (input: Record<string, any>) => {
          conversationUpdates.push(input);
          return { id: input.where.id, ...input.data };
        },
      },
    },
    webwhatsBridge: {
      refreshConversationProfilePicture: async (companyId: number, remoteJid: string) => {
        bridgeCalls.push({ companyId, remoteJid });
        return 'https://motor.example/avatar/abner.jpg';
      },
    },
  });

  const result = await service.refreshConversationAvatar({ companyId: 7 }, 42);

  assert.deepEqual(result, { avatarUrl: 'https://motor.example/avatar/abner.jpg' });
  assert.equal(bridgeCalls.length, 1);
  assert.equal(bridgeCalls[0].remoteJid, '5519998877766@s.whatsapp.net');
  assert.equal(conversationUpdates.length, 1);
  const persisted = JSON.parse(conversationUpdates[0].data.metadata);
  assert.equal(persisted.whatsappAvatarUrl, 'https://motor.example/avatar/abner.jpg');
  // Preserva metadata existente.
  assert.equal(persisted.cliente, 'Carlos');
});

test('refreshConversationAvatar returns null without persisting when motor has no photo', async () => {
  const conversationUpdates: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          companyId: 7,
          channel: 'whatsapp',
          whatsappConnectionSessionId: 'session-7',
          contact: '+5519998877766',
          metadata: JSON.stringify({ whatsappRemoteJid: '5519998877766@s.whatsapp.net' }),
          createdAt: new Date('2026-03-18T10:00:00.000Z'),
          updatedAt: new Date('2026-03-18T10:01:00.000Z'),
          messages: [],
        }),
        update: async (input: Record<string, any>) => {
          conversationUpdates.push(input);
          return { id: input.where.id, ...input.data };
        },
      },
    },
    webwhatsBridge: {
      refreshConversationProfilePicture: async () => null,
    },
  });

  const result = await service.refreshConversationAvatar({ companyId: 7 }, 42);

  assert.deepEqual(result, { avatarUrl: null });
  // Sem foto = não escreve metadata (fallback de iniciais é estado válido).
  assert.equal(conversationUpdates.length, 0);
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

test('updateConversationQueue keeps all as neutral conversation without personal contact flags', async () => {
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
  assert.equal(payload.botActive, undefined);
  assert.equal(payload.humanAssigned, undefined);
  assert.equal(payload.flowResult, undefined);
  assert.equal(payload.metadata.queueTarget, 'conversas');
  assert.equal(payload.metadata.routeTarget, 'conversas');
  assert.equal(payload.metadata.inboxPersonalContact, false);
  assert.equal(payload.metadata.personalContact, false);
  assert.equal(payload.metadata.whatsappPersonalContact, false);
  assert.equal(payload.metadata.inboxLocalDeleted, false);

  assert.equal(profileStateCalls.length, 0);
});

test('deleteConversation rejects the removed excluded queue flow without deleting messages', async () => {
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
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await assert.rejects(
    () => service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42),
    /Excluídos foi removido/,
  );
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 0);
});

test('deleteConversation preserves local backend row without WhatsApp command', async () => {
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
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await assert.rejects(
    () => service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42),
    /Excluídos foi removido/,
  );
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 0);
});

test('deleteConversation ignores disconnected WhatsApp session and archives locally', async () => {
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
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await assert.rejects(
    () => service.deleteConversation({ companyId: 7, role: 'ADMIN' }, 42),
    /Excluídos foi removido/,
  );
  assert.equal(messageDeleteCalls.length, 0);
  assert.equal(conversationDeleteCalls.length, 0);
  assert.equal(conversationStateCalls.length, 0);
  assert.equal(auditCalls.length, 0);
});

test('wipeAllWhatsAppData apaga TUDO no banco, mata motor e desconecta (store-on-arrival — sem supressão)', async () => {
  const motorCalls: number[] = [];
  const sessionUpdateMany: any[] = [];
  const companyUpdates: any[] = [];
  const { service, auditCalls } = createService({
    prisma: {
      atendimentoAppointment: { updateMany: async () => ({ count: 0 }) },
      companyConversation: {
        findMany: async () => [
          { id: 1, contact: '+5519998877766' },
          { id: 2, contact: '+5519920121720' },
        ],
        deleteMany: async () => ({ count: 2 }),
      },
      companyMessage: { deleteMany: async () => ({ count: 9 }) },
      whatsAppConnectionSession: {
        updateMany: async (input: any) => { sessionUpdateMany.push(input); return { count: 1 }; },
      },
      company: {
        update: async ({ data }: any) => { companyUpdates.push(data); return { id: 7, ...data }; },
      },
    },
    webwhatsBridge: {
      wipeMotorInstance: async (companyId: number) => { motorCalls.push(companyId); return { loggedOut: true, deleted: true }; },
    },
  });

  const result = await service.wipeAllWhatsAppData({ companyId: 7, role: 'ADMIN' });

  // Apagou o banco.
  assert.equal(result.deletedConversations, 2);
  assert.equal(result.deletedMessages, 9);
  // Matou TODAS as instâncias no motor (sem supressão — store-on-arrival).
  assert.deepEqual(motorCalls, [7]);
  assert.equal(result.motorWiped, true);
  assert.equal(result.requiresReconnect, true);
  // Sem supressão: não grava 'conversation_backend_deleted' (removida).
  assert.equal(auditCalls.some((c: any) => c.event === 'conversation_backend_deleted'), false);
  // Refletiu desconectado (usuário re-escaneia o QR).
  assert.equal(sessionUpdateMany.length, 1);
  assert.equal(companyUpdates.at(-1).whatsappModalStatus, 'DISCONNECTED');
});

// cleanupOldWhatsappSessions removida (store-on-arrival — sem supressão/floor/merge).
// Confirmação: a função lança erro se chamada.
test('cleanupOldWhatsappSessions foi removida — lança erro se chamada', async () => {
  const { service } = createService({ prisma: {} });
  await assert.rejects(
    () => service.cleanupOldWhatsappSessions({ companyId: 7, role: 'ADMIN' }, 'discard'),
    /cleanupOldWhatsappSessions foi removida/,
  );
});

/*
test('cleanupOldWhatsappSessions discard apaga SÓ o número anterior, intacta o chip novo', async () => {
  // DEFINITIVO: discard remove o histórico do número ANTERIOR (chip OUTRO). O número
  // ATUAL (chip novo) não é apagado, NÃO leva floor de reset (senão sumiria o histórico
  // legítimo dele) e o motor Webwhats não é tocado.
  const deletedMessages: number[] = [];
  const deletedConversations: number[] = [];
  const sessionUpdates: any[] = [];
  const sessionDeletes: any[] = [];
  const customerDeletes: any[] = [];
  const leadDeletes: any[] = [];
  const profileResets: any[] = [];
  const profileDeletes: any[] = [];
  const oldSession = {
    id: 'old-session-7',
    phoneNormalized: '5519998877766',
    displayPhone: '+55 19 99887-7766',
    metadataJson: JSON.stringify({ oldPreference: true }),
  };
  const currentSession = {
    id: 'session-7',
    companyId: 7,
    provider: 'webwhats',
    tenantKey: 'company-7',
    // CHIP NOVO — número diferente do anterior.
    phoneNormalized: '5519920121720',
    displayPhone: '+5519920121720',
    status: 'active',
    connectedAt: new Date('2026-03-18T09:00:00.000Z'),
    disconnectedAt: null,
    createdAt: new Date('2026-03-18T09:00:00.000Z'),
    updatedAt: new Date('2026-03-18T09:00:00.000Z'),
    metadataJson: JSON.stringify({ keepThis: true }),
  };
  const { service, auditCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'CONNECTED',
          whatsappModalPhone: '+5519920121720',
          whatsappModalConnectedAt: new Date('2026-03-18T09:00:00.000Z'),
          whatsappStatus: null,
          currentWhatsappConnectionSessionId: 'session-7',
          currentWhatsappConnectionSession: currentSession,
        }),
      },
      whatsAppConnectionSession: {
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [oldSession],
        findFirst: async () => ({ metadataJson: currentSession.metadataJson }),
        deleteMany: async (input: any) => {
          sessionDeletes.push(input);
          return { count: 1 };
        },
        update: async (input: any) => {
          sessionUpdates.push(input);
          return { id: input.where.id, ...input.data };
        },
      },
      companyConversation: {
        // No mundo real o discard mira só a sessão anterior; o mock devolve só ela.
        findMany: async () => [
          { id: 42, contact: '+5519998877766', whatsappConnectionSessionId: 'old-session-7' },
        ],
        delete: async (input: any) => {
          deletedConversations.push(Number(input.where.id));
          return { id: input.where.id };
        },
      },
      companyMessage: {
        findMany: async () => [{ id: 901 }, { id: 902 }],
        delete: async (input: any) => {
          deletedMessages.push(Number(input.where.id));
          return { id: input.where.id };
        },
        updateMany: async () => ({ count: 0 }),
      },
      atendimentoAppointment: {
        updateMany: async () => ({ count: 0 }),
      },
      atendimentoCustomer: {
        deleteMany: async (input: any) => {
          customerDeletes.push(input);
          return { count: 1 };
        },
      },
      vendasLead: {
        deleteMany: async (input: any) => {
          leadDeletes.push(input);
          return { count: 1 };
        },
      },
      customerProfile: {
        updateMany: async (input: any) => {
          profileResets.push(input);
          return { count: 1 };
        },
        deleteMany: async (input: any) => {
          profileDeletes.push(input);
          return { count: 1 };
        },
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback((service as any).prisma),
    },
  });

  const result = await service.cleanupOldWhatsappSessions({ companyId: 7, role: 'ADMIN' }, 'discard');

  assert.equal(result.mode, 'discard');
  assert.equal(result.deletedMessages, 2);
  assert.equal(result.deletedConversations, 1);
  assert.deepEqual(deletedMessages, [901, 902]);
  assert.deepEqual(deletedConversations, [42]);
  // Só a sessão ANTERIOR é apagada; a ATUAL (chip novo) nunca.
  assert.equal(sessionDeletes[0].where.id.in.includes('old-session-7'), true);
  assert.equal(sessionDeletes[0].where.id.in.includes('session-7'), false);
  // NENHUM floor/escrita na sessão atual: o histórico do número novo é preservado.
  assert.equal(sessionUpdates.length, 0);
  // O purge mira o número ANTERIOR; o número ATUAL nunca entra nos candidatos.
  const purgePhones = customerDeletes[0].where.phoneNormalized.in;
  assert.equal(purgePhones.includes('5519920121720'), false);
  assert.equal(purgePhones.includes('5519998877766'), true);
  assert.equal(customerDeletes.length, 1);
  assert.equal(leadDeletes.length, 1);
  assert.equal(profileResets.length, 1);
  assert.equal(profileDeletes.length, 1);
  assert.equal(auditCalls[0].event, 'whatsapp_old_sessions_cleaned');
});

test('cleanupOldWhatsappSessions keep arquiva o histórico anterior sem apagar nada', async () => {
  const sessionUpdateMany: any[] = [];
  const sessionDeletes: any[] = [];
  const conversationDeletes: any[] = [];
  const oldSession = {
    id: 'old-session-7',
    phoneNormalized: '5519998877766',
    displayPhone: '+55 19 99887-7766',
    metadataJson: null,
  };
  const currentSession = {
    id: 'session-7',
    companyId: 7,
    provider: 'webwhats',
    tenantKey: 'company-7',
    phoneNormalized: '5519920121720',
    displayPhone: '+5519920121720',
    status: 'active',
    connectedAt: new Date('2026-03-18T09:00:00.000Z'),
    disconnectedAt: null,
    createdAt: new Date('2026-03-18T09:00:00.000Z'),
    updatedAt: new Date('2026-03-18T09:00:00.000Z'),
    metadataJson: null,
  };
  const { service, auditCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'CONNECTED',
          whatsappModalPhone: '+5519920121720',
          whatsappModalConnectedAt: new Date('2026-03-18T09:00:00.000Z'),
          whatsappStatus: null,
          currentWhatsappConnectionSessionId: 'session-7',
          currentWhatsappConnectionSession: currentSession,
        }),
      },
      whatsAppConnectionSession: {
        updateMany: async (input: any) => {
          sessionUpdateMany.push(input);
          return { count: 1 };
        },
        findMany: async () => [oldSession],
        findFirst: async () => null,
        deleteMany: async (input: any) => {
          sessionDeletes.push(input);
          return { count: 0 };
        },
        update: async (input: any) => ({ id: input.where.id, ...input.data }),
      },
      companyConversation: {
        findMany: async () => [],
        delete: async (input: any) => {
          conversationDeletes.push(input);
          return { id: input.where.id };
        },
      },
    },
  });

  const result = await service.cleanupOldWhatsappSessions({ companyId: 7, role: 'ADMIN' }, 'keep');

  assert.equal(result.mode, 'keep');
  assert.equal(result.deletedConversations, 0);
  assert.equal(result.deletedMessages, 0);
  // 'keep' só ARQUIVA a sessão anterior; nada apagado.
  assert.equal(sessionUpdateMany[0].data.status, 'archived');
  assert.equal(sessionUpdateMany[0].where.id.in.includes('old-session-7'), true);
  assert.equal(sessionDeletes.length, 0);
  assert.equal(conversationDeletes.length, 0);
  assert.equal(auditCalls[0].event, 'whatsapp_old_sessions_kept');
});

test('cleanupOldWhatsappSessions discard limpa CONTAMINAÇÃO da sessão atual (caso legado relabel)', async () => {
  // O CASO REAL DO DONO PÓS-DEPLOY: NÃO há sessão separada — o relabel pré-fix mesclou os
  // chats do número anterior na sessão de agora. Detectamos pela origem (sourcePhoneNormalized
  // != número atual) e o discard apaga só esses, sem tocar no chip novo.
  const deletedConversations: number[] = [];
  const deletedMessages: number[] = [];
  const sessionDeletes: any[] = [];
  const customerDeletes: any[] = [];
  const contaminatedConv = {
    id: 50,
    contact: '+5519998877766',
    sourcePhoneNormalized: '5519998877766', // número ANTERIOR, carimbado no create
    whatsappConnectionSessionId: 'session-7',
    lastMessageAt: new Date('2026-03-17T09:00:00.000Z'),
  };
  const currentSession = {
    id: 'session-7',
    companyId: 7,
    provider: 'webwhats',
    tenantKey: 'company-7',
    phoneNormalized: '5519920121720', // chip NOVO
    displayPhone: '+5519920121720',
    status: 'active',
    metadataJson: null,
  };
  const { service, auditCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'CONNECTED',
          whatsappModalPhone: '+5519920121720',
          whatsappModalConnectedAt: new Date('2026-03-18T09:00:00.000Z'),
          whatsappStatus: null,
          currentWhatsappConnectionSessionId: 'session-7',
          currentWhatsappConnectionSession: currentSession,
        }),
      },
      whatsAppConnectionSession: {
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [], // SEM sessão separada
        findFirst: async () => null,
        deleteMany: async (input: any) => {
          sessionDeletes.push(input);
          return { count: 0 };
        },
        update: async (input: any) => ({ id: input.where.id, ...input.data }),
      },
      companyConversation: {
        findMany: async () => [contaminatedConv],
        delete: async (input: any) => {
          deletedConversations.push(Number(input.where.id));
          return { id: input.where.id };
        },
      },
      companyMessage: {
        findMany: async () => [{ id: 701 }],
        delete: async (input: any) => {
          deletedMessages.push(Number(input.where.id));
          return { id: input.where.id };
        },
        updateMany: async () => ({ count: 0 }),
      },
      atendimentoAppointment: { updateMany: async () => ({ count: 0 }) },
      atendimentoCustomer: {
        deleteMany: async (input: any) => {
          customerDeletes.push(input);
          return { count: 1 };
        },
      },
      vendasLead: { deleteMany: async () => ({ count: 0 }) },
      customerProfile: {
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback((service as any).prisma),
    },
  });

  const result = await service.cleanupOldWhatsappSessions({ companyId: 7, role: 'ADMIN' }, 'discard');

  assert.equal(result.mode, 'discard');
  assert.deepEqual(deletedConversations, [50]); // a conversa contaminada foi apagada
  assert.deepEqual(deletedMessages, [701]);
  // Nenhuma sessão deletada (a atual fica): sem sessão separada, a atual nunca entra.
  assert.equal((sessionDeletes[0]?.where?.id?.in || []).length, 0);
  // O purge mira o número ANTERIOR; nunca o número ATUAL.
  const purgePhones = customerDeletes[0].where.phoneNormalized.in;
  assert.equal(purgePhones.includes('5519998877766'), true);
  assert.equal(purgePhones.includes('5519920121720'), false);
  assert.equal(auditCalls[0].event, 'whatsapp_old_sessions_cleaned');
});
*/

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

// ── Fase B: visão empresa ────────────────────────────────────────────────────

test('Fase B (a): ADMIN resolve scope como company agregando todas as sessões ativas', async () => {
  const sessions = [
    {
      id: 'session-vendedor-1',
      phoneNormalized: '5511999990001',
      displayPhone: '+5511999990001',
      user: { id: 101, name: 'João' },
    },
    {
      id: 'session-vendedor-2',
      phoneNormalized: '5511999990002',
      displayPhone: '+5511999990002',
      user: { id: 102, name: 'Maria' },
    },
  ];
  const { service } = createService({
    prisma: {
      company: {
        findUnique: async ({ select }: any) => {
          // aggregate branch só pede whatsappStatus
          if (Object.keys(select || {}).length === 1 && 'whatsappStatus' in select) {
            return { whatsappStatus: null };
          }
          return { id: 7, whatsappModalStatus: 'CONNECTED', whatsappStatus: null, currentWhatsappConnectionSessionId: null, currentWhatsappConnectionSession: null };
        },
      },
      whatsAppConnectionSession: {
        findFirst: async () => null,
        findMany: async ({ where }: any) => {
          if (where?.provider === 'webwhats' && where?.status === 'active') return sessions;
          return [];
        },
        updateMany: async () => ({ count: 0 }),
      },
    },
  });

  const scope: any = await (service as any).resolveInboxWhatsappSessionScope(7, { aggregate: true });

  assert.equal(scope.mode, 'company');
  assert.equal(scope.accessible, true);
  assert.deepEqual(scope.sessionIds, ['session-vendedor-1', 'session-vendedor-2']);
  assert.equal(scope.sessions.length, 2);
  assert.equal(scope.sessions[0].sellerName, 'João');
  assert.equal(scope.sessions[1].sellerName, 'Maria');
  assert.equal(scope.currentSessionId, null);
});

test('Fase B (b): USER (aggregate=false) vê apenas a sua sessão — regressão Fase A', async () => {
  const { service } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          whatsappModalStatus: 'CONNECTED',
          whatsappStatus: null,
          currentWhatsappConnectionSessionId: 'session-7',
          currentWhatsappConnectionSession: {
            id: 'session-7',
            provider: 'webwhats',
            tenantKey: 'company-7-user-55',
            status: 'active',
            connectedAt: new Date(),
          },
        }),
      },
      whatsAppConnectionSession: {
        findFirst: async ({ where }: any) => {
          if (where?.userId === 55) {
            return { id: 'session-user-55', companyId: 7, provider: 'webwhats', tenantKey: 'company-7-user-55', status: 'active', connectedAt: new Date() };
          }
          return null;
        },
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    },
  });

  // USER com userId=55 e aggregate=false → scope per-user (mode:'current', só a sessão dele)
  const scope: any = await (service as any).resolveInboxWhatsappSessionScope(7, { userId: 55, aggregate: false });

  assert.equal(scope.mode, 'current');
  assert.equal(scope.currentSessionId, 'session-user-55');
  assert.equal(scope.sessionIds, undefined, 'USER não deve ter sessionIds — isolamento Fase A');
});

test('Fase B (c): ADMIN company mode inclui conversa só-Meta quando metaActive', async () => {
  const { service } = createService({
    prisma: {
      company: {
        findUnique: async () => ({ whatsappStatus: 'connected' }),
      },
      whatsAppConnectionSession: {
        findFirst: async () => null,
        findMany: async ({ where }: any) => {
          if (where?.provider === 'webwhats' && where?.status === 'active') return [];
          return [];
        },
        updateMany: async () => ({ count: 0 }),
      },
    },
  });

  const scope: any = await (service as any).resolveInboxWhatsappSessionScope(7, { aggregate: true });

  assert.equal(scope.mode, 'company');
  assert.equal(scope.metaActive, true);
  assert.equal(scope.accessible, true);
  assert.deepEqual(scope.sessionIds, []);

  // Conversa só-Meta (sessionId=null) deve ser visível
  const rowMeta = { whatsappConnectionSessionId: null };
  const rowWebwhats = { whatsappConnectionSessionId: 'some-session' };
  assert.equal((service as any).isRowVisibleForWhatsappSessionScope(rowMeta, scope), true);
  assert.equal((service as any).isRowVisibleForWhatsappSessionScope(rowWebwhats, scope), false);
});

// ---------------------------------------------------------------------------
// startConversation (+Nova): canonicaliza via motor (onWhatsApp = fonte da verdade)
// ---------------------------------------------------------------------------

function buildStartConversationService(opts: {
  checkWhatsappNumbers: (companyId: number, numbers: any[], selector?: any) => Promise<any[]>;
}) {
  const created: Array<Record<string, any>> = [];
  const logged: Array<Record<string, any>> = [];
  const { service } = createService({
    webwhatsBridge: { checkWhatsappNumbers: opts.checkWhatsappNumbers },
    prisma: {
      companyConversation: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          created.push(data);
          return { id: 4242, ...data };
        },
      },
    },
  });
  (service as any).resolveInboxWhatsappSessionScope = async () => ({
    accessible: true,
    reason: 'webwhats_active',
    currentSessionId: 'session-7',
    mode: 'current',
  });
  (service as any).logInboxEvent = async () => undefined;
  (service as any).getPersistedConversationByIdForCompany = async (
    _companyId: number,
    id: number,
  ) => ({ id: String(id), messages: [] });
  return { service, created, logged };
}

test('startConversation usa o JID canônico do motor (resolve o "9 a mais")', async () => {
  let askedNumbers: any[] | null = null;
  const { service, created } = buildStartConversationService({
    // Dono digitou com o 9 extra (5551993572856); o motor devolve o canônico (555193572856).
    checkWhatsappNumbers: async (_companyId, numbers) => {
      askedNumbers = numbers;
      return [
        {
          input: '5551993572856',
          normalizedNumber: '5551993572856',
          exists: true,
          remoteJid: '555193572856@s.whatsapp.net',
          raw: null,
        },
      ];
    },
  });

  await service.startConversation({ companyId: 7, id: 55 }, { phone: '5551993572856' });

  // Perguntou ao motor com os dígitos digitados (sem inventar/remover 9 por conta própria).
  assert.deepEqual(askedNumbers, ['5551993572856']);
  assert.equal(created.length, 1);
  // Persistiu o canônico do motor, NÃO o digitado.
  assert.equal(created[0].contact, '+555193572856');
  const metadata = JSON.parse(created[0].metadata);
  assert.equal(metadata.whatsappRemoteJid, '555193572856@s.whatsapp.net');
  assert.equal(metadata.whatsappUnverified, undefined);
});

test('startConversation rejeita número sem WhatsApp e NÃO cria conversa', async () => {
  const { service, created } = buildStartConversationService({
    checkWhatsappNumbers: async () => [
      {
        input: '5551999999999',
        normalizedNumber: '5551999999999',
        exists: false,
        remoteJid: null,
        raw: null,
      },
    ],
  });

  await assert.rejects(
    () => service.startConversation({ companyId: 7, id: 55 }, { phone: '5551999999999' }),
    (err: any) => /não tem WhatsApp/i.test(String(err?.message || '')),
  );
  assert.equal(created.length, 0, 'não pode criar conversa pra número sem WhatsApp');
});

test('startConversation degrada (não trava) quando o motor falha — marca whatsappUnverified', async () => {
  const { service, created } = buildStartConversationService({
    checkWhatsappNumbers: async () => {
      throw new Error('motor fora do ar');
    },
  });

  await service.startConversation({ companyId: 7, id: 55 }, { phone: '5551993572856' });

  assert.equal(created.length, 1, 'motor fora do ar não pode travar o +Nova');
  // Sem confirmação do motor, mantém o digitado e sinaliza não-verificado.
  assert.equal(created[0].contact, '+5551993572856');
  assert.equal(JSON.parse(created[0].metadata).whatsappUnverified, true);
});

// ---------------------------------------------------------------------------
// clearEmptyConversations: faxina local — apaga vazia/fantasma, preserva real
// ---------------------------------------------------------------------------

test('clearEmptyConversations remove só-FAILED mas PRESERVA conversa com mensagem real', async () => {
  // O banco fake aplica o filtro `messages`: conversas com INBOUND ou OUTBOUND SENT/DELIVERED/READ
  // NÃO casam o critério de apagável, então nem aparecem como candidatas.
  const universe = [
    // fantasma: só uma OUTBOUND FAILED → apagável
    { id: 1, whatsappConnectionSessionId: 'session-7', metadata: '{}', contact: '+5511000000001', messages: [{ direction: 'OUTBOUND', status: 'FAILED' }] },
    // vazia (+Nova nunca enviada) → apagável
    { id: 2, whatsappConnectionSessionId: 'session-7', metadata: '{}', contact: '+5511000000002', messages: [] },
    // real: tem INBOUND → preservar
    { id: 3, whatsappConnectionSessionId: 'session-7', metadata: '{}', contact: '+5511000000003', messages: [{ direction: 'INBOUND', status: 'RECEIVED' }] },
    // real: OUTBOUND SENT → preservar
    { id: 4, whatsappConnectionSessionId: 'session-7', metadata: '{}', contact: '+5511000000004', messages: [{ direction: 'OUTBOUND', status: 'SENT' }] },
  ];
  const isDeletable = (row: any) => {
    const msgs = row.messages || [];
    const hasInbound = msgs.some((m: any) => m.direction === 'INBOUND');
    const hasRealOutbound = msgs.some(
      (m: any) => m.direction === 'OUTBOUND' && ['SENT', 'DELIVERED', 'READ'].includes(m.status),
    );
    return !hasInbound && !hasRealOutbound;
  };

  let deletedIds: number[] = [];
  const { service } = createService({
    prisma: {
      companyConversation: {
        findMany: async () => universe.filter(isDeletable),
        deleteMany: async ({ where }: any) => {
          // Reaplica o filtro de apagável no delete (guarda dura contra corrida).
          deletedIds = (where?.id?.in || []).filter((id: number) => {
            const row = universe.find((r) => r.id === id);
            return row && isDeletable(row);
          });
          return { count: deletedIds.length };
        },
      },
      atendimentoAppointment: { updateMany: async () => ({ count: 0 }) },
      $transaction: async (cb: any) => cb({
        atendimentoAppointment: { updateMany: async () => ({ count: 0 }) },
        companyConversation: {
          deleteMany: async ({ where }: any) => {
            deletedIds = (where?.id?.in || []).filter((id: number) => {
              const row = universe.find((r) => r.id === id);
              return row && isDeletable(row);
            });
            return { count: deletedIds.length };
          },
        },
      }),
    },
  });
  (service as any).resolveInboxWhatsappSessionScope = async () => ({ accessible: true, mode: 'company', reason: 'webwhats_active' });
  (service as any).isAggregateUser = () => true;
  (service as any).isRowVisibleForWhatsappSessionScope = () => true;
  (service as any).logInboxEvent = async () => undefined;

  const result = await service.clearEmptyConversations({ companyId: 7, id: 55 });

  // Apagou as duas apagáveis (fantasma só-FAILED + vazia), preservou as duas reais.
  assert.deepEqual(result.ids.map(Number).sort((a, b) => a - b), [1, 2]);
  assert.deepEqual(deletedIds.sort((a, b) => a - b), [1, 2]);
  assert.equal(result.deleted, 2);
});
