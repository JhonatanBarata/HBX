import test from 'node:test';
import assert from 'node:assert/strict';

import { CustomerProfileService } from './customer-profile.service';

function buildProfileRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'profile-1',
    companyId: 7,
    sourceConnectionId: null,
    name: 'Cliente',
    profileName: null,
    nameSource: null,
    nameConfirmed: false,
    phone: '+5519998877766',
    phoneNormalized: '5519998877766',
    email: null,
    document: null,
    externalSource: 'whatsapp_bot',
    externalCustomerId: null,
    status: 'active',
    notes: null,
    firstInboundAt: null,
    lastInboundAt: null,
    botOff: false,
    botOffReason: null,
    botOffAt: null,
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

test('upsertAtendimentoProfileState stores provisional inbound identity and timestamps in CustomerProfile', async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const createdRow = buildProfileRow({
    id: 'profile-inbound',
    name: null,
    profileName: null,
    nameSource: null,
    nameConfirmed: false,
    status: 'provisional',
    firstInboundAt: null,
    lastInboundAt: null,
  });
  let findFirstCalls = 0;

  const prisma = {
    customerProfile: {
      findFirst: async () => {
        findFirstCalls += 1;
        if (findFirstCalls === 1) return null;
        return createdRow;
      },
      create: async ({ data }: any) => {
        createCalls.push(data);
        return { ...createdRow, ...data };
      },
      update: async ({ data }: any) => {
        updateCalls.push(data);
        return { ...createdRow, ...data };
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const inboundAt = new Date('2026-04-15T10:00:00.000Z');
  const result = await service.upsertAtendimentoProfileState({
    companyId: 7,
    phone: '+55 19 99887-7766',
    profileName: 'Carlos no WhatsApp',
    nameSource: 'whatsapp_profile',
    inboundAt,
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].name, null);
  assert.equal(createCalls[0].status, 'provisional');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].profileName, 'Carlos no WhatsApp');
  assert.equal(updateCalls[0].nameSource, 'whatsapp_profile');
  assert.deepEqual(updateCalls[0].firstInboundAt, inboundAt);
  assert.deepEqual(updateCalls[0].lastInboundAt, inboundAt);
  assert.equal(result.profileName, 'Carlos no WhatsApp');
  assert.equal(result.nameConfirmed, false);
});

test('upsertAtendimentoProfileState confirms name and persists BOT_OFF without losing the first inbound timestamp', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const existingRow = buildProfileRow({
    id: 'profile-shared-state',
    name: null,
    profileName: 'Carlos no WhatsApp',
    nameSource: 'whatsapp_profile',
    nameConfirmed: false,
    status: 'provisional',
    firstInboundAt: new Date('2026-04-15T10:00:00.000Z'),
    lastInboundAt: new Date('2026-04-15T10:00:00.000Z'),
    botOff: false,
  });

  const prisma = {
    customerProfile: {
      findFirst: async () => existingRow,
      update: async ({ data }: any) => {
        updateCalls.push(data);
        return { ...existingRow, ...data };
      },
    },
  } as any;

  const service = new CustomerProfileService(prisma);
  const inboundAt = new Date('2026-04-15T10:05:00.000Z');
  const botOffAt = new Date('2026-04-15T10:06:00.000Z');
  const result = await service.upsertAtendimentoProfileState({
    companyId: 7,
    phone: '+55 19 99887-7766',
    confirmedName: 'Carlos Eduardo',
    nameSource: 'confirmed_inbound',
    nameConfirmed: true,
    inboundAt,
    botOff: true,
    botOffReason: 'Operador solicitou fila humana',
    botOffAt,
  });

  assert.equal(updateCalls.length, 2);
  assert.equal(updateCalls[1].nameConfirmed, true);
  assert.equal(updateCalls[1].nameSource, 'confirmed_inbound');
  assert.deepEqual(updateCalls[1].lastInboundAt, inboundAt);
  assert.equal(updateCalls[1].firstInboundAt, undefined);
  assert.equal(updateCalls[1].botOff, true);
  assert.equal(updateCalls[1].botOffReason, 'Operador solicitou fila humana');
  assert.deepEqual(updateCalls[1].botOffAt, botOffAt);
  assert.equal(result.nameConfirmed, true);
  assert.equal(result.botOff, true);
});