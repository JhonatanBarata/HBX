import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import {
  assertEffectiveTeamAccess,
  hasEffectiveTeamAccess,
  resolveEffectiveTeamAccess,
  resolveProductsAccessContext,
  resolveVendasAccessContext,
  __getEffectiveTeamAccessResolveCount,
  __resetEffectiveTeamAccessResolveCount,
} from './team-access-runtime';
import { TEAM_ACCESS_CATALOG } from './team-access-catalog';
import {
  resolveTeamPolicySubjectKind,
  serializeTeamPolicyModuleAndAccessRows,
} from './team-policy-persistence';

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

test('resolveTeamPolicySubjectKind maps tenant USERMASTER to company_admin', () => {
  assert.equal(
    resolveTeamPolicySubjectKind({ role: 'USERMASTER', isSystemMaster: false }),
    'company_admin',
  );
  // system master continua system_master; ADMIN e USER intactos
  assert.equal(
    resolveTeamPolicySubjectKind({ role: 'USERMASTER', isSystemMaster: true }),
    'system_master',
  );
  assert.equal(resolveTeamPolicySubjectKind({ role: 'ADMIN' }), 'company_admin');
  assert.equal(resolveTeamPolicySubjectKind({ role: 'USER' }), 'common_seller');
});

test('tenant USERMASTER (dono/admin) sees the whole company funnel by default', async () => {
  const owner = buildUser({
    id: 5,
    role: 'USERMASTER',
    isSystemMaster: false,
    company: { id: 1, name: 'Cliente A', companyKind: 'tenant' },
  });
  const prisma = buildPrisma({
    user: owner,
    policy: buildPolicy({ userId: 5 }),
  });

  const context = await resolveVendasAccessContext(prisma as any, owner);

  // Regressao do bug "minha vendedora tem leads e eu nao": o dono recebe os
  // defaults de admin (nao mais de vendedor).
  assert.equal(context.subjectKind, 'company_admin');
  assert.equal(context.isAdmin, true);
  assert.equal(context.canViewCompanyCards, true);
  assert.equal(context.canViewOwnCards, true);
});

