import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { TeamPolicyService } from './team-policy.service';

// S8/A2 — "so passa o que tem": gerente/admin-capado so concede chave de
// acesso (patch.access/accessMap) que ELE MESMO tem (grant ⊆ granter).
// Dono/master sao raiz (concedem tudo, sem interseção). DESLIGAR (false) e
// sempre livre. Cobre tambem T2 — canViewBilling so editavel por dono/master
// (aqui apenas a trava LOCAL do updatePolicy; a trava de superficie HTTP fica
// em users.controller.ts:updateRole, coberta a parte).

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

// requesterTeamPolicy: policy PERSISTIDA do concedente (requester), usada por
// resolveGranterAccessMap via loadUserTeamPolicyRuntime(requester.id).
function createService(input: {
  requester?: Record<string, any>;
  requesterTeamPolicy?: Record<string, any> | null;
  user?: Record<string, any>;
} = {}) {
  const state = {
    user: buildUser(input.user || {}),
    requesterTeamPolicy: input.requesterTeamPolicy === undefined ? null : input.requesterTeamPolicy,
    modules: [
      { key: 'vendas', name: 'Vendas', userAllowed: true, accessible: true, visible: true },
      { key: 'webscraping', name: 'Radar', userAllowed: true, accessible: true, visible: true },
      { key: 'atendimento', name: 'Atendimento', userAllowed: true, accessible: true, visible: true },
    ],
    rawSqlCalls: [] as Array<{ strings: string[]; values: any[] }>,
    moduleUpdateCalls: [] as any[],
  };

  const requesterId = Number(input.requester?.id || 0);

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
      // findUnique e chamado tanto p/ o TARGET (via findTargetUser) quanto p/
      // o REQUESTER (via resolveGranterAccessMap / assertCanManage). Como o
      // teste usa userId diferentes, decide pelo `where.userId`.
      findUnique: async (args: any) => {
        const whereUserId = Number(args?.where?.userId || 0);
        if (whereUserId && whereUserId === requesterId && whereUserId !== Number(state.user.id)) {
          return state.requesterTeamPolicy ? { ...state.requesterTeamPolicy } : null;
        }
        return { ...state.user.teamPolicy };
      },
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

  const service = new TeamPolicyService(prisma as any, modulesService as any);
  const requester = input.requester || {
    id: 1,
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: 1,
    company: { id: 1, slug: 'cliente-a', companyKind: 'tenant' },
  };
  return { service, state, requester };
}

// Gerente = ADMIN + canViewBilling=false (access/actor-kind.ts). Requester
// distinto do target (id 22 concede para o usuario 7).
function gerenteRequester(overrides: Record<string, any> = {}) {
  return {
    id: 22,
    role: 'ADMIN',
    isSystemMaster: false,
    canViewBilling: false,
    companyId: 1,
    company: { id: 1, slug: 'cliente-a', companyKind: 'tenant' },
    ...overrides,
  };
}

function donoRequester(overrides: Record<string, any> = {}) {
  return {
    id: 22,
    role: 'ADMIN',
    isSystemMaster: false,
    canViewBilling: true,
    companyId: 1,
    company: { id: 1, slug: 'cliente-a', companyKind: 'tenant' },
    ...overrides,
  };
}

// Caso 1 — gerente concede chave que TEM -> passa.
test('gerente concede chave de acesso que TEM -> passa (subset ok)', async () => {
  const requester = gerenteRequester();
  const { service, state } = createService({
    requester,
    // gerente tem vendas.cards.edit (default admin do catálogo = true)
    requesterTeamPolicy: null,
  });

  const result = await service.updatePolicy(requester, 7, {
    access: { 'vendas.cards.edit': true },
  } as any);

  assert.equal(result.effectiveAccessMap['vendas.cards.edit'], true);
  const rows = JSON.parse(state.user.teamPolicy.modulesJson);
  assert.equal(rows.some((row: any) => row.key === 'vendas.cards.edit' && row.allowed === true), true);
});

// Caso 2 — gerente concede chave que NÃO tem -> 403 (subset viola).
// team.access.manage fica LIGADO (e a chave que da ao gerente o direito de
// GERIR a policy de terceiros, via assertCanManage) — a chave sob teste e
// commission.markPaid, que o gerente NAO tem (desligada explicitamente).
test('gerente concede chave de acesso que NAO tem -> ForbiddenException', async () => {
  const requester = gerenteRequester();
  const { service, state } = createService({
    requester,
    requesterTeamPolicy: buildStoredPolicy({
      userId: 22,
      companyId: 1,
      modulesJson: JSON.stringify([
        { key: 'team.access.manage', allowed: true },
        { key: 'commission.markPaid', allowed: false },
      ]),
    }),
  });

  await assert.rejects(
    () => service.updatePolicy(requester, 7, {
      access: { 'commission.markPaid': true },
    } as any),
    ForbiddenException,
  );
  // nao persistiu nada (rejeitado antes do write).
  assert.equal(JSON.parse(state.user.teamPolicy.modulesJson).some((row: any) => row.key === 'commission.markPaid'), false);
});

