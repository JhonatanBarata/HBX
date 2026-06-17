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
    product: {
      findFirst: async () => null,
      ...(overrides?.product || {}),
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

  const cadastrosService = {
    upsertCustomerRegistry: async () => ({ id: 'registry-1' }),
    ...(overrides?.cadastrosService || {}),
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
    ...(overrides?.commercialPlansService || {}),
  } as any;

  // PR12062026005: apresentação do Vendas sai pelo e-mail da empresa
  const companyPresentationEmails = {
    previewPresentationForCompany: async () => ({}),
    sendPresentationForCompany: async () => ({}),
    ...(overrides?.companyPresentationEmails || {}),
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
    cadastrosService,
    customerProfileService,
    conversations,
    inboxService,
    webwhatsBridge,
    commercialPlansService,
    companyPresentationEmails,
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

test('getBoardForUser hides product catalog price without products.viewPrice', async () => {
  const now = new Date();
  const rows = [
    {
      id: 'lead-product-hidden-price',
      companyId: 7,
      assignedUserId: 99,
      name: 'Cliente Produto',
      status: 'novo',
      returnAt: now,
      updatedAt: now,
      createdAt: now,
      productId: 10,
      productKindSnapshot: 'tenant_product',
      productNameSnapshot: 'Plano Comercial',
      productPriceCentsSnapshot: 12345,
      productCurrencySnapshot: 'BRL',
      productBillingCycleSnapshot: 'MONTHLY',
      productCommissionPercentSnapshot: 12,
      productPlanKeySnapshot: 'tenant_plano',
      saleValue: 123.45,
      timelineEvents: [],
    },
  ];

  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.viewPrice': false },
        }),
      },
    },
    vendasLead: {
      findMany: async () => rows,
    },
  });

  const result = await service.getBoardForUser({ companyId: 7, id: 99, role: 'USER' });
  const lead = result.blocks.today[0];

  assert.equal(lead.productPriceCentsSnapshot, null);
  assert.equal(lead.product.priceCents, null);
  assert.equal(lead.product.priceLabel, null);
  assert.equal(lead.product.canViewPrice, false);
  assert.equal(lead.saleValue, 123.45);
});

