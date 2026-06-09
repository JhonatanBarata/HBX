import test from 'node:test';
import assert from 'node:assert/strict';
import { CommercialUsageLimitsService } from './commercial-usage-limits.service';

function buildTeamPolicyMock(input: Record<string, any> = {}) {
  return {
    id: 'policy-7',
    userId: 7,
    companyId: 1,
    status: 'active',
    subjectKind: 'common_seller',
    modulesJson: '[]',
    enrichmentDailyMode: 'inherit',
    enrichmentDailyLimit: null,
    cardDeliveryDailyMode: 'inherit',
    cardDeliveryDailyLimit: null,
    activeCardsMode: 'inherit',
    activeCardsLimit: null,
    monthlyCardsMode: 'inherit',
    monthlyCardsLimit: null,
    vendasPullQuantityMode: 'inherit',
    vendasPullQuantityLimit: null,
    allowedSegmentsJson: '[]',
    blockedSegmentsJson: '[]',
    allowedCitiesJson: '[]',
    allowedStatesJson: '[]',
    requiresLocation: true,
    requiredChannelsJson: '{}',
    ...input,
  };
}

function buildPrismaMock(input: {
  activeVendas?: number;
  activeRadar?: number;
  wonLast30?: number;
  targetStockPerSeller?: number;
  sellerMode?: string;
  sellerPausedUntil?: Date | null;
  lastSeenAt?: Date | null;
  companyKind?: string;
  teamPolicy?: Record<string, any> | null;
} = {}) {
  const now = new Date();
  const lastSeenAt = input.lastSeenAt === undefined ? now : input.lastSeenAt;
  return {
    company: {
      findUnique: async () => ({ companyKind: input.companyKind || 'tenant' }),
    },
    user: {
      findFirst: async () => ({
        id: 7,
        role: 'USER',
        isSystemMaster: false,
        isActive: true,
        deactivatedAt: null,
        createdAt: now,
        sellerDistributionMode: input.sellerMode || 'normal',
        sellerDistributionPausedUntil: input.sellerPausedUntil || null,
        sellerDistributionDailyLimitOverride: input.targetStockPerSeller ?? null,
      }),
      findUnique: async () => ({ isSystemMaster: false }),
    },
    userTeamPolicy: {
      findUnique: async () => input.teamPolicy === undefined
        ? null
        : input.teamPolicy,
    },
    radarAutoDistributionRule: {
      findFirst: async () => ({ targetStockPerSeller: input.targetStockPerSeller ?? 20 }),
    },
    vendasLead: {
      count: async (args: any) => args?.where?.closedAt === null
        ? input.activeVendas || 0
        : input.wonLast30 || 0,
    },
    radarLeadCompanyState: {
      count: async () => input.activeRadar || 0,
    },
    authSession: {
      findFirst: async () => lastSeenAt ? ({ lastSeenAt }) : null,
    },
    companyCommercialUsageLog: {
      create: async () => ({}),
      count: async () => 0,
      findFirst: async () => null,
    },
  };
}

test('seller active card quota blocks when active count reaches effective limit', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 18,
    activeRadar: 2,
    targetStockPerSeller: 20,
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.seller, true);
  assert.equal(snapshot.activeCount, 20);
  assert.equal(snapshot.effectiveLimit, 20);
  assert.equal(snapshot.availableSlots, 0);
  assert.equal(snapshot.code, 'SELLER_CARD_QUOTA_REACHED');
});

test('tenant seller active quota follows configured distribution rule', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    targetStockPerSeller: 80,
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.seller, true);
  assert.equal(snapshot.baseLimit, 80);
  assert.equal(snapshot.effectiveLimit, 80);
  assert.equal(snapshot.availableSlots, 80);
});

test('team policy can override active card quota exactly', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 10,
    activeRadar: 1,
    teamPolicy: buildTeamPolicyMock({
      activeCardsMode: 'limited',
      activeCardsLimit: 12,
    }),
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.baseLimit, 12);
  assert.equal(snapshot.effectiveLimit, 12);
  assert.equal(snapshot.activeCount, 11);
  assert.equal(snapshot.availableSlots, 1);
});

test('platform_infra company has zero commercial usage limits', async () => {
  const service = new CommercialUsageLimitsService({
    company: {
      findUnique: async () => ({
        selectedPlanKey: null,
        premiumAccess: true,
        paymentStatus: null,
        subscriptionStatus: null,
        timezone: 'America/Sao_Paulo',
        companyKind: 'platform_infra',
      }),
    },
    user: {
      count: async () => 3,
      findUnique: async () => ({ isSystemMaster: false, role: 'USER', sellerDistributionDailyLimitOverride: null }),
    },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: {
      count: async (args: any) => {
        const eventTypes = args?.where?.eventType?.in || [];
        const userScoped = Number(args?.where?.userId || 0) === 7;
        if (eventTypes.includes('lead_enrichment_used')) return userScoped ? 30 : 90;
        if (eventTypes.includes('vendas_card_refunded')) return 0;
        if (eventTypes.includes('radar_card_claimed')) return userScoped ? 29 : 90;
        return 0;
      },
    },
  } as any);

  const snapshot = await service.getUsageSnapshot(1, 7);

  assert.equal(snapshot.planKey, 'platform_infra');
  assert.equal(snapshot.cards.dailySafetyLimit, 0);
  assert.equal(snapshot.cards.dailyUsed, 0);
  assert.equal(snapshot.cards.dailyRemaining, 0);
  assert.equal(snapshot.enrichment.dailyLimit, 0);
  assert.equal(snapshot.enrichment.dailyUsed, 0);
  assert.equal(snapshot.enrichment.dailyRemaining, 0);
  assert.equal(snapshot.enrichment.dailyLimitSource, 'platform_infra');
  assert.equal(snapshot.enrichment.configuredDailyLimit, null);
  assert.equal(snapshot.enrichment.fallbackDailyLimit, null);
});

