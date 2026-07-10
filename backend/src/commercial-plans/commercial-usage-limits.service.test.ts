import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
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
  noDistributionRule?: boolean;
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
      findFirst: async () => input.noDistributionRule
        ? null
        : ({ targetStockPerSeller: input.targetStockPerSeller ?? 20 }),
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

// RBAC 03/07: USERMASTER (dono do tenant) NAO e vendedor — o teto de carteira
// (cap de cards ativos) so se aplica a role 'USER'. Como o dono e admin, ele nasce
// ILIMITADO aqui, identico ao ADMIN (seller=false, unlimited=true). Confirma que o
// reconhecimento de papel deixa o admin naturalmente fora do limite de vendedor,
// SEM codigo de isencao especial.
test('seller active card quota: USERMASTER (dono/admin) fica isento (seller=false, unlimited)', async () => {
  const now = new Date();
  const prisma = {
    company: { findUnique: async () => ({ companyKind: 'tenant' }) },
    user: {
      findFirst: async () => ({
        id: 7,
        role: 'USERMASTER',
        isSystemMaster: false,
        isActive: true,
        deactivatedAt: null,
        createdAt: now,
        sellerDistributionMode: 'normal',
        sellerDistributionPausedUntil: null,
        sellerDistributionDailyLimitOverride: 20,
      }),
      findUnique: async () => ({ isSystemMaster: false }),
    },
    userTeamPolicy: { findUnique: async () => null },
    radarAutoDistributionRule: { findFirst: async () => ({ targetStockPerSeller: 20 }) },
    vendasLead: { count: async () => 50 },
    radarLeadCompanyState: { count: async () => 50 },
    authSession: { findFirst: async () => ({ lastSeenAt: now }) },
    companyCommercialUsageLog: { create: async () => ({}), count: async () => 0, findFirst: async () => null },
  };
  const service = new CommercialUsageLimitsService(prisma as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.seller, false);
  assert.equal(snapshot.unlimited, true);
  assert.equal(snapshot.code, null);
});

test('LEI DO DONO 27/06: vendedor SEM teto configurado nasce ILIMITADO (não trava em 20)', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 40,
    activeRadar: 5,
    noDistributionRule: true,
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.seller, true);
  assert.equal(snapshot.unlimited, true);
  assert.equal(snapshot.activeCount, 45);
  // 45 cards ativos e NADA de bloqueio — o teto antigo de 20 não existe mais por padrão
  assert.equal(snapshot.code, null);
  assert.ok(snapshot.availableSlots > 0);
});

test('admin que CONFIGURA teto por vendedor corta o ilimitado (regra de distribuição manda)', async () => {
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 30,
    activeRadar: 0,
    targetStockPerSeller: 25,
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.unlimited, false);
  assert.equal(snapshot.effectiveLimit, 25);
  assert.equal(snapshot.code, 'SELLER_CARD_QUOTA_REACHED');
});

test('VENDAS-REFAB S1: penalidade de inatividade fica OFF por default mesmo com teto explicito e vendedor sumido ha 30 dias', async () => {
  delete process.env.HBX_SELLER_INACTIVITY_PENALTY_ENABLED;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const service = new CommercialUsageLimitsService(buildPrismaMock({
    activeVendas: 5,
    activeRadar: 0,
    targetStockPerSeller: 20,
    lastSeenAt: thirtyDaysAgo,
  }) as any);

  const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

  assert.equal(snapshot.seller, true);
  assert.equal(snapshot.baseLimit, 20);
  assert.equal(snapshot.inactivityPenalty, 0);
  // Sem a env ligada, 30 dias sumido NAO zera/reduz o teto sozinho.
  assert.equal(snapshot.effectiveLimit, 20);
});

