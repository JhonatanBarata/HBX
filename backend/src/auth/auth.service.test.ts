import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service';
import { sanitizeUser } from './profile.controller';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';

const DAY_MS = 24 * 60 * 60 * 1000;

function inDays(days: number) {
  return new Date(Date.now() + days * DAY_MS);
}

function buildAuthServiceForLogin(
  companySnapshot: any,
  options: { systemMaster?: boolean; role?: string; teamPolicy?: any } = {},
) {
  const companyFindUniqueCalls: any[] = [];
  const signedPayloads: any[] = [];
  const systemMaster = Boolean(options.systemMaster);
  const role = options.role || (systemMaster ? 'USERMASTER' : 'ADMIN');
  const prisma = {
    company: {
      findUnique: async (args: any) => {
        companyFindUniqueCalls.push(args);
        return companySnapshot;
      },
    },
    userTeamPolicy: {
      findUnique: async () => options.teamPolicy ?? null,
    },
    $transaction: async (callback: any) => callback({
      authSession: {
        updateMany: async () => ({ count: 1 }),
        create: async () => ({ id: 'session_1' }),
      },
      user: {
        update: async (args: any) => {
          if (args?.select) {
            return {
              id: 10,
              email: 'dono@cliente.test',
              companyId: systemMaster ? null : 77,
              role,
              isSystemMaster: systemMaster,
              sessionVersion: 4,
            };
          }
          return { id: 10 };
        },
      },
    }),
  };
  const jwtService = {
    sign: (payload: any) => {
      signedPayloads.push(payload);
      return 'signed-token';
    },
  };
  const service = new AuthService({} as any, jwtService as any, prisma as any, {} as any, {} as any, {} as any);
  return { service, companyFindUniqueCalls, signedPayloads };
}

async function loginAsAdmin(service: AuthService) {
  return service.login({
    id: 10,
    email: 'dono@cliente.test',
    role: 'ADMIN',
    isSystemMaster: false,
    companyId: 77,
  });
}

async function loginAsSeller(service: AuthService) {
  return service.login({
    id: 11,
    email: 'vendedor@cliente.test',
    role: 'USER',
    isSystemMaster: false,
    companyId: 77,
  });
}

test('System Master sem contexto assumido entra no master puro e nao vira empresa operacional comercial', async () => {
  const { service, companyFindUniqueCalls, signedPayloads } = buildAuthServiceForLogin(null, { systemMaster: true });

  const result = await service.login({
    id: 10,
    email: 'master@hbx.local',
    role: 'USERMASTER',
    isSystemMaster: true,
    companyId: null,
  });

  assert.equal(result.next, '/dashboard/master');
  assert.equal(result.requiresCheckout, false);
  assert.equal(companyFindUniqueCalls.length, 0);
  assert.equal(signedPayloads[0].companyId, undefined);

  const currentUser = sanitizeUser({
    id: 10,
    username: 'master',
    email: 'master@hbx.local',
    role: 'USERMASTER',
    isSystemMaster: true,
    company: null,
  });
  assert.equal(currentUser?.userKind, 'system_master');
  assert.equal(currentUser?.company, null);
  assert.equal(currentUser?.masterContext.active, false);
  assert.equal(currentUser?.masterContext.mode, 'master_puro');
});

test('login de tenant manual premium legado (sem stored status) segue fluxo normal', async () => {
  const { service, companyFindUniqueCalls } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    isActive: true,
    onboardingStatus: 'active_paid',
    subscriptionStatus: 'manual',
    paymentStatus: 'MANUAL',
    premiumAccess: true,
    trialEndsAt: null,
  });

  const result = await loginAsAdmin(service);

  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
  assert.equal(companyFindUniqueCalls.length, 1);
  assert.equal(companyFindUniqueCalls[0].where.id, 77);
  assert.equal(Object.prototype.hasOwnProperty.call(companyFindUniqueCalls[0].select, 'slug'), false);
});

// Gate canonico (PR-002 C.1b): o destino pos-login e projecao do estado unico.
test('gate de login: trial vigente entra direto no dashboard', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'trial',
    isActive: true,
    trialEndsAt: inDays(10),
  });
  const result = await loginAsAdmin(service);
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
});

