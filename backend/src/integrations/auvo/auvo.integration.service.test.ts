import test from 'node:test';
import assert from 'node:assert/strict';

import { IntegrationSecretsService } from '../integration-secrets.service';
import { AuvoIntegrationService } from './auvo.integration.service';
import { AuvoMapper } from './auvo.mapper';
import { AuvoSyncService } from './auvo.sync.service';

function createEncryptedSecret(secret = 'auvo-token-123') {
  const secrets = new IntegrationSecretsService();
  return secrets.encryptSecret(secret);
}

function createConnectionRow(extra?: Record<string, unknown>) {
  return {
    id: 'conn-auvo-1',
    companyId: 12,
    provider: 'AUVO',
    instanceName: 'Operacao principal',
    secretCiphertext: createEncryptedSecret(),
    secretPreview: '***n-123',
    status: 'DISCONNECTED',
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestMessage: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastError: null,
    isActive: true,
    createdAt: new Date('2026-03-29T10:00:00.000Z'),
    updatedAt: new Date('2026-03-29T10:00:00.000Z'),
    ...extra,
  };
}

function createProjectionStub() {
  return {
    upsertCustomerProfile: async () => ({ action: 'imported', row: { id: 'profile-1' } }),
    upsertDebtCase: async () => ({ action: 'imported', row: { id: 'debt-1' } }),
  } as any;
}

function createAuvoClientStub(overrides?: Record<string, unknown>) {
  return {
    listCustomers: async () => ({
      source: 'remote',
      items: [],
      note: 'AUVO customers endpoint nao configurado; sync de clientes dedicados foi ignorado.',
      rawShape: null,
    }),
    listRecords: async () => ({
      source: 'scaffold',
      items: [],
      note: null,
      rawShape: null,
    }),
    ...overrides,
  } as any;
}