test('VENDAS-REFAB S1: penalidade de inatividade só corta o teto quando o admin liga HBX_SELLER_INACTIVITY_PENALTY_ENABLED', async () => {
  process.env.HBX_SELLER_INACTIVITY_PENALTY_ENABLED = 'true';
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const service = new CommercialUsageLimitsService(buildPrismaMock({
      activeVendas: 5,
      activeRadar: 0,
      targetStockPerSeller: 20,
      lastSeenAt: thirtyDaysAgo,
    }) as any);

    const snapshot = await service.getSellerActiveCardQuotaSnapshot(1, 7);

    assert.equal(snapshot.seller, true);
    assert.ok(snapshot.inactivityPenalty > 0);
    assert.ok(snapshot.effectiveLimit < 20);
  } finally {
    delete process.env.HBX_SELLER_INACTIVITY_PENALTY_ENABLED;
  }
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

// R5 (FASE 2 — REMOÇÃO, definitivo): cota count-based (mensal/diária por plano)
// deixou de bloquear — vira só telemetria (`card_import_limit_shadow`). O teto
// real agora é o saldo de crédito (CreditWalletService), gate separado nesta
// mesma chamada (enforceLeadDeliveryDebit) que não faz parte deste cenário.
test('team policy card delivery daily limit no longer blocks import (R5: cota vira telemetria)', async () => {
  const shadowLogs: Array<Record<string, any>> = [];
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
      create: async ({ data }: any) => {
        shadowLogs.push(data);
        return {};
      },
      count: async (args: any) => {
        const eventTypes = args?.where?.eventType?.in || [];
        const userScoped = Number(args?.where?.userId || 0) === 7;
        if (eventTypes.includes('radar_card_claimed')) return userScoped ? 2 : 90;
        return 0;
      },
    },
  } as any);

  const snapshot = await service.assertCanImportCard(1, 7);
  assert.ok(snapshot);
  assert.ok(shadowLogs.some((row) => row.eventType === 'card_import_limit_shadow'));
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

// ─── CRÉDITOS S2 — cobertura do shadow-debit no DONO da baixa ───────────────────────────────────
// Prova que o shadow dispara pelos DOIS métodos que consomem cota (recordCardImport +
// recordCardCommercialUseOnce), cobrindo vendas E radar por construção. O fake creditsService
// registra as chamadas ignorando a flag real (HBX_CREDITS_SHADOW) — o no-op-por-flag já é testado
// em credits.service.test.ts. Aqui o alvo é: o hook FIRA no ponto certo, com a chave certa, 1×.

function buildShadowPrismaMock(existingLogs: Array<Record<string, any>> = []) {
  const logs = [...existingLogs];
  return {
    prisma: {
      company: {
        // getCompanyPlan: sem plano especial -> cai no padrão; timezone default.
        findUnique: async () => ({ selectedPlanKey: 'hbx_padrao', timezone: 'America/Sao_Paulo', companyKind: 'tenant' }),
      },
      // isSystemMaster=true faz getUsageSnapshot devolver snapshot ilimitado ->
      // assertCanImportCard nunca bloqueia (o teste é de COBERTURA do shadow, não de cota).
      user: {
        findUnique: async () => ({ isSystemMaster: true, role: 'USER' }),
        count: async () => 1,
      },
      userTeamPolicy: { findUnique: async () => null },
      authSession: { findFirst: async () => null },
      $queryRawUnsafe: async () => [],
      companyCommercialUsageLog: {
        create: async ({ data }: any) => {
          logs.push(data);
          return { id: `log-${logs.length}`, ...data };
        },
        count: async () => 0,
        // recordCardCommercialUseOnce dedup: acha um log anterior cujo metadataJson contém a
        // substring buscada (`"usageKey":"..."`). Com logs vazio (mock fresco) -> null -> segue.
        findFirst: async ({ where }: any) => {
          const needle = String(where?.metadataJson?.contains || '');
          if (!needle) return null;
          const hit = logs.find((l) => String(l.metadataJson || '').includes(needle));
          return hit ? { id: 'existing' } : null;
        },
      },
    },
    logs,
  };
}

