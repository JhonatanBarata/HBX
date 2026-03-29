import test from 'node:test';
import assert from 'node:assert/strict';

import { CustomerProfileService } from './customer-profile.service';

function buildProfileRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'profile-1',
    companyId: 7,
    sourceConnectionId: null,
    name: 'Cliente',
    phone: '+5519998877766',
    phoneNormalized: '5519998877766',
    email: null,
    document: null,
    externalSource: 'whatsapp_bot',
    externalCustomerId: null,
    status: 'active',
    notes: null,
    createdAt: new Date('2026-03-28T10:00:00.000Z'),
    updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    ...overrides,
  };
}

test('createProfile retries read after P2002 conflict', async () => {
  const existingRow = buildProfileRow();
  const prisma = {
    customerProfile: {
      create: async () => {
        const error: any = new Error('Unique constraint failed');
        error.code = 'P2002';
        throw error;
      },
      findFirst: async () => existingRow,
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const result = await service.createProfile(7, {
    phone: '+55 19 99887-7766',
    name: 'Cliente',
    externalSource: 'whatsapp_bot',
  });

  assert.equal(result.id, 'profile-1');
  assert.equal(result.phoneNormalized, '5519998877766');
});

test('upsertProfile retries read after P2002 when concurrent create wins', async () => {
  const existingRow = buildProfileRow({ id: 'profile-2' });
  let findFirstCalls = 0;
  const prisma = {
    customerProfile: {
      create: async () => {
        const error: any = new Error('Unique constraint failed');
        error.code = 'P2002';
        throw error;
      },
      findFirst: async () => {
        findFirstCalls += 1;
        return findFirstCalls === 1 ? null : existingRow;
      },
      update: async () => {
        throw new Error('unexpected update');
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const result = await service.upsertProfile({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Cliente',
    externalSource: 'whatsapp_bot',
    status: 'active',
  });

  assert.equal(result.id, 'profile-2');
  assert.equal(findFirstCalls, 2);
});

test('createProfile drops weak provisional whatsapp names instead of freezing them', async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    customerProfile: {
      create: async ({ data }: any) => {
        createCalls.push(data);
        return buildProfileRow({
          id: 'profile-weak',
          name: data.name ?? null,
          status: data.status,
          externalSource: data.externalSource,
        });
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const result = await service.createProfile(7, {
    phone: '+55 19 99887-7766',
    name: 'Oi',
    externalSource: 'whatsapp_bot',
    status: 'provisional',
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].name, null);
  assert.equal(result.name, null);
});

test('upsertProfile retifies provisional whatsapp name when a better name arrives', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const existingRow = buildProfileRow({
    id: 'profile-provisional',
    name: 'Cliente',
    status: 'provisional',
    externalSource: 'whatsapp_bot',
  });
  const prisma = {
    customerProfile: {
      findFirst: async () => existingRow,
      update: async ({ data }: any) => {
        updateCalls.push(data);
        return buildProfileRow({
          ...existingRow,
          ...data,
        });
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const result = await service.upsertProfile({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Carlos Eduardo',
    externalSource: 'recovery',
    status: 'active',
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].name, 'Carlos Eduardo');
  assert.equal(updateCalls[0].externalSource, 'recovery');
  assert.equal(updateCalls[0].status, 'active');
  assert.equal(result.name, 'Carlos Eduardo');
});

test('upsertProfile does not downgrade a strong active name with weak whatsapp input', async () => {
  let updateCalled = false;
  const existingRow = buildProfileRow({
    id: 'profile-active',
    name: 'Carlos Eduardo',
    status: 'active',
    externalSource: 'manual',
  });
  const prisma = {
    customerProfile: {
      findFirst: async () => existingRow,
      update: async () => {
        updateCalled = true;
        return existingRow;
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const result = await service.upsertProfile({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Oi',
    externalSource: 'whatsapp_bot',
    status: 'provisional',
  });

  assert.equal(updateCalled, false);
  assert.equal(result.name, 'Carlos Eduardo');
  assert.equal(result.status, 'active');
});