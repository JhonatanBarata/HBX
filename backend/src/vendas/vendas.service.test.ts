import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasService } from './vendas.service';
import { serializeTeamPolicyModuleAndAccessRows } from '../team/team-policy-persistence';

function normalizePhone(raw: unknown) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? digits.slice(-13) : null;
}

function buildRuntimePolicy(input: {
  userId?: number;
  companyId?: number;
  modules?: Array<{ key: string; allowed: boolean }>;
  access?: Record<string, boolean>;
} = {}) {
  return {
    id: `policy-${input.userId || 99}`,
    userId: input.userId || 99,
    companyId: input.companyId || 7,
    status: 'active',
    subjectKind: null,
    modulesJson: serializeTeamPolicyModuleAndAccessRows({
      modules: input.modules || [],
      access: input.access || {},
    }),
    requiredChannelsJson: '{}',
  };
}

function createService(overrides?: Partial<Record<string, any>>) {
  const getOrCreateCalls: Array<Record<string, unknown>> = [];
  const updateConversationStateCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    vendasLead: {
      findMany: async () => [],
      findFirst: async () => null,
      ...(overrides?.vendasLead || {}),
    },
    vendasLeadTimelineEvent: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
      create: async () => ({}),
      ...(overrides?.vendasLeadTimelineEvent || {}),
    },
    companyConversation: {
      findFirst: async () => null,
      findMany: async () => [],
      ...(overrides?.companyConversation || {}),
    },
    user: {
      findFirst: async ({ where }: any) => ({
        id: Number(where?.id || 99),
        name: 'Vendedor Teste',
        email: 'vendedor@teste.local',
        username: 'vendedor',
        phone: null,
        role: 'USER',
        commissionPercent: 10,
      }),
      findMany: async () => [],
      ...(overrides?.user || {}),
    },
    company: {
      findUnique: async () => ({ selectedPlanKey: 'hbx_padrao' }),
      ...(overrides?.company || {}),
    },
    hasTable: async () => false,
    hasColumn: async () => false,
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
    getUsageSnapshot: async () => ({ cards: { remaining: 999, dailyRemaining: 999 } }),
    assertCanImportCard: async () => true,
    assertSellerActiveCardSlots: async () => true,
    recordCardImport: async () => true,
    recordCardCommercialUseOnce: async () => ({ debited: true, alreadyDebited: false }),
    assertCanSendPresentationEmail: async () => true,
    recordPresentationEmailAttempt: async () => true,
    recordPresentationEmailResult: async () => true,
    ...(overrides?.commercialUsageLimits || {}),
  } as any;

  const hbxCommissionSync = {
    syncSalesCompanyCommissions: async () => ({ scannedCompanies: 0, matchedLeads: 0, updatedLeads: 0, createdReceivables: 0 }),
    ...(overrides?.hbxCommissionSync || {}),
  } as any;

  const authService = {
    signup: async () => ({ status: 'pending_email_confirmation' }),
    ...(overrides?.authService || {}),
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
    hbxCommissionSync,
    authService,
  );
  return { service, getOrCreateCalls, updateConversationStateCalls };
}

function createImportPrismaHarness(now = new Date()) {
  const createdRows: any[] = [];
  const prisma = {
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
  };
  return { prisma, createdRows };
}

test('assertRadarLeadImportAllowed blocks Radar card discarded for the current company', async () => {
  const { service } = createService({
    prisma: {
      hasTable: async (table: string) => ['RadarLeadPool', 'RadarLeadCompanyState'].includes(table),
      hasColumn: async (table: string, column: string) => table === 'RadarLeadPool' && column === 'ownerCompanyId',
      radarLeadPool: {
        findUnique: async () => ({ id: 'radar-1', ownerCompanyId: null, status: 'clean' }),
      },
      radarLeadCompanyState: {
        findUnique: async () => ({ status: 'discarded' }),
      },
    },
  });

  await assert.rejects(
    () => (service as any).assertRadarLeadImportAllowed({ companyId: 7 }, 'radar-1'),
    /protegido para esta empresa/,
  );
});

