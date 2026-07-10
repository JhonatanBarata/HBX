import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';
import { sanitizeUser } from './profile.controller';
import { GoogleOAuthDto, SignupDto } from './dto/auth.dto';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';

const DAY_MS = 24 * 60 * 60 * 1000;

// CRÉDITOS (cutover 06/07) — a chavinha vive no .env local (HBX_CREDITS_ENABLED=true) e vaza pro
// processo de teste. A maioria destes testes cobre o caminho LEGADO (pending_checkout); zerar a
// flag antes de CADA teste os deixa determinísticos independente do ambiente. O teste do caminho
// novo (courtesy do modelo grátis) liga a flag localmente e restaura no fim.
//
// MOCK LOCAL (achado 06/07) — só importar AuthService já carrega @prisma/client, que por sua vez
// autocarrega o .env do backend pro process.env (efeito colateral do runtime do Prisma, independente
// de qualquer PrismaService real ser instanciado). O .env local tem NODE_ENV=development +
// PAYMENTS_PROVIDER=mock, então isLocalMockSignupFlow() vira TRUE dentro do processo de teste sem
// nenhum teste ter pedido isso — muda o comportamento real de loginWithUsername (pula o gate de
// sessão ativa e o throw de EMAIL_CONFIRMATION_REQUIRED). Zerar PAYMENTS_PROVIDER antes de CADA
// teste garante que os testes exercitem o mesmo caminho que roda em produção (onde essa combinação
// não existe).
beforeEach(() => {
  delete process.env.HBX_CREDITS_ENABLED;
  delete process.env.PAYMENTS_PROVIDER;
});

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

// Login único sem aviso (07/07/2026): logar substitui a sessão anterior DIRETO,
// mesmo vindo de outro aparelho — sem consultar a sessão ativa nem 409
// SESSION_ALREADY_ACTIVE (o 409 virava atrito com a janela de 30d do session-ttl.ts).
test('login do System Master substitui a sessao ativa direto, sem consulta nem 409', async () => {
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
    // Outro cliente (userAgent/IP diferentes da sessão viva) — antes caía no 409.
    const result = await service.loginWithUsername('Jhonatan', 'master-secret', { userAgent: 'Outro Browser', ip: '10.0.0.9' });

    assert.equal(result.next, '/master');
    assert.equal(result.access_token, 'signed-token');
    assert.equal(authSessionFinds.length, 0);
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

test('gate de login: trial vencido cai no dashboard (bloqueio-gate captura) — conta enterprise', async () => {
  // MASTER-REFAB S6 (10/07 noite): trial só bloqueia conta enterprise — conta credit (default)
  // nunca mais tem trial vivo, lê como ativa. accountType explícito exercita o caminho legado.
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    accountType: 'enterprise',
    status: 'trial',
    isActive: true,
    trialEndsAt: inDays(-1),
  });
  const result = await loginAsAdmin(service);
  // F8 (19/06): preCheckoutNextPath aponta /dashboard; bloqueio-gate intercepta.
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, true);
});

test('gate de login: pending_checkout cai no dashboard (bloqueio-gate captura) — conta enterprise', async () => {
  const { service } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    accountType: 'enterprise',
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
    accountType: 'enterprise',
    status: 'overdue',
    isActive: true,
    billingGraceEndsAt: inDays(3),
  });
  const result = await loginAsAdmin(service);
  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
});

test('gate de login: overdue sem graca e suspended caem no dashboard (bloqueio-gate captura) — conta enterprise', async () => {
  for (const status of ['overdue', 'suspended']) {
    const { service } = buildAuthServiceForLogin({
      companyKind: 'tenant',
      accountType: 'enterprise',
      status,
      isActive: false,
    });
    const result = await loginAsAdmin(service);
    // F8 (19/06): preCheckoutNextPath aponta /dashboard; bloqueio-gate intercepta.
    assert.equal(result.next, '/dashboard');
    assert.equal(result.requiresCheckout, true);
  }
});

test('gate de login: S6 — conta credit NUNCA bloqueia por trial/pending_checkout/overdue legado (só suspensão)', async () => {
  for (const status of ['trial', 'pending_checkout', 'overdue']) {
    const { service } = buildAuthServiceForLogin({
      companyKind: 'tenant',
      accountType: 'credit',
      status,
      isActive: false,
      trialEndsAt: inDays(-1),
    });
    const result = await loginAsAdmin(service);
    assert.equal(result.requiresCheckout, false, `conta credit em status legado "${status}" não deveria exigir checkout`);
  }

  const { service: suspendedService } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    accountType: 'credit',
    status: 'suspended',
    isActive: false,
  });
  const suspendedResult = await loginAsAdmin(suspendedService);
  assert.equal(suspendedResult.requiresCheckout, true); // suspensão é o ÚNICO bloqueio de conta credit
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
    // MASTER-REFAB S6 (10/07 noite): trial só é vocabulário vivo pra conta enterprise — este
    // teste exercita o accessState/accessStateLabel legado, precisa do tipo explícito.
    accountType: 'enterprise',
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
    accountType: 'enterprise', // MASTER-REFAB S6: trial só é vivo pra conta enterprise
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

