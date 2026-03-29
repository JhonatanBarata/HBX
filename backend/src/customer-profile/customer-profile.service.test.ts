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