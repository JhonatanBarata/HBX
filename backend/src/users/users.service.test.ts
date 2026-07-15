import test from 'node:test';
import assert from 'node:assert/strict';

import { LAST_TENANT_ADMIN_MESSAGE, SELF_ACCESS_REMOVAL_MESSAGE, UsersService } from './users.service';
import { getTenantScopeBypassReason, runWithTenantContext } from '../prisma/tenant-context';

type FakeUser = {
  id: number;
  companyId: number;
  role: string;
  isActive: boolean;
  isSystemMaster: boolean;
  deactivatedAt: Date | null;
  retentionUntil?: Date | null;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  createdAt?: Date;
};

function pickSelected(row: any, select?: Record<string, boolean>) {
  if (!row || !select) return row;
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

function matchesWhere(user: FakeUser, where: any) {
  if (!where) return true;
  if (where.companyId !== undefined && Number(user.companyId) !== Number(where.companyId)) return false;
  if (where.id?.not !== undefined && Number(user.id) === Number(where.id.not)) return false;
  if (where.role?.in && !where.role.in.includes(user.role)) return false;
  if (where.role?.notIn && where.role.notIn.includes(user.role)) return false;
  if (where.role !== undefined && typeof where.role !== 'object' && String(user.role) !== String(where.role)) return false;
  if (where.isActive !== undefined && Boolean(user.isActive) !== Boolean(where.isActive)) return false;
  if (where.isSystemMaster !== undefined && Boolean(user.isSystemMaster) !== Boolean(where.isSystemMaster)) return false;
  if (where.deactivatedAt === null && user.deactivatedAt !== null) return false;
  return true;
}

function createNoopModel() {
  return {
    create: async () => ({}),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
    findMany: async () => [],
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  };
}

function createUsersService(input: { users: FakeUser[]; companyKind?: string }) {
  const state = {
    users: input.users.map((user) => ({
      email: `user-${user.id}@cliente.test`,
      username: `user-${user.id}`,
      name: `User ${user.id}`,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      retentionUntil: null,
      ...user,
    })),
    deletedUserIds: [] as number[],
    // W7 (tenant-guard): motivo de bypass visto pelas queries da cascata do hard-delete.
    cascadeBypassReasons: [] as (string | null)[],
  };
  const company = {
    id: 7,
    slug: 'cliente-a',
    companyKind: input.companyKind || 'tenant',
    selectedPlanKey: null,
    commissionDueBusinessDays: 3,
  };

  const userModel = {
    count: async ({ where }: any = {}) => state.users.filter((user) => matchesWhere(user, where)).length,
    findUnique: async ({ where, select, include }: any) => {
      const user = state.users.find((item) => Number(item.id) === Number(where?.id)) || null;
      if (!user) return null;
      if (include) {
        return {
          ...user,
          company,
          moduleAccesses: [],
          referredByUser: null,
        };
      }
      return pickSelected(user, select);
    },
    update: async ({ where, data, include }: any) => {
      const index = state.users.findIndex((item) => Number(item.id) === Number(where?.id));
      if (index < 0) throw new Error('User not found');
      state.users[index] = { ...state.users[index], ...data };
      return include ? { ...state.users[index], referredByUser: null } : state.users[index];
    },
    updateMany: async ({ where, data }: any = {}) => {
      state.cascadeBypassReasons.push(getTenantScopeBypassReason());
      let count = 0;
      state.users = state.users.map((user) => {
        if (where?.referredByUserId !== undefined && Number((user as any).referredByUserId || 0) !== Number(where.referredByUserId)) {
          return user;
        }
        count += 1;
        return { ...user, ...data };
      });
      return { count };
    },
    delete: async ({ where }: any) => {
      state.cascadeBypassReasons.push(getTenantScopeBypassReason());
      state.deletedUserIds.push(Number(where?.id));
      state.users = state.users.filter((user) => Number(user.id) !== Number(where?.id));
      return {};
    },
  };

  const tx = new Proxy({
    user: userModel,
    $executeRawUnsafe: async () => ({}),
  } as any, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return createNoopModel();
    },
  });

  const prisma = new Proxy({
    user: userModel,
    company: {
      findUnique: async ({ select }: any = {}) => pickSelected(company, select),
    },
    sellerOnboarding: {
      findMany: async () => [],
    },
    userTeamPolicy: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    companyBillableSeatUsage: {
      findFirst: async () => null,
      create: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    companyCommercialUsageLog: {
      create: async () => ({}),
    },
    hasTable: async () => false,
    $transaction: async (fn: any) => fn(tx),
  } as any, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return createNoopModel();
    },
  });

  const webwhatsBridgeStub = {
    wipeMotorInstanceByTenantKey: async () => ({ loggedOut: false, deleted: false }),
  };
  return { service: new UsersService(prisma as any, webwhatsBridgeStub as any), state };
}

