import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasService } from './vendas.service';

function normalizePhone(raw: unknown) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? digits.slice(-13) : null;
}

function createService(overrides?: Partial<Record<string, any>>) {
  const getOrCreateCalls: Array<Record<string, unknown>> = [];
  const updateConversationStateCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    vendasLead: {
      findMany: async () => [],
      ...(overrides?.vendasLead || {}),
    },
    vendasLeadTimelineEvent: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
      ...(overrides?.vendasLeadTimelineEvent || {}),
    },
    companyConversation: {
      findFirst: async () => null,
      findMany: async () => [],
      ...(overrides?.companyConversation || {}),
    },
    company: {
      findUnique: async () => ({ selectedPlanKey: 'hbx_padrao' }),
      ...(overrides?.company || {}),
    },
    ...(overrides?.prisma || {}),
  } as any;

  const customerProfileService = {
    normalizePhone,
    normalizeEmail: (raw: unknown) => String(raw || '').trim().toLowerCase() || null,
    buildSharedContextRegistry: async () => ({ byProfileId: new Map(), byPhoneNormalized: new Map() }),
    upsertProfile: async () => ({ id: 'profile-1' }),
    ...(overrides?.customerProfileService || {}),
  } as any;

  const conversations = {
    getOrCreateConversationForContact: async (companyId: number, contact: string) => {
      getOrCreateCalls.push({ companyId, contact });
      return { id: 501, metadata: null, contact };
    },
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, unknown>) => {
      updateConversationStateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    ...(overrides?.conversations || {}),
  } as any;

  const inboxService = {
    getBotConfig: async () => null,
    updateBotConfig: async (_user: any, payload: unknown) => payload,
    getAgendaConfig: async () => null,
    ...(overrides?.inboxService || {}),
  } as any;

  const webwhatsBridge = {
    checkWhatsappNumbers: async () => [],
    ...(overrides?.webwhatsBridge || {}),
  } as any;

  const commercialPlansService = {
    assertBotAiEntitlementForUser: async () => true,
    ...(overrides?.commercialPlansService || {}),
  } as any;

  const hbxPresentationEmails = {
    previewPresentationToContact: async () => ({}),
    sendPresentationToContact: async () => ({}),
    ...(overrides?.hbxPresentationEmails || {}),
  } as any;

  const commercialUsageLimits = {
    assertCanImportCard: async () => true,
    recordCardImport: async () => true,
    assertCanSendPresentationEmail: async () => true,
    recordPresentationEmailAttempt: async () => true,
    recordPresentationEmailResult: async () => true,
    ...(overrides?.commercialUsageLimits || {}),
  } as any;

  const service = new VendasService(
    prisma,
    customerProfileService,
    conversations,
    inboxService,
    webwhatsBridge,
    commercialPlansService,
    hbxPresentationEmails,
    commercialUsageLimits,
  );
  return { service, getOrCreateCalls, updateConversationStateCalls };
}