test('tenant USER keeps seller isolation (only own cards) — company scope is admin-only', async () => {
  const seller = buildUser();
  const context = await resolveVendasAccessContext(buildPrisma({ user: seller }) as any, seller);

  // Isolamento do vendedor preservado: NAO ganha visao de empresa por engano.
  assert.equal(context.subjectKind, 'common_seller');
  assert.equal(context.isSeller, true);
  assert.equal(context.canViewOwnCards, true);
  assert.equal(context.canViewCompanyCards, false);
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

test('RBAC Sprint 1: GERENTE (ADMIN) com team.users.create=false e bloqueado', async () => {
  const gerente = buildUser({ id: 30, role: 'ADMIN' });
  const prisma = buildPrisma({
    user: gerente,
    policy: buildPolicy({
      userId: 30,
      access: { 'team.users.create': false },
    }),
  });

  await assert.rejects(
    () => assertEffectiveTeamAccess(prisma as any, gerente, 'team.users.create'),
    ForbiddenException,
  );
  // outras chaves de gestao seguem no default do admin (true)
  assert.equal(await hasEffectiveTeamAccess(prisma as any, gerente, 'team.users.delete'), true);
});

test('RBAC Sprint 1: ADMIN sem bloqueio explicito passa nas 4 team.users.* (default admin)', async () => {
  const admin = buildUser({ id: 31, role: 'ADMIN' });
  const prisma = buildPrisma({
    user: admin,
    policy: buildPolicy({ userId: 31 }),
  });
  for (const key of ['team.users.create', 'team.users.edit', 'team.users.disable', 'team.users.delete']) {
    assert.equal(await hasEffectiveTeamAccess(prisma as any, admin, key), true, `admin default para ${key}`);
  }
});

test('RBAC Sprint 1: SYSTEM MASTER nunca e bloqueado mesmo com politica false', async () => {
  const master = buildUser({
    id: 1,
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: 99,
    company: { id: 99, name: 'HBX Plataforma', companyKind: 'platform_infra' },
  });
  // Mesmo que exista uma politica com false, o master nao tem policy row real;
  // aqui simulamos policy=null (comportamento de producao para master).
  const prisma = buildPrisma({
    user: master,
    policy: null,
  });
  for (const key of ['team.users.create', 'radar.cards.distribute', 'radar.distribution.manage']) {
    assert.equal(await hasEffectiveTeamAccess(prisma as any, master, key), true, `master nunca bloqueado em ${key}`);
    await assertEffectiveTeamAccess(prisma as any, master, key); // nao lanca
  }
});

test('RBAC Sprint 1: radar.cards.distribute=false bloqueia inclusive ADMIN via runtime', async () => {
  const gerente = buildUser({ id: 32, role: 'ADMIN' });
  const prisma = buildPrisma({
    user: gerente,
    policy: buildPolicy({
      userId: 32,
      access: { 'radar.cards.distribute': false, 'radar.distribution.manage': false },
    }),
  });
  await assert.rejects(
    () => assertEffectiveTeamAccess(prisma as any, gerente, 'radar.cards.distribute'),
    ForbiddenException,
  );
  await assert.rejects(
    () => assertEffectiveTeamAccess(prisma as any, gerente, 'radar.distribution.manage'),
    ForbiddenException,
  );
});

// RBAC Sprint 3 — instrumentação: prisma que conta as leituras de política.
function buildCountingPrisma(input: {
  user?: any;
  policy?: any;
} = {}) {
  const counts = { userFindUnique: 0, policyFindUnique: 0, total: 0 };
  const base = buildPrisma(input);
  const wrapped = {
    ...base,
    user: {
      findUnique: async (...args: any[]) => {
        counts.userFindUnique += 1;
        counts.total += 1;
        return (base.user.findUnique as any)(...args);
      },
    },
    userTeamPolicy: {
      findUnique: async (...args: any[]) => {
        counts.policyFindUnique += 1;
        counts.total += 1;
        return (base.userTeamPolicy.findUnique as any)(...args);
      },
    },
  };
  return { prisma: wrapped, counts };
}

test('RBAC Sprint 3: cache por request colapsa o Vendas para 1 resolve (mede queries antes/depois)', async () => {
  const user = buildUser({ id: 77 });

  // ANTES (baseline sem cache): cada chamada re-executa o resolve → N× as queries.
  // Simulamos com prismas DISTINTOS (cache MISS proposital) para medir o custo cru.
  __resetEffectiveTeamAccessResolveCount();
  const c1 = buildCountingPrisma({ user, policy: buildPolicy({ userId: 77 }) });
  const c2 = buildCountingPrisma({ user, policy: buildPolicy({ userId: 77 }) });
  const c3 = buildCountingPrisma({ user, policy: buildPolicy({ userId: 77 }) });
  await resolveVendasAccessContext(c1.prisma as any, user);
  await hasEffectiveTeamAccess(c2.prisma as any, user, 'vendas.cards.edit');
  await assertEffectiveTeamAccess(c3.prisma as any, user, 'vendas.access');
  const baselineResolves = __getEffectiveTeamAccessResolveCount();
  const baselineQueries = c1.counts.total + c2.counts.total + c3.counts.total;
  assert.equal(baselineResolves, 3, 'sem cache: 1 resolve por chamada');
  assert.ok(baselineQueries >= 6, `sem cache: 2 queries x 3 chamadas = ${baselineQueries}`);

  // DEPOIS (com cache por request): MESMO prisma (singleton do request) + MESMO
  // user (req.user) → 1 único resolve; as chamadas seguintes leem o cache.
  __resetEffectiveTeamAccessResolveCount();
  const req = buildCountingPrisma({ user, policy: buildPolicy({ userId: 77 }) });
  await resolveVendasAccessContext(req.prisma as any, user);
  await hasEffectiveTeamAccess(req.prisma as any, user, 'vendas.cards.edit');
  await assertEffectiveTeamAccess(req.prisma as any, user, 'vendas.access');
  await resolveVendasAccessContext(req.prisma as any, user);
  const cachedResolves = __getEffectiveTeamAccessResolveCount();
  assert.equal(cachedResolves, 1, 'com cache: 1 resolve para o request inteiro');
  assert.equal(req.counts.userFindUnique, 1, 'com cache: 1 hydrateUser por request');
  assert.equal(req.counts.policyFindUnique, 1, 'com cache: 1 loadUserTeamPolicy por request');
});

test('RBAC Sprint 3: cache nao vaza entre users nem entre prismas diferentes', async () => {
  __resetEffectiveTeamAccessResolveCount();
  const userA = buildUser({ id: 91 });
  const userB = buildUser({ id: 92 });
  const prismaA = buildPrisma({ user: userA, policy: buildPolicy({ userId: 91 }) });
  const prismaB = buildPrisma({ user: userB, policy: buildPolicy({ userId: 92 }) });

  // users distintos → 1 resolve cada (nao compartilham entrada de cache).
  await resolveEffectiveTeamAccess(prismaA as any, userA);
  await resolveEffectiveTeamAccess(prismaB as any, userB);
  assert.equal(__getEffectiveTeamAccessResolveCount(), 2);

  // mesmo user, OUTRO prisma (outro estado de banco) → cache MISS de proposito.
  const prismaA2 = buildPrisma({
    user: userA,
    policy: buildPolicy({ userId: 91, access: { 'vendas.cards.viewCompany': true } }),
  });
  const before = await resolveVendasAccessContext(prismaA as any, userA);
  const after = await resolveVendasAccessContext(prismaA2 as any, userA);
  assert.equal(before.canViewCompanyCards, false, 'estado 1 preservado');
  assert.equal(after.canViewCompanyCards, true, 'estado 2 (outro prisma) nao vem do cache velho');
});

test('catalog marks products and tenant communication enforcement honestly', () => {
  const byKey = new Map(TEAM_ACCESS_CATALOG.map((item) => [item.key, item]));

  assert.equal(byKey.get('commission.viewInherited')?.backendEnforced, false);
  assert.equal(byKey.get('communication.support.contactAdmin')?.backendEnforced, false);
  assert.equal(byKey.get('communication.email.useCompanyReplyTo')?.backendEnforced, true);
  assert.equal(byKey.get('communication.support.viewCompanySupportChannels')?.backendEnforced, true);
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