test('team policy overrides tenant seller enrichment daily limit inside plan cap', async () => {
  const service = new CommercialUsageLimitsService({
    company: {
      findUnique: async () => ({
        timezone: 'America/Sao_Paulo',
        companyKind: 'tenant',
      }),
    },
    user: {
      count: async () => 3,
      findUnique: async () => ({ isSystemMaster: false, role: 'USER', sellerDistributionDailyLimitOverride: null }),
    },
    userTeamPolicy: {
      findUnique: async () => buildTeamPolicyMock({
        enrichmentDailyMode: 'limited',
        enrichmentDailyLimit: 80,
      }),
    },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: {
      count: async (args: any) => {
        const eventTypes = args?.where?.eventType?.in || [];
        const userScoped = Number(args?.where?.userId || 0) === 7;
        if (eventTypes.includes('lead_enrichment_used')) return userScoped ? 15 : 90;
        return 0;
      },
    },
  } as any);

  const snapshot = await service.getUsageSnapshot(1, 7);

  assert.equal(snapshot.enrichment.dailyLimit, 80);
  assert.equal(snapshot.enrichment.dailyUsed, 15);
  assert.equal(snapshot.enrichment.dailyRemaining, 65);
  assert.equal(snapshot.enrichment.dailyLimitSource, 'team_policy');
  assert.equal(snapshot.enrichment.configuredDailyLimit, 80);
});

test('tenant usage does not become special seller quota from legacy user override alone', async () => {
  const service = new CommercialUsageLimitsService({
    company: {
      findUnique: async () => ({
        timezone: 'America/Sao_Paulo',
        companyKind: 'tenant',
      }),
    },
    user: {
      count: async () => 3,
      findUnique: async () => ({ isSystemMaster: false, role: 'USER', sellerDistributionDailyLimitOverride: 12 }),
    },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: { count: async () => 0 },
  } as any);

  const snapshot = await service.getUsageSnapshot(1, 7);

  assert.equal(snapshot.planKey, 'hbx_padrao');
  assert.equal(snapshot.enrichment.dailyLimit, 100);
  assert.equal(snapshot.enrichment.dailyRemaining, 100);
  assert.equal(snapshot.enrichment.dailyLimitSource, 'plan');
  assert.equal(snapshot.enrichment.configuredDailyLimit, null);
  assert.equal(snapshot.enrichment.fallbackDailyLimit, null);
  assert.equal(snapshot.enrichment.canAutoEnrich, false);
  assert.equal(snapshot.enrichment.canManualEnrich, true);
  assert.equal(snapshot.enrichment.mode, 'manual_only');
});

test('team policy card delivery daily limit blocks import when seller daily use is exhausted', async () => {
  const service = new CommercialUsageLimitsService({
    company: {
      findUnique: async () => ({
        timezone: 'America/Sao_Paulo',
        companyKind: 'tenant',
      }),
    },
    user: {
      count: async () => 3,
      findUnique: async () => ({ isSystemMaster: false, role: 'USER', sellerDistributionDailyLimitOverride: null }),
    },
    userTeamPolicy: {
      findUnique: async () => buildTeamPolicyMock({
        cardDeliveryDailyMode: 'limited',
        cardDeliveryDailyLimit: 2,
      }),
    },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: {
      create: async () => ({}),
      count: async (args: any) => {
        const eventTypes = args?.where?.eventType?.in || [];
        const userScoped = Number(args?.where?.userId || 0) === 7;
        if (eventTypes.includes('radar_card_claimed')) return userScoped ? 2 : 90;
        return 0;
      },
    },
  } as any);

  await assert.rejects(
    () => service.assertCanImportCard(1, 7),
    (error: any) => error?.response?.code === 'DAILY_CARD_SAFETY_LIMIT_REACHED',
  );
});

test('seller active card quota limits requested Radar quantity to available slots', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 9,
    activeRadar: 3,
    targetStockPerSeller: 20,
  }) as any);

  const result = await service.limitRequestedCardsBySellerActiveQuota(1, 7, 50);

  assert.equal(result.quota.activeCount, 12);
  assert.equal(result.quota.availableSlots, 8);
  assert.equal(result.limit, 8);
});

test('seller active card quota pauses new cards when governance is paused', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 1,
    sellerMode: 'paused',
    sellerPausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.paused, true);
  assert.equal(snapshot.effectiveLimit, 0);
  assert.equal(snapshot.availableSlots, 0);
  assert.equal(snapshot.code, 'SELLER_QUOTA_PAUSED');
});