test('getBoardForUser exposes product catalog price with products.viewPrice', async () => {
  const now = new Date();
  const rows = [
    {
      id: 'lead-product-visible-price',
      companyId: 7,
      assignedUserId: 99,
      name: 'Cliente Produto',
      status: 'novo',
      returnAt: now,
      updatedAt: now,
      createdAt: now,
      productId: 10,
      productKindSnapshot: 'tenant_product',
      productNameSnapshot: 'Plano Comercial',
      productPriceCentsSnapshot: 12345,
      productCurrencySnapshot: 'BRL',
      productBillingCycleSnapshot: 'MONTHLY',
      productCommissionPercentSnapshot: 12,
      productPlanKeySnapshot: 'tenant_plano',
      timelineEvents: [],
    },
  ];

  const { service } = createService({
    vendasLead: {
      findMany: async () => rows,
    },
  });

  const result = await service.getBoardForUser({ companyId: 7, id: 99, role: 'USER' });
  const lead = result.blocks.today[0];

  assert.equal(lead.productPriceCentsSnapshot, 12345);
  assert.equal(lead.product.priceCents, 12345);
  assert.equal(lead.product.priceLabel, 'R$ 123,45');
  assert.equal(lead.product.canViewPrice, true);
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

test('buildLeadPayload hides product catalog price when access context is missing', () => {
  const { service } = createService();
  const payload = (service as any).buildLeadPayload({
    id: 'lead-product-no-context',
    companyId: 7,
    name: 'Cliente Produto',
    status: 'novo',
    productId: 10,
    productKindSnapshot: 'tenant_product',
    productNameSnapshot: 'Plano Comercial',
    productPriceCentsSnapshot: 12345,
    productCurrencySnapshot: 'BRL',
    productBillingCycleSnapshot: 'MONTHLY',
    saleValue: 123.45,
    createdAt: new Date(),
    updatedAt: new Date(),
    timelineEvents: [],
  });

  assert.equal(payload.productPriceCentsSnapshot, null);
  assert.equal(payload.product.priceCents, null);
  assert.equal(payload.product.priceLabel, null);
  assert.equal(payload.product.canViewPrice, false);
  assert.equal(payload.saleValue, 123.45);
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

test('importWebscrapingLeadsForUser hides product price when products.viewPrice=false', async () => {
  const now = new Date();
  const createdRows: any[] = [];
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.viewPrice': false },
        }),
      },
      $transaction: async (fn: any) => fn({
        vendasLead: {
          create: async ({ data }: any) => {
            const row = {
              id: 'lead-import-product',
              companyId: data.companyId,
              ...data,
              status: data.status || 'novo',
              returnAt: data.returnAt || now,
              createdAt: now,
              updatedAt: now,
              productId: 10,
              productKindSnapshot: 'tenant_product',
              productNameSnapshot: 'Plano Comercial',
              productPriceCentsSnapshot: 12345,
              productCurrencySnapshot: 'BRL',
              productBillingCycleSnapshot: 'MONTHLY',
              productCommissionPercentSnapshot: 12,
              productPlanKeySnapshot: 'tenant_plano',
              timelineEvents: [],
            };
            createdRows.push(row);
            return row;
          },
          findUniqueOrThrow: async () => createdRows[0],
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
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99, role: 'USER' },
    {
      skipWhatsappValidation: true,
      leads: [
        {
          name: 'Cliente Importado',
          phone: '+55 19 99999-0001',
          phoneDigits: '5519999990001',
        },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(createdRows[0].productPriceCentsSnapshot, 12345);
  assert.equal(result.leads[0].productPriceCentsSnapshot, null);
  assert.equal(result.leads[0].product.priceCents, null);
  assert.equal(result.leads[0].product.priceLabel, null);
  assert.equal(result.leads[0].product.canViewPrice, false);
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

test('previewWebscrapingImportForUser hides duplicate CRM details outside USER wallet', async () => {
  const now = new Date('2026-01-10T12:00:00.000Z');
  let seenWhere: any = null;
  const { service } = createService({
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [
          {
            id: 'lead-other',
            companyId: 7,
            customerProfileId: 'profile-other',
            sourceType: 'webscraping',
            primarySource: 'radar',
            sourceHistoryId: 'radar:lead-other',
            timesSeen: 4,
            name: 'Cliente de Outro Vendedor',
            phone: '+55 11 99887-7766',
            phoneNormalized: '5511998877766',
            status: 'retorno',
            lastContactAt: now,
            attemptCount: 3,
            lastResult: 'respondeu depois',
            assignedUserId: 123,
            createdByUserId: 123,
            createdAt: now,
            updatedAt: now,
            timelineEvents: [],
          },
        ];
      },
    },
  });

  const result = await service.previewWebscrapingImportForUser(
    { companyId: 7, id: 99, role: 'USER' },
    {
      leads: [
        { phone: '+55 11 99887-7766', phoneDigits: '5511998877766' },
      ],
    } as any,
  );

  assert.equal(seenWhere.companyId, 7);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].existsInCrm, true);
  assert.equal(result.items[0].crmDetailsRestricted, true);
  assert.equal(result.items[0].leadId, null);
  assert.equal(result.items[0].leadName, null);
  assert.equal(result.items[0].status, null);
  assert.equal(result.items[0].attemptCount, 0);
  assert.equal(result.items[0].lastContactAt, null);
  assert.equal(result.items[0].lastResult, null);
  assert.equal(result.items[0].sharedProfile, null);
  assert.equal(result.items[0].signals.alreadyExisted, true);
});

test('previewWebscrapingImportForUser shows duplicate CRM details inside USER wallet', async () => {
  const now = new Date('2026-01-10T12:00:00.000Z');
  const { service } = createService({
    vendasLead: {
      findMany: async () => [
        {
          id: 'lead-own',
          companyId: 7,
          customerProfileId: null,
          sourceType: 'webscraping',
          primarySource: 'radar',
          sourceHistoryId: 'radar:lead-own',
          timesSeen: 2,
          name: 'Cliente do Vendedor',
          phone: '+55 11 99887-7766',
          phoneNormalized: '5511998877766',
          status: 'retorno',
          returnAt: now,
          lastContactAt: now,
          attemptCount: 2,
          lastResult: 'whatsapp',
          wasClosedBefore: false,
          assignedUserId: 99,
          createdByUserId: 99,
          createdAt: now,
          updatedAt: now,
          timelineEvents: [],
        },
      ],
    },
  });

  const result = await service.previewWebscrapingImportForUser(
    { companyId: 7, id: 99, role: 'USER' },
    {
      leads: [
        { phone: '+55 11 99887-7766', phoneDigits: '5511998877766' },
      ],
    } as any,
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].existsInCrm, true);
  assert.equal(result.items[0].crmDetailsRestricted, false);
  assert.equal(result.items[0].leadId, 'lead-own');
  assert.equal(result.items[0].leadName, 'Cliente do Vendedor');
  assert.equal(result.items[0].status, 'retorno');
  assert.equal(result.items[0].attemptCount, 2);
  assert.equal(result.items[0].lastContactAt, now.toISOString());
  assert.equal(result.items[0].lastResult, 'whatsapp');
});

test('previewWebscrapingImportForUser requires read access before duplicate lookup', async () => {
  let duplicateLookupCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: {
            'vendas.cards.viewOwn': false,
            'vendas.cards.viewCompany': false,
          },
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
    () => service.previewWebscrapingImportForUser(
      { companyId: 7, id: 99, role: 'USER' },
      { leads: [{ phone: '+55 11 99887-7766' }] } as any,
    ),
    /Acesso aos cards do Vendas bloqueado/i,
  );

  assert.equal(duplicateLookupCalls, 0);
});

test('importWebscrapingLeadsForUser requires Radar-to-Vendas or manual card access', async () => {
  let planLookupCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: {
            'vendas.cards.createManual': false,
            'radar.cards.sendToVendas': false,
          },
        }),
      },
    },
    company: {
      findUnique: async () => {
        planLookupCalls += 1;
        return { selectedPlanKey: 'hbx_padrao' };
      },
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99, role: 'USER' },
      {
        skipWhatsappValidation: true,
        leads: [{ name: 'Lead bloqueado', phone: '+55 11 99887-7766' }],
      } as any,
    ),
    /enviar cards do Radar ao Vendas bloqueado/i,
  );

  assert.equal(planLookupCalls, 0);
});