test('gate de login: trial vencido cai no pre-checkout com motivo trial_expired', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'trial',
    isActive: true,
    trialEndsAt: inDays(-1),
  });
  const result = await loginAsAdmin(service);
  assert.equal(result.next, '/pre-checkout?reason=trial_expired');
  assert.equal(result.requiresCheckout, true);
});

test('gate de login: pending_checkout cai no pre-checkout com motivo pending_checkout', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'pending_checkout',
    isActive: false,
  });
  const result = await loginAsAdmin(service);
  assert.equal(result.next, '/pre-checkout?reason=pending_checkout');
  assert.equal(result.requiresCheckout, true);
});

test('gate de login: overdue dentro da graca mantem acesso', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'overdue',
    isActive: true,
    billingGraceEndsAt: inDays(3),
  });
  const result = await loginAsAdmin(service);
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
});

test('gate de login: overdue sem graca e suspended caem em payment_failed', async () => {
  for (const status of ['overdue', 'suspended']) {
    const { service } = buildAuthServiceForLogin({
      companyKind: 'tenant',
      status,
      isActive: false,
    });
    const result = await loginAsAdmin(service);
    assert.equal(result.next, '/pre-checkout?reason=payment_failed');
    assert.equal(result.requiresCheckout, true);
  }
});

// Gate do vendedor (PR-002 D.2/D.4): login cai direto em Vendas e nunca
// recebe destino nem flag de cobranca — empresa irregular vira tela neutra.
test('gate de login: vendedor com empresa regular cai direto em Vendas', async () => {
  const { service } = buildAuthServiceForLogin(
    {
      companyKind: 'tenant',
      status: 'trial',
      isActive: true,
      trialEndsAt: inDays(10),
    },
    { role: 'USER' },
  );
  const result = await loginAsSeller(service);
  assert.equal(result.next, '/vendas');
  assert.equal(result.requiresCheckout, false);
});

test('gate de login: vendedor de empresa irregular NAO vai para pre-checkout', async () => {
  for (const status of ['pending_checkout', 'overdue', 'suspended']) {
    const { service } = buildAuthServiceForLogin(
      {
        companyKind: 'tenant',
        status,
        isActive: false,
      },
      { role: 'USER' },
    );
    const result = await loginAsSeller(service);
    assert.equal(result.next, '/vendas');
    assert.equal(result.requiresCheckout, false, `vendedor nao recebe requiresCheckout em ${status}`);
  }
});

test('gate de login: vendedor com vendas.access negado na policy cai no dashboard', async () => {
  const { service } = buildAuthServiceForLogin(
    {
      companyKind: 'tenant',
      status: 'trial',
      isActive: true,
      trialEndsAt: inDays(10),
    },
    {
      role: 'USER',
      teamPolicy: {
        id: 'policy-11',
        userId: 11,
        companyId: 77,
        status: 'active',
        subjectKind: 'common_seller',
        modulesJson: JSON.stringify([{ key: 'vendas.access', allowed: false }]),
        requiredChannelsJson: '{}',
      },
    },
  );
  const result = await loginAsSeller(service);
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
});

// Vazamento de cobranca (PR-002 D.4): sanitizeUser corta status de pagamento,
// graca, plano/preco e datas de trial para role USER; accessReleased fica.
test('sanitizeUser: vendedor recebe payload de empresa sem campos de cobranca', () => {
  const company = {
    id: 77,
    name: 'Cliente A',
    companyKind: 'tenant',
    isActive: true,
    status: 'trial',
    onboardingStatus: 'active_trial',
    paymentStatus: 'TRIAL',
    subscriptionStatus: 'trialing',
    premiumAccess: false,
    selectedPlanKey: 'hbx_padrao',
    trialStartsAt: new Date(),
    trialEndsAt: inDays(10),
    billingGraceEndsAt: null,
    billingGraceReason: null,
    subscriptionCurrentPeriodEnd: null,
    plan: { id: 1, name: 'Plano X', price: 199, features: [] },
  };

  const seller = sanitizeUser({ id: 11, username: 'vendedor', role: 'USER', isSystemMaster: false, company });
  assert.equal(seller?.company?.accessReleased, true);
  assert.equal(seller?.company?.accessState, null);
  assert.equal(seller?.company?.paymentStatus, null);
  assert.equal(seller?.company?.subscriptionStatus, null);
  assert.equal(seller?.company?.premiumAccess, null);
  assert.equal(seller?.company?.selectedPlanKey, null);
  assert.equal(seller?.company?.trialEndsAt, null);
  assert.equal(seller?.company?.trialRemainingDays, null);
  assert.equal(seller?.company?.billingGraceReason, null);
  assert.equal(seller?.company?.plan, null);

  const admin = sanitizeUser({ id: 10, username: 'dono', role: 'ADMIN', isSystemMaster: false, company });
  assert.equal(admin?.company?.accessState, 'trial');
  assert.equal(admin?.company?.paymentStatus, 'TRIAL');
  assert.equal(admin?.company?.plan?.price, 199);
});