// Caso 3 — gerente DESLIGA chave (mesmo sem ter) -> passa (remover e livre).
// team.access.manage precisa continuar LIGADO na policy do gerente aqui —
// e a chave que assertCanManage exige pra ele poder chamar updatePolicy de
// outro usuario; o que testamos e ele desligando OUTRA chave (commission.markPaid)
// que ele proprio nao possui.
test('gerente desliga chave de acesso mesmo sem ter -> passa (remocao e livre)', async () => {
  const requester = gerenteRequester();
  const { service, state } = createService({
    requester,
    requesterTeamPolicy: buildStoredPolicy({
      userId: 22,
      companyId: 1,
      modulesJson: JSON.stringify([
        { key: 'team.access.manage', allowed: true },
        { key: 'commission.markPaid', allowed: false },
      ]),
    }),
  });

  const result = await service.updatePolicy(requester, 7, {
    access: { 'commission.markPaid': false },
  } as any);

  assert.equal(result.effectiveAccessMap['commission.markPaid'], false);
  const rows = JSON.parse(state.user.teamPolicy.modulesJson);
  assert.equal(rows.some((row: any) => row.key === 'commission.markPaid' && row.allowed === false), true);
});

// Caso 4 — dono concede qualquer chave -> passa (raiz, sem interseção).
test('dono concede qualquer chave de acesso -> passa (raiz, sem interseção)', async () => {
  const requester = donoRequester();
  const { service, state } = createService({
    requester,
    // dono sem policy persistida explicita pra essa chave (nao importa: e raiz).
    requesterTeamPolicy: buildStoredPolicy({
      userId: 22,
      companyId: 1,
      modulesJson: JSON.stringify([{ key: 'radar.distribution.manage', allowed: false }]),
    }),
  });

  const result = await service.updatePolicy(requester, 7, {
    access: { 'radar.distribution.manage': true },
  } as any);

  assert.equal(result.effectiveAccessMap['radar.distribution.manage'], true);
  const rows = JSON.parse(state.user.teamPolicy.modulesJson);
  assert.equal(rows.some((row: any) => row.key === 'radar.distribution.manage' && row.allowed === true), true);
});

// Caso 5 — master -> passa sempre.
test('master concede qualquer chave de acesso -> passa sempre', async () => {
  const { service, state, requester } = createService();

  const result = await service.updatePolicy(requester, 7, {
    access: { 'team.access.manage': true, 'commission.markPaid': true },
  } as any);

  assert.equal(result.effectiveAccessMap['team.access.manage'], true);
  assert.equal(result.effectiveAccessMap['commission.markPaid'], true);
  const rows = JSON.parse(state.user.teamPolicy.modulesJson);
  assert.equal(rows.some((row: any) => row.key === 'commission.markPaid' && row.allowed === true), true);
});

// Caso 6 — gerente tenta canViewBilling=true -> nao existe patch de policy
// para isso (canViewBilling vive em User, fora do escopo do updatePolicy);
// aqui garantimos que o patch.access nao aceita chaves fora do catalogo (o
// campo nao e um TeamAccessKey) e nao vaza para o update. A trava de
// SUPERFICIE HTTP (users.controller.ts updateRole) tem cobertura própria.
test('patch.access nao aceita canViewBilling (nao e chave do catalogo, ignorado)', async () => {
  const requester = gerenteRequester();
  const { service, state } = createService({ requester });

  const result = await service.updatePolicy(requester, 7, {
    access: { canViewBilling: true, 'vendas.cards.edit': true },
  } as any);

  // canViewBilling nao e TeamAccessKey -> normalizeTeamAccessMap descarta;
  // so a chave valida (que o gerente tem por default) passa.
  assert.equal((result.effectiveAccessMap as any).canViewBilling, undefined);
  assert.equal(result.effectiveAccessMap['vendas.cards.edit'], true);
  const rows = JSON.parse(state.user.teamPolicy.modulesJson);
  assert.equal(rows.some((row: any) => row.key === 'canViewBilling'), false);
});

test('gerente com policy persistida parcial: chave sem override cai no default do papel', async () => {
  const requester = gerenteRequester();
  const { service } = createService({
    requester,
    // policy do gerente so tem override explicito p/ radar.distribution.manage;
    // vendas.cards.delete nao tem override -> cai no default de admin (true).
    requesterTeamPolicy: buildStoredPolicy({
      userId: 22,
      companyId: 1,
      modulesJson: JSON.stringify([{ key: 'radar.distribution.manage', allowed: false }]),
    }),
  });

  const result = await service.updatePolicy(requester, 7, {
    access: { 'vendas.cards.delete': true },
  } as any);

  assert.equal(result.effectiveAccessMap['vendas.cards.delete'], true);
});

test('gerente concede mix de chaves com e sem posse -> lista as negadas na mensagem', async () => {
  const requester = gerenteRequester();
  const { service } = createService({
    requester,
    requesterTeamPolicy: buildStoredPolicy({
      userId: 22,
      companyId: 1,
      modulesJson: JSON.stringify([
        { key: 'team.access.manage', allowed: true },
        { key: 'commission.markPaid', allowed: false },
        { key: 'commission.cancel', allowed: false },
      ]),
    }),
  });

  await assert.rejects(
    () => service.updatePolicy(requester, 7, {
      access: {
        'commission.markPaid': true,
        'commission.cancel': true,
        'vendas.cards.edit': true, // este o gerente TEM (default admin)
      },
    } as any),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      const message = (error as ForbiddenException).message;
      assert.ok(message.includes('commission.markPaid'));
      assert.ok(message.includes('commission.cancel'));
      assert.ok(!message.includes('vendas.cards.edit'));
      return true;
    },
  );
});