test('importWebscrapingLeadsForUser assigns USER imports to self', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const importLeadQuality = {
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
  };
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99, role: 'USER' },
    {
      skipWhatsappValidation: true,
      leads: [
        { name: 'Humanitarian Calçados', phone: '+55 19 3513-9668', phoneDigits: '1935139668', ...importLeadQuality },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(createdRows[0].assignedUserId, 99);
  assert.equal(createdRows[0].assignedByUserId, null);
});

test('importWebscrapingLeadsForUser blocks USER assigning to another seller without company view', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99, role: 'USER' },
      {
        assignedUserId: 123,
        skipWhatsappValidation: true,
        leads: [
          { name: 'Lead de outro', phone: '+55 11 99887-7766', phoneDigits: '5511998877766' },
        ],
      } as any,
    ),
    /atribuir ou transferir card bloqueado/i,
  );

  assert.equal(createdRows.length, 0);
});

test('importWebscrapingLeadsForUser blocks ADMIN assigning when assign and transfer are explicitly false', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const { service } = createService({
    prisma: {
      ...prisma,
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: {
            'vendas.cards.assign': false,
            'vendas.cards.transfer': false,
          },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => null,
    },
  });

  await assert.rejects(
    () => service.importWebscrapingLeadsForUser(
      { companyId: 7, id: 99, role: 'ADMIN' },
      {
        assignedUserId: 123,
        skipWhatsappValidation: true,
        leads: [
          { name: 'Lead admin bloqueado', phone: '+55 11 99887-7766', phoneDigits: '5511998877766' },
        ],
      } as any,
    ),
    /atribuir ou transferir card bloqueado/i,
  );

  assert.equal(createdRows.length, 0);
});

test('importWebscrapingLeadsForUser lets ADMIN assign to an active seller in same tenant', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const importLeadQuality = {
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
  };
  const { service } = createService({
    prisma,
    vendasLead: {
      findFirst: async () => null,
    },
    user: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, 123);
        assert.equal(where.companyId, 7);
        assert.equal(where.isActive, true);
        assert.equal(where.isSystemMaster, false);
        return {
          id: 123,
          name: 'Destino',
          email: 'destino@teste.local',
          username: 'destino',
          phone: null,
          role: 'USER',
          commissionPercent: 15,
        };
      },
    },
  });

  const result = await service.importWebscrapingLeadsForUser(
    { companyId: 7, id: 99, role: 'ADMIN' },
    {
      assignedUserId: 123,
      skipWhatsappValidation: true,
      leads: [
        { name: 'Humanitarian Calçados', phone: '+55 19 3513-9668', phoneDigits: '1935139668', ...importLeadQuality },
      ],
    } as any,
  );

  assert.equal(result.createdCount, 1);
  assert.equal(createdRows[0].assignedUserId, 123);
  assert.equal(createdRows[0].assignedByUserId, 99);
  assert.equal(createdRows[0].commissionPercentSnapshot, 15);
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