function buildShadowCredits() {
  const calls: Array<{ companyId: number; userId: number | null; leadId: string; actionKey: string }> = [];
  return {
    calls,
    service: {
      recordShadowDebit: async (
        companyId: number,
        userId: number | null,
        input: { leadId: string; actionKey: string },
      ) => {
        calls.push({ companyId, userId, leadId: String(input.leadId), actionKey: input.actionKey });
      },
      // CRÉDITOS R1 — o fake real (CreditsService) sempre expõe isto; aqui simula gate OFF
      // (no-op transparente), que é o comportamento default enquanto HBX_CREDITS_ENFORCE não
      // está ligada. Provado à parte em credits.service.test.ts.
      assertAndDebitLeadDelivery: async () => ({ applied: false, debited: 0 }),
      refundLeadDelivery: async () => ({ refunded: 0 }),
      // FRONTEIRA 07/07: default não-conta-de-crédito (empresa paga) — só relevante quando a
      // cota de plano estoura; os testes de shadow usam master (snapshot ilimitado) e nunca chegam lá.
      isCreditsAccountCompany: async () => false,
    } as any,
  };
}

test('shadow-debit: recordCardImport (radar_card_claimed) dispara 1 shadow com leadId canônico', async () => {
  const { prisma } = buildShadowPrismaMock();
  const credits = buildShadowCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'abc-123', status: 'delivered' });

  assert.equal(credits.calls.length, 1);
  assert.equal(credits.calls[0].companyId, 1);
  assert.equal(credits.calls[0].userId, 7);
  assert.equal(credits.calls[0].leadId, 'radar:abc-123');
  assert.equal(credits.calls[0].actionKey, 'lead_delivery');
});

test('shadow-debit: recordCardCommercialUseOnce dispara 1 shadow com a usageKey como leadId', async () => {
  const { prisma } = buildShadowPrismaMock();
  const credits = buildShadowCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await service.recordCardCommercialUseOnce(1, 7, {
    source: 'radar_contact_click',
    usageKey: 'radar:abc-123',
    radarLeadId: 'abc-123',
    status: 'contacted',
  });

  assert.equal(credits.calls.length, 1);
  assert.equal(credits.calls[0].leadId, 'radar:abc-123');
  assert.equal(credits.calls[0].actionKey, 'lead_delivery');
});

test('shadow-debit: import + commercial-use do MESMO lead usam o MESMO leadId canônico (idempotência 1:1)', async () => {
  // recordCardImport passa radarLeadId cru; recordCardCommercialUseOnce passa usageKey radar:<id>.
  // Ambos DEVEM resolver para o mesmo leadId 'radar:abc-123' -> o recordShadowDebit real (idempotente
  // por usageKey) grava 1 só. Aqui provamos que a CHAVE é idêntica nos dois caminhos.
  const importMock = buildShadowPrismaMock();
  const commercialMock = buildShadowPrismaMock();
  const creditsImport = buildShadowCredits();
  const creditsCommercial = buildShadowCredits();

  const svcImport = new CommercialUsageLimitsService(importMock.prisma as any, creditsImport.service);
  const svcCommercial = new CommercialUsageLimitsService(commercialMock.prisma as any, creditsCommercial.service);

  await svcImport.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'abc-123' });
  await svcCommercial.recordCardCommercialUseOnce(1, 7, { source: 'radar_contact_click', usageKey: 'radar:abc-123', radarLeadId: 'abc-123' });

  assert.equal(creditsImport.calls.length, 1);
  assert.equal(creditsCommercial.calls.length, 1);
  assert.equal(creditsImport.calls[0].leadId, creditsCommercial.calls[0].leadId);
  assert.equal(creditsImport.calls[0].leadId, 'radar:abc-123');
});

test('shadow-debit: sem CreditsService injetado (undefined) NÃO quebra recordCardImport', async () => {
  const { prisma } = buildShadowPrismaMock();
  const service = new CommercialUsageLimitsService(prisma as any); // sem 2º arg (opcional)
  await assert.doesNotReject(() =>
    service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'abc-123' }),
  );
});