test('releaseRadarLeadBackToPool protects deleted Vendas lead by phone when sourceHistoryId is missing', async () => {
  let upsertPayload: any = null;
  const { service } = createService({
    prisma: {
      hasTable: async (table: string) => ['RadarLeadPool', 'RadarLeadCompanyState'].includes(table),
      hasColumn: async (table: string, column: string) => table === 'RadarLeadPool' && ['ownerCompanyId', 'claimedAt'].includes(column),
      radarLeadPool: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.OR[0].phoneDigits.in.includes('5511998877766'), true);
          return { id: 'radar-by-phone' };
        },
        findUnique: async () => ({ id: 'radar-by-phone', ownerCompanyId: 7, status: 'sent_to_vendas' }),
        update: async () => ({ id: 'radar-by-phone' }),
      },
      radarLeadCompanyState: {
        upsert: async (payload: any) => {
          upsertPayload = payload;
          return payload;
        },
      },
    },
  });

  await (service as any).releaseRadarLeadBackToPool(
    { companyId: 7, userId: 9 },
    {
      id: 'lead-1',
      sourceHistoryId: null,
      phone: '+55 11 99887-7766',
      phoneNormalized: '5511998877766',
      shortNote: 'Lead do Radar',
    },
    { status: 'discarded', reason: 'Card ocultado do Vendas.' },
  );

  assert.equal(upsertPayload.where.companyId_radarLeadId.radarLeadId, 'radar-by-phone');
  assert.equal(upsertPayload.update.status, 'discarded');
  assert.equal(upsertPayload.update.vendasLeadId, null);
});

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

test('getBoardForUser filters USER without viewCompany to own assigned cards', async () => {
  let seenWhere: any = null;
  const { service } = createService({
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [];
      },
    },
  });

  await service.getBoardForUser({ companyId: 7, id: 99, role: 'USER' });

  assert.equal(seenWhere.companyId, 7);
  assert.equal(seenWhere.assignedUserId, 99);
  assert.equal(Boolean(seenWhere.OR), false);
});

test('getBoardForUser respects ADMIN explicit false for company card visibility', async () => {
  let seenWhere: any = null;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          userId: 22,
          access: { 'vendas.cards.viewCompany': false },
        }),
      },
    },
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [];
      },
    },
  });

  await service.getBoardForUser({ companyId: 7, id: 22, role: 'ADMIN' });

  assert.equal(seenWhere.companyId, 7);
  assert.equal(seenWhere.assignedUserId, 22);
});

test('getBoardForUser releases company cards when viewCompany is explicit true', async () => {
  let seenWhere: any = null;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.cards.viewCompany': true },
        }),
      },
    },
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [];
      },
    },
  });

  await service.getBoardForUser({ companyId: 7, id: 99, role: 'USER' });

  assert.deepEqual(seenWhere, { companyId: 7 });
});