test('createManualLeadForUser with productId stores product snapshots on the card', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const { service } = createService({
    prisma,
    vendasLead: {
      findMany: async () => [],
    },
    product: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where, { id: 10, companyId: 7, status: 'active' });
        return {
          id: 10,
          companyId: 7,
          status: 'active',
          kind: 'platform_plan',
          name: 'HBX Lead',
          priceCents: 9900,
          currency: 'BRL',
          billingCycle: 'MONTHLY',
          defaultCommissionPercent: 12,
          planKey: 'hbx_padrao',
        };
      },
    },
  });

  const result = await service.createManualLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    {
      name: 'Cliente Produto',
      productId: 10,
    } as any,
  );

  assert.equal(result.ok, true);
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].productId, 10);
  assert.equal(createdRows[0].productKindSnapshot, 'platform_plan');
  assert.equal(createdRows[0].productNameSnapshot, 'HBX Lead');
  assert.equal(createdRows[0].productPriceCentsSnapshot, 9900);
  assert.equal(createdRows[0].productCurrencySnapshot, 'BRL');
  assert.equal(createdRows[0].productBillingCycleSnapshot, 'MONTHLY');
  assert.equal(createdRows[0].productCommissionPercentSnapshot, 12);
  assert.equal(createdRows[0].productPlanKeySnapshot, 'hbx_padrao');
});

test('createManualLeadForUser hides product price when products.viewPrice=false', async () => {
  const { prisma, createdRows } = createImportPrismaHarness();
  const { service } = createService({
    prisma: {
      ...prisma,
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.viewPrice': false },
        }),
      },
    },
    vendasLead: {
      findMany: async () => [],
    },
    product: {
      findFirst: async () => ({
        id: 10,
        companyId: 7,
        status: 'active',
        kind: 'tenant_product',
        name: 'Plano Comercial',
        priceCents: 9900,
        currency: 'BRL',
        billingCycle: 'MONTHLY',
        defaultCommissionPercent: 12,
        planKey: 'tenant_plano',
      }),
    },
  });

  const result = await service.createManualLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    { name: 'Cliente Produto', productId: 10 } as any,
  );

  assert.equal(createdRows[0].productPriceCentsSnapshot, 9900);
  assert.equal(result.lead.productPriceCentsSnapshot, null);
  assert.equal(result.lead.product.priceCents, null);
  assert.equal(result.lead.product.priceLabel, null);
  assert.equal(result.lead.product.canViewPrice, false);
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

test('updateLeadForUser hides product price when products.viewPrice=false', async () => {
  const now = new Date();
  let row: any = {
    id: 'lead-1',
    companyId: 7,
    assignedUserId: 99,
    name: 'Cliente Produto',
    status: 'novo',
    returnAt: now,
    attemptCount: 0,
    saleStatus: 'none',
    saleValue: 123.45,
    commissionStatus: 'none',
    productId: 10,
    productKindSnapshot: 'tenant_product',
    productNameSnapshot: 'Plano Comercial',
    productPriceCentsSnapshot: 12345,
    productCurrencySnapshot: 'BRL',
    productBillingCycleSnapshot: 'MONTHLY',
    productCommissionPercentSnapshot: 12,
    productPlanKeySnapshot: 'tenant_plano',
    createdAt: now,
    updatedAt: now,
    timelineEvents: [],
  };
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.viewPrice': false },
        }),
      },
      $transaction: async (fn: any) => fn({
        vendasLead: {
          update: async ({ data }: any) => {
            row = { ...row, ...data, updatedAt: now };
            return row;
          },
          findUniqueOrThrow: async () => row,
        },
        vendasLeadTimelineEvent: {
          createMany: async () => ({ count: 0 }),
        },
      }),
    },
    vendasLead: {
      findFirst: async () => row,
    },
  });

  const result = await service.updateLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { name: 'Cliente Atualizado' } as any,
  );

  assert.equal(result.lead.name, 'Cliente Atualizado');
  assert.equal(result.lead.productPriceCentsSnapshot, null);
  assert.equal(result.lead.product.priceCents, null);
  assert.equal(result.lead.product.priceLabel, null);
  assert.equal(result.lead.product.canViewPrice, false);
  assert.equal(result.lead.saleValue, 123.45);
});