// ─── FRONTEIRA cota-de-plano × crédito (decisão do dono 07/07) ──────────────────────────────────
// Conta de CRÉDITO (cortesia, modelo grátis) NÃO tem cota de plano; o teto real é o saldo de
// crédito, checado no débito por-lead (enforceLeadDeliveryDebit). Aqui provamos, no ponto de
// integração (recordCardCommercialUseOnce), que:
//   (A) cota de plano ESGOTADA não barra a baixa da conta de crédito — o crédito é quem decide —
//       e o shadow-log de "limite de plano" é PULADO (não confunde a telemetria da conta grátis);
//   (B) o gate de crédito BARRA (fail-closed) mesmo com cota de plano SOBRANDO.
// Empresa PAGA (não-conta-de-crédito) segue com o shadow-log normal (coberto pelo teste R5 acima).

function buildFrontierPrismaMock(input: { cardsExhausted: boolean }) {
  const logs: Array<Record<string, any>> = [];
  const prisma = {
    company: {
      // hbx_lite (cota 880/mês) — plano concreto pra a cota ter um teto finito a estourar.
      findUnique: async () => ({ selectedPlanKey: 'hbx_lite', timezone: 'America/Sao_Paulo', companyKind: 'tenant' }),
    },
    user: {
      // NÃO-master: getUsageSnapshot roda a cota real de plano (não o snapshot ilimitado).
      findUnique: async () => ({ isSystemMaster: false, role: 'USER' }),
      count: async () => 1,
    },
    userTeamPolicy: { findUnique: async () => null },
    authSession: { findFirst: async () => null },
    $queryRawUnsafe: async () => [],
    companyCommercialUsageLog: {
      create: async ({ data }: any) => { logs.push(data); return { id: `log-${logs.length}`, ...data }; },
      // findFirst = dedup do recordCardCommercialUseOnce: sem log anterior -> null -> segue a baixa.
      findFirst: async () => null,
      // Cota de plano ESGOTADA = muitos CARD_SUCCESS no mês; refunds/e-mail/enriquecimento = 0.
      count: async (args: any) => {
        const types = args?.where?.eventType?.in || [];
        if (input.cardsExhausted && types.includes('radar_card_claimed')) return 999999;
        return 0;
      },
    },
  };
  return { prisma, logs };
}

test('FRONTEIRA: conta de crédito com cota de plano ESGOTADA ainda puxa (crédito decide) e o shadow-log de limite é PULADO', async () => {
  const { prisma, logs } = buildFrontierPrismaMock({ cardsExhausted: true });
  const debitCalls: Array<Record<string, any>> = [];
  const credits = {
    isCreditsAccountCompany: async () => true, // é conta de crédito (cortesia)
    assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      debitCalls.push({ companyId, userId, ...i });
      return { applied: true, debited: 1 }; // saldo cobriu -> baixa liberada
    },
    recordShadowDebit: async () => {},
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService(prisma as any, credits);

  const result = await service.recordCardCommercialUseOnce(1, 7, {
    source: 'radar_contact_click', usageKey: 'radar:ct-1', radarLeadId: 'ct-1',
  });

  assert.equal(result.debited, true);
  // Débito de crédito FOI o gate consultado (com a chave canônica do lead).
  assert.equal(debitCalls.length, 1);
  assert.equal(debitCalls[0].leadId, 'radar:ct-1');
  // Cota de plano estourada NÃO gerou ruído: nenhum card_import_limit_shadow p/ conta de crédito.
  assert.equal(logs.some((l) => l.eventType === 'card_import_limit_shadow'), false);
  // Mas a telemetria que NÃO bloqueia segue: tentativa + baixa registradas.
  assert.equal(logs.some((l) => l.eventType === 'card_import_attempt'), true);
  assert.equal(logs.some((l) => l.eventType === 'card_commercial_used'), true);
});

