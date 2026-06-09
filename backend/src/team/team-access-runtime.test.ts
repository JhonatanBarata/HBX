import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import {
  assertEffectiveTeamAccess,
  hasEffectiveTeamAccess,
  resolveEffectiveTeamAccess,
  resolveProductsAccessContext,
  resolveVendasAccessContext,
} from './team-access-runtime';
import { TEAM_ACCESS_CATALOG } from './team-access-catalog';
import { serializeTeamPolicyModuleAndAccessRows } from './team-policy-persistence';

function buildUser(overrides: Record<string, any> = {}) {
  const company = overrides.company || {
    id: 1,
    name: 'Cliente A',
    companyKind: 'tenant',
  };
  return {
    id: 7,
    companyId: company.id,
    role: 'USER',
    isSystemMaster: false,
    company,
    ...overrides,
  };
}

function buildPolicy(input: {
  userId?: number;
  companyId?: number | null;
  subjectKind?: string | null;
  modules?: Array<{ key: string; allowed: boolean }>;
  access?: Record<string, boolean>;
} = {}) {
  return {
    id: `policy-${input.userId || 7}`,
    userId: input.userId || 7,
    companyId: input.companyId === undefined ? 1 : input.companyId,
    status: 'active',
    subjectKind: input.subjectKind || null,
    modulesJson: serializeTeamPolicyModuleAndAccessRows({
      modules: input.modules || [],
      access: input.access || {},
    }),
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
    requiresLocation: null,
    requiredChannelsJson: '{}',
    visibilityJson: null,
  };
}

function buildPrisma(input: {
  user?: any;
  policy?: any;
  moduleAccesses?: Array<{ key: string; allowed: boolean }>;
} = {}) {
  const user = input.user === undefined ? buildUser() : input.user;
  const policy = input.policy === undefined ? buildPolicy({ userId: Number(user?.id || 7) }) : input.policy;
  const moduleAccesses = input.moduleAccesses || [];

  return {
    user: {
      findUnique: async () => user,
    },
    userTeamPolicy: {
      findUnique: async () => policy,
    },
    userModuleAccess: {
      findMany: async () => moduleAccesses.map((row) => ({
        allowed: row.allowed,
        systemModule: { key: row.key },
      })),
    },
  };
}

test('legacy module access grants runtime action when there is no explicit block', async () => {
  const user = buildUser({ moduleAccesses: undefined });
  const prisma = buildPrisma({
    user,
    policy: buildPolicy({
      modules: [{ key: 'webscraping', allowed: true }],
    }),
  });

  const context = await resolveEffectiveTeamAccess(prisma as any, user);

  assert.equal(context.accessMap['radar.search.run'], true);
  assert.equal(await hasEffectiveTeamAccess(prisma as any, user, 'radar.search.run'), true);
});

test('explicit false blocks legacy module and role defaults', async () => {
  const user = buildUser();
  const prisma = buildPrisma({
    user,
    policy: buildPolicy({
      modules: [{ key: 'vendas', allowed: true }],
      access: { 'vendas.cards.edit': false },
    }),
  });

  const context = await resolveVendasAccessContext(prisma as any, user);

  assert.equal(context.canEditCards, false);
  assert.equal(context.explicitAccessMap['vendas.cards.edit'], false);
  await assert.rejects(
    () => assertEffectiveTeamAccess(prisma as any, user, 'vendas.cards.edit'),
    ForbiddenException,
  );
});

test('USER with explicit vendas.access false cannot resolve Vendas context', async () => {
  const user = buildUser();
  const prisma = buildPrisma({
    user,
    policy: buildPolicy({
      modules: [{ key: 'vendas', allowed: true }],
      access: { 'vendas.access': false },
    }),
  });

  await assert.rejects(
    () => resolveVendasAccessContext(prisma as any, user),
    ForbiddenException,
  );
});

test('USER defaults to own Vendas cards and can be explicitly released for company cards', async () => {
  const user = buildUser();
  const defaultContext = await resolveVendasAccessContext(buildPrisma({ user }) as any, user);

  assert.equal(defaultContext.canViewOwnCards, true);
  assert.equal(defaultContext.canViewCompanyCards, false);
  assert.equal(defaultContext.isSeller, true);
  assert.equal(defaultContext.canSellProducts, true);
  assert.equal(defaultContext.canViewProductPrice, true);
  assert.equal(defaultContext.canApplyProductDiscount, false);
  assert.equal(defaultContext.canChangeProductPrice, false);

  const releasedContext = await resolveVendasAccessContext(buildPrisma({
    user,
    policy: buildPolicy({
      access: { 'vendas.cards.viewCompany': true },
    }),
  }) as any, user);

  assert.equal(releasedContext.canViewCompanyCards, true);
});