test('buildLeadPayload exposes negative timeline conversation reference without raw JSON note', () => {
  const { service } = createService();
  const createdAt = new Date('2026-05-28T12:00:00.000Z');
  const payload = (service as any).buildLeadPayload({
    id: 'lead-1',
    companyId: 7,
    name: 'Lead Negativo',
    phone: '+5511999990000',
    phoneNormalized: '5511999990000',
    status: 'encerrado',
    timelineEvents: [
      {
        id: 'event-1',
        eventType: 'lead_closed',
        title: 'Resposta negativa',
        description: JSON.stringify({
          kind: 'lead_closure_conversation',
          conversationId: 501,
          anchorMessageId: 901,
          inboundMessageId: 901,
          detectedText: 'não tenho interesse',
          sourceModule: 'vendas_prospeccao_bot',
          createdAt: createdAt.toISOString(),
          closureReason: 'negative',
        }),
        resultLabel: 'Negativo',
        createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  });

  assert.equal(payload.timeline[0].conversationReference.conversationId, 501);
  assert.equal(payload.timeline[0].conversationReference.inboundMessageId, 901);
  assert.equal(payload.timeline[0].description, 'Negativo registrado: "não tenho interesse"');
  assert.equal(payload.timeline[0].description.startsWith('{'), false);
});

test('importWebscrapingLeadsForUser debits quota for new delivered card with WhatsApp available', async () => {
  const { prisma } = createImportPrismaHarness();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  let checkWhatsappCalls = 0;
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    webwhatsBridge: {
      checkWhatsappNumbers: async () => {
        checkWhatsappCalls += 1;
        return [{ input: '5519999990001', normalizedNumber: '5519999990001', exists: true }];
      },
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      debitOnImport: true,
      leads: [
        {
          name: 'Auto Mecânica São José',
          phone: '+55 19 99999-0001',
          phoneDigits: '5519999990001',
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.quotaDebited, 1);
  assert.equal(result.deliveredCount, 1);
  assert.equal(result.skippedWithoutWhatsapp, 0);
  assert.equal(assertCanImportCalls, 1);
  assert.equal(recordCardImportCalls, 1);
  assert.equal(checkWhatsappCalls, 1);
});

test('importWebscrapingLeadsForUser no modo List importa weak_contact sem cortar', async () => {
  const { prisma } = createImportPrismaHarness();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      debitOnImport: true,
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Humanitarian Calçados',
          phone: '+55 19 3513-9668',
          phoneDigits: '1935139668',
          quality: {
            status: 'weak_contact',
            billable: false,
            segmentMatchScore: 85,
            contactQualityScore: 50,
            commercialScore: 56,
          },
          enrichmentJson: {
            qualityV2: {
              version: 'lead-quality-v2',
              identityScore: 55,
              segmentFitScore: 85,
              contactabilityScore: 33,
              commercialIntentScore: 50,
              freshnessScore: 50,
              riskScore: 0,
              opportunityScore: 45,
              finalRankScore: 35,
              decision: 'discard',
              reasons: ['Contato fraco.'],
              discardReason: 'weak_contactability',
              protectionReason: null,
              recommendedChannel: 'call',
              productFit: { listFit: 45, leadFit: 35, botFit: 30, recoveryFit: 20, websiteFit: 10 },
            },
          },
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.deliveredCount, 1);
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser no Lead+ importa card basico quando nao qualifica destaque', async () => {
  const { prisma } = createImportPrismaHarness();
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Barbearia Bairro',
          phone: '+55 19 3513-9668',
          phoneDigits: '1935139668',
          quality: {
            status: 'weak_contact',
            billable: false,
            segmentMatchScore: 45,
            contactQualityScore: 40,
            commercialScore: 35,
          },
          enrichmentJson: {
            qualityV2: {
              version: 'lead-quality-v2',
              identityScore: 55,
              segmentFitScore: 42,
              contactabilityScore: 33,
              commercialIntentScore: 35,
              freshnessScore: 45,
              riskScore: 0,
              opportunityScore: 35,
              finalRankScore: 32,
              decision: 'discard',
              reasons: ['Lead+ fraco, mas contato publico existe.'],
              discardReason: 'weak_contactability',
              protectionReason: null,
              recommendedChannel: 'call',
              productFit: { listFit: 45, leadFit: 35, botFit: 30, recoveryFit: 20, websiteFit: 10 },
            },
          },
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.deliveredCount, 1);
});

test('importWebscrapingLeadsForUser importa card com site mesmo sem telefone', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Studio Beleza Viva',
          website: 'https://studiobelezaviva.com.br',
          segment: 'salões de beleza',
          city: 'Águas da Prata',
          state: 'SP',
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.deliveredCount, 1);
  assert.equal(createdRows[0].phoneNormalized, null);
  assert.equal(createdRows[0].website, 'https://studiobelezaviva.com.br');
});

