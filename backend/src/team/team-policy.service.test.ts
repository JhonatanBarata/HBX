import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamPolicyService } from './team-policy.service';

function buildStoredPolicy(overrides: Record<string, any> = {}) {
  return {
    id: 'policy-7',
    userId: 7,
    companyId: 1,
    presetId: null,
    source: 'legacy_backfill',
    commissionPercent: 20,
    commissionDueBusinessDays: 3,
    canRegisterHbxSellers: false,
    sellerReferralCommissionPercent: 0,
    referredByUserId: null,
    referredByCommissionPercentSnapshot: 0,
    modulesJson: JSON.stringify([
      { key: 'vendas', allowed: true },
      { key: 'webscraping', allowed: true },
      { key: 'atendimento', allowed: true },
    ]),
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
    visibilityJson: null,
    preset: null,
    referredByUser: null,
    ...overrides,
  };
}

function buildUser(overrides: Record<string, any> = {}) {
  const company = overrides.company || {
    id: 1,
    name: 'Cliente A',
    slug: 'cliente-a',
    companyKind: 'tenant',
    selectedPlanKey: null,
    commissionDueBusinessDays: 3,
    timezone: 'America/Sao_Paulo',
  };
  return {
    id: 7,
    companyId: company.id,
    role: 'USER',
    isSystemMaster: false,
    isActive: true,
    deactivatedAt: null,
    name: 'Vendedor',
    email: 'seller@cliente.test',
    username: 'seller-cliente',
    commissionPercent: 20,
    canRegisterHbxSellers: false,
    sellerReferralCommissionPercent: 0,
    referredByUserId: null,
    referredByCommissionPercentSnapshot: 0,
    sellerDistributionDailyLimitOverride: null,
    company,
    teamPolicy: buildStoredPolicy({ companyId: company.id }),
    referredByUser: null,
    moduleAccesses: [
      { allowed: true, systemModule: { key: 'vendas' } },
      { allowed: true, systemModule: { key: 'webscraping' } },
      { allowed: true, systemModule: { key: 'atendimento' } },
    ],
    ...overrides,
  };
}

function buildUsageSnapshot(overrides: Record<string, any> = {}) {
  return {
    dailyResetAt: '2026-06-08T03:00:00.000Z',
    resetAt: '2026-07-01T03:00:00.000Z',
    enrichment: {
      dailyLimit: 30,
      dailyUsed: 4,
      dailyRemaining: 26,
    },
    cards: {
      dailySafetyLimit: 30,
      dailyUsed: 3,
      dailyRemaining: 27,
      monthlyLimit: 250,
      monthlyUsed: 40,
      monthlyRemaining: 210,
    },
    ...overrides,
  };
}