test('ADMIN defaults are broad but explicit false remains authoritative', async () => {
  const admin = buildUser({
    id: 22,
    role: 'ADMIN',
  });
  const prisma = buildPrisma({
    user: admin,
    policy: buildPolicy({
      userId: 22,
      access: {
        'vendas.cards.viewCompany': false,
        'vendas.cards.delete': false,
      },
    }),
  });

  const context = await resolveVendasAccessContext(prisma as any, admin);

  assert.equal(context.isAdmin, true);
  assert.equal(context.canViewOwnCards, true);
  assert.equal(context.canViewCompanyCards, false);
  assert.equal(context.canDeleteCards, false);
});

test('System Master without active tenant context cannot operate Vendas', async () => {
  const master = buildUser({
    id: 1,
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: 99,
    company: {
      id: 99,
      name: 'HBX Plataforma',
      companyKind: 'platform_infra',
    },
    masterContext: { active: false },
  });
  const prisma = buildPrisma({
    user: master,
    policy: buildPolicy({ userId: 1, companyId: 99, subjectKind: 'system_master' }),
  });

  await assert.rejects(
    () => resolveVendasAccessContext(prisma as any, master),
    ForbiddenException,
  );
});

test('runtime does not require company slug and normalizes old explicit access keys', async () => {
  const user = buildUser({
    company: {
      id: 1,
      name: 'Cliente sem slug',
      companyKind: 'tenant',
    },
  });
  const prisma = buildPrisma({
    user,
    policy: buildPolicy({
      modules: [{ key: 'vendas', allowed: true }],
      access: {
        'communication.whatsapp.send': false,
      },
    }),
  });

  const context = await resolveVendasAccessContext(prisma as any, user);

  assert.equal(context.companyId, 1);
  assert.equal(context.canSendWhatsappManual, false);
  assert.equal(context.explicitAccessMap['communication.whatsapp.sendManual'], false);
});

test('Products context exposes catalog permissions from role defaults and explicit overrides', async () => {
  const user = buildUser();
  const defaultContext = await resolveProductsAccessContext(buildPrisma({ user }) as any, user);

  assert.equal(defaultContext.companyId, 1);
  assert.equal(defaultContext.canViewProducts, true);
  assert.equal(defaultContext.canSellProducts, true);
  assert.equal(defaultContext.canViewProductPrice, true);
  assert.equal(defaultContext.canEditProducts, false);
  assert.equal(defaultContext.canApplyProductDiscount, false);
  assert.equal(defaultContext.canChangeProductPrice, false);

  const releasedContext = await resolveProductsAccessContext(buildPrisma({
    user,
    policy: buildPolicy({
      access: {
        'products.discount': true,
        'products.changePrice': true,
        'products.viewPrice': false,
      },
    }),
  }) as any, user);

  assert.equal(releasedContext.canApplyProductDiscount, true);
  assert.equal(releasedContext.canChangeProductPrice, true);
  assert.equal(releasedContext.canViewProductPrice, false);
});

test('products module access grants only base catalog operations', async () => {
  const user = buildUser();
  const prisma = buildPrisma({
    user,
    policy: buildPolicy({
      modules: [{ key: 'products', allowed: true }],
      access: {
        'products.view': false,
        'products.sell': false,
        'products.viewPrice': false,
      },
    }),
  });

  const context = await resolveProductsAccessContext(prisma as any, user);

  assert.equal(context.moduleAccessMap['products.view'], true);
  assert.equal(context.moduleAccessMap['products.sell'], true);
  assert.equal(context.moduleAccessMap['products.viewPrice'], true);
  assert.equal(context.canViewProducts, false);
  assert.equal(context.canSellProducts, false);
  assert.equal(context.canViewProductPrice, false);
  assert.equal(context.canEditProducts, false);
});

test('System Master without active tenant context cannot operate Products', async () => {
  const master = buildUser({
    id: 1,
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: 99,
    company: {
      id: 99,
      name: 'HBX Plataforma',
      companyKind: 'platform_infra',
    },
    masterContext: { active: false },
  });
  const prisma = buildPrisma({
    user: master,
    policy: buildPolicy({ userId: 1, companyId: 99, subjectKind: 'system_master' }),
  });

  await assert.rejects(
    () => resolveProductsAccessContext(prisma as any, master),
    ForbiddenException,
  );
});

test('catalog marks products enforced and commission.viewInherited pending', () => {
  const byKey = new Map(TEAM_ACCESS_CATALOG.map((item) => [item.key, item]));

  assert.equal(byKey.get('commission.viewInherited')?.backendEnforced, false);
  for (const key of [
    'products.view',
    'products.sell',
    'products.edit',
    'products.discount',
    'products.viewPrice',
    'products.changePrice',
  ]) {
    assert.equal(byKey.get(key)?.backendEnforced, true);
  }
});