test('importWebscrapingLeadsForUser entrega card sem debitar quando importacao nao e uso comercial', async () => {
  const { prisma } = createImportPrismaHarness();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Pizzaria do Roberto',
          phone: '+55 19 99836-8311',
          phoneDigits: '19998368311',
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.deliveredCount, 1);
  assert.equal(result.quotaDebited, 0);
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser does not debit quota when WhatsApp is unavailable', async () => {
  const { prisma } = createImportPrismaHarness();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    webwhatsBridge: {
      checkWhatsappNumbers: async () => [
        { input: '5519999990001', normalizedNumber: '5519999990001', exists: false },
      ],
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      debitOnImport: true,
      leads: [
        {
          name: 'Auto Mecânica São José',
          phone: '+55 19 99999-0001',
          phoneDigits: '5519999990001',
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.quotaDebited, 0);
  assert.equal(result.deliveredCount, 0);
  assert.equal(result.skippedWithoutWhatsapp, 1);
  assert.equal(result.skippedByFilterCount, 1);
  assert.equal(assertCanImportCalls, 1);
  assert.equal(recordCardImportCalls, 0);
  assert.match(result.message, /0 lead\(s\) entregues ao CRM/);
  assert.match(result.message, /Descartados nao consomem limite/);
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
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
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
  assert.equal(result.deliveredCount, 1);
  assert.equal(result.skippedDuplicateCount, 1);
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser blocks duplicate commercial domain before quota', async () => {
  let activeQuotaCalls = 0;
  const existing = {
    id: 'lead-domain',
    name: 'Clinica Exemplo',
    website: 'https://www.clinicaexemplo.com.br',
  };
  const { service } = createService({
    vendasLead: {
      findMany: async ({ where }: any) => {
        assert.equal(where.website.contains, 'clinicaexemplo.com.br');
        return [existing];
      },
    },
    commercialUsageLimits: {
      assertSellerActiveCardSlots: async () => {
        activeQuotaCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99 },
      {
        debitOnImport: true,
        skipWhatsappValidation: true,
        leads: [
          {
            name: 'Clinica Exemplo',
            website: 'https://clinicaexemplo.com.br/contato',
            city: 'Campinas',
            state: 'SP',
          },
        ],
      } as any,
    ),
    /Contato comercial duplicado/i,
  );

  assert.equal(activeQuotaCalls, 0);
});

test('importWebscrapingLeadsForUser blocks duplicate Google place before quota', async () => {
  let activeQuotaCalls = 0;
  const { service } = createService({
    prisma: {
      hasTable: async (table: string) => ['RadarLeadPool', 'RadarLeadCompanyState'].includes(table),
      radarLeadPool: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.placeId, 'google-place-1');
          return { id: 'radar-place-1' };
        },
      },
      radarLeadCompanyState: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.companyId, 7);
          assert.equal(where.radarLeadId, 'radar-place-1');
          return { vendasLeadId: 'lead-place', vendasLead: { id: 'lead-place', name: 'Padaria Central' } };
        },
      },
    },
    commercialUsageLimits: {
      assertSellerActiveCardSlots: async () => {
        activeQuotaCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99 },
      {
        debitOnImport: true,
        skipWhatsappValidation: true,
        leads: [
          {
            name: 'Padaria Central',
            placeId: 'google-place-1',
            googleMapsUrl: 'https://www.google.com/maps/place/?q=place_id:google-place-1',
          },
        ],
      } as any,
    ),
    /Contato comercial duplicado/i,
  );

  assert.equal(activeQuotaCalls, 0);
});

test('importWebscrapingLeadsForUser blocks duplicate name and city fallback before quota', async () => {
  let activeQuotaCalls = 0;
  const { service } = createService({
    vendasLead: {
      findMany: async ({ where }: any) => {
        assert.equal(where.state, 'SP');
        return [{ id: 'lead-name-city', name: 'Studio Alfa', city: 'Sao Paulo', state: 'SP' }];
      },
    },
    commercialUsageLimits: {
      assertSellerActiveCardSlots: async () => {
        activeQuotaCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99 },
      {
        debitOnImport: true,
        skipWhatsappValidation: true,
        leads: [
          {
            name: 'Stúdio Alfa',
            city: 'São Paulo',
            state: 'SP',
            instagramUrl: 'https://instagram.com/studioalfa',
          },
        ],
      } as any,
    ),
    /Contato comercial duplicado/i,
  );

  assert.equal(activeQuotaCalls, 0);
});

test('createManualLeadForUser blocks duplicate website before active quota', async () => {
  let activeQuotaCalls = 0;
  const { service } = createService({
    vendasLead: {
      findMany: async ({ where }: any) => {
        assert.equal(where.website.contains, 'empresaativa.com.br');
        return [{ id: 'lead-site', name: 'Empresa Ativa', website: 'https://empresaativa.com.br' }];
      },
    },
    commercialUsageLimits: {
      assertSellerActiveCardSlots: async () => {
        activeQuotaCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.createManualLeadForUser(
      { companyId: 7, id: 99 },
      {
        name: 'Empresa Ativa',
        website: 'https://www.empresaativa.com.br/produtos',
      } as any,
    ),
    /Contato comercial duplicado/i,
  );

  assert.equal(activeQuotaCalls, 0);
});

test('createManualLeadForUser requires createManual access', async () => {
  let duplicateLookupCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.cards.createManual': false },
        }),
      },
    },
    vendasLead: {
      findMany: async () => {
        duplicateLookupCalls += 1;
        return [];
      },
    },
  });

  await assert.rejects(
    () => service.createManualLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      { name: 'Lead bloqueado' } as any,
    ),
    /criar card manual bloqueado/i,
  );

  assert.equal(duplicateLookupCalls, 0);
});