function createCloseCardHarness(input: { saleStatus: string }) {
  const now = new Date();
  let row: any = {
    id: 'lead-1',
    companyId: 7,
    assignedUserId: 99,
    customerProfileId: 'profile-1',
    name: 'Cliente Fechamento',
    phone: '5511999990000',
    phoneNormalized: '5511999990000',
    status: 'qualificado',
    attemptCount: 1,
    lastContactAt: now,
    saleStatus: input.saleStatus,
    saleValue: 0,
    commissionStatus: 'none',
    createdAt: now,
    updatedAt: now,
    timelineEvents: [],
  };
  const registryCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    vendasLead: {
      findFirst: async ({ where }: any) => (where?.phoneNormalized ? null : row),
    },
    prisma: {
      $transaction: async (fn: any) => fn({
        vendasLead: {
          update: async ({ data }: any) => {
            row = { ...row, ...data, updatedAt: now };
            return row;
          },
          findUniqueOrThrow: async () => ({ ...row, timelineEvents: [] }),
        },
        vendasLeadTimelineEvent: {
          createMany: async () => ({ count: 0 }),
        },
      }),
    },
    cadastrosService: {
      upsertCustomerRegistry: async (payload: Record<string, unknown>) => {
        registryCalls.push(payload);
        return { id: 'registry-1' };
      },
    },
  });
  return { service, registryCalls };
}

test('updateLeadForUser cria cadastro confirmado ao encerrar card com venda', async () => {
  const { service, registryCalls } = createCloseCardHarness({ saleStatus: 'sale_confirmed' });

  const result = await service.updateLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { status: 'encerrado' } as any,
  );

  assert.equal(result.ok, true);
  assert.equal(registryCalls.length, 1);
  assert.equal(registryCalls[0].companyId, 7);
  assert.equal(registryCalls[0].phone, '5511999990000');
  assert.equal(registryCalls[0].customerProfileId, 'profile-1');
  assert.equal(registryCalls[0].registrationOrigin, 'vendas');
  assert.equal(registryCalls[0].registrationStatus, 'confirmed');
});

test('updateLeadForUser cria cadastro pendente ao encerrar card sem venda', async () => {
  const { service, registryCalls } = createCloseCardHarness({ saleStatus: 'none' });

  const result = await service.updateLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { status: 'encerrado' } as any,
  );

  assert.equal(result.ok, true);
  assert.equal(registryCalls.length, 1);
  assert.equal(registryCalls[0].registrationStatus, 'pending_confirmation');
});

test('updateLeadForUser nao cria cadastro enquanto o card segue aberto', async () => {
  const { service, registryCalls } = createCloseCardHarness({ saleStatus: 'none' });

  const result = await service.updateLeadForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { status: 'contato' } as any,
  );

  assert.equal(result.ok, true);
  assert.equal(registryCalls.length, 0);
});

test('updateLeadForUser requires products.sell before linking catalog product', async () => {
  let productFindCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.sell': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        status: 'novo',
        attemptCount: 0,
      }),
    },
    product: {
      findFirst: async () => {
        productFindCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.updateLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { productId: 10 } as any,
    ),
    /vender produtos bloqueado/i,
  );

  assert.equal(productFindCalls, 0);
});

test('updateLeadForUser requires products.discount for product sale below catalog price', async () => {
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.discount': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        status: 'novo',
        attemptCount: 0,
        saleStatus: 'none',
        saleValue: 0,
        commissionStatus: 'none',
      }),
    },
    product: {
      findFirst: async () => ({
        id: 10,
        companyId: 7,
        status: 'active',
        kind: 'tenant_product',
        name: 'Plano Comercial',
        priceCents: 10000,
        currency: 'BRL',
        billingCycle: 'MONTHLY',
        allowDiscount: true,
        maxDiscountPercent: 20,
        minPriceCents: 8000,
        defaultCommissionPercent: 12,
        planKey: 'tenant_plano',
      }),
    },
  });

  await assert.rejects(
    () => service.updateLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { productId: 10, saleValue: 90 } as any,
    ),
    /aplicar desconto bloqueado/i,
  );
});

