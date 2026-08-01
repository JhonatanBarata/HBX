import test from 'node:test';
import assert from 'node:assert/strict';

import { InboxService } from './inbox.service';
import { WebwhatsProviderError } from '../messaging/webwhats-bridge.service';
import { BotConfigStoreService } from '../bot/config/bot-config-store.service';
import { VendasContactSuppressionService } from '../vendas/vendas-contact-suppression.service';

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
    // BotConfig vazio por padrão: o BotConfigStoreService cai no fallback legado
    // (hbxRecoveryFlowStage acima) — mesmo comportamento de antes da migração.
    botConfig: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: any) => ({ id: 'bot-config-test', ...data }),
    },
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
    ...(overrides?.prisma || {}),
  } as any;

  // INTENTENGINE S3: store REAL sobre o prisma mockado (dual-read cai no legado acima).
  const botConfigStore = overrides?.botConfigStore ?? new BotConfigStoreService(prisma);

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
    // Default: motor indisponível/sem leitura (mesmo comportamento honesto de fallback do C3) —
    // testes que querem simular o motor respondendo sobrescrevem via overrides.webwhatsBridge.
    listMotorInstances: async () => null,
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
    botConfigStore as any,
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

// 02-QUOTED-BRIDGE: sendMessage precisa resolver quotedMessageId -> { key, message } do motor
// nos 3 formatos que o front manda (quotedPayload() em atendimento/page.client.tsx): keyId cru
// (providerKeyId), providerMessageId completo (webwhats:tenantKey:keyId) e id numerico da Message
// — e cair num fallback textual quando a original nao for localizavel.

test('sendMessage resolves quoted from the original message by raw keyId', async () => {
  const rawPayload = JSON.stringify({
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: false, id: 'RAWKEY123' },
    message: { conversation: 'Mensagem original do cliente' },
  });
  const { service, queueCalls } = createService({
    prisma: {
      companyMessage: {
        findFirst: async ({ where }: any) => {
          const orClauses: any[] = where?.OR || [];
          const matches = orClauses.some((clause) => clause?.providerMessageId === 'RAWKEY123');
          if (!matches) return null;
          return {
            id: 555,
            direction: 'INBOUND',
            providerMessageId: 'webwhats:company-7:RAWKEY123',
            rawPayload,
          };
        },
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7 }, 42, 'Pode confirmar o pedido?', {
    quotedMessageId: 'RAWKEY123',
    quotedContent: 'Mensagem original do cliente',
  });

  assert.equal(queueCalls.length, 1);
  const variables = (queueCalls[0].payload as any).variables;
  assert.equal(variables.quotedMessageId, 'RAWKEY123');
  assert.deepEqual(variables.quoted, {
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: false, id: 'RAWKEY123' },
    message: { conversation: 'Mensagem original do cliente' },
  });
});

test('sendMessage resolves quoted from the original message by full providerMessageId', async () => {
  const rawPayload = JSON.stringify({
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: true, id: 'RAWKEY456' },
    message: { extendedTextMessage: { text: 'Resposta anterior do atendente' } },
  });
  const { service, queueCalls } = createService({
    prisma: {
      companyMessage: {
        findFirst: async ({ where }: any) => {
          const orClauses: any[] = where?.OR || [];
          const matches = orClauses.some(
            (clause) => clause?.providerMessageId === 'webwhats:company-7:RAWKEY456',
          );
          if (!matches) return null;
          return {
            id: 556,
            direction: 'OUTBOUND',
            providerMessageId: 'webwhats:company-7:RAWKEY456',
            rawPayload,
          };
        },
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7 }, 42, 'Combinado, obrigado!', {
    quotedMessageId: 'webwhats:company-7:RAWKEY456',
    quotedContent: 'Resposta anterior do atendente',
  });

  assert.equal(queueCalls.length, 1);
  const variables = (queueCalls[0].payload as any).variables;
  assert.deepEqual(variables.quoted, {
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: true, id: 'RAWKEY456' },
    message: { extendedTextMessage: { text: 'Resposta anterior do atendente' } },
  });
});

test('sendMessage falls back to a textual quoted when the original message cannot be found', async () => {
  const { service, queueCalls } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7 }, 42, 'Segue a resposta', {
    quotedMessageId: 'id-perdido-999',
    quotedContent: 'Preview do que foi citado',
  });

  assert.equal(queueCalls.length, 1);
  const variables = (queueCalls[0].payload as any).variables;
  assert.equal(variables.quotedMessageId, 'id-perdido-999');
  assert.deepEqual(variables.quoted, {
    key: { remoteJid: undefined, fromMe: false, id: 'id-perdido-999' },
    message: { conversation: 'Preview do que foi citado' },
  });
});