test('FRONTEIRA: gate de crédito BARRA a baixa (fail-closed) mesmo com cota de plano SOBRANDO', async () => {
  const { prisma, logs } = buildFrontierPrismaMock({ cardsExhausted: false }); // cota de plano livre
  const credits = {
    isCreditsAccountCompany: async () => true,
    // Sem saldo -> o gate real (CreditsService) lança ConflictException fail-closed.
    assertAndDebitLeadDelivery: async () => {
      throw new ConflictException({ ok: false, code: 'CREDIT_BALANCE_EXHAUSTED', message: 'Saldo de créditos esgotado.' });
    },
    recordShadowDebit: async () => {},
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService(prisma as any, credits);

  await assert.rejects(
    () => service.recordCardCommercialUseOnce(1, 7, { source: 'radar_contact_click', usageKey: 'radar:ct-2', radarLeadId: 'ct-2' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_BALANCE_EXHAUSTED');
      return true;
    },
  );
  // Fail-closed: a baixa PAROU antes de logar sucesso — nenhum card_commercial_used gravado.
  assert.equal(logs.some((l) => l.eventType === 'card_commercial_used'), false);
});

// ─── CRÉDITOS ATOMICIDADE: reserva ANTES de gravar + estorno (fix "entrega parcial + 409") ───────
// reserveLeadDeliveryCredit debita ANTES de qualquer gravação de card, com a MESMA chave canônica
// do choke real (idempotente), e propaga isBillingAudienceUser (mensagem do dono vs bloqueio
// neutro). Sem saldo LANÇA aqui — nenhum card órfão. releaseLeadDeliveryCredit estorna na falha.

test('reserveLeadDeliveryCredit: sem saldo LANÇA fail-closed (nada é gravado antes do débito)', async () => {
  const credits = {
    assertAndDebitLeadDelivery: async () => {
      throw new ConflictException({ ok: false, code: 'CREDIT_BALANCE_EXHAUSTED', message: 'Saldo de créditos esgotado.' });
    },
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  await assert.rejects(
    () => service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-1', isBillingAudienceUser: true }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_BALANCE_EXHAUSTED');
      return true;
    },
  );
});

test('reserveLeadDeliveryCredit: com saldo devolve {applied,debited} e propaga leadId canônico + audiência', async () => {
  const calls: Array<Record<string, any>> = [];
  const credits = {
    assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      calls.push({ companyId, userId, ...i });
      return { applied: true, debited: 1, balanceAfter: 4 };
    },
    refundLeadDelivery: async () => ({ refunded: 0 }),
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  const result = await service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-2', isBillingAudienceUser: true });
  assert.deepEqual(result, { applied: true, debited: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].leadId, 'radar:ct-2'); // MESMA chave do débito downstream -> idempotente
  assert.equal(calls[0].actionKey, 'lead_delivery');
  assert.equal(calls[0].isBillingAudienceUser, true);
});

test('reserveLeadDeliveryCredit: sem CreditsService (gate indisponível) = no-op {applied:false}, NÃO lança', async () => {
  const service = new CommercialUsageLimitsService({} as any); // sem 2º arg (opcional)
  const result = await service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-3' });
  assert.deepEqual(result, { applied: false, debited: 0 });
});

test('releaseLeadDeliveryCredit: estorna pela MESMA usageKey; sem CreditsService é no-op silencioso', async () => {
  const refunds: Array<Record<string, any>> = [];
  const credits = {
    assertAndDebitLeadDelivery: async () => ({ applied: true, debited: 1 }),
    refundLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
      refunds.push({ companyId, userId, ...i });
      return { refunded: 1 };
    },
  } as any;
  const service = new CommercialUsageLimitsService({} as any, credits);
  await service.releaseLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-2' });
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].leadId, 'radar:ct-2');
  assert.equal(refunds[0].actionKey, 'lead_delivery');

  // Sem CreditsService injetado: não lança, não faz nada.
  const bare = new CommercialUsageLimitsService({} as any);
  await assert.doesNotReject(() => bare.releaseLeadDeliveryCredit(1, 7, { usageKey: 'radar:ct-9' }));
});