test('updateLeadForUser requires products.changePrice for product sale above catalog price', async () => {
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'products.changePrice': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        status: 'novo',
        attemptCount: 0,
        saleStatus: 'none',
        saleValue: 0,
        commissionStatus: 'none',
      }),
    },
    product: {
      findFirst: async () => ({
        id: 10,
        companyId: 7,
        status: 'active',
        kind: 'tenant_product',
        name: 'Plano Comercial',
        priceCents: 10000,
        currency: 'BRL',
        billingCycle: 'MONTHLY',
        allowDiscount: true,
        maxDiscountPercent: 20,
        minPriceCents: 8000,
        defaultCommissionPercent: 12,
        planKey: 'tenant_plano',
      }),
    },
  });

  await assert.rejects(
    () => service.updateLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      { productId: 10, saleValue: 120 } as any,
    ),
    /alterar valor da venda bloqueado/i,
  );
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

test('sendPresentationEmailForUser blocks explicit company reply-to without access', async () => {
  let sendCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.email.useCompanyReplyTo': false },
        }),
      },
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        name: 'Cliente Email',
        email: 'cliente@email.com',
        status: 'novo',
      }),
    },
    companyPresentationEmails: {
      sendPresentationForCompany: async () => {
        sendCalls += 1;
        return {};
      },
    },
  });

  await assert.rejects(
    () => service.sendPresentationEmailForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
      {
        subject: 'Assunto',
        text: 'Mensagem',
        useCompanyReplyTo: true,
      } as any,
    ),
    /reply-to da empresa bloqueado/i,
  );

  assert.equal(sendCalls, 0);
});

test('sendPresentationEmailForUser does not use company reply-to without access', async () => {
  let sentInput: any = null;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.email.useCompanyReplyTo': false },
        }),
      },
    },
    company: {
      findUnique: async () => ({
        companyKind: 'tenant',
        replyToEmail: 'responder@empresa.com',
        supportEmail: 'suporte@empresa.com',
        contactEmail: 'contato@empresa.com',
      }),
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        name: 'Cliente Email',
        email: 'cliente@email.com',
        status: 'novo',
      }),
    },
    companyPresentationEmails: {
      sendPresentationForCompany: async (_companyId: number, input: any) => {
        sentInput = input;
        return {
          ok: true,
          sentAt: '2026-06-09T12:00:00.000Z',
          subject: input.subject,
          attachment: null,
          delivery: { ok: true, messageId: 'msg-1', transport: 'mock' },
        };
      },
    },
  });

  await service.sendPresentationEmailForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { subject: 'Assunto', text: 'Mensagem' } as any,
  );

  assert.equal(sentInput.replyTo, null);
});

test('sendPresentationEmailForUser uses tenant reply-to with access', async () => {
  let sentInput: any = null;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.email.useCompanyReplyTo': true },
        }),
      },
    },
    company: {
      findUnique: async () => ({
        companyKind: 'tenant',
        replyToEmail: 'Responder@Empresa.com',
        supportEmail: 'suporte@empresa.com',
        contactEmail: 'contato@empresa.com',
      }),
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 99,
        name: 'Cliente Email',
        email: 'cliente@email.com',
        status: 'novo',
      }),
    },
    companyPresentationEmails: {
      sendPresentationForCompany: async (_companyId: number, input: any) => {
        sentInput = input;
        return {
          ok: true,
          sentAt: '2026-06-09T12:00:00.000Z',
          subject: input.subject,
          attachment: null,
          delivery: { ok: true, messageId: 'msg-1', transport: 'mock' },
        };
      },
    },
  });

  await service.sendPresentationEmailForUser(
    { companyId: 7, id: 99, role: 'USER' },
    'lead-1',
    { subject: 'Assunto', text: 'Mensagem', useCompanyReplyTo: true } as any,
  );

  assert.equal(sentInput.replyTo, 'responder@empresa.com');
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