test('syncTodayAgendaForUser mirrors today leads into Inbox prospeccao and skips leads without phone', async () => {
  const now = new Date();
  const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const tomorrowAtNoon = new Date(todayAtNoon);
  tomorrowAtNoon.setDate(tomorrowAtNoon.getDate() + 1);

  const rows = [
    {
      id: 'lead-today',
      companyId: 7,
      name: 'Carlos',
      phone: '+5511998877766',
      phoneNormalized: '5511998877766',
      status: 'novo',
      nextAction: 'Retomar hoje',
      returnAt: todayAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
    {
      id: 'lead-no-phone',
      companyId: 7,
      name: 'Sem Telefone',
      phone: null,
      phoneNormalized: null,
      status: 'retorno',
      nextAction: 'Retomar hoje',
      returnAt: todayAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
    {
      id: 'lead-future',
      companyId: 7,
      name: 'Amanha',
      phone: '+5511988877766',
      phoneNormalized: '5511988877766',
      status: 'retorno',
      nextAction: 'Falar amanha',
      returnAt: tomorrowAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
  ];

  const { service, getOrCreateCalls, updateConversationStateCalls } = createService({
    vendasLead: {
      findMany: async () => rows,
    },
  });

  const result = await service.syncTodayAgendaForUser({ companyId: 7, id: 99 });

  assert.equal(result.activated, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.deactivated, 0);
  assert.equal(result.skippedWithoutPhone, 1);
  assert.equal(getOrCreateCalls.length, 1);
  assert.deepEqual(getOrCreateCalls[0], { companyId: 7, contact: '+5511998877766' });
  assert.equal(updateConversationStateCalls.length, 1);
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.active,
    true,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftPending,
    true,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.sourceModule,
    'vendas',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.sourceBlock,
    'today',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.queueTarget,
    'prospeccao',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.queueTarget,
    'prospeccao',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.status,
    'novo',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSent,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
  assert.match(
    String((updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftMessage || ''),
    /HBX Vendas/i,
  );
});

test('syncTodayAgendaForUser deactivates stale agendamento items when the lead is no longer in Hoje', async () => {
  const now = new Date();
  const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const tomorrowAtNoon = new Date(todayAtNoon);
  tomorrowAtNoon.setDate(tomorrowAtNoon.getDate() + 1);

  const rows = [
    {
      id: 'lead-old',
      companyId: 7,
      name: 'Carlos',
      phone: '+5511998877766',
      phoneNormalized: '5511998877766',
      status: 'retorno',
      nextAction: 'Falar depois',
      returnAt: tomorrowAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
  ];

  const { service, updateConversationStateCalls } = createService({
    vendasLead: {
      findMany: async () => rows,
    },
    companyConversation: {
      findMany: async () => [
        {
          id: 888,
          contact: '+5511998877766',
          metadata: JSON.stringify({
            vendasAgendaQueue: {
              active: true,
              leadId: 'lead-old',
              draftPending: true,
            },
          }),
        },
      ],
    },
  });

  const result = await service.syncTodayAgendaForUser({ companyId: 7, id: 99 });

  assert.equal(result.activated, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.deactivated, 1);
  assert.equal(updateConversationStateCalls.length, 1);
  assert.equal(updateConversationStateCalls[0].conversationId, 888);
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.active,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftPending,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
});

test('getBoardForUser hides complete intelligence for HBX List', async () => {
  const now = new Date();
  const rows = [
    {
      id: 'lead-list',
      companyId: 7,
      name: 'Loja Social',
      phone: '+5511998877766',
      phoneNormalized: '5511998877766',
      email: 'vendas@loja.com.br',
      website: null,
      status: 'novo',
      returnAt: now,
      updatedAt: now,
      createdAt: now,
      timelineEvents: [
        {
          id: 'evt-1',
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            instagramUrl: 'https://instagram.com/loja',
            opportunityReason: 'Instagram encontrado + sem site: oportunidade premium.',
          }),
          createdAt: now,
        },
      ],
    },
  ];

  const { service } = createService({
    company: {
      findUnique: async () => ({ selectedPlanKey: 'hbx_lite' }),
    },
    vendasLead: {
      findMany: async () => rows,
    },
  });

  const result = await service.getBoardForUser({ companyId: 7, id: 99 });
  const lead = result.blocks.today[0];

  assert.equal(result.planTier, 'list');
  assert.equal(result.capabilities.canSeeLeadIntelligence, false);
  assert.equal(lead.leadIntelligence.opportunityScore, null);
  assert.equal(lead.leadIntelligence.opportunityReason, null);
  assert.equal(lead.leadIntelligence.instagramUrl, null);
  assert.equal(lead.leadIntelligence.primarySocial, 'instagram');
  assert.ok(lead.leadIntelligence.premiumTeaser);
});

test('importWebscrapingLeadsForUser does not debit quota for duplicate card', async () => {
  const now = new Date();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const existing = {
    id: 'lead-existing',
    companyId: 7,
    name: 'Duplicado',
    phone: '+5511998877766',
    phoneNormalized: '5511998877766',
    status: 'novo',
    returnAt: now,
    updatedAt: now,
    createdAt: now,
    timelineEvents: [],
  };
  const { service } = createService({
    prisma: {
      $transaction: async (fn: any) => fn({
        vendasLead: {
          update: async () => existing,
          findUniqueOrThrow: async () => existing,
        },
        vendasLeadTimelineEvent: {
          create: async () => ({}),
        },
      }),
      hasTable: async () => false,
      hasColumn: async () => false,
    },
    vendasLead: {
      findFirst: async () => existing,
    },
    vendasLeadTimelineEvent: {
      create: async () => ({}),
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardImport: async () => {
        recordCardImportCalls += 1;
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Duplicado',
          phone: '+55 11 99887-7766',
          phoneDigits: '5511998877766',
        },
      ],
    } as any,
  );

  assert.equal(result.updatedCount, 1);
  assert.equal(result.createdCount, 0);
  assert.equal(result.quotaDebited, 0);
  assert.equal(result.skippedDuplicateCount, 1);
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser reports protected Radar card without quota debit', async () => {
  let assertCanImportCalls = 0;
  const { service } = createService({
    prisma: {
      hasTable: async (name: string) => name === 'RadarLeadPool',
      hasColumn: async () => true,
      radarLeadPool: {
        findUnique: async () => ({ id: 'radar-1', ownerCompanyId: null, status: 'blocked' }),
      },
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99 },
      {
        sourceHistoryId: 'radar:radar-1',
        skipWhatsappValidation: true,
        leads: [
          {
            name: 'Protegido',
            phone: '+55 11 99887-7766',
            phoneDigits: '5511998877766',
          },
        ],
      } as any,
    ),
    /protegido/i,
  );
  assert.equal(assertCanImportCalls, 0);
});

test('importWebscrapingLeadsForUser blocks rejected quality before quota', async () => {
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { service } = createService({
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardImport: async () => {
        recordCardImportCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99 },
      {
        skipWhatsappValidation: true,
        leads: [
          {
            name: 'Tia Luiza',
            phone: '+55 19 99999-0001',
            phoneDigits: '19999990001',
            quality: {
              status: 'segment_mismatch',
              billable: false,
              segmentMatchScore: 20,
              contactQualityScore: 70,
              commercialScore: 30,
              reasons: ['Sem aderencia.'],
            },
          },
        ],
      } as any,
    ),
    /Nenhum lead passou na qualidade minima|Descartados nao consomem limite/i,
  );
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser debita somente aprovado criado e reporta descartes', async () => {
  const now = new Date();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const createdRows: any[] = [];
  const { service } = createService({
    prisma: {
      $transaction: async (fn: any) => fn({
        vendasLead: {
          create: async ({ data }: any) => {
            const row = {
              id: `lead-${createdRows.length + 1}`,
              companyId: data.companyId,
              ...data,
              status: data.status || 'novo',
              returnAt: data.returnAt || now,
              createdAt: now,
              updatedAt: now,
              timelineEvents: [],
            };
            createdRows.push(row);
            return row;
          },
          findUniqueOrThrow: async ({ where }: any) => createdRows.find((row) => row.id === where.id),
        },
        vendasLeadTimelineEvent: {
          createMany: async () => ({ count: 0 }),
          create: async () => ({}),
        },
      }),
      hasTable: async () => false,
      hasColumn: async () => false,
    },
    vendasLead: {
      findFirst: async () => null,
    },
    vendasLeadTimelineEvent: {
      create: async () => ({}),
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardImport: async () => {
        recordCardImportCalls += 1;
      },
    },
  });

  const approvedQuality = {
    status: 'approved',
    billable: true,
    segmentMatchScore: 80,
    contactQualityScore: 70,
    commercialScore: 75,
    reasons: [],
  };
  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Auto Mecânica São José',
          phone: '+55 19 99999-0001',
          phoneDigits: '19999990001',
          quality: approvedQuality,
        },
        {
          name: 'Guia Comercial',
          phone: '+55 19 99999-0002',
          phoneDigits: '19999990002',
          quality: { ...approvedQuality, status: 'generic_directory', billable: false },
        },
        {
          name: 'Tia Luiza',
          phone: '+55 19 99999-0003',
          phoneDigits: '19999990003',
          quality: { ...approvedQuality, status: 'segment_mismatch', billable: false },
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.quotaDebited, 1);
  assert.equal(result.skippedByQualityCount, 2);
  assert.equal(result.skippedGenericDirectoryCount, 1);
  assert.equal(result.skippedBySegmentMismatchCount, 1);
  assert.equal(assertCanImportCalls, 1);
  assert.equal(recordCardImportCalls, 1);
  assert.match(result.message, /Descartados nao consomem limite/);
});