test('sendMessage resolves quoted by the numeric Message id when the front sends replyTo.id', async () => {
  const rawPayload = JSON.stringify({
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: false, id: 'RAWKEY789' },
    message: { conversation: 'Mensagem antiga sem providerMessageId no front' },
  });
  const { service, queueCalls } = createService({
    prisma: {
      companyMessage: {
        findFirst: async ({ where }: any) => {
          const orClauses: any[] = where?.OR || [];
          const matches = orClauses.some((clause) => clause?.id === 901);
          if (!matches) return null;
          return {
            id: 901,
            direction: 'INBOUND',
            providerMessageId: 'webwhats:company-7:RAWKEY789',
            rawPayload,
          };
        },
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7 }, 42, 'Ja resolvi por aqui', {
    quotedMessageId: '901',
    quotedContent: 'Mensagem antiga sem providerMessageId no front',
  });

  assert.equal(queueCalls.length, 1);
  const variables = (queueCalls[0].payload as any).variables;
  assert.deepEqual(variables.quoted, {
    key: { remoteJid: '5519998877766@s.whatsapp.net', fromMe: false, id: 'RAWKEY789' },
    message: { conversation: 'Mensagem antiga sem providerMessageId no front' },
  });
});

test('retryConversationMessage reopens failed outbound in the dispatch queue', async () => {
  const outboundUpdates: Array<Record<string, any>> = [];
  const messageUpdates: Array<Record<string, any>> = [];
  const projectionCalls: Array<Record<string, any>> = [];
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
    conversations: {
      dispatchVendasCockpitProjection: async (input: Record<string, any>) => {
        projectionCalls.push(input);
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
  assert.deepEqual(projectionCalls[0], {
    companyId: 7,
    conversationId: 42,
    event: 'queued',
    messageId: 901,
  });
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

// REESCRITO em 31/07/2026. Este teste cobrava o comportamento ANTIGO (buscar a
// foto no motor e gravar no metadata). O dono aposentou a foto de perfil na
// faxina — "erro de fotos e constante, seria interessante tirar?" — entao agora
// ele cobra o contrario: a rota responde, mas NAO fala com o motor e NAO grava
// nada. Se alguem religar a busca de foto, este teste cai.
test('refreshConversationAvatar e NO-OP: nao consulta o motor nem grava foto', async () => {
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

  // Responde 200 com null (aba antiga que ainda chama a rota nao quebra).
  assert.deepEqual(result, { avatarUrl: null });
  // Zero trafego no motor: menos fingerprint de bot no chip.
  assert.deepEqual(bridgeCalls, [], 'a rota aposentada nao pode consultar o motor');
  assert.deepEqual(conversationUpdates, [], 'a rota aposentada nao pode gravar metadata');
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

test('Fix 2 (PR05072026): avatar local existente NÃO é sobrescrito por URL crua pps.whatsapp.net', () => {
  const service = createBareService();
  const stateMetadata = { cliente: 'Carlos' };
  const snapshot = {
    conversation: { contact: '+5519998877766' },
    remoteJid: '5519998877766@s.whatsapp.net',
    remoteJidAlt: null,
    contact: '+5519998877766',
    displayName: 'Carlos',
    avatarUrl: 'https://pps.whatsapp.net/v/abc123.jpg',
    unreadCount: 0,
    archived: false,
    windowActive: null,
    lastMessageAt: null,
    lastMessage: null,
  };
  const previousAvatarUrl = '/uploads/avatars/9f8e7d6c.jpg';

  const merged = service.buildLiveConversationMetadata(stateMetadata, snapshot, previousAvatarUrl);

  assert.equal(merged.whatsappAvatarUrl, previousAvatarUrl);
});

test('Fix 2 (PR05072026): avatar local existente É substituído quando o snapshot já traz outro local', () => {
  const service = createBareService();
  const stateMetadata = { cliente: 'Carlos' };
  const snapshot = {
    conversation: { contact: '+5519998877766' },
    remoteJid: '5519998877766@s.whatsapp.net',
    remoteJidAlt: null,
    contact: '+5519998877766',
    displayName: 'Carlos',
    avatarUrl: '/uploads/avatars/novofoto111.jpg',
    unreadCount: 0,
    archived: false,
    windowActive: null,
    lastMessageAt: null,
    lastMessage: null,
  };
  const previousAvatarUrl = '/uploads/avatars/9f8e7d6c.jpg';

  const merged = service.buildLiveConversationMetadata(stateMetadata, snapshot, previousAvatarUrl);

  assert.equal(merged.whatsappAvatarUrl, '/uploads/avatars/novofoto111.jpg');
});

test('Fix 2 (PR05072026): sem avatar local prévio, URL crua entra normalmente (nunca pior que hoje)', () => {
  const service = createBareService();
  const stateMetadata = { cliente: 'Carlos' };
  const snapshot = {
    conversation: { contact: '+5519998877766' },
    remoteJid: '5519998877766@s.whatsapp.net',
    remoteJidAlt: null,
    contact: '+5519998877766',
    displayName: 'Carlos',
    avatarUrl: 'https://pps.whatsapp.net/v/abc123.jpg',
    unreadCount: 0,
    archived: false,
    windowActive: null,
    lastMessageAt: null,
    lastMessage: null,
  };

  const merged = service.buildLiveConversationMetadata(stateMetadata, snapshot, null);

  assert.equal(merged.whatsappAvatarUrl, 'https://pps.whatsapp.net/v/abc123.jpg');
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

// PR20072026-CHIP (A2): a identidade de quem clica "enviar" se perdia na CRIAÇÃO da
// conversa (shell órfã, sem whatsappConnectionSessionId) — não no dispatch. O incidente
// 20/07 (9 msgs da vendedora Gabriele saindo pelo chip do dono) veio exatamente daqui: a
// conversa nasceu órfã e o envio caiu no fallback cego do bridge. sendMessage agora resolve
// a sessão do PRÓPRIO viewer quando a conversa é órfã, carimba a conversa (idempotente) e
// propaga senderUserId no outboundPayload (fallback do queueOutboundForCompany, A3).
test('sendMessage (A2, conversa órfã): resolve a sessão do viewer, carimba a conversa e propaga senderUserId', async () => {
  const conversationUpdateManyCalls: Array<Record<string, unknown>> = [];
  const orphanConversation = {
    id: 42,
    companyId: 7,
    channel: 'whatsapp',
    whatsappConnectionSessionId: null,
    sourcePhoneNormalized: null,
    sourceTenantKey: null,
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
  const { service, queueCalls } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({ ...orphanConversation }),
        updateMany: async (input: any) => {
          conversationUpdateManyCalls.push(input);
          return { count: 1 };
        },
      },
      whatsAppConnectionSession: {
        findFirst: async ({ where }: any) =>
          where?.userId === 33
            ? { id: 'session-33', tenantKey: 'company-7-user-33', phoneNormalized: '5511988887777' }
            : null,
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await service.sendMessage({ companyId: 7, id: 33 }, 42, 'Oi, aqui é a Gabriele');

  assert.equal(queueCalls.length, 1);
  assert.equal((queueCalls[0] as any).payload.senderUserId, 33);
  assert.equal(conversationUpdateManyCalls.length, 1);
  assert.equal((conversationUpdateManyCalls[0] as any).where.id, 42);
  assert.equal((conversationUpdateManyCalls[0] as any).where.whatsappConnectionSessionId, null);
  assert.equal((conversationUpdateManyCalls[0] as any).data.whatsappConnectionSessionId, 'session-33');
  assert.equal((conversationUpdateManyCalls[0] as any).data.sourceTenantKey, 'company-7-user-33');
});

test('sendMessage (A2, conversa órfã, viewer sem chip conectado): falha fechado, nunca usa o chip da empresa/terceiro', async () => {
  const orphanConversation = {
    id: 42,
    companyId: 7,
    channel: 'whatsapp',
    whatsappConnectionSessionId: null,
    sourcePhoneNormalized: null,
    sourceTenantKey: null,
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
  const { service, queueCalls } = createService({
    prisma: {
      companyConversation: {
        findFirst: async () => ({ ...orphanConversation }),
      },
      // Ninguém conectado (banco não tem sessão active pra userId 33) — não pode cair pro
      // ponteiro/chip mais recente da empresa.
      whatsAppConnectionSession: {
        findFirst: async () => null,
      },
    },
  });
  (service as any).getConversationByIdForCompany = async () => ({ id: '42', messages: [] });

  await assert.rejects(
    () => service.sendMessage({ companyId: 7, id: 33 }, 42, 'Oi, aqui é a Gabriele'),
    /Seu WhatsApp não está conectado/,
  );
  assert.equal(queueCalls.length, 0);
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
  // Contrato de 25/06 (`b6118316`): ADMIN-dono em company mode vê a EMPRESA INTEIRA,
  // inclusive conversa de sessão fora de `sessionIds` — o filtro antigo escondia o
  // histórico a cada publish (re-link pisca a sessão pra 'disconnected' no banco).
  // Este assert esperava `false` pela spec de 18/06 e ficou 1 mês vermelho sem ninguém
  // rodar (censo 26/07); quem segue filtrando por sessão é só o gerente `restricted`.
  assert.equal((service as any).isRowVisibleForWhatsappSessionScope(rowWebwhats, scope), true);
});

// ---------------------------------------------------------------------------
// startConversation (+Nova): canonicaliza via motor (onWhatsApp = fonte da verdade)
// ---------------------------------------------------------------------------

function buildStartConversationService(opts: {
  checkWhatsappNumbers: (companyId: number, numbers: any[], selector?: any) => Promise<any[]>;
  findFirst?: (input: any) => Promise<any>;
}) {
  const created: Array<Record<string, any>> = [];
  const updated: Array<Record<string, any>> = [];
  const logged: Array<Record<string, any>> = [];
  const { service } = createService({
    webwhatsBridge: { checkWhatsappNumbers: opts.checkWhatsappNumbers },
    prisma: {
      companyConversation: {
        findFirst: opts.findFirst || (async () => null),
        update: async ({ where, data }: any) => {
          updated.push({ where, data });
          return { id: where.id, companyId: 7, channel: 'whatsapp', contact: data.contact, metadata: data.metadata, ...data };
        },
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
  return { service, created, updated, logged };
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

test('startConversation reaproveita rascunho manual sem sessão em vez de duplicar chat', async () => {
  const orphan = {
    id: 313,
    companyId: 7,
    channel: 'whatsapp',
    whatsappConnectionSessionId: null,
    sourcePhoneNormalized: null,
    sourceTenantKey: null,
    contact: '+5511999998888',
    metadata: JSON.stringify({
      sourceModule: 'atendimento_manual',
      manualConversationStarted: true,
      whatsappRemoteJid: '5511999998888@s.whatsapp.net',
      whatsappName: 'HBX SUP',
    }),
    currentFlow: 'cobranca_recovery',
    currentStep: 'novo',
    flowResult: null,
    botActive: false,
    humanAssigned: true,
    assignedUserId: 55,
    lastInteractionAt: new Date('2026-07-08T10:00:00.000Z'),
    lastMessageAt: new Date('2026-07-08T10:00:00.000Z'),
    createdAt: new Date('2026-07-08T10:00:00.000Z'),
    updatedAt: new Date('2026-07-08T10:00:00.000Z'),
  };
  let findCalls = 0;
  const { service, created, updated } = buildStartConversationService({
    checkWhatsappNumbers: async () => [
      {
        input: '5511999998888',
        normalizedNumber: '5511999998888',
        exists: true,
        remoteJid: '5511999998888@s.whatsapp.net',
        raw: null,
      },
    ],
    findFirst: async ({ where }: any) => {
      findCalls += 1;
      return where?.whatsappConnectionSessionId === null ? orphan : null;
    },
  });
  (service as any).resolveInboxWhatsappSessionScope = async () => ({
    accessible: true,
    reason: 'webwhats_active',
    currentSessionId: 'session-7',
    currentSession: {
      id: 'session-7',
      phoneNormalized: '5511999990000',
      tenantKey: 'company-7-user-55',
    },
    mode: 'current',
  });

  await service.startConversation({ companyId: 7, id: 55 }, { phone: '5511999998888', name: 'HBX System' });

  assert.equal(findCalls, 2);
  assert.equal(created.length, 0, 'não deve criar segunda conversa para o mesmo número');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].where.id, 313);
  assert.equal(updated[0].data.whatsappConnectionSessionId, 'session-7');
  assert.equal(updated[0].data.sourcePhoneNormalized, '5511999990000');
  const metadata = JSON.parse(updated[0].data.metadata);
  assert.equal(metadata.whatsappName, 'HBX System');
  assert.equal(metadata.whatsappRemoteJid, '5511999998888@s.whatsapp.net');
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

test('startConversation NÃO cria conversa quando o motor falha — recusa pra validar de novo', async () => {
  // Ordem do dono 23/06: "bater número por número". Falha do motor NÃO degrada criando
  // fantasma — recusa pedindo nova tentativa (nenhuma conversa nasce sem confirmação).
  const { service, created } = buildStartConversationService({
    checkWhatsappNumbers: async () => {
      throw new Error('motor fora do ar');
    },
  });

  await assert.rejects(
    () => service.startConversation({ companyId: 7, id: 55 }, { phone: '5551993572856' }),
    (err: any) => /confirmar|tente de novo/i.test(String(err?.message || '')),
  );
  assert.equal(created.length, 0, 'falha de validação NÃO pode virar conversa-fantasma');
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
        companyMessage: {
          deleteMany: async ({ where }: any) => {
            // As mensagens têm que cair ANTES da conversa (FK Restrict) — só as apagáveis.
            const count = (where?.conversationId?.in || []).filter((id: number) => {
              const row = universe.find((r) => r.id === id);
              return row && isDeletable(row);
            }).length;
            return { count };
          },
        },
        companyConversation: {
          // Reconfirma apagáveis dentro da transação (guarda dura contra corrida).
          findMany: async ({ where }: any) =>
            universe.filter((r) => (where?.id?.in || []).includes(r.id) && isDeletable(r)),
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

// ===========================================================================
// WEBWHATS-ARQ3 Sprint 3 — Fonte única do estado no painel "Equipe".
// Caracteriza que getWhatsappAdminPanel deriva "conectado?" da PROJEÇÃO (motor ao vivo
// carimbado), não mais de `status === 'active'` cru — matando o "Conectado fantasma".
// ===========================================================================

function buildAdminPanelService(sessions: any[]) {
  const service = createBareService();
  (service as any).assertCompanyAdminOwner = () => undefined;
  // Motor indisponível/sem leitura por padrão (fallback honesto do C3) — os testes abaixo
  // caracterizam a PROJEÇÃO (banco), não a decoração do motor ao vivo (isso é coberto à parte).
  (service as any).webwhatsBridge = { listMotorInstances: async () => null };
  (service as any).prisma = {
    company: {
      findUnique: async () => ({
        whatsappAttendanceMode: 'individual',
        currentWhatsappConnectionSession: null,
      }),
    },
    whatsAppConnectionSession: {
      findMany: async () => sessions,
    },
    companyConversation: {
      groupBy: async () => [],
    },
    user: {
      findMany: async () =>
        sessions.map((s, i) => ({
          id: s.userId,
          name: `User ${s.userId}`,
          username: `user${s.userId}`,
          role: 'USER',
          isSystemMaster: false,
          canViewBilling: false,
        })),
    },
  };
  return service;
}

test('ARQ3-S3: painel Equipe mostra Conectado quando a projeção diz vivo (active+open+fresco)', async () => {
  const prev = process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
  process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '180';
  try {
    const service = buildAdminPanelService([
      {
        id: 'sess-live',
        userId: 10,
        displayPhone: '5511999990000',
        phoneNormalized: '5511999990000',
        status: 'active',
        connectedAt: new Date(Date.now() - 3600_000),
        lastReconciledAt: new Date(Date.now() - 5_000), // fresco
        motorState: 'open',
      },
    ]);
    const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
    const m = res.team.find((t: any) => String(t.userId) === '10');
    assert.equal(m.whatsappConnected, true);
    assert.equal(m.whatsappHasSession, true);
    assert.ok(m.whatsappSeenAgoSeconds >= 0);
  } finally {
    if (prev === undefined) delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    else process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = prev;
  }
});

test('ARQ3-S3 FANTASMA: sessão active mas motorState close → painel NÃO mostra Conectado (mostra órfão)', async () => {
  const service = buildAdminPanelService([
    {
      id: 'sess-ghost',
      userId: 20,
      displayPhone: '5511988887777',
      phoneNormalized: '5511988887777',
      status: 'active', // banco ainda diz ativo (o legado mostraria Conectado)
      connectedAt: new Date(Date.now() - 7200_000),
      lastReconciledAt: new Date(Date.now() - 2_000),
      motorState: 'close', // motor morreu
    },
  ]);
  const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
  const m = res.team.find((t: any) => String(t.userId) === '20');
  // Verdade honesta: NÃO conectado…
  assert.equal(m.whatsappConnected, false);
  // …mas HÁ sessão ativa no banco → "Derrubar conexão" deve ficar disponível (RUIM#2).
  assert.equal(m.whatsappHasSession, true);
});

test('ARQ3-S3 ÓRFÃO STALE: sessão active sem confirmação recente → NÃO conectado, mas com sessão p/ derrubar', async () => {
  const prev = process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
  process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '180';
  try {
    const service = buildAdminPanelService([
      {
        id: 'sess-stale',
        userId: 30,
        displayPhone: '5511977776666',
        phoneNormalized: '5511977776666',
        status: 'active',
        connectedAt: new Date(Date.now() - 7200_000),
        lastReconciledAt: new Date(Date.now() - 10_000_000), // carimbo MUITO velho
        motorState: 'open',
      },
    ]);
    const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
    const m = res.team.find((t: any) => String(t.userId) === '30');
    assert.equal(m.whatsappConnected, false);
    assert.equal(m.whatsappHasSession, true);
    assert.equal(m.whatsappStale, true);
  } finally {
    if (prev === undefined) delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    else process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = prev;
  }
});

test('ARQ3-S3 retrocompat: sessão active pré-migração (sem carimbo) → segue Conectado (sem regressão)', async () => {
  const service = buildAdminPanelService([
    {
      id: 'sess-legacy',
      userId: 40,
      displayPhone: '5511966665555',
      phoneNormalized: '5511966665555',
      status: 'active',
      connectedAt: new Date(Date.now() - 3600_000),
      lastReconciledAt: null, // pré-migração
      motorState: null,
    },
  ]);
  const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
  const m = res.team.find((t: any) => String(t.userId) === '40');
  assert.equal(m.whatsappConnected, true); // não regride o legado
  assert.equal(m.whatsappStale, true); // mas sinaliza "visto há —"
});

// ===========================================================================
// C3 aplicado ao painel "Equipe" (achado da campanha TESTE-GERAL/CORRECOES.md):
// getWhatsappAdminPanel só lia a PROJEÇÃO (banco) — nunca o motor ao vivo. Se o
// webhook atrasar/falhar e ninguém tiver reconciliado (outra rota) dentro da
// janela de frescor, o painel podia mentir "conectado" com o chip já caído no
// motor. Estes testes cobrem a decoração com `listMotorInstances` (SÓ LEITURA),
// por USUÁRIO (`company-{id}-user-{N}` — granularidade da Equipe).
// ===========================================================================

test('C3/Equipe: motor close derruba o fantasma mesmo com projeção active+fresca', async () => {
  const prev = process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
  process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '180';
  try {
    const service = buildAdminPanelService([
      {
        id: 'sess-live-but-motor-dead',
        userId: 50,
        displayPhone: '5511955554444',
        phoneNormalized: '5511955554444',
        status: 'active',
        connectedAt: new Date(Date.now() - 3600_000),
        lastReconciledAt: new Date(Date.now() - 5_000), // projeção fresca...
        motorState: 'open', // ...e ainda diz 'open' (webhook de queda não chegou)
      },
    ]);
    // Motor AO VIVO já enxerga o chip caído — é a fonte que a projeção ainda não pegou.
    (service as any).webwhatsBridge = {
      listMotorInstances: async () => [
        { instance: { instanceName: 'company-7-user-50', state: 'close' } },
      ],
    };
    const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
    const m = res.team.find((t: any) => String(t.userId) === '50');
    assert.equal(m.whatsappConnected, false, 'motor close deve vencer a projeção desatualizada');
    assert.equal(m.whatsappMotorState, 'close');
    assert.equal(m.whatsappHasSession, true, 'sessão segue existindo no banco p/ oferecer Derrubar');
  } finally {
    if (prev === undefined) delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    else process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = prev;
  }
});

test('C3/Equipe: motor open confirma vivo mesmo com projeção stale (carimbo velho)', async () => {
  const prev = process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
  process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '180';
  try {
    const service = buildAdminPanelService([
      {
        id: 'sess-stale-but-motor-alive',
        userId: 60,
        displayPhone: '5511944443333',
        phoneNormalized: '5511944443333',
        status: 'active',
        connectedAt: new Date(Date.now() - 7200_000),
        lastReconciledAt: new Date(Date.now() - 10_000_000), // carimbo MUITO velho
        motorState: 'open',
      },
    ]);
    (service as any).webwhatsBridge = {
      listMotorInstances: async () => [
        { instance: { instanceName: 'company-7-user-60', state: 'open' } },
      ],
    };
    const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
    const m = res.team.find((t: any) => String(t.userId) === '60');
    assert.equal(m.whatsappConnected, true, 'motor open ao vivo confirma mesmo sem carimbo recente');
    assert.equal(m.whatsappMotorState, 'open');
  } finally {
    if (prev === undefined) delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    else process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = prev;
  }
});

test('C3/Equipe: motor indisponível é no-op — cai na projeção sem alterar nada', async () => {
  const service = buildAdminPanelService([
    {
      id: 'sess-live',
      userId: 70,
      displayPhone: '5511933332222',
      phoneNormalized: '5511933332222',
      status: 'active',
      connectedAt: new Date(Date.now() - 3600_000),
      lastReconciledAt: new Date(Date.now() - 5_000),
      motorState: 'open',
    },
  ]);
  (service as any).webwhatsBridge = { listMotorInstances: async () => null }; // motor fora do ar
  const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
  const m = res.team.find((t: any) => String(t.userId) === '70');
  assert.equal(m.whatsappConnected, true, 'sem leitura do motor, confia na projeção (fallback honesto)');
});

test('C3/Equipe: instância do motor de OUTRO usuário não decora quem não tem chip no motor', async () => {
  const service = buildAdminPanelService([
    {
      id: 'sess-live',
      userId: 80,
      displayPhone: '5511922221111',
      phoneNormalized: '5511922221111',
      status: 'active',
      connectedAt: new Date(Date.now() - 3600_000),
      lastReconciledAt: new Date(Date.now() - 5_000),
      motorState: 'open',
    },
  ]);
  // Motor só enxerga OUTRO usuário (81) — não deve mexer no estado do 80.
  (service as any).webwhatsBridge = {
    listMotorInstances: async () => [
      { instance: { instanceName: 'company-7-user-81', state: 'close' } },
    ],
  };
  const res = await service.getWhatsappAdminPanel({ companyId: 7, role: 'ADMIN' });
  const m = res.team.find((t: any) => String(t.userId) === '80');
  assert.equal(m.whatsappConnected, true, 'granularidade por usuário: instância de outro user não afeta este');
});

// ---------------------------------------------------------------------------
// P1.3: mídia do inbox — assinatura na SAÍDA + upload privado (UUID/magic bytes)
// ---------------------------------------------------------------------------

import { mkdirSync as p13MkdirSync, mkdtempSync as p13MkdtempSync, rmSync as p13RmSync, writeFileSync as p13WriteFileSync, existsSync as p13ExistsSync, readdirSync as p13ReaddirSync } from 'node:fs';
import { tmpdir as p13Tmpdir } from 'node:os';
import { join as p13Join } from 'node:path';
import { verifyInboxMediaSignature as p13Verify } from '../uploads/inbox-media.util';

function p13WithTempCwd(run: (tempDir: string) => void) {
  const previousCwd = process.cwd();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'segredo-de-teste-com-32-caracteres!';
  const tempDir = p13MkdtempSync(p13Join(p13Tmpdir(), 'inbox-media-p13-'));
  try {
    process.chdir(tempDir);
    run(tempDir);
  } finally {
    process.chdir(previousCwd);
    p13RmSync(tempDir, { recursive: true, force: true });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}

function p13AssertSignedInboxUrl(value: unknown, filename: string) {
  const url = new URL(`http://x${String(value)}`);
  assert.equal(url.pathname, `/uploads/inbox/${filename}`);
  assert.equal(
    p13Verify(filename, url.searchParams.get('e'), url.searchParams.get('s')),
    true,
    `assinatura inválida em: ${String(value)}`,
  );
}

test('P1.3 normalizeStoredMediaAssetUrl assina o path cru na saída (arquivo no storage privado)', () => {
  p13WithTempCwd((tempDir) => {
    p13MkdirSync(p13Join(tempDir, 'storage', 'inbox'), { recursive: true });
    p13WriteFileSync(p13Join(tempDir, 'storage', 'inbox', 'anexo.jpg'), 'bytes');

    const service = Object.create(InboxService.prototype) as any;
    const signed = service.normalizeStoredMediaAssetUrl('/uploads/inbox/anexo.jpg');
    p13AssertSignedInboxUrl(signed, 'anexo.jpg');

    // valor armazenado com query velha sai re-assinado fresco
    const resigned = service.normalizeStoredMediaAssetUrl('/uploads/inbox/anexo.jpg?e=1&s=velho');
    p13AssertSignedInboxUrl(resigned, 'anexo.jpg');

    // URL absoluta armazenada vira path relativo assinado
    const fromAbsolute = service.normalizeStoredMediaAssetUrl(
      'https://api.hbxsystem.com.br/uploads/inbox/anexo.jpg',
    );
    p13AssertSignedInboxUrl(fromAbsolute, 'anexo.jpg');

    // arquivo que não existe em nenhum dir → null (comportamento preservado)
    assert.equal(service.normalizeStoredMediaAssetUrl('/uploads/inbox/sumiu.jpg'), null);
  });
});

test('P1.3 normalizeStoredMediaAssetUrl aceita arquivo ainda no public legado (transição)', () => {
  p13WithTempCwd((tempDir) => {
    p13MkdirSync(p13Join(tempDir, 'public', 'uploads', 'inbox'), { recursive: true });
    p13WriteFileSync(p13Join(tempDir, 'public', 'uploads', 'inbox', 'legado.ogg'), 'bytes');

    const service = Object.create(InboxService.prototype) as any;
    const signed = service.normalizeStoredMediaAssetUrl('/uploads/inbox/legado.ogg');
    p13AssertSignedInboxUrl(signed, 'legado.ogg');
  });
});

test('P1.3 uploadConversationMedia grava UUID+ext do MIME no storage privado e devolve URL assinada', async () => {
  await (async () => {
    const previousCwd = process.cwd();
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'segredo-de-teste-com-32-caracteres!';
    const tempDir = p13MkdtempSync(p13Join(p13Tmpdir(), 'inbox-upload-p13-'));
    try {
      process.chdir(tempDir);
      const service = Object.create(InboxService.prototype) as any;
      service.requireCompanyIdFromUser = () => 7;
      service.assertCanSendInConversation = async () => 'shared';
      service.prisma = {
        companyConversation: { findFirst: async () => ({ id: 42, companyId: 7 }) },
      };

      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
      const result = await service.uploadConversationMedia({ id: 1 }, 42, {
        buffer: pngBytes,
        mimetype: 'image/png',
        originalname: 'malicioso.html', // originalname NÃO manda na extensão
        size: pngBytes.length,
      });

      // nome = uuid.png (extensão do MIME validado)
      assert.match(
        String(result.filename),
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
      p13AssertSignedInboxUrl(result.url, result.filename);

      // gravou no storage privado, nada no public
      assert.equal(
        p13ExistsSync(p13Join(tempDir, 'storage', 'inbox', result.filename)),
        true,
      );
      assert.equal(p13ExistsSync(p13Join(tempDir, 'public', 'uploads', 'inbox')), false);

      // magic bytes: HTML mascarado de PNG é recusado e nada é gravado
      await assert.rejects(
        service.uploadConversationMedia({ id: 1 }, 42, {
          buffer: Buffer.from('<html><script>alert(1)</script></html>'),
          mimetype: 'image/png',
          originalname: 'foto.png',
          size: 10,
        }),
        /nao corresponde ao tipo/i,
      );
      assert.equal(p13ReaddirSync(p13Join(tempDir, 'storage', 'inbox')).length, 1);
    } finally {
      process.chdir(previousCwd);
      p13RmSync(tempDir, { recursive: true, force: true });
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  })();
});

// ================================================================
// ESCRITA DA SUPRESSÃO — CAMINHO HUMANO (30/07/2026).
// Com o bot desligado em produção, "Sem interesse"/"Não ligar mais" do
// /atendimento é o caminho que roda TODO DIA. Ele gravava botOff no perfil e o
// SOFT-hide no metadata da conversa — nenhum dos dois é consultado antes de
// disparar. A única marca que o portão da cadência lê é a global
// (VendasContactSuppression), e ela não tinha escritor. Vacina abaixo: escreve
// pelo caminho de produção e LÊ com o serviço real, como a cadência lê.
// ================================================================

function createInboxSuppressionStore() {
  const rows: any[] = [];
  const matchesKeys = (row: any, where: any) => {
    const or = Array.isArray(where?.OR) ? where.OR : [];
    if (!or.length) return false;
    return or.some((clause: any) => {
      if (String(clause.contactType) !== String(row.contactType)) return false;
      const key = clause.contactKey;
      if (key && typeof key === 'object' && Array.isArray(key.in)) return key.in.includes(row.contactKey);
      return String(key) === String(row.contactKey);
    });
  };
  const isActive = (row: any) =>
    row.expiresAt === null || row.expiresAt === undefined || new Date(row.expiresAt).getTime() > Date.now();
  return {
    rows,
    model: {
      createMany: async ({ data }: any) => {
        const list = Array.isArray(data) ? data : [data];
        for (const item of list) rows.push({ ...item, createdAt: new Date() });
        return { count: list.length };
      },
      findFirst: async ({ where }: any) =>
        rows.filter((row) => matchesKeys(row, where) && isActive(row)).slice(-1)[0] || null,
      findMany: async ({ where }: any) => rows.filter((row) => matchesKeys(row, where) && isActive(row)),
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter(
          (row) =>
            matchesKeys(row, where) &&
            isActive(row) &&
            (where.originCompanyId === undefined || row.originCompanyId === where.originCompanyId),
        );
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      },
    },
  };
}

function createStatusCardService(store: ReturnType<typeof createInboxSuppressionStore>) {
  const leadWrites: Array<Record<string, any>> = [];
  const service = createBareService();
  service.logger = { log: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
  service.prisma = {
    customerProfile: { update: async (input: any) => ({ id: 'profile-1', ...input.data }) },
    atendimentoCustomer: { update: async (input: any) => ({ id: 5, ...input.data }) },
    vendasLead: {
      findFirst: async () => ({ id: 'lead-1', companyId: 7, name: 'Carlos' }),
      update: async (input: any) => {
        leadWrites.push(input);
        return { id: 'lead-1', ...input.data };
      },
      create: async (input: any) => {
        leadWrites.push(input);
        return { id: 'lead-1', ...input.data };
      },
    },
    vendasLeadTimelineEvent: { createMany: async () => ({ count: 1 }) },
    vendasContactSuppression: store.model,
  };
  service.conversations = { updateConversationState: async () => ({ id: 42 }) };
  service.customerProfileService = { upsertAtendimentoProfileState: async () => ({ id: 'profile-1' }) };
  service.requireCompanyIdFromUser = () => 7;
  service.resolveInboxMutationSessionScope = async () => ({ accessible: true });
  service.resolveStatusCardRecords = async () => ({
    conversation: { id: 42, metadata: '{}' },
    phoneNormalized: '5519998877766',
    profile: { id: 'profile-1', email: 'contato@padaria.com.br', cnpj: '12.345.678/0001-90', notes: null, botOff: false },
    atendimentoCustomer: { id: 5 },
  });
  service.getConversationStatusCard = async () => ({ ok: true });
  service.parseConversationMetadata = () => ({});
  service.getStatusCardPhoneVariants = () => ['5519998877766'];
  service.vendasLeadStatusCardSelectWithoutAddress = () => ({ id: true });
  service.buildLeadClosureTimelineDescription = () => 'descricao';
  service.parseStatusCardDate = (value: any) => (value ? new Date(value) : null);
  return { service, leadWrites };
}

test('operador marca "Nao ligar mais" no Atendimento e o contato passa a aparecer suprimido para a cadencia', async () => {
  const store = createInboxSuppressionStore();
  const { service, leadWrites } = createStatusCardService(store);

  await service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'nao_ligar' });

  const phoneRow = store.rows.find((row) => row.contactType === 'phone');
  assert.ok(phoneRow, 'a marca global tinha que ser gravada pelo clique do operador');
  assert.equal(phoneRow.reason, 'opt_out', '"Nao ligar mais" e pedido explicito: permanente');
  assert.equal(phoneRow.expiresAt, null);
  assert.equal(phoneRow.originCompanyId, 7);
  assert.ok(store.rows.some((row) => row.contactType === 'cnpj' && row.contactKey === '12345678000190'));
  assert.ok(store.rows.some((row) => row.contactType === 'email' && row.contactKey === 'contato@padaria.com.br'));

  // motivo estruturado tambem chega no lead (a tela de Vendas parava de mostrar motivo)
  assert.equal(leadWrites[0].data.closureReason, 'sem_interesse');

  const reader = new VendasContactSuppressionService({ vendasContactSuppression: store.model } as any);
  assert.equal((await reader.isSuppressed({ phone: '+55 19 99887-7766' })).suppressed, true);
});

test('dosagem POR MOTIVO (dono 30/07): preco ~60d, ja_tem ~90d, sem_perfil permanente', async () => {
  // Antes preco/ja_tem/sem_perfil caiam todos no generico sem_interesse (12m).
  const before = Date.now();
  const days = (row: { expiresAt: Date | null }) => Math.round(((row.expiresAt as Date).getTime() - before) / (24 * 60 * 60 * 1000));

  const storePreco = createInboxSuppressionStore();
  const { service: svcPreco } = createStatusCardService(storePreco);
  await svcPreco.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'preco' });
  const rowPreco = storePreco.rows.find((row) => row.contactType === 'phone')!;
  assert.equal(rowPreco.reason, 'preco');
  assert.ok(rowPreco.expiresAt instanceof Date, 'preco resfria, nao e permanente');
  assert.ok(days(rowPreco) >= 59 && days(rowPreco) <= 61, `preco deveria ser ~60 dias, foi ${days(rowPreco)}`);

  const storeJaTem = createInboxSuppressionStore();
  const { service: svcJaTem } = createStatusCardService(storeJaTem);
  await svcJaTem.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'ja_tem' });
  const rowJaTem = storeJaTem.rows.find((row) => row.contactType === 'phone')!;
  assert.equal(rowJaTem.reason, 'ja_tem');
  assert.ok(days(rowJaTem) >= 89 && days(rowJaTem) <= 91, `ja_tem deveria ser ~90 dias, foi ${days(rowJaTem)}`);

  const storeSemPerfil = createInboxSuppressionStore();
  const { service: svcSemPerfil } = createStatusCardService(storeSemPerfil);
  await svcSemPerfil.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'sem_perfil' });
  const rowSemPerfil = storeSemPerfil.rows.find((row) => row.contactType === 'phone')!;
  assert.equal(rowSemPerfil.reason, 'sem_perfil');
  assert.equal(rowSemPerfil.expiresAt, null, 'sem_perfil e permanente — insistir queima chip');
});

test('encerramento por "convertido" NAO marca supressao (sinal positivo nao trava prospeccao futura)', async () => {
  const store = createInboxSuppressionStore();
  const { service } = createStatusCardService(store);

  await service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'convertido' });

  assert.equal(store.rows.length, 0, 'cliente convertido nao pode entrar na lista de quem pediu para sair');
});

test('"Liberar" (doNotCall=false) desfaz a marca desta empresa — botao nao pode mentir', async () => {
  const store = createInboxSuppressionStore();
  const { service } = createStatusCardService(store);

  await service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'nao_ligar' });
  const reader = new VendasContactSuppressionService({ vendasContactSuppression: store.model } as any);
  assert.equal((await reader.isSuppressed({ phone: '5519998877766' })).suppressed, true);

  await service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: false });
  assert.equal(
    (await reader.isSuppressed({ phone: '5519998877766' })).suppressed,
    false,
    'liberado na tela tem que voltar a poder receber',
  );
});

test('marca de OUTRA empresa nao e desfeita pelo "Liberar" deste tenant', async () => {
  const store = createInboxSuppressionStore();
  store.rows.push({
    contactType: 'phone',
    contactKey: '5519998877766',
    reason: 'opt_out',
    suppressedAt: new Date(),
    expiresAt: null,
    originCompanyId: 99,
    originLeadId: 'lead-de-outro',
  });
  const { service } = createStatusCardService(store);

  await service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: false });

  const reader = new VendasContactSuppressionService({ vendasContactSuppression: store.model } as any);
  assert.equal(
    (await reader.isSuppressed({ phone: '5519998877766' })).suppressed,
    true,
    'marca de terceiro nao e minha para desfazer',
  );
});

test('marca do Atendimento e best-effort: banco fora do ar NAO derruba o clique do operador', async () => {
  const store = createInboxSuppressionStore();
  const { service } = createStatusCardService(store);
  service.prisma.vendasContactSuppression = {
    createMany: async () => {
      throw new Error('banco fora do ar');
    },
    updateMany: async () => {
      throw new Error('banco fora do ar');
    },
  };

  await assert.doesNotReject(
    service.updateConversationStatusCard({ id: 1 }, 42, { doNotCall: true, closureReason: 'nao_ligar' }),
  );
});

// ============================================================================
// FAXINA DAS CONVERSAS — 31/07/2026 (ordem do dono).
// Tres leis novas viraram teste aqui. Cada uma nasceu de uma queixa real:
//  1. IDENTIDADE HBX   — "puxar nome do contato da erro / e se os nomes forem do HBX?"
//  2. HISTORICO SOBERANO — "nada de puxar chat antigo, MAS nao pode perder mensagens"
//  3. LIMPAR CONVERSA  — "some do HBX, NUNCA manda exclusao pro WhatsApp"
// ============================================================================

function conversaDaFaxina(metadata: Record<string, unknown>) {
  return {
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
    metadata: JSON.stringify(metadata),
    createdAt: new Date('2026-07-31T10:00:00.000Z'),
    updatedAt: new Date('2026-07-31T10:01:00.000Z'),
    messages: [],
  };
}

async function mapearConversaDaFaxina(service: any, conversation: any, identityRow: any) {
  service.resolveRecoveryRoutingContext = async () => ({
    routeTarget: 'atendimento',
    routeReason: null,
    recoverySuggestedPath: null,
    latestSourceModule: null,
  });
  return service.mapConversation(7, conversation, {} as any, identityRow, null);
}

test('IDENTIDADE HBX: o nome CADASTRADO vence o nome que o cliente usa no WhatsApp', async () => {
  const { service } = createService();
  // Cena do dono: vendedor cadastrou "Padaria do Ze"; o cliente se chama
  // "Ze da Van" no WhatsApp. Antes de 31/07 a tela mostrava o do WhatsApp.
  const mapped = await mapearConversaDaFaxina(
    service,
    conversaDaFaxina({ whatsappContactName: 'Ze da Van' }),
    { id: 'ident-1', name: 'Padaria do Ze', customerProfile: { id: 'prof-1', name: 'Padaria do Ze' } },
  );

  assert.equal(mapped.customer.name, 'Padaria do Ze');
  assert.equal(mapped.customer.isRegistered, true);
  // Com cadastro existindo, a dica some — seria ruido na tela.
  assert.equal(mapped.customer.suggestedName, null);
});

test('IDENTIDADE HBX: sem cadastro, o nome do WhatsApp vira DICA (nao vira identidade sozinho)', async () => {
  const { service } = createService();
  const mapped = await mapearConversaDaFaxina(
    service,
    conversaDaFaxina({ whatsappContactName: 'Ze da Van' }),
    null,
  );

  // Ainda EXIBE (melhor que numero cru), mas marcado como nao-cadastrado e
  // oferecido como sugestao pra tela pedir o cadastro em 1 clique.
  assert.equal(mapped.customer.name, 'Ze da Van');
  assert.equal(mapped.customer.isRegistered, false);
  assert.equal(mapped.customer.suggestedName, 'Ze da Van');
});

test('IDENTIDADE HBX: foto de perfil do WhatsApp NUNCA sai no payload', async () => {
  const { service } = createService();
  // Mesmo com foto gravada no metadata (legado de antes da faxina), o contrato
  // devolve null: a tela usa iniciais. Isto mata o "erro de fotos constante" —
  // a URL da Meta e assinada e expira.
  const mapped = await mapearConversaDaFaxina(
    service,
    conversaDaFaxina({
      whatsappContactName: 'Ze da Van',
      whatsappAvatarUrl: 'https://pps.whatsapp.net/v/t61.24694-24/expirada.jpg',
      profilePicUrl: 'https://pps.whatsapp.net/outra.jpg',
    }),
    null,
  );

  assert.equal(mapped.customer.avatarUrl, null);
});

test('HISTORICO SOBERANO: o primeiro espelhamento NAO escava o chat antigo do aparelho', async () => {
  const { service } = createService();
  const syncCalls: Array<Record<string, any>> = [];
  (service as any).resolveInboxWhatsappSessionScope = async () => ({
    accessible: true,
    mode: 'current',
    currentSessionId: 'session-7',
  });
  (service as any).assertInboxWhatsappAccessible = () => undefined;
  (service as any).webwhatsBridge = {
    listContacts: async () => [],
    syncRecentChats: async () => 1,
    syncConversationMessagesDetailed: async (
      _companyId: number,
      _conversationId: number,
      options: Record<string, any>,
    ) => {
      syncCalls.push(options);
      return { syncedMessages: 0, mediaMessages: 0, pagesFetched: 1, remoteJids: [], avatarUrl: null, displayName: null };
    },
  };

  await (service as any).runBootstrapFullMirror(7, 50, 6);

  assert.equal(syncCalls.length > 0, true, 'o bootstrap precisa espelhar alguma coisa');
  for (const options of syncCalls) {
    // O teto que importa: era limit 120 x maxPages 80 = ate 9.600 msgs/conversa.
    assert.equal(options.maxPages, 1, 'bootstrap nao pode paginar pra tras no historico do aparelho');
    assert.equal(options.fullSync, false, 'bootstrap nao pode pedir sync completo do historico');
    assert.ok(options.limit <= 30, `janela de cortesia estourou: limit=${options.limit}`);
  }
});

test('HISTORICO SOBERANO: a REDE DE SEGURANCA anti-perda continua conferindo a janela recente', async () => {
  // Este teste existe pra GRITAR se alguem, "limpando o historico", apagar
  // junto a reconciliacao que impede mensagem do cliente de sumir quando o
  // webhook do motor e engolido (ja aconteceu em producao). O dono foi
  // explicito: "nao pode perder mensagens entre o cliente! isso e grave!".
  const { service } = createService();
  const syncCalls: Array<Record<string, any>> = [];
  (service as any).buildWebwhatsConversationSelector = async () => ({ sessionId: 'session-7' });
  (service as any).webwhatsBridge = {
    syncConversationMessagesDetailed: async (
      _companyId: number,
      _conversationId: number,
      options: Record<string, any>,
    ) => {
      syncCalls.push(options);
      return { syncedMessages: 0, mediaMessages: 0, pagesFetched: 1, remoteJids: [], avatarUrl: null, displayName: null };
    },
  };

  const erro = await (service as any).syncLatestInboxConversationWindow(7, 42);

  assert.equal(erro, null);
  assert.equal(syncCalls.length, 1, 'a rede de seguranca precisa consultar o motor');
  assert.ok(syncCalls[0].limit >= 20, 'janela de conferencia pequena demais aumenta risco de perda');
  assert.equal(syncCalls[0].force, true, 'a conferencia nao pode ser barrada por cache');
});

test('LIMPAR CONVERSA: some da caixa, preserva as mensagens e NUNCA apaga no WhatsApp', async () => {
  const bridgeCalls: string[] = [];
  const { service, conversationStateCalls } = createService({
    prisma: {
      companyMessage: {
        findFirst: async () => null,
        findMany: async () => [],
        // 137 mensagens guardadas: o numero tem que sobreviver na auditoria.
        count: async () => 137,
        create: async ({ data }: any) => ({ id: 801, ...data }),
        delete: async ({ where }: any) => ({ id: where.id }),
        deleteMany: async () => ({ count: 0 }),
      },
    },
    webwhatsBridge: {
      // Qualquer chamada ao motor neste caminho e violacao da lei do dono.
      deleteMessageForEveryone: async () => { bridgeCalls.push('deleteMessageForEveryone'); return true; },
      updateBlockStatus: async () => { bridgeCalls.push('updateBlockStatus'); return true; },
      archiveChat: async () => { bridgeCalls.push('archiveChat'); return true; },
    },
  });
  (service as any).resolveInboxMutationSessionScope = async () => ({ mode: 'current', currentSessionId: 'session-7' });
  (service as any).ensureConversation = async () => conversaDaFaxina({ cliente: 'Carlos' });
  (service as any).appendInboxSystemEvent = async () => undefined;
  const logs: Array<Record<string, any>> = [];
  (service as any).logInboxEvent = async (payload: Record<string, any>) => { logs.push(payload); };

  const result = await service.clearConversationFromInbox({ id: 6, companyId: 7 }, 42, { reason: 'finalizado' });

  // 1) Sumiu da caixa — mas via metadata, sem deletar linha nenhuma.
  assert.equal(result.cleared, true);
  const patch = conversationStateCalls.at(-1)?.payload as any;
  assert.ok(patch.metadata.hbxClearedAt, 'precisa carimbar quando foi limpa');
  assert.equal(patch.metadata.hbxClearedByUserId, 6, 'auditoria: quem limpou');
  assert.equal(patch.metadata.hbxClearedReason, 'finalizado');

  // 2) O historico continua salvo — "auditoria sim, sujeira nao".
  assert.equal(result.preservedMessages, 137);
  assert.equal(patch.metadata.hbxClearedMessageCount, 137);

  // 3) A LEI DURA: zero comando de exclusao pro WhatsApp.
  assert.deepEqual(bridgeCalls, [], 'limpar no HBX NAO pode falar com o motor do WhatsApp');

  // 4) Ficou registrado pra auditoria.
  assert.equal(logs.some((l) => l.event === 'conversation_cleared_from_inbox'), true);
});

test('LIMPAR CONVERSA: conversa limpa fica invisivel na listagem, e restaurar traz de volta', async () => {
  const { service } = createService();

  const limpa = (service as any).getConversationClearedState({
    hbxClearedAt: '2026-07-31T12:00:00.000Z',
    hbxClearedByUserId: 6,
    hbxClearedMessageCount: 137,
  });
  assert.equal(limpa.isCleared, true);
  assert.equal(limpa.preservedMessageCount, 137);

  // Restaurar limpa as marcas — a conversa volta pra caixa intacta.
  (service as any).resolveInboxMutationSessionScope = async () => ({ mode: 'current', currentSessionId: 'session-7' });
  (service as any).ensureConversation = async () => conversaDaFaxina({
    hbxClearedAt: '2026-07-31T12:00:00.000Z',
    hbxClearedByUserId: 6,
    hbxClearedReason: 'finalizado',
    hbxClearedMessageCount: 137,
  });
  (service as any).logInboxEvent = async () => undefined;
  (service as any).getConversationByIdForCompany = async () => ({ id: '42' });
  const stateCalls: Array<Record<string, any>> = [];
  (service as any).conversations = {
    updateConversationState: async (_c: number, _id: number, payload: Record<string, any>) => {
      stateCalls.push(payload);
      return {};
    },
  };

  await service.restoreConversationToInbox({ id: 6, companyId: 7 }, 42);

  const restored = stateCalls.at(-1)?.metadata as Record<string, unknown>;
  assert.equal(restored.hbxClearedAt, undefined);
  assert.equal(restored.hbxClearedByUserId, undefined);
  assert.equal((service as any).getConversationClearedState(restored).isCleared, false);
});

// ===========================================================================
// BUSCA DENTRO DAS CONVERSAS (01/08/2026 — ordem do dono: "fala q procura dentro
// das conversas, mas ele só acha o nome da pessoa"). O campo filtrava no navegador
// as conversas já carregadas, olhando nome+telefone; o texto das mensagens nem chega
// na lista (o backend manda só a ÚLTIMA de cada conversa).
// ===========================================================================

// Serviço de busca com o I/O trocado por dublê: as 3 consultas cruas respondem pelo
// TRECHO do SQL, o resto (peneira de metadata, escopo, recorte) roda de verdade.
function createBuscaService(opts: {
  mensagens?: Array<{ conversationId: number; messageId: number; body: string; timestamp: Date }>;
  pessoas?: Array<{ id: number }>;
  apelidos?: Array<{ id: number; metadata: string | null }>;
  linhas?: Array<Record<string, any>>;
  falharMensagens?: boolean;
}) {
  const service = createBareService();
  const sqlVistos: Array<{ sql: string; params: unknown[] }> = [];

  service.logger = { warn: () => undefined, log: () => undefined };
  service.requireCompanyIdFromUser = () => 7;
  service.isAggregateUser = () => false;
  service.resolveInboxWhatsappSessionScope = async () => ({ accessible: true, mode: 'company', restricted: false });
  service.prisma = {
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      sqlVistos.push({ sql, params });
      if (sql.includes('FROM "Message"')) {
        if (opts.falharMensagens) throw new Error('scan explodiu');
        return opts.mensagens || [];
      }
      if (sql.includes('"AtendimentoCustomer"')) return opts.pessoas || [];
      return opts.apelidos || [];
    },
  };
  service.findConversationRowsByOrderedIds = async (_companyId: number, ids: number[]) =>
    ids.map((id) => (opts.linhas || []).find((row) => Number(row.id) === id)).filter(Boolean);
  service.getRecoveryRoutingRules = async () => ({});
  service.mapPersistedConversationRowsForCompany = async (_c: number, rows: any[]) =>
    rows.map((row) => ({ id: String(row.id), contact: row.contact }));

  return { service, sqlVistos };
}

function linhaDeConversa(id: number, metadata: Record<string, unknown> = {}) {
  return { id, contact: '+5519998877766', metadata: JSON.stringify(metadata), messages: [] };
}

test('BUSCA: acha a conversa pelo TEXTO da mensagem, com o trecho que casou', async () => {
  const { service } = createBuscaService({
    mensagens: [{
      conversationId: 42,
      messageId: 900,
      body: 'Olá Mariana! Tudo bem? Como posso te ajudar hoje?',
      timestamp: new Date('2026-08-01T12:00:00.000Z'),
    }],
    linhas: [linhaDeConversa(42)],
  });

  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'Mariana' });

  assert.equal(res.conversations.length, 1, 'o nome só existe DENTRO da mensagem — era exatamente isso que não achava');
  assert.equal(res.conversations[0].id, '42');
  assert.equal(res.conversations[0].searchMatch.field, 'message');
  assert.match(res.conversations[0].searchMatch.snippet, /Mariana/);
  assert.equal(res.messagesSearched, true);
});

test('BUSCA: conversa LIMPA da caixa não volta pelo resultado', async () => {
  const { service } = createBuscaService({
    mensagens: [
      { conversationId: 42, messageId: 900, body: 'orçamento fechado', timestamp: new Date('2026-08-01T12:00:00.000Z') },
      { conversationId: 43, messageId: 901, body: 'orçamento fechado', timestamp: new Date('2026-08-01T11:00:00.000Z') },
    ],
    linhas: [
      linhaDeConversa(42, { hbxClearedAt: '2026-07-31T12:00:00.000Z' }),
      linhaDeConversa(43),
    ],
  });

  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'orcamento' });

  assert.deepEqual(res.conversations.map((c: any) => c.id), ['43'], 'busca não ressuscita o que o operador tirou da frente');
});

test('BUSCA: grupo fica de fora (a caixa é 1:1)', async () => {
  const { service } = createBuscaService({
    mensagens: [{ conversationId: 44, messageId: 902, body: 'combinado', timestamp: new Date() }],
    linhas: [{ id: 44, contact: '12036304@g.us', metadata: JSON.stringify({ whatsappIsGroup: true }), messages: [] }],
  });

  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'combinado' });
  assert.equal(res.conversations.length, 0);
});