test('updateLeadForUser requires edit access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.cards.edit': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.updateLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { name: 'Novo nome' } as any,
    ),
    /editar card bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('updateLeadForUser scopes USER without viewCompany to own assigned card', async () => {
  let seenWhere: any = null;
  const { service } = createService({
    vendasLead: {
      findFirst: async ({ where }: any) => {
        seenWhere = where;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.updateLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-other',
      { name: 'Tentativa' } as any,
    ),
    /nao encontrado/i,
  );

  assert.equal(seenWhere.companyId, 7);
  assert.deepEqual(seenWhere.AND, [
    { id: 'lead-other' },
    { assignedUserId: 99 },
  ]);
});

test('createHbxSalesHandoffForUser requires activation sale access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.sale.markActivationPending': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.createHbxSalesHandoffForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      {} as any,
    ),
    /ativacao pendente bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('createHbxAssistedSignupForUser requires activation sale access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.sale.markActivationPending': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.createHbxAssistedSignupForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { email: 'cliente@teste.local' } as any,
    ),
    /ativacao pendente bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('previewPresentationEmailForUser requires email access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.email.send': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.previewPresentationEmailForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      {},
    ),
    /enviar e-mail bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('sendPresentationEmailForUser requires email access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.email.send': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.sendPresentationEmailForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { subject: 'Assunto', text: 'Mensagem' } as any,
    ),
    /enviar e-mail bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('deleteLeadForUser requires delete access before loading cards', async () => {
  let findManyCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.cards.delete': false },
        }),
      },
    },
    vendasLead: {
      findMany: async () => {
        findManyCalls += 1;
        return [];
      },
    },
  });

  await assert.rejects(
    () => service.deleteLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
    ),
    /excluir card bloqueado/i,
  );

  assert.equal(findManyCalls, 0);
});

test('registerAttemptForUser requires timeline access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'vendas.timeline.comment': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => {
        findFirstCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.registerAttemptForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { channel: 'whatsapp' },
    ),
    /registrar timeline bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
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

test('importWebscrapingLeadsForUser importa segment_mismatch fraco como card basico sem debitar', async () => {
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { prisma } = createImportPrismaHarness();
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99 },
    {
      debitOnImport: true,
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Burguer Avenida',
          phone: '+55 19 99999-0001',
          phoneDigits: '19999990001',
          quality: {
            status: 'segment_mismatch',
            billable: false,
            segmentMatchScore: 20,
            contactQualityScore: 70,
            commercialScore: 30,
            reasons: ['Sem aderencia forte.'],
          },
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(result.deliveredCount, 1);
  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser blocks LeadQualityV2 protect/discard before quota', async () => {
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  const { service } = createService({
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
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
            name: 'Lead Opt Out',
            phone: '+55 19 99999-0001',
            phoneDigits: '19999990001',
            enrichmentJson: {
              qualityV2: {
                version: 'lead-quality-v2',
                identityScore: 80,
                segmentFitScore: 80,
                contactabilityScore: 80,
                commercialIntentScore: 50,
                freshnessScore: 70,
                riskScore: 95,
                opportunityScore: 0,
                finalRankScore: 0,
                decision: 'protect',
                reasons: ['Protegido: opt-out.'],
                discardReason: null,
                protectionReason: 'opt-out',
                recommendedChannel: 'discard',
                productFit: { listFit: 0, leadFit: 0, botFit: 0, recoveryFit: 0, websiteFit: 0 },
              },
            },
          },
        ],
      } as any,
    ),
    /LeadQualityV2|Descartados nao consomem limite/i,
  );

  assert.equal(assertCanImportCalls, 0);
  assert.equal(recordCardImportCalls, 0);
});