function createService(input: {
  requester?: Record<string, any>;
  user?: Record<string, any>;
  usage?: Record<string, any>;
} = {}) {
  const state = {
    user: buildUser(input.user || {}),
    modules: [
      { key: 'vendas', name: 'Vendas', userAllowed: true, accessible: true, visible: true },
      { key: 'webscraping', name: 'Radar', userAllowed: true, accessible: true, visible: true },
      { key: 'atendimento', name: 'Atendimento', userAllowed: true, accessible: true, visible: true },
    ],
    rawSqlCalls: [] as Array<{ strings: string[]; values: any[] }>,
    moduleUpdateCalls: [] as any[],
  };

  const prisma = {
    user: {
      findUnique: async () => state.user,
      findFirst: async () => null,
      update: async (args: any) => {
        state.user = { ...state.user, ...args.data };
        return state.user;
      },
    },
    userTeamPolicy: {
      findUnique: async () => ({ id: state.user.teamPolicy.id }),
      update: async (args: any) => {
        state.user.teamPolicy = { ...state.user.teamPolicy, ...args.data };
        return state.user.teamPolicy;
      },
      upsert: async (args: any) => {
        state.user.teamPolicy = { ...state.user.teamPolicy, ...args.create, ...args.update };
        return state.user.teamPolicy;
      },
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      state.rawSqlCalls.push({ strings: Array.from(strings), values });
      return {};
    },
  };

  const modulesService = {
    listMyModules: async () => state.modules,
    updateCompanyUserModuleAccess: async (_adminUserId: number, _targetUserId: number, permissions: Array<{ key: string; allowed: boolean }>) => {
      state.moduleUpdateCalls.push(permissions);
      state.modules = state.modules.map((moduleItem) => {
        const permission = permissions.find((item) => item.key === moduleItem.key);
        return permission ? { ...moduleItem, userAllowed: Boolean(permission.allowed), accessible: Boolean(permission.allowed), visible: Boolean(permission.allowed) } : moduleItem;
      });
      return { ok: true };
    },
  };

  const commercialUsageLimits = {
    getUsageSnapshot: async () => buildUsageSnapshot(input.usage || {}),
    getSellerActiveCardQuotaSnapshot: async () => ({
      seller: true,
      effectiveLimit: 30,
      activeCount: 9,
      availableSlots: 21,
    }),
  };

  const service = new TeamPolicyService(prisma as any, modulesService as any, commercialUsageLimits as any);
  const requester = input.requester || {
    id: 1,
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: 1,
    company: { id: 1, slug: 'cliente-a', companyKind: 'tenant' },
  };
  return { service, state, requester };
}

function findSqlCall(state: ReturnType<typeof createService>['state'], tableName: string) {
  return state.rawSqlCalls.find((call) => call.strings.join(' ').includes(`"${tableName}"`));
}

function findMetadata(call: { values: any[] }) {
  const raw = call.values.find((value) => typeof value === 'string' && value.includes('"before"'));
  assert.equal(typeof raw, 'string');
  return JSON.parse(raw as string);
}

test('MASTER resolves unlimited team policy and writes team/master audit logs', async () => {
  const { service, state, requester } = createService();

  const result = await service.updatePolicy(requester, 7, {
    modules: [
      { key: 'vendas', allowed: true },
      { key: 'webscraping', allowed: true },
      { key: 'atendimento', allowed: false },
    ],
    limits: {
      enrichmentDaily: { mode: 'unlimited', value: 'unlimited' },
    },
    audit: {
      batch: true,
      batchId: 'batch-1',
      sourceUserId: 7,
    },
  } as any);

  assert.equal(result.limits.enrichmentDaily.mode, 'unlimited');
  assert.equal(state.user.sellerDistributionDailyLimitOverride, 0);
  assert.equal(state.user.teamPolicy.enrichmentDailyMode, 'unlimited');
  assert.equal(state.user.teamPolicy.enrichmentDailyLimit, null);
  assert.equal(result.modules.find((moduleItem) => moduleItem.key === 'atendimento')?.allowed, false);

  const teamAudit = findSqlCall(state, 'TeamPolicyAuditLog');
  const masterAudit = findSqlCall(state, 'MasterSupportAuditLog');
  assert.ok(teamAudit);
  assert.ok(masterAudit);

  const metadata = findMetadata(teamAudit!);
  assert.equal(metadata.actor.userId, requester.id);
  assert.equal(metadata.companyId, 1);
  assert.equal(metadata.targetUserId, 7);
  assert.equal(metadata.batch, true);
  assert.deepEqual(metadata.modulesChanged, ['atendimento']);
  assert.deepEqual(metadata.limitsChanged, ['enrichmentDaily']);
  assert.equal(metadata.before.modules.atendimento, true);
  assert.equal(metadata.after.modules.atendimento, false);
});

test('ADMIN can edit tenant seller policy inside current plan cap', async () => {
  const { service } = createService({
    requester: {
      id: 22,
      role: 'ADMIN',
      isSystemMaster: false,
      companyId: 1,
      company: { id: 1, slug: 'cliente-a', companyKind: 'tenant' },
    },
  });

  const result = await service.updatePolicy({ id: 22, role: 'ADMIN', isSystemMaster: false, companyId: 1 }, 7, {
    limits: { enrichmentDaily: { mode: 'limited', value: 20 } },
  } as any);

  assert.equal(result.limits.enrichmentDaily.value, 20);
});