function activeAdmin(id: number, overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id,
    companyId: 7,
    role: 'ADMIN',
    isActive: true,
    isSystemMaster: false,
    deactivatedAt: null,
    ...overrides,
  };
}

function activeSeller(id: number, overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id,
    companyId: 7,
    role: 'USER',
    isActive: true,
    isSystemMaster: false,
    deactivatedAt: null,
    ...overrides,
  };
}

test('não permite autoexclusão', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeAdmin(2)] });

  await assert.rejects(
    () => service.hardDeleteUser(1, { actorUserId: 1 }),
    new RegExp(SELF_ACCESS_REMOVAL_MESSAGE),
  );
});

test('não permite autodesativação', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeAdmin(2)] });

  await assert.rejects(
    () => service.deactivateUser(1, 730, { actorUserId: 1 }),
    new RegExp(SELF_ACCESS_REMOVAL_MESSAGE),
  );
});

test('não permite autorrebaixamento admin para user', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeAdmin(2)] });

  await assert.rejects(
    () => service.updateById(1, { role: 'USER' }, { actorUserId: 1, action: 'role_update' }),
    new RegExp(SELF_ACCESS_REMOVAL_MESSAGE),
  );
});

test('não permite excluir último admin ativo', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeSeller(2)] });

  await assert.rejects(
    () => service.hardDeleteUser(1, { actorUserId: 2 }),
    new RegExp(LAST_TENANT_ADMIN_MESSAGE),
  );
});

test('não permite desativar último admin ativo', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeSeller(2)] });

  await assert.rejects(
    () => service.deactivateUser(1, 730, { actorUserId: 2 }),
    new RegExp(LAST_TENANT_ADMIN_MESSAGE),
  );
});

test('não permite rebaixar último admin ativo', async () => {
  const { service } = createUsersService({ users: [activeAdmin(1), activeSeller(2)] });

  await assert.rejects(
    () => service.updateById(1, { role: 'USER' }, { actorUserId: 2, action: 'role_update' }),
    new RegExp(LAST_TENANT_ADMIN_MESSAGE),
  );
});

test('permite excluir vendedor', async () => {
  const { service, state } = createUsersService({ users: [activeAdmin(1), activeSeller(2)] });

  await service.hardDeleteUser(2, { actorUserId: 1 });

  assert.deepEqual(state.deletedUserIds, [2]);
});

// W7 (tenant-guard P1.1, 10/07): a cascata do hard-delete é fixada por userId (sem
// companyId no where) e é chamada em request de tenant (admin excluindo vendedor).
// O contrato é rodar TODA a cascata sob withoutTenantScope — sem isso o guard acusa
// unscoped em report e QUEBRA a exclusão em enforce.
test('hard-delete em request de tenant roda a cascata sob bypass explícito do tenant-guard', async () => {
  const { service, state } = createUsersService({ users: [activeAdmin(1), activeSeller(2)] });

  await runWithTenantContext({ companyId: 7 }, () => service.hardDeleteUser(2, { actorUserId: 1 }));

  assert.deepEqual(state.deletedUserIds, [2]);
  assert.ok(state.cascadeBypassReasons.length >= 2); // updateMany(referredBy) + delete
  for (const reason of state.cascadeBypassReasons) {
    assert.ok(reason, 'query da cascata rodou SEM o bypass do tenant-guard');
  }
});

test('permite rebaixar admin quando existe outro admin ativo', async () => {
  const { service, state } = createUsersService({ users: [activeAdmin(1), activeAdmin(2)] });

  await service.updateById(1, { role: 'USER' }, { actorUserId: 2, action: 'role_update' });

  assert.equal(state.users.find((user) => user.id === 1)?.role, 'USER');
});

test('System Master não conta como admin ativo do tenant', async () => {
  const { service } = createUsersService({
    users: [
      activeAdmin(1),
      activeAdmin(99, { role: 'USERMASTER', isSystemMaster: true }),
    ],
  });

  await assert.rejects(
    () => service.updateById(1, { role: 'USER' }, { actorUserId: 99, action: 'role_update' }),
    new RegExp(LAST_TENANT_ADMIN_MESSAGE),
  );
});