test('BUSCA: varredura de mensagem que FALHA avisa — não mente "nada encontrado"', async () => {
  const { service } = createBuscaService({
    falharMensagens: true,
    pessoas: [{ id: 42 }],
    linhas: [linhaDeConversa(42)],
  });

  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'Mariana' });

  assert.equal(res.messagesSearched, false, 'a tela precisa saber que o texto NÃO foi varrido');
  assert.equal(res.conversations.length, 1, 'o que deu pra procurar (nome/telefone) continua valendo');
});

test('BUSCA: apelido do WhatsApp só conta se casar no CAMPO de nome, não em qualquer canto do metadata', async () => {
  const { service } = createBuscaService({
    apelidos: [
      { id: 50, metadata: JSON.stringify({ whatsappContactName: 'Vendas Norte' }) },
      { id: 51, metadata: JSON.stringify({ sourceModule: 'vendas', whatsappContactName: 'Padaria do Zé' }) },
    ],
    linhas: [linhaDeConversa(50), linhaDeConversa(51)],
  });

  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'vendas' });

  assert.deepEqual(res.conversations.map((c: any) => c.id), ['50'], 'sourceModule:"vendas" não é nome de ninguém');
});

test('BUSCA: termo de 1 caractere não vai ao banco', async () => {
  const { service, sqlVistos } = createBuscaService({});
  const res = await service.searchConversations({ id: 6, companyId: 7 }, { q: 'a' });
  assert.equal(res.conversations.length, 0);
  assert.equal(sqlVistos.length, 0, 'meia caixa casaria com 1 letra — não paga o scan');
});