// OOBE POR CATEGORIA (PR10072026/02, 10/07): modulesPending pergunta as categorias
// ao dono no 1º acesso; ramoPending passa a valer SÓ quando a categoria 'radar'
// foi escolhida (cliente só-logística nunca vê pergunta de ramo).
test('sanitizeUser: modulesPending/ramoPending seguem as categorias de módulo', () => {
  const baseCompany = {
    id: 78,
    name: 'Cliente B',
    companyKind: 'tenant',
    accountType: 'enterprise',
    isActive: true,
    status: 'trial',
    selectedPlanKey: 'hbx_padrao',
    trialStartsAt: new Date(),
    trialEndsAt: inDays(10),
  };

  // Sem categorias escolhidas: portão pergunta categorias; ramo ainda NÃO (espera o radar).
  const semCategorias = sanitizeUser({ id: 20, username: 'dono', role: 'ADMIN', isSystemMaster: false, company: baseCompany });
  assert.equal(semCategorias?.modulesPending, true);
  assert.equal(semCategorias?.ramoPending, false);
  assert.deepEqual(semCategorias?.company?.moduleCategories, []);

  // Radar escolhido + sem ramo salvo: categorias resolvidas, ramo pendente.
  const comRadar = sanitizeUser({
    id: 20, username: 'dono', role: 'ADMIN', isSystemMaster: false,
    company: { ...baseCompany, moduleCategoriesJson: ['radar', 'vendas'] },
  });
  assert.equal(comRadar?.modulesPending, false);
  assert.equal(comRadar?.ramoPending, true);
  assert.deepEqual(comRadar?.company?.moduleCategories, ['radar', 'vendas']);

  // Só-logística: nunca vê pergunta de ramo. (JSON em string também é aceito.)
  const soLogistica = sanitizeUser({
    id: 20, username: 'dono', role: 'ADMIN', isSystemMaster: false,
    company: { ...baseCompany, moduleCategoriesJson: JSON.stringify(['logistica']) },
  });
  assert.equal(soLogistica?.modulesPending, false);
  assert.equal(soLogistica?.ramoPending, false);

  // Vendedor nunca responde OOBE de dono.
  const vendedor = sanitizeUser({ id: 21, username: 'v', role: 'USER', isSystemMaster: false, company: baseCompany });
  assert.equal(vendedor?.modulesPending, false);
  assert.equal(vendedor?.ramoPending, false);
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

test('CRÉDITOS: com a chavinha ON a confirmação ATIVA a conta direto (accountType credit, sem checkout)', async () => {
  // Cutover 06/07 + MASTER-REFAB S6 (10/07 noite): no modelo grátis, confirmar identidade não vai
  // mais pro checkout — ativa a empresa como `active` (era `courtesy`; cortesia morreu como
  // conceito de conta — accountType nasce 'credit' pelo default da coluna, nada a escrever aqui).
  // Lê como 'exempt' (liberado, módulos default-on pelo kill-switch). NÃO é trial (não reabre o
  // furo 16/06): o limite real é o SALDO de crédito.
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
    assert.equal(companyUpdates[0].status, 'active');
    assert.equal(companyUpdates[0].isActive, true);
    assert.equal(companyUpdates[0].courtesyEndsAt, null);
    // não escreve accountType — o default 'credit' da coluna já cobre (S6, escrita explícita
    // só existe no wizard master, que cria 'enterprise').
    assert.equal('accountType' in companyUpdates[0], false);
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

test('resume: confirmado + pending_checkout → awaiting_payment (sem cooldown) — conta enterprise', async () => {
  // MASTER-REFAB S6 (10/07 noite): pending_checkout só barra conta enterprise (a exceção
  // montada pelo master, ainda aguardando configuração de cobrança) — conta credit (default)
  // nunca fica presa em pending_checkout.
  const service = buildAuthServiceForResume({
    id: 6,
    email: 'pagar@cliente.test',
    emailConfirmedAt: new Date(),
    emailConfirmationSentAt: null,
    company: { companyKind: 'tenant', accountType: 'enterprise', status: 'pending_checkout', isActive: false, selectedPlanKey: 'hbx_padrao' },
  });

  const r = await service.resolveOnboardingResume('poll-token');

  assert.equal(r.step, 'awaiting_payment');
  assert.equal(r.resendAvailableAt, null);
});

test('resume: confirmado + conta credit em pending_checkout legado → done (S6: nunca fica presa)', async () => {
  const service = buildAuthServiceForResume({
    id: 60,
    email: 'gratis@cliente.test',
    emailConfirmedAt: new Date(),
    emailConfirmationSentAt: null,
    company: { companyKind: 'tenant', accountType: 'credit', status: 'pending_checkout', isActive: false, selectedPlanKey: null },
  });

  const r = await service.resolveOnboardingResume('poll-token');

  assert.equal(r.step, 'done');
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

// ── FIX-SEG (07/07): login não vaza existência de usuário ────────────────────
function buildAuthServiceForCredCheck(userSnapshot: any) {
  const usersService = {
    findByLoginIdentifier: async () => userSnapshot,
  };
  const jwtService = { sign: () => 'signed', verify: () => ({}) };
  return new AuthService(usersService as any, jwtService as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

test('SEGURANCA: usuário inexistente e senha errada retornam o MESMO 401 genérico (anti-enumeração)', async () => {
  const passwordHash = await bcrypt.hash('Segredo123!', 4);

  // (a) usuário inexistente — antes era NotFound('Usuário inexistente') (vazava
  // que a conta não existe + respondia mais rápido por não rodar bcrypt).
  const svcMissing = buildAuthServiceForCredCheck(null);
  let missingErr: any;
  await assert.rejects(
    () => svcMissing.loginWithUsername('naoexiste@cliente.test', 'qualquer-senha'),
    (err: any) => { missingErr = err; return true; },
  );

  // (b) usuário existe, senha errada — antes era 'Senha incorreta' (mensagem
  // distinta → dava pra enumerar login válido comparando as respostas).
  const svcWrongPass = buildAuthServiceForCredCheck({
    id: 9,
    username: 'dono',
    email: 'dono@cliente.test',
    password: passwordHash,
    role: 'ADMIN',
    isSystemMaster: false,
    isActive: true,
    companyId: 77,
    emailConfirmedAt: new Date(),
    emailConfirmationToken: null,
    company: { companyKind: 'tenant', status: 'trial', isActive: true },
  });
  let wrongErr: any;
  await assert.rejects(
    () => svcWrongPass.loginWithUsername('dono@cliente.test', 'senha-errada'),
    (err: any) => { wrongErr = err; return true; },
  );

  // MESMO status HTTP e MESMA resposta — os dois caminhos ficam indistinguíveis.
  assert.equal(missingErr.getStatus(), 401);
  assert.equal(wrongErr.getStatus(), 401);
  assert.equal(missingErr.getResponse().message, 'Usuário ou senha inválidos');
  assert.equal(wrongErr.getResponse().message, 'Usuário ou senha inválidos');
  assert.deepEqual(missingErr.getResponse(), wrongErr.getResponse());
});

// ============================================================================
// W7 (tenant-guard P1.1, 10/07) — logout era o hit real "User.updateMany unscoped"
// nos logs de prod (tenants 37 e 5). O update fixa a PRÓPRIA linha por PK do JWT
// (cross-tenant impossível) e precisa rodar sob withoutTenantScope: escopar por
// companyId quebraria o master (linha companyId NULL + store com empresa assumida).
// ============================================================================
test('logout em request de tenant: user.updateMany roda sob bypass explícito do tenant-guard', async () => {
  const { runWithTenantContext, getTenantScopeBypassReason } = await import('../prisma/tenant-context');
  const capturas: Array<{ where: any; bypassReason: string | null }> = [];
  const prisma = {
    $transaction: async (callback: any) => callback({
      authSession: {
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        updateMany: async (args: any) => {
          capturas.push({ where: args?.where, bypassReason: getTenantScopeBypassReason() });
          return { count: 1 };
        },
      },
    }),
  };
  const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any, {} as any, {} as any);

  const result = await runWithTenantContext({ companyId: 37 }, () =>
    service.logoutCurrentSession({ id: 10, sessionId: 'sess_1', companyId: 37 }),
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(capturas.length, 1);
  // Comportamento intacto: continua condicionado à sessão atual, sem companyId no where.
  assert.deepEqual(capturas[0].where, { id: 10, currentSessionId: 'sess_1' });
  // O que mudou: a query roda com o bypass consciente ativo (guard loga o motivo e passa).
  assert.ok(capturas[0].bypassReason, 'logout rodou SEM o bypass do tenant-guard');
});

// ============================================================================
// P0.2 (PR10072026 W1) — SIGNUP NEUTRO: o plano morreu na porta de entrada.
// Empresa pública (e-mail E Google) nasce sem selectedPlanKey, sem
// trialModuleSelection e sem NENHUM post-it de CompanyModule (módulo vem do
// default/kill-switch do master). selectedPlanKey no payload é aceito-e-IGNORADO.
// ============================================================================
function buildAuthServiceForNeutralSignup() {
  const companyCreates: any[] = [];
  const companyModuleWrites: any[] = [];
  const systemModuleFinds: any[] = [];
  const entitlementUpserts: any[] = [];
  let createdCompanyId = 0;
  const tx = {
    company: {
      findFirst: async () => null,
      create: async (args: any) => {
        companyCreates.push(args.data);
        createdCompanyId = 900 + companyCreates.length;
        return { id: createdCompanyId, ...args.data };
      },
      update: async (args: any) => ({ id: args?.where?.id, ...args?.data }),
      findUnique: async () => null,
    },
    user: {
      create: async (args: any) => ({ id: 700, ...args.data }),
      update: async (args: any) => (args?.select
        ? { id: 700, email: 'novo@cliente.test', companyId: createdCompanyId, role: 'ADMIN', isSystemMaster: false, sessionVersion: 2 }
        : { id: 700 }),
    },
    // Semente de produto default: "já existe" → seeding vira no-op sem criar nada.
    product: { findFirst: async () => ({ id: 1 }), create: async () => ({ id: 2 }) },
    systemModule: {
      findMany: async (args: any) => {
        systemModuleFinds.push(args);
        return [];
      },
    },
    companyModule: {
      updateMany: async (args: any) => {
        companyModuleWrites.push({ op: 'updateMany', args });
        return { count: 0 };
      },
      upsert: async (args: any) => {
        companyModuleWrites.push({ op: 'upsert', args });
        return {};
      },
    },
    companyCommercialEntitlement: {
      upsert: async (args: any) => {
        entitlementUpserts.push(args);
        return {};
      },
    },
    authSession: {
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: 'sess_neutro' }),
    },
  };
  const prisma = {
    $transaction: async (input: any) => (typeof input === 'function' ? input(tx) : Promise.all(input)),
    // ensureUserTeamPolicyForUser: user não encontrado → early-return (fora do foco).
    user: { findUnique: async () => null },
    company: {
      findUnique: async () => ({
        companyKind: 'tenant',
        accountType: 'credit',
        status: 'pending_checkout',
        isActive: false,
        trialEndsAt: null,
        billingGraceEndsAt: null,
        courtesyEndsAt: null,
        courtesyReason: null,
      }),
    },
    userTeamPolicy: { findUnique: async () => null },
  };
  const usersService = {
    findByLoginIdentifier: async () => null,
    findByEmail: async () => null,
  };
  const jwtService = { sign: () => 'signed-token' };
  const mail = {
    getConfigurationSummary: () => ({ ready: false, mode: 'log' }),
    sendMail: async () => ({ ok: true, previewUrl: null, errorCode: null, errorMessage: null }),
  };
  const emailTemplates = {
    getTemplateSafe: async () => ({}),
    renderTemplate: () => ({ subject: 'Confirme', text: 'txt', html: '<p>x</p>' }),
  };
  const service = new AuthService(
    usersService as any,
    jwtService as any,
    prisma as any,
    mail as any,
    emailTemplates as any,
    {} as any,
    {} as any,
  );
  return { service, companyCreates, companyModuleWrites, systemModuleFinds, entitlementUpserts };
}

// Campos que definem o nascimento neutro — os MESMOS nos dois fluxos públicos.
const NEUTRAL_BIRTH_KEYS = [
  'selectedPlanKey',
  'trialModuleSelection',
  'assistedSetupRequired',
  'assistedSetupStatus',
  'assistedSetupNote',
  'status',
  'isActive',
] as const;

test('signup e-mail: empresa nasce NEUTRA (plano null, zero CompanyModule) e IGNORA selectedPlanKey de client velho', async () => {
  const { service, companyCreates, companyModuleWrites, systemModuleFinds } = buildAuthServiceForNeutralSignup();

  // Client velho em cache manda plano (e ANTES o hbx_padrao exigiria perfil de
  // trial com acceptedTerms). Cadastro passa e o plano é ignorado.
  const res: any = await service.signup({
    companyName: 'Empresa Neutra',
    name: 'Dono Neutro',
    email: 'novo@cliente.test',
    password: 'Segredo123!',
    selectedPlanKey: 'hbx_padrao' as any,
    trialModuleSelection: 'vendas',
  });

  assert.equal(companyCreates.length, 1);
  assert.equal(companyCreates[0].selectedPlanKey, null);
  assert.equal(companyCreates[0].trialModuleSelection, null);
  assert.equal(companyCreates[0].assistedSetupRequired, false);
  assert.equal(companyCreates[0].assistedSetupStatus, 'not_required');
  assert.equal(companyCreates[0].assistedSetupNote, null);
  assert.equal(companyCreates[0].status, 'pending_checkout');
  // ZERO post-it de módulo no nascimento (nem consulta de SystemModule pra isso).
  assert.equal(companyModuleWrites.length, 0);
  assert.equal(systemModuleFinds.length, 0);
  // Resposta: campos de plano seguem no payload (compat), sempre null.
  assert.equal(res.status, 'pending_email_confirmation');
  assert.equal(res.selectedPlanKey, null);
  assert.equal(res.trialModuleSelection, null);
});

test('signup Google: empresa nasce NEUTRA e estruturalmente IGUAL à do e-mail (diferença só de verificação)', async () => {
  const email = buildAuthServiceForNeutralSignup();
  await email.service.signup({
    companyName: 'Empresa A',
    name: 'Dono A',
    email: 'a@cliente.test',
    password: 'Segredo123!',
  });

  const google = buildAuthServiceForNeutralSignup();
  const res: any = await (google.service as any).signupWithGoogle({
    email: 'b@cliente.test',
    name: 'Dono B',
    googleId: 'google-sub-1',
    selectedPlanKey: 'hbx_pro', // client velho: aceito-e-ignorado
  });

  assert.equal(google.companyCreates.length, 1);
  // Mesma estrutura neutra nos dois fluxos (chavinha OFF no beforeEach).
  for (const key of NEUTRAL_BIRTH_KEYS) {
    assert.deepEqual(
      google.companyCreates[0][key],
      email.companyCreates[0][key],
      `campo ${key} divergiu entre Google e e-mail`,
    );
  }
  assert.equal(google.companyCreates[0].selectedPlanKey, null);
  assert.equal(google.companyCreates[0].trialModuleSelection, null);
  // ZERO post-it de módulo também no Google.
  assert.equal(google.companyModuleWrites.length, 0);
  assert.equal(google.systemModuleFinds.length, 0);
  // Google já entra logado (identidade confirmada pelo token).
  assert.equal(res.access_token, 'signed-token');
});

test('confirmação legada com plano NULL não ressuscita hbx_padrao: sem gravação de plano, sem post-it, sem entitlement', async () => {
  // Chavinha OFF (beforeEach) → cai no ramo legado do activateConfirmedTrialTx.
  // Empresa neutra (pós-P0.2): nada de plano pra sincronizar.
  const service = buildBareAuthService();
  const { tx, companyUpdates, entitlementUpserts } = buildTrialActivationTx({
    selectedPlanKey: null,
    trialModuleSelection: null,
    primaryContactName: 'Dono Neutro',
    contactPhone: '19999990000',
    taxDocument: null,
  });

  const trialEndsAt = await service.activateConfirmedTrialTx(tx, 7, new Date());

  assert.equal(trialEndsAt, null);
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0].status, 'pending_checkout');
  // NÃO grava selectedPlanKey (o normalize antigo ressuscitava hbx_padrao aqui).
  assert.equal('selectedPlanKey' in companyUpdates[0], false);
  // Nenhum entitlement de plano nasce sem plano.
  assert.equal(entitlementUpserts.length, 0);
});

// DTO público: selectedPlanKey aceito-e-IGNORADO — nunca 400 (mesma config do
// ValidationPipe global de main.ts: whitelist + forbidNonWhitelisted + transform).
test('DTO signup/google: selectedPlanKey de client velho (válido OU lixo) não devolve 400', async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const run = (metatype: any, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype, data: '' } as ArgumentMetadata);

  const baseSignup = { email: 'velho@cliente.test', password: 'Segredo123!' };
  // Chave legada válida (client em cache) e valor lixo: os dois passam.
  await run(SignupDto, { ...baseSignup, selectedPlanKey: 'hbx_lite' });
  await run(SignupDto, { ...baseSignup, selectedPlanKey: 'qualquer-coisa' });
  await run(GoogleOAuthDto, { idToken: 'tok', selectedPlanKey: 'hbx_padrao' });
  await run(GoogleOAuthDto, { idToken: 'tok', selectedPlanKey: 'lixo-em-cache' });
});