// Maquina de cadastro nativa (PR-002 C.1): a confirmacao de e-mail inicia o
// trial direto a partir do perfil coletado no cadastro.
function buildTrialActivationTx(company: any) {
  const companyUpdates: any[] = [];
  const entitlementUpserts: any[] = [];
  const trialPhoneWrites: any[] = [];
  const tx = {
    company: {
      findUnique: async () => company,
      update: async (args: any) => {
        companyUpdates.push(args.data);
        return { id: 7, ...args.data };
      },
    },
    trialPhoneUsage: {
      findUnique: async () => null,
      update: async (args: any) => {
        trialPhoneWrites.push(args.data);
        return args.data;
      },
      create: async (args: any) => {
        trialPhoneWrites.push(args.data);
        return args.data;
      },
    },
    systemModule: { findMany: async () => [] },
    companyModule: {
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
    },
    companyCommercialEntitlement: {
      upsert: async (args: any) => {
        entitlementUpserts.push(args);
        return {};
      },
    },
  };
  return { tx, companyUpdates, entitlementUpserts, trialPhoneWrites };
}

function buildBareAuthService() {
  return new AuthService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
}

test('confirmacao inicia trial nativo: status trial, sem premiumAccess, 14 dias do catalogo', async () => {
  const service = buildBareAuthService();
  const { tx, companyUpdates, entitlementUpserts, trialPhoneWrites } = buildTrialActivationTx({
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
    trialModuleSelection: 'vendas',
    primaryContactName: 'Dono Teste',
    contactPhone: '19999990000',
    taxDocument: '52998224725',
  });

  const activatedAt = new Date();
  const trialEndsAt = await service.activateConfirmedTrialTx(tx, 7, activatedAt);

  assert.ok(trialEndsAt instanceof Date);
  assert.equal(Math.round((trialEndsAt.getTime() - activatedAt.getTime()) / DAY_MS), 14);
  const update = companyUpdates.find((data) => data.status === 'trial');
  assert.ok(update, 'esperava escrita nativa de status trial');
  assert.equal(update.premiumAccess, false);
  assert.equal(update.isActive, true);
  assert.equal(update.subscriptionStatus, 'trialing');
  assert.equal(update.statusChangedAt, activatedAt);
  assert.ok(entitlementUpserts.length > 0);
  assert.ok(entitlementUpserts.every((args) => args.update.status === 'trialing'));
  assert.equal(trialPhoneWrites.length, 1);
});

test('cadastro antigo sem telefone nao trava a confirmacao: degrada para pending_checkout', async () => {
  const service = buildBareAuthService();
  const { tx, companyUpdates, entitlementUpserts } = buildTrialActivationTx({
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
    trialModuleSelection: 'vendas',
    primaryContactName: 'Dono Teste',
    contactPhone: null,
    taxDocument: null,
  });

  const trialEndsAt = await service.activateConfirmedTrialTx(tx, 7, new Date());

  assert.equal(trialEndsAt, null);
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0].status, 'pending_checkout');
  assert.equal(companyUpdates[0].premiumAccess, false);
  assert.equal(companyUpdates[0].isActive, false);
  assert.ok(entitlementUpserts.length > 0);
  assert.ok(entitlementUpserts.every((args) => ['pending_checkout', 'canceled'].includes(args.update.status)));
});

test('plano sem trial (List) confirma e segue direto para o checkout', async () => {
  const service = buildBareAuthService();
  const { tx, companyUpdates } = buildTrialActivationTx({
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
    trialModuleSelection: null,
    primaryContactName: 'Dono Teste',
    contactPhone: '19999990000',
    taxDocument: '52998224725',
  });

  const trialEndsAt = await service.activateConfirmedTrialTx(tx, 7, new Date());

  assert.equal(trialEndsAt, null);
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0].status, 'pending_checkout');
});