test('BUSCA: % e _ digitados são LITERAIS, nunca curinga do LIKE', () => {
  const service = createBareService();
  assert.equal(service.buildInboxSearchPattern('50% _off'), String.raw`%50\% \_off%`);
  assert.equal(service.buildInboxSearchPattern('Orçamento'), '%orcamento%', 'acento e caixa somem dos dois lados');
});

test('BUSCA: o trecho recorta em volta do termo mesmo com acento antes dele', () => {
  const service = createBareService();
  const texto = 'Olá! Não é só café — segue o orçamento que você pediu ontem à tarde, com prazo de entrega e condição de pagamento combinada.';
  const trecho = service.buildInboxSearchSnippet(texto, 'orçamento');
  assert.match(trecho, /orçamento/, 'NFD na string inteira muda o tamanho — o índice tem que voltar pro texto original');
});

test('BUSCA: em mensagem curta o trecho ainda começa perto do termo (a linha da lista corta o resto)', () => {
  const service = createBareService();
  const trecho = service.buildInboxSearchSnippet(
    'Claro! Te enviei os detalhes por aqui, qualquer dúvida é só chamar.',
    'duvida',
  );
  assert.ok(trecho.startsWith('…'), 'começou do zero, o "dúvida" cairia na parte cortada pelas reticências do CSS');
  assert.match(trecho, /dúvida/);
});