test('testConnection updates AUVO connection test metadata', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const updates: Array<any> = [];
    const prisma = {
      integrationConnection: {
        findFirst: async () => createConnectionRow(),
        update: async (args: any) => {
          updates.push(args);
          return createConnectionRow(args.data);
        },
      },
    } as any;
    const service = new AuvoIntegrationService(
      prisma,
      new IntegrationSecretsService(),
      {
        testConnection: async () => ({
          ok: true,
          status: 'CONNECTED',
          message: 'Scaffold AUVO validado localmente.',
        }),
      } as any,
      {} as any,
    );

    const result = await service.testConnection(12, { integrationId: 'conn-auvo-1' });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'CONNECTED');
    assert.equal(result.message, 'Scaffold AUVO validado localmente.');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.lastTestStatus, 'SUCCESS');
    assert.equal(updates[0].data.lastTestMessage, 'Scaffold AUVO validado localmente.');
    assert.equal(updates[0].data.status, 'CONNECTED');
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow creates execution log and stores compact raw payload summary', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const syncCreates: Array<any> = [];
    const syncUpdates: Array<any> = [];
    const recordUpserts: Array<any> = [];
    const connectionUpdates: Array<any> = [];
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async (args: any) => {
            connectionUpdates.push(args);
            return createConnectionRow(args.data);
          },
        },
        integrationSyncRun: {
          create: async (args: any) => {
            syncCreates.push(args);
            return { id: 'run-1', ...args.data };
          },
          update: async (args: any) => {
            syncUpdates.push(args);
            return { id: 'run-1', ...args.data };
          },
        },
        auvoExternalRecord: {
          findMany: async () => [],
          upsert: async (args: any) => {
            recordUpserts.push(args);
            return args;
          },
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async () => ({
          source: 'scaffold',
          items: [
            {
              externalId: 'task-1',
              title: 'OS 001',
              status: 'open',
              scheduledStart: '2026-03-29T08:00:00.000Z',
              scheduledEnd: '2026-03-29T09:00:00.000Z',
              technician: 'Joao',
              customer: 'Cliente A',
              updatedAt: '2026-03-29T07:45:00.000Z',
              rawPayload: { id: 'task-1', nested: { foo: 'bar' } },
            },
          ],
          note: 'Sync scaffold executado.',
        }),
      }),
      new AuvoMapper(),
    );

    const result = await service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1', triggeredByUserId: 99 });

    assert.equal(result.ok, true);
    assert.equal(syncCreates.length, 1);
    assert.equal(syncCreates[0].data.provider, 'AUVO');
    assert.equal(syncCreates[0].data.triggerType, 'manual');
    assert.equal(syncCreates[0].data.status, 'RUNNING');
    assert.equal(syncUpdates.length, 1);
    assert.equal(syncUpdates[0].data.status, 'SUCCESS');
    assert.equal(syncUpdates[0].data.importedCount, 1);
    assert.equal(syncUpdates[0].data.updatedCount, 0);
    assert.equal(syncUpdates[0].data.skippedCount, 0);
    assert.equal(syncUpdates[0].data.errorCount, 0);
    assert.equal(recordUpserts.length, 1);
    assert.match(String(recordUpserts[0].create.rawPayloadSummaryJson), /task-1/);
    assert.equal(connectionUpdates.length, 1);
    assert.ok(connectionUpdates[0].data.lastSyncAt instanceof Date);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow maps realistic AUVO payload aliases and nested fields', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const recordUpserts: Array<any> = [];
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async () => createConnectionRow(),
        },
        integrationSyncRun: {
          create: async (args: any) => ({ id: 'run-1', ...args.data }),
          update: async (args: any) => ({ id: 'run-1', ...args.data }),
        },
        auvoExternalRecord: {
          findMany: async () => [],
          upsert: async (args: any) => {
            recordUpserts.push(args);
            return args;
          },
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async () => ({
          source: 'normalized',
          items: [
            {
              taskID: 77,
              orientation: 'Visita tecnica',
              taskStatus: 'Agendado',
              startDate: '29/03/2026 08:00:00',
              endDate: '2026-03-29 09:00:00',
              customer: { name: 'Cliente Real' },
              userTo: { name: 'Tecnico Real' },
              lastUpdate: 1774771200,
            },
          ],
        }),
      }),
      new AuvoMapper(),
    );

    const result = await service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1' });

    assert.equal(result.ok, true);
    assert.equal(recordUpserts.length, 1);
    assert.equal(recordUpserts[0].create.externalId, '77');
    assert.equal(recordUpserts[0].create.title, 'Visita tecnica');
    assert.equal(recordUpserts[0].create.status, 'SCHEDULED');
    assert.equal(recordUpserts[0].create.customerName, 'Cliente Real');
    assert.equal(recordUpserts[0].create.technicianName, 'Tecnico Real');
    assert.ok(recordUpserts[0].create.scheduledStart instanceof Date);
    assert.ok(recordUpserts[0].create.scheduledEnd instanceof Date);
    assert.ok(recordUpserts[0].create.sourceUpdatedAt instanceof Date);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow dedupes the same payload when externalId aliases resolve to the same value', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const syncUpdates: Array<any> = [];
    const upserts: Array<any> = [];
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async () => createConnectionRow(),
        },
        integrationSyncRun: {
          create: async (args: any) => ({ id: 'run-1', ...args.data }),
          update: async (args: any) => {
            syncUpdates.push(args);
            return { id: 'run-1', ...args.data };
          },
        },
        auvoExternalRecord: {
          findMany: async () => [],
          upsert: async (args: any) => {
            upserts.push(args);
            return args;
          },
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async () => ({
          source: 'normalized',
          items: [
            { taskID: 44, orientation: 'OS alias 1', lastUpdate: '2026-03-29T08:00:00.000Z' },
            { externalId: '44', orientation: 'OS alias 2', lastUpdate: '2026-03-29T08:05:00.000Z' },
          ],
        }),
      }),
      new AuvoMapper(),
    );

    const result = await service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1' });

    assert.equal(result.ok, true);
    assert.equal(upserts.length, 1);
    assert.equal(syncUpdates.length, 1);
    assert.equal(syncUpdates[0].data.importedCount, 1);
    assert.equal(syncUpdates[0].data.updatedCount, 0);
    assert.equal(syncUpdates[0].data.skippedCount, 1);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow counts updates correctly when realistic payload uses alias taskID', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const syncUpdates: Array<any> = [];
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async () => createConnectionRow(),
        },
        integrationSyncRun: {
          create: async (args: any) => ({ id: 'run-1', ...args.data }),
          update: async (args: any) => {
            syncUpdates.push(args);
            return { id: 'run-1', ...args.data };
          },
        },
        auvoExternalRecord: {
          findMany: async () => [
            {
              id: 'row-77',
              companyId: 12,
              connectionId: 'conn-auvo-1',
              externalId: '77',
              sourceUpdatedAt: new Date('2026-03-29T07:00:00.000Z'),
            },
          ],
          upsert: async (args: any) => args,
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async () => ({
          source: 'normalized',
          items: [
            {
              taskID: 77,
              orientation: 'OS Atualizada',
              taskStatus: 'Concluido',
              lastUpdate: '2026-03-29T08:30:00.000Z',
            },
          ],
        }),
      }),
      new AuvoMapper(),
    );

    const result = await service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1' });

    assert.equal(result.ok, true);
    assert.equal(syncUpdates.length, 1);
    assert.equal(syncUpdates[0].data.importedCount, 0);
    assert.equal(syncUpdates[0].data.updatedCount, 1);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow blocks concurrent AUVO runs through running lock', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
        },
        integrationSyncRun: {
          create: async () => {
            const error: any = new Error('duplicate');
            error.code = 'P2002';
            throw error;
          },
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({ listRecords: async () => ({ source: 'scaffold', items: [] }) }),
      new AuvoMapper(),
    );

    await assert.rejects(
      () => service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1' }),
      /sincronizacao AUVO em andamento/i,
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow dedupes by companyId and externalId when existing record is newer', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const recordUpserts: Array<any> = [];
    const syncUpdates: Array<any> = [];
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async () => createConnectionRow(),
        },
        integrationSyncRun: {
          create: async (args: any) => ({ id: 'run-1', ...args.data }),
          update: async (args: any) => {
            syncUpdates.push(args);
            return { id: 'run-1', ...args.data };
          },
        },
        auvoExternalRecord: {
          findMany: async () => [
            {
              id: 'row-1',
              companyId: 12,
              connectionId: 'conn-auvo-1',
              externalId: 'task-1',
              sourceUpdatedAt: new Date('2026-03-29T08:00:00.000Z'),
            },
          ],
          upsert: async (args: any) => {
            recordUpserts.push(args);
            return args;
          },
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async () => ({
          source: 'scaffold',
          items: [
            {
              externalId: 'task-1',
              title: 'OS antiga',
              status: 'open',
              updatedAt: '2026-03-29T07:00:00.000Z',
            },
          ],
        }),
      }),
      new AuvoMapper(),
    );

    const result = await service.syncNow({ companyId: 12, connectionId: 'conn-auvo-1' });

    assert.equal(result.ok, true);
    assert.equal(recordUpserts.length, 0);
    assert.equal(syncUpdates.length, 1);
    assert.equal(syncUpdates[0].data.skippedCount, 1);
    assert.equal(syncUpdates[0].data.importedCount, 0);
    assert.equal(syncUpdates[0].data.updatedCount, 0);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncIncremental uses connection lastSyncAt as updatedSince cursor', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const capturedInputs: Array<any> = [];
    const lastSyncAt = new Date('2026-03-29T11:15:00.000Z');
    const service = new AuvoSyncService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow({ lastSyncAt }),
          update: async () => createConnectionRow({ lastSyncAt }),
        },
        integrationSyncRun: {
          create: async (args: any) => ({ id: 'run-1', ...args.data }),
          update: async (args: any) => ({ id: 'run-1', ...args.data }),
        },
        auvoExternalRecord: {
          findMany: async () => [],
          upsert: async () => null,
        },
      } as any,
      new IntegrationSecretsService(),
      createProjectionStub(),
      createAuvoClientStub({
        listRecords: async (_credentials: any, input: any) => {
          capturedInputs.push(input);
          return { source: 'scaffold', items: [] };
        },
      }),
      new AuvoMapper(),
    );

    await service.syncIncremental({ companyId: 12, connectionId: 'conn-auvo-1' });

    assert.equal(capturedInputs.length, 1);
    assert.equal(capturedInputs[0].updatedSince, lastSyncAt.toISOString());
    assert.equal(capturedInputs[0].periodStart, lastSyncAt.toISOString());
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});