import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { sanitizeUser } from './profile.controller';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';

const DAY_MS = 24 * 60 * 60 * 1000;

// CRÉDITOS (cutover 06/07) — a chavinha vive no .env local (HBX_CREDITS_ENABLED=true) e vaza pro
// processo de teste. A maioria destes testes cobre o caminho LEGADO (pending_checkout); zerar a
// flag antes de CADA teste os deixa determinísticos independente do ambiente. O teste do caminho
// novo (courtesy do modelo grátis) liga a flag localmente e restaura no fim.
beforeEach(() => { delete process.env.HBX_CREDITS_ENABLED; });

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
  const service = new AuthService({} as any, jwtService as any, prisma as any, {} as any, {} as any, {} as any, {} as any);
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

  assert.equal(result.next, '/master');
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

test('bootstrap do System Master preserva sessao ativa quando usuario ja esta correto', async () => {
  const previousEnv = {
    BOOTSTRAP_SYSTEM_MASTER: process.env.BOOTSTRAP_SYSTEM_MASTER,
    SYSTEM_MASTER_USERNAME: process.env.SYSTEM_MASTER_USERNAME,
    SYSTEM_MASTER_PASSWORD: process.env.SYSTEM_MASTER_PASSWORD,
    SYSTEM_MASTER_EMAIL: process.env.SYSTEM_MASTER_EMAIL,
  };
  process.env.BOOTSTRAP_SYSTEM_MASTER = 'true';
  process.env.SYSTEM_MASTER_USERNAME = 'Jhonatan';
  process.env.SYSTEM_MASTER_PASSWORD = 'master-secret';
  delete process.env.SYSTEM_MASTER_EMAIL;

  const revocationCalls: any[] = [];
  const userUpdateData: any[] = [];
  const existingPassword = await bcrypt.hash('master-secret', 4);
  const tx = {
    authSession: {
      updateMany: async (args: any) => {
        revocationCalls.push(args);
        return { count: 1 };
      },
    },
    user: {
      update: async (args: any) => {
        userUpdateData.push(args.data);
        return { id: 35 };
      },
      create: async () => {
        throw new Error('nao deveria criar master existente');
      },
    },
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 35,
        password: existingPassword,
        name: 'Jhonatan',
        companyId: null,
        role: 'USERMASTER',
        isSystemMaster: true,
        isActive: true,
        currentSessionId: 'sessao_ativa',
      }),
      updateMany: async () => ({ count: 0 }),
    },
    userTeamPolicy: {
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (input: any) => (
      typeof input === 'function' ? input(tx) : Promise.all(input)
    ),
  };

  try {
    const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any, {} as any, {} as any) as any;
    await service.ensureSystemMasterUser();

    assert.equal(revocationCalls.length, 0);
    assert.equal(userUpdateData.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(userUpdateData[0], 'currentSessionId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(userUpdateData[0], 'sessionVersion'), false);
  } finally {
    for (const key of Object.keys(previousEnv) as Array<keyof typeof previousEnv>) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('login do System Master substitui a propria sessao ativa no mesmo cliente', async () => {
  const password = await bcrypt.hash('master-secret', 4);
  const authSessionFinds: any[] = [];
  const revokedSessions: any[] = [];
  const createdSessions: any[] = [];
  const usersService = {
    findByLoginIdentifier: async () => ({
      id: 35,
      username: 'Jhonatan',
      email: 'master@hbx.local',
      password,
      role: 'USERMASTER',
      isSystemMaster: true,
      isActive: true,
      companyId: null,
      currentSessionId: 'sessao_ativa',
      sessionVersion: 9,
    }),
  };
  let service: AuthService;
  const prisma = {
    authSession: {
      findFirst: async (args: any) => {
        authSessionFinds.push(args);
        return {
          id: 'sessao_ativa',
          createdAt: new Date(),
          lastSeenAt: new Date(),
          expiresAt: inDays(1),
          userAgent: null,
          ipHash: (service as any).hashIp('127.0.0.1'),
        };
      },
    },
    company: { findUnique: async () => null },
    userTeamPolicy: { findUnique: async () => null },
    $transaction: async (callback: any) => callback({
      authSession: {
        updateMany: async (args: any) => {
          revokedSessions.push(args);
          return { count: 1 };
        },
        create: async (args: any) => {
          createdSessions.push(args);
          return { id: 'sessao_nova' };
        },
      },
      user: {
        update: async (args: any) => {
          if (args?.select) {
            return {
              id: 35,
              email: 'master@hbx.local',
              companyId: null,
              role: 'USERMASTER',
              isSystemMaster: true,
              sessionVersion: 10,
            };
          }
          return { id: 35 };
        },
      },
    }),
  };
  const signedPayloads: any[] = [];
  const jwtService = {
    sign: (payload: any) => {
      signedPayloads.push(payload);
      return 'signed-token';
    },
  };
  const previousMasterUsername = process.env.SYSTEM_MASTER_USERNAME;
  process.env.SYSTEM_MASTER_USERNAME = 'OutroMaster';
  try {
    service = new AuthService(usersService as any, jwtService as any, prisma as any, {} as any, {} as any, {} as any, {} as any);
    const result = await service.loginWithUsername('Jhonatan', 'master-secret', { userAgent: 'Local Browser', ip: '127.0.0.1' });

    assert.equal(result.next, '/master');
    assert.equal(result.access_token, 'signed-token');
    assert.equal(authSessionFinds.length, 1);
    assert.equal(revokedSessions.length, 1);
    assert.equal(createdSessions.length, 1);
    assert.equal(signedPayloads[0].sid, 'sessao_nova');
  } finally {
    if (previousMasterUsername === undefined) delete process.env.SYSTEM_MASTER_USERNAME;
    else process.env.SYSTEM_MASTER_USERNAME = previousMasterUsername;
  }
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

test('gate de login: trial vencido cai no dashboard (bloqueio-gate captura)', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'trial',
    isActive: true,
    trialEndsAt: inDays(-1),
  });
  const result = await loginAsAdmin(service);
  // F8 (19/06): preCheckoutNextPath aponta /dashboard; bloqueio-gate intercepta.
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, true);
});

test('gate de login: pending_checkout cai no dashboard (bloqueio-gate captura)', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    status: 'pending_checkout',
    isActive: false,
  });
  const result = await loginAsAdmin(service);
  // F8 (19/06): preCheckoutNextPath aponta /dashboard; bloqueio-gate intercepta.
  assert.equal(result.next, '/dashboard');
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

test('gate de login: overdue sem graca e suspended caem no dashboard (bloqueio-gate captura)', async () => {
  for (const status of ['overdue', 'suspended']) {
    const { service } = buildAuthServiceForLogin({
      companyKind: 'tenant',
      status,
      isActive: false,
    });
    const result = await loginAsAdmin(service);
    // F8 (19/06): preCheckoutNextPath aponta /dashboard; bloqueio-gate intercepta.
    assert.equal(result.next, '/dashboard');
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
  };

  const seller = sanitizeUser({ id: 11, username: 'vendedor', role: 'USER', isSystemMaster: false, company });
  assert.equal(seller?.company?.accessReleased, true);
  assert.equal(seller?.company?.accessState, null);
  assert.equal(seller?.company?.accessStateLabel, null);
  assert.equal(seller?.company?.selectedPlanKey, null);
  assert.equal(seller?.company?.trialEndsAt, null);
  assert.equal(seller?.company?.trialRemainingDays, null);
  assert.equal(seller?.company?.billingGraceReason, null);

  const admin = sanitizeUser({ id: 10, username: 'dono', role: 'ADMIN', isSystemMaster: false, company });
  assert.equal(admin?.company?.accessState, 'trial');
  assert.equal(admin?.company?.accessStateLabel, 'Trial ativo');
});

// RBAC 03/07: USERMASTER (dono do tenant) e SUPERSET de ADMIN — deve ser tratado
// IDENTICO a ADMIN em sanitizeUser (userKind 'admin', ve cobranca, isAdmin true).
// Antes caia em userKind 'user' (orfao) e herdava comportamento de vendedor.
test('sanitizeUser: USERMASTER (dono) e reconhecido como admin, identico a ADMIN', () => {
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
  };

  const usermaster = sanitizeUser({ id: 9, username: 'dono', role: 'USERMASTER', isSystemMaster: false, company });
  const admin = sanitizeUser({ id: 10, username: 'admin', role: 'ADMIN', isSystemMaster: false, company });

  // Papel: admin, NAO 'user' orfao nem 'seller'.
  assert.equal(usermaster?.userKind, 'admin');
  assert.equal(usermaster?.userKind, admin?.userKind);
  // Ve cobranca (billingAudience), igual ao ADMIN-dono.
  assert.equal(usermaster?.canViewBilling, true);
  assert.equal(usermaster?.company?.accessState, 'trial');
  assert.equal(usermaster?.company?.selectedPlanKey, 'hbx_padrao');
  // sellerProfile.isAdmin true e NAO e vendedor comum.
  assert.equal(usermaster?.sellerProfile?.isAdmin, true);
  assert.equal(usermaster?.sellerProfile?.isCommonSeller, false);
});

// Maquina de cadastro nativa: a confirmacao de e-mail confirma o e-mail e deixa
// a empresa em pending_checkout. O trial EXIGE cartao e so nasce no checkout
// (regra travada do dono 16/06) — nunca na confirmacao.
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
  return new AuthService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
}

test('SEGURANCA: confirmacao de e-mail NAO concede trial sem cartao (vai para pending_checkout)', async () => {
  // Regra travada do dono (16/06): o trial EXIGE cartao. Mesmo o plano Lead
  // (PADRAO, 14 dias) com telefone valido NAO pode ser liberado na confirmacao
  // de e-mail — isso era o furo que vazou pra VPS. O trial so nasce no checkout.
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

  assert.equal(trialEndsAt, null);
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0].status, 'pending_checkout');
  assert.equal(companyUpdates[0].isActive, false);
  assert.equal(companyUpdates[0].trialEndsAt, null);
  // nenhum status 'trial' deve ser escrito na confirmacao.
  assert.equal(companyUpdates.some((data) => data.status === 'trial'), false);
  // sem reserva de trial-phone na confirmacao — o trial (e o anti-abuso) so no checkout.
  assert.equal(trialPhoneWrites.length, 0);
  // DROP: sem espelhos legados na escrita nativa.
  assert.equal('premiumAccess' in companyUpdates[0], false);
  assert.equal('subscriptionStatus' in companyUpdates[0], false);
  assert.equal('paymentStatus' in companyUpdates[0], false);
  assert.equal('onboardingStatus' in companyUpdates[0], false);
  // entitlements ficam pendentes de checkout, nunca 'trialing'.
  assert.ok(entitlementUpserts.length > 0);
  assert.ok(entitlementUpserts.every((args) => ['pending_checkout', 'canceled'].includes(args.update.status)));
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
  assert.equal(companyUpdates[0].isActive, false);
  assert.equal('premiumAccess' in companyUpdates[0], false);
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

test('CRÉDITOS: com a chavinha ON a confirmação ATIVA a conta como courtesy (modelo grátis, sem checkout)', async () => {
  // Cutover 06/07: no modelo grátis, confirmar identidade não vai mais pro checkout — ativa a
  // empresa como `courtesy` PERMANENTE (courtesyEndsAt null → 'exempt' = liberado, módulos default-on
  // pelo kill-switch). NÃO é trial (não reabre o furo 16/06): o limite real é o SALDO de crédito.
  const prev = process.env.HBX_CREDITS_ENABLED;
  process.env.HBX_CREDITS_ENABLED = 'true';
  try {
    const service = buildBareAuthService();
    const { tx, companyUpdates, entitlementUpserts } = buildTrialActivationTx({
      selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
      trialModuleSelection: 'vendas',
      primaryContactName: 'Dono Teste',
      contactPhone: '19999990000',
      taxDocument: '52998224725',
    });

    const trialEndsAt = await service.activateConfirmedTrialTx(tx, 7, new Date());

    assert.equal(trialEndsAt, null);
    assert.equal(companyUpdates.length, 1);
    assert.equal(companyUpdates[0].status, 'courtesy');
    assert.equal(companyUpdates[0].isActive, true);
    assert.equal(companyUpdates[0].courtesyEndsAt, null);
    // modelo grátis NÃO cria entitlements de pending_checkout nem desabilita módulos.
    assert.equal(entitlementUpserts.length, 0);
  } finally {
    if (prev === undefined) delete process.env.HBX_CREDITS_ENABLED;
    else process.env.HBX_CREDITS_ENABLED = prev;
  }
});

// ── F4 (19/06): máquina de estados do onboarding — resume server-side ────────
function buildAuthServiceForResume(userSnapshot: any) {
  const prisma = {
    user: { findUnique: async () => userSnapshot },
  };
  const jwtService = {
    verify: () => ({ sub: userSnapshot?.id ?? 1, purpose: 'email_confirmation_poll' }),
    sign: () => 'signed',
  };
  return new AuthService({} as any, jwtService as any, prisma as any, {} as any, {} as any, {} as any, {} as any);
}