// ─── GUARDRAILS S3 (10/07) — teto DIÁRIO de entregas por empresa (anti-scraper) ──────────────────
// Roda no MESMO choke do débito real (enforceLeadDeliveryDebit via recordCardImport /
// reserveLeadDeliveryCredit), ANTES do débito — bloqueia MESMO com saldo sobrando. Config lida por
// SQL cru numa query só (override da empresa + default global via LEFT-subselect); qualquer erro
// nessa leitura OU na contagem é fail-open (nunca derruba a venda por bug do guardrail).

function buildDailyCapPrismaMock(input: {
  isSystemMaster?: boolean;
  companyKind?: string;
  companyName?: string;
  override?: number | null;
  globalDefault?: number | null;
  deliveredTodayCount?: number;
  existingUsageKeys?: string[];
  queryRawThrows?: boolean;
  countThrows?: boolean;
} = {}) {
  const createdLogs: Array<Record<string, any>> = [];
  return {
    prisma: {
      company: {
        findUnique: async () => ({
          selectedPlanKey: 'hbx_padrao',
          timezone: 'America/Sao_Paulo',
          companyKind: input.companyKind || 'tenant',
        }),
      },
      user: {
        findUnique: async () => ({ isSystemMaster: Boolean(input.isSystemMaster) }),
      },
      userTeamPolicy: { findUnique: async () => null },
      $queryRawUnsafe: async () => {
        if (input.queryRawThrows) throw new Error('boom: coluna ainda nao migrada');
        return [{
          companyKind: input.companyKind || 'tenant',
          companyName: input.companyName ?? 'Empresa Teste',
          override: input.override === undefined ? null : input.override,
          globalDefault: input.globalDefault === undefined ? 500 : input.globalDefault,
        }];
      },
      companyCommercialUsageLog: {
        create: async ({ data }: any) => {
          createdLogs.push(data);
          return { id: `log-${createdLogs.length}`, ...data };
        },
        findFirst: async ({ where }: any) => {
          const needle = String(where?.metadataJson?.contains || '');
          if (!needle) return null;
          const hit = (input.existingUsageKeys || []).some((key) => needle.includes(`"usageKey":"${key}"`));
          return hit ? { id: 'existing' } : null;
        },
        count: async () => {
          if (input.countThrows) throw new Error('boom: banco fora do ar');
          return input.deliveredTodayCount ?? 0;
        },
      },
    },
    createdLogs,
  };
}

function buildDailyCapCredits() {
  const debitCalls: Array<Record<string, any>> = [];
  return {
    debitCalls,
    service: {
      assertAndDebitLeadDelivery: async (companyId: number, userId: number | null, i: any) => {
        debitCalls.push({ companyId, userId, ...i });
        return { applied: true, debited: 1 };
      },
      recordShadowDebit: async () => {},
      refundLeadDelivery: async () => ({ refunded: 0 }),
      isCreditsAccountCompany: async () => false,
    } as any,
  };
}