test('enrichLeadForUser requires manual enrichment access before loading the card', async () => {
  let findFirstCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'radar.enrichment.manual': false },
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
    () => service.enrichLeadForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
    ),
    /enriquecer card manualmente bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('buildPresentationEmailDraftForUser requires email access before loading the card', async () => {
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
    () => service.buildPresentationEmailDraftForUser(
      { companyId: 7, id: 99, role: 'USER' },
      'lead-1',
    ),
    /enviar e-mail bloqueado/i,
  );

  assert.equal(findFirstCalls, 0);
});

test('syncTodayAgendaForUser requires manual WhatsApp access before loading cards', async () => {
  let findManyCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'communication.whatsapp.sendManual': false },
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
    () => service.syncTodayAgendaForUser(
      { companyId: 7, id: 99, role: 'USER' },
    ),
    /envio manual de WhatsApp bloqueado/i,
  );

  assert.equal(findManyCalls, 0);
});

test('getCommissionSummaryForUser requires commission view access before sync', async () => {
  let syncCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: {
            'commission.viewOwn': false,
            'commission.viewTeam': false,
          },
        }),
      },
    },
    hbxCommissionSync: {
      syncSalesCompanyCommissions: async () => {
        syncCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.getCommissionSummaryForUser(
      { companyId: 7, id: 99, role: 'USER' },
    ),
    /ver comissao bloqueado/i,
  );

  assert.equal(syncCalls, 0);
});

test('getCommissionSummaryForUser scopes own commission without team view', async () => {
  const seenLeadWheres: any[] = [];
  const seenReceivableWheres: any[] = [];
  const seenPayoutWheres: any[] = [];
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: {
            'commission.viewOwn': true,
            'commission.viewTeam': false,
          },
        }),
      },
      vendasCommissionReceivable: {
        findMany: async ({ where }: any) => {
          seenReceivableWheres.push(where);
          return [];
        },
      },
      vendasCommissionPayout: {
        findMany: async ({ where }: any) => {
          seenPayoutWheres.push(where);
          return [];
        },
      },
    },
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenLeadWheres.push(where);
        return [];
      },
    },
  });

  const result = await service.getCommissionSummaryForUser(
    { companyId: 7, id: 99, role: 'USER' },
  );

  assert.equal(result.scope, 'seller');
  assert.equal(seenLeadWheres[0].assignedUserId, 99);
  assert.equal(seenReceivableWheres[0].sellerUserId, 99);
  assert.equal(seenPayoutWheres[0].sellerUserId, 99);
});

test('createCommissionPayoutForUser requires markPaid access before sync', async () => {
  let syncCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'commission.markPaid': false },
        }),
      },
    },
    hbxCommissionSync: {
      syncSalesCompanyCommissions: async () => {
        syncCalls += 1;
      },
    },
  });

  await assert.rejects(
    () => service.createCommissionPayoutForUser(
      { companyId: 7, id: 99, role: 'ADMIN' },
      {},
    ),
    /pagamento de comissao bloqueado/i,
  );

  assert.equal(syncCalls, 0);
});

test('cancelCommissionPayoutForUser requires cancel commission access before loading payout', async () => {
  let payoutFindCalls = 0;
  const { service } = createService({
    prisma: {
      userTeamPolicy: {
        findUnique: async () => buildRuntimePolicy({
          access: { 'commission.cancel': false },
        }),
      },
      vendasCommissionPayout: {
        findFirst: async () => {
          payoutFindCalls += 1;
          return null;
        },
      },
    },
  });

  await assert.rejects(
    () => service.cancelCommissionPayoutForUser(
      { companyId: 7, id: 99, role: 'ADMIN' },
      'payout-1',
      {},
    ),
    /cancelar comissao bloqueado/i,
  );

  assert.equal(payoutFindCalls, 0);
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

test('buildSaleCommissionPatch uses product snapshot price and commission when sale value is absent', async () => {
  const { service } = createService();
  const result = await (service as any).buildSaleCommissionPatch(
    {
      id: 'lead-product',
      companyId: 7,
      assignedUserId: 99,
      commissionPercentSnapshot: 20,
      productPriceCentsSnapshot: 12990,
      productCommissionPercentSnapshot: 15,
      productPlanKeySnapshot: 'tenant_plano',
      saleValue: 0,
      salePlanKey: null,
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
  assert.equal(result.data.saleValue, 129.9);
  assert.equal(result.data.salePlanKey, 'tenant_plano');
  assert.equal(result.data.commissionStatus, 'payable');
  assert.equal(result.data.commissionAmount, 19.49);
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