test('resume: e-mail não confirmado → awaiting_email + resendAvailableAt (cooldown 60s)', async () => {
  const sentAt = new Date('2026-06-19T10:00:00.000Z');
  const service = buildAuthServiceForResume({
    id: 5,
    email: 'aguardando@cliente.test',
    emailConfirmedAt: null,
    emailConfirmationSentAt: sentAt,
    company: { companyKind: 'tenant', status: 'pending_checkout', isActive: false, selectedPlanKey: 'hbx_padrao' },
  });

  const r = await service.resolveOnboardingResume('poll-token');

  assert.equal(r.step, 'awaiting_email');
  assert.equal(r.planKey, 'hbx_padrao');
  assert.equal(r.email, 'aguardando@cliente.test');
  assert.equal(r.resendAvailableAt, new Date(sentAt.getTime() + 60_000).toISOString());
});

test('resume: confirmado + pending_checkout → awaiting_payment (sem cooldown)', async () => {
  const service = buildAuthServiceForResume({
    id: 6,
    email: 'pagar@cliente.test',
    emailConfirmedAt: new Date(),
    emailConfirmationSentAt: null,
    company: { companyKind: 'tenant', status: 'pending_checkout', isActive: false, selectedPlanKey: 'hbx_padrao' },
  });

  const r = await service.resolveOnboardingResume('poll-token');

  assert.equal(r.step, 'awaiting_payment');
  assert.equal(r.resendAvailableAt, null);
});

test('resume: confirmado + trial vigente → done', async () => {
  const service = buildAuthServiceForResume({
    id: 7,
    email: 'dentro@cliente.test',
    emailConfirmedAt: new Date(),
    emailConfirmationSentAt: null,
    company: { companyKind: 'tenant', status: 'trial', isActive: true, trialEndsAt: inDays(10), selectedPlanKey: 'hbx_padrao' },
  });

  const r = await service.resolveOnboardingResume('poll-token');

  assert.equal(r.step, 'done');
});

// ── F4 (19/06): login deixou de ser beco ─────────────────────────────────────
function buildAuthServiceForUnconfirmedLogin(passwordHash: string) {
  const usersService = {
    findByLoginIdentifier: async () => ({
      id: 9,
      username: 'dono',
      email: 'dono@cliente.test',
      password: passwordHash,
      role: 'ADMIN',
      isSystemMaster: false,
      isActive: true,
      companyId: 77,
      emailConfirmedAt: null,
      emailConfirmationToken: 'hash-vivo',
      emailConfirmationSentAt: new Date(),
      company: { companyKind: 'tenant', status: 'pending_checkout', isActive: false, selectedPlanKey: 'hbx_padrao' },
    }),
  };
  const jwtService = { sign: () => 'signed', verify: () => ({}) };
  return new AuthService(usersService as any, jwtService as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

test('login no-beco: e-mail pendente + senha CORRETA → resume pro funil (next + step)', async () => {
  const passwordHash = await bcrypt.hash('Segredo123!', 4);
  const service = buildAuthServiceForUnconfirmedLogin(passwordHash);

  await assert.rejects(
    () => service.loginWithUsername('dono@cliente.test', 'Segredo123!'),
    (err: any) => {
      const body = err.getResponse();
      assert.equal(body.code, 'EMAIL_CONFIRMATION_REQUIRED');
      assert.equal(body.next, '/?ver=planos&resume=1');
      assert.equal(body.resume?.step, 'awaiting_email');
      assert.equal(body.resume?.planKey, 'hbx_padrao');
      assert.ok(body.confirmationPollToken);
      return true;
    },
  );
});

test('login no-beco: e-mail pendente + senha ERRADA → genérico (anti-enumeração, sem next/resume)', async () => {
  const passwordHash = await bcrypt.hash('Segredo123!', 4);
  const service = buildAuthServiceForUnconfirmedLogin(passwordHash);

  await assert.rejects(
    () => service.loginWithUsername('dono@cliente.test', 'senha-errada'),
    (err: any) => {
      const body = err.getResponse();
      assert.equal(body.code, 'EMAIL_CONFIRMATION_REQUIRED');
      assert.equal(body.next, undefined);
      assert.equal(body.resume, undefined);
      assert.equal(body.confirmationPollToken, undefined);
      return true;
    },
  );
});