test('GUARDRAILS S3 (1): 4a entrega do dia com cap=3 lanca DAILY_DELIVERY_CAP_REACHED MESMO com saldo (débito nunca chamado)', async () => {
  const { prisma } = buildDailyCapPrismaMock({ globalDefault: 3, deliveredTodayCount: 3 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.rejects(
    () => service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-4', isBillingAudienceUser: true }),
    (error: any) => {
      assert.equal(error?.response?.code, 'DAILY_DELIVERY_CAP_REACHED');
      return true;
    },
  );
  // O bloqueio aconteceu ANTES do débito de crédito — saldo sobrando não importa.
  assert.equal(credits.debitCalls.length, 0);
});

test('GUARDRAILS S3 (2): override por empresa VENCE o default global', async () => {
  // Global folgado (100) mas override apertado (2) — a 3a entrega já bloqueia pelo override.
  const { prisma } = buildDailyCapPrismaMock({ override: 2, globalDefault: 100, deliveredTodayCount: 2 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.rejects(
    () => service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-3' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'DAILY_DELIVERY_CAP_REACHED');
      return true;
    },
  );
  assert.equal(credits.debitCalls.length, 0);
});

test('GUARDRAILS S3 (3): override = 0 significa SEM teto (mesmo com contagem gigante)', async () => {
  const { prisma } = buildDailyCapPrismaMock({ override: 0, globalDefault: 5, deliveredTodayCount: 999 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.doesNotReject(() =>
    service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-1000' }),
  );
  assert.equal(credits.debitCalls.length, 1);
});

test('GUARDRAILS S3 (4): erro simulado na contagem de hoje -> FAIL-OPEN (entrega segue, débito chamado)', async () => {
  const { prisma } = buildDailyCapPrismaMock({ globalDefault: 3, countThrows: true });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.doesNotReject(() =>
    service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-x' }),
  );
  assert.equal(credits.debitCalls.length, 1);
});

test('GUARDRAILS S3 (5): vendedor recebe MENSAGEM NEUTRA (mesmo code, sem citar teto/credito)', async () => {
  const { prisma } = buildDailyCapPrismaMock({ globalDefault: 3, deliveredTodayCount: 3 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.rejects(
    // isBillingAudienceUser OMITIDO -> LEI DO VENDEDOR: bloqueio neutro.
    () => service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-4' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'DAILY_DELIVERY_CAP_REACHED');
      assert.equal(error?.response?.message, 'Acesso pausado pela administracao da conta.');
      return true;
    },
  );
});

test('GUARDRAILS S3 (6): lead JÁ entregue hoje (idempotente) re-tentado NÃO é bloqueado pelo cap', async () => {
  // Cap já ESTOURADO (3/3), mas a usageKey desta tentativa é a MESMA de uma das 3 já contadas —
  // um retry (rede/duplo-clique) não pode ser barrado por um cap que ele mesmo já compõe.
  const { prisma } = buildDailyCapPrismaMock({
    globalDefault: 3,
    deliveredTodayCount: 3,
    existingUsageKeys: ['radar:lead-1'],
  });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.doesNotReject(() =>
    service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-1' }),
  );
  assert.equal(credits.debitCalls.length, 1);
});

test('GUARDRAILS S3: bypass isSystemMaster — nunca é capado mesmo com cap estourado', async () => {
  const { prisma } = buildDailyCapPrismaMock({ isSystemMaster: true, globalDefault: 1, deliveredTodayCount: 999 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.doesNotReject(() =>
    service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-master' }),
  );
});

test('GUARDRAILS S3: flag HBX_DELIVERY_DAILY_CAP_ENABLED=false desliga o guardrail inteiro', async () => {
  const { prisma } = buildDailyCapPrismaMock({ globalDefault: 1, deliveredTodayCount: 999 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  const prev = process.env.HBX_DELIVERY_DAILY_CAP_ENABLED;
  process.env.HBX_DELIVERY_DAILY_CAP_ENABLED = 'false';
  try {
    await assert.doesNotReject(() =>
      service.recordCardImport(1, 7, { source: 'radar_claim', radarLeadId: 'lead-flag-off' }),
    );
  } finally {
    if (prev === undefined) delete process.env.HBX_DELIVERY_DAILY_CAP_ENABLED;
    else process.env.HBX_DELIVERY_DAILY_CAP_ENABLED = prev;
  }
});

// Segundo choke (reserveLeadDeliveryCredit — reserva atômica do Radar->Vendas) também aplica o
// MESMO teto: prova que os "MESMOS 2 chokes" do R1 estão cobertos, não só recordCardImport.
test('GUARDRAILS S3: reserveLeadDeliveryCredit (outro choke) também aplica o teto diário', async () => {
  const { prisma } = buildDailyCapPrismaMock({ globalDefault: 2, deliveredTodayCount: 2 });
  const credits = buildDailyCapCredits();
  const service = new CommercialUsageLimitsService(prisma as any, credits.service);

  await assert.rejects(
    () => service.reserveLeadDeliveryCredit(1, 7, { usageKey: 'radar:lead-9', isBillingAudienceUser: true }),
    (error: any) => {
      assert.equal(error?.response?.code, 'DAILY_DELIVERY_CAP_REACHED');
      return true;
    },
  );
  assert.equal(credits.debitCalls.length, 0);
});
