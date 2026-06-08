import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service';
import { sanitizeUser } from './profile.controller';

function buildAuthServiceForLogin(companySnapshot: any, options: { systemMaster?: boolean } = {}) {
  const companyFindUniqueCalls: any[] = [];
  const signedPayloads: any[] = [];
  const systemMaster = Boolean(options.systemMaster);
  const prisma = {
    company: {
      findUnique: async (args: any) => {
        companyFindUniqueCalls.push(args);
        return companySnapshot;
      },
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
              role: systemMaster ? 'USERMASTER' : 'ADMIN',
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

test('login de tenant manual premium com slug hbx segue fluxo normal sem consultar slug', async () => {
  const { service, companyFindUniqueCalls } = buildAuthServiceForLogin({
    companyKind: 'tenant',
    onboardingStatus: 'active_paid',
    subscriptionStatus: 'manual',
    paymentStatus: 'MANUAL',
    premiumAccess: true,
    trialEndsAt: null,
  });

  const result = await service.login({
    id: 10,
    email: 'dono@cliente.test',
    role: 'ADMIN',
    isSystemMaster: false,
    companyId: 77,
  });

  assert.equal(result.next, '/dashboard');
  assert.equal(result.requiresCheckout, false);
  assert.equal(result.requiresTrialActivation, false);
  assert.equal(companyFindUniqueCalls.length, 1);
  assert.equal(companyFindUniqueCalls[0].where.id, 77);
  assert.equal(Object.prototype.hasOwnProperty.call(companyFindUniqueCalls[0].select, 'slug'), false);
});