test('importWebscrapingLeadsForUser debita somente aprovado criado e reporta descartes', async () => {
  const now = new Date();
  let assertCanImportCalls = 0;
  let recordCardImportCalls = 0;
  let checkWhatsappCalls = 0;
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
    webwhatsBridge: {
      checkWhatsappNumbers: async () => {
        checkWhatsappCalls += 1;
        return [];
      },
    },
    commercialUsageLimits: {
      assertCanImportCard: async () => {
        assertCanImportCalls += 1;
      },
      recordCardCommercialUseOnce: async () => {
        recordCardImportCalls += 1;
        return { debited: true, alreadyDebited: false };
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
      debitOnImport: true,
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Auto Mecânica São José',
          phone: '+55 19 99999-0001',
          phoneDigits: '19999990001',
          quality: approvedQuality,
        },
        {
          name: 'Pizzaria Bella Massa',
          phone: '+55 19 99999-0002',
          phoneDigits: '19999990002',
          quality: { ...approvedQuality, status: 'generic_directory', billable: false },
        },
        {
          name: 'Burguer Avenida',
          phone: '+55 19 99999-0003',
          phoneDigits: '19999990003',
          quality: { ...approvedQuality, status: 'segment_mismatch', billable: false },
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 3);
  assert.equal(result.quotaDebited, 1);
  assert.equal(result.deliveredCount, 3);
  assert.equal(result.whatsappValidationSkipped, true);
  assert.equal(result.skippedByQualityCount, 0);
  assert.equal(result.skippedGenericDirectoryCount, 0);
  assert.equal(result.skippedBySegmentMismatchCount, 0);
  assert.equal(result.failedImports.length, 0);
  assert.equal(assertCanImportCalls, 1);
  assert.equal(recordCardImportCalls, 1);
  assert.equal(checkWhatsappCalls, 0);
  assert.match(result.message, /Descartados nao consomem limite/);
});

test('buildSaleCommissionPatch keeps trial without payable commission', async () => {
  const { service } = createService();
  const result = await (service as any).buildSaleCommissionPatch(
    {
      id: 'lead-trial',
      companyId: 7,
      assignedUserId: 99,
      commissionPercentSnapshot: 20,
      saleValue: 99,
      salePlanKey: 'hbx_padrao',
      saleStatus: 'activation_pending',
      commissionStatus: 'pending',
      commissionAmount: 0,
      commissionDueAt: null,
      commissionPaidAt: null,
      commissionPayoutId: null,
    },
    { saleStatus: 'trial_started' } as any,
    99,
    { allowAutomaticSaleStatus: true },
  );

  assert.equal(result.data.saleStatus, 'trial_started');
  assert.equal(result.data.commissionStatus, 'pending');
  assert.equal(result.data.commissionAmount, 0);
  assert.equal(result.data.commissionDueAt, null);
  assert.equal(result.data.commissionPaidAt, null);
  assert.equal(result.data.commissionRecurring, false);
});

test('buildSaleCommissionPatch releases commission only after confirmed payment', async () => {
  const { service } = createService();
  const result = await (service as any).buildSaleCommissionPatch(
    {
      id: 'lead-paid',
      companyId: 7,
      assignedUserId: 99,
      commissionPercentSnapshot: 20,
      saleValue: 99,
      salePlanKey: 'hbx_padrao',
      saleStatus: 'trial_started',
      commissionStatus: 'pending',
      commissionAmount: 0,
      commissionDueAt: null,
      commissionPaidAt: null,
      commissionPayoutId: null,
    },
    { saleStatus: 'sale_confirmed' } as any,
    99,
    { allowAutomaticSaleStatus: true },
  );

  assert.equal(result.data.saleStatus, 'sale_confirmed');
  assert.equal(result.data.commissionStatus, 'payable');
  assert.equal(result.data.commissionAmount, 19.8);
  assert.ok(result.data.commissionDueAt instanceof Date);
  assert.equal(result.data.commissionRecurring, true);
});

test('buildSaleCommissionPatch rejects payable commission before confirmed payment', async () => {
  const { service } = createService();

  await assert.rejects(
    () => (service as any).buildSaleCommissionPatch(
      {
        id: 'lead-early-payable',
        companyId: 7,
        assignedUserId: 99,
        commissionPercentSnapshot: 20,
        saleValue: 99,
        salePlanKey: 'hbx_padrao',
        saleStatus: 'activation_pending',
        commissionStatus: 'pending',
      },
      { saleStatus: 'trial_started', commissionStatus: 'payable' } as any,
      99,
      { allowAutomaticSaleStatus: true },
    ),
    /pagamento confirmado/i,
  );
});