test('policy update persists seller visibility and keeps system visibility derived', async () => {
  const { service, state, requester } = createService();

  const result = await service.updatePolicy(requester, 7, {
    visibility: {
      sellerCanViewOwnPolicy: true,
      sellerCanViewCommission: false,
      sellerCanViewSellerNetwork: true,
      sellerCanViewLimits: false,
      adminCanEditLegacyFields: false,
      masterCanUseUnlimited: false,
    },
  } as any);

  assert.equal(result.visibility.sellerCanViewOwnPolicy, true);
  assert.equal(result.visibility.sellerCanViewCommission, false);
  assert.equal(result.visibility.sellerCanViewSellerNetwork, true);
  assert.equal(result.visibility.sellerCanViewLimits, false);
  assert.equal(result.visibility.adminCanEditLegacyFields, true);
  assert.equal(result.visibility.masterCanUseUnlimited, true);
  assert.deepEqual(JSON.parse(state.user.teamPolicy.visibilityJson), {
    sellerCanViewOwnPolicy: true,
    sellerCanViewCommission: false,
    sellerCanViewSellerNetwork: true,
    sellerCanViewLimits: false,
  });

  const teamAudit = findSqlCall(state, 'TeamPolicyAuditLog');
  assert.ok(teamAudit);
  const metadata = findMetadata(teamAudit!);
  assert.equal(metadata.patch.hasVisibility, true);
  assert.equal(metadata.diff.visibilityChanged, true);
});

test('ADMIN cannot set individual enrichment above current plan cap', async () => {
  const company = {
    id: 10,
    name: 'Cliente A',
    slug: 'cliente-a',
    companyKind: 'tenant',
    selectedPlanKey: 'hbx_lite',
    commissionDueBusinessDays: 3,
    timezone: 'America/Sao_Paulo',
  };
  const { service } = createService({
    requester: {
      id: 22,
      role: 'ADMIN',
      isSystemMaster: false,
      companyId: 10,
      company,
    },
    user: {
      company,
      companyId: 10,
      teamPolicy: buildStoredPolicy({ companyId: 10, requiresLocation: null }),
    },
  });

  await assert.rejects(
    () => service.updatePolicy({ id: 22, role: 'ADMIN', isSystemMaster: false, companyId: 10 }, 7, {
      limits: { enrichmentDaily: { mode: 'limited', value: 250 } },
    } as any),
    BadRequestException,
  );
});

test('policy update refuses USERMASTER target, including batch payload', async () => {
  const { service, requester } = createService({
    user: {
      id: 99,
      role: 'USERMASTER',
      isSystemMaster: true,
      companyId: 1,
      teamPolicy: buildStoredPolicy({
        userId: 99,
        subjectKind: 'system_master',
      }),
    },
  });

  await assert.rejects(
    () => service.updatePolicy(requester, 99, {
      modules: [{ key: 'vendas', allowed: false }],
      audit: { batch: true, batchId: 'batch-master' },
    } as any),
    ForbiddenException,
  );
});

test('company ADMIN cannot update user from another company', async () => {
  const company = {
    id: 20,
    name: 'Cliente B',
    slug: 'cliente-b',
    selectedPlanKey: 'hbx_padrao',
    commissionDueBusinessDays: 3,
    timezone: 'America/Sao_Paulo',
  };
  const { service } = createService({
    user: {
      company,
      companyId: 20,
      teamPolicy: buildStoredPolicy({ companyId: 20, requiresLocation: null }),
    },
  });

  await assert.rejects(
    () => service.updatePolicy({ id: 22, role: 'ADMIN', isSystemMaster: false, companyId: 10 }, 7, {
      modules: [{ key: 'atendimento', allowed: false }],
    } as any),
    ForbiddenException,
  );
});
