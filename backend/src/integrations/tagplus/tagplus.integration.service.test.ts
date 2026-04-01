import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIntegrationCredentialEnvelope, serializeIntegrationCredentialEnvelope } from '../integration-credentials.util';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { TagPlusIntegrationService } from './tagplus.integration.service';
import { TagPlusMapper } from './tagplus.mapper';
import { TagPlusSyncService } from './tagplus.sync.service';

function createConnectionRow(extra?: Record<string, unknown>) {
  const secrets = new IntegrationSecretsService();
  return {
    id: 'conn-tagplus-1',
    companyId: 21,
    provider: 'TAGPLUS',
    instanceName: 'Financeiro piloto',
    secretCiphertext: secrets.encryptSecret(
      String(serializeIntegrationCredentialEnvelope(buildIntegrationCredentialEnvelope('TAGPLUS', 'tagplus-token-123456'))),
    ),
    secretPreview: 'token: ***123456',
    status: 'DISCONNECTED',
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestMessage: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastError: null,
    isActive: true,
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
    updatedAt: new Date('2026-04-01T10:00:00.000Z'),
    ...extra,
  };
}

function createTagPlusClientStub(overrides?: Record<string, unknown>) {
  return {
    listCustomers: async () => ({
      source: 'remote',
      items: [],
      note: 'TagPlus customers endpoint nao configurado; sync dedicado de clientes foi ignorado.',
    }),
    listReceivables: async () => ({
      source: 'scaffold',
      note: null,
      items: [],
    }),
    ...overrides,
  } as any;
}

test('testConnection updates TagPlus metadata with explicit status and success timestamp', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const updates: Array<any> = [];
    const service = new TagPlusIntegrationService(
      {
        integrationConnection: {
          findFirst: async () => createConnectionRow(),
          update: async (args: any) => {
            updates.push(args);
            return createConnectionRow(args.data);
          },
        },
      } as any,
      new IntegrationSecretsService(),
      {
        testConnection: async (credentials: any) => {
          assert.equal(credentials.token, 'tagplus-token-123456');
          return {
            ok: true,
            status: 'CONNECTED',
            message: 'TagPlus scaffold validado localmente.',
          };
        },
      } as any,
      {} as any,
    );

    const result = await service.testConnection(21, { integrationId: 'conn-tagplus-1' });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'CONNECTED');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.lastTestStatus, 'SUCCESS');
    assert.equal(updates[0].data.status, 'CONNECTED');
    assert.ok(updates[0].data.lastSuccessAt instanceof Date);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('syncNow projects customer and debt counters for TagPlus records', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const syncCreates: Array<any> = [];
    const syncUpdates: Array<any> = [];
    const connectionUpdates: Array<any> = [];
    const projectionCalls = {
      customers: [] as any[],
      debts: [] as any[],
    };

    const service = new TagPlusSyncService(
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
            return { id: 'run-tagplus-1', ...args.data };
          },
          update: async (args: any) => {
            syncUpdates.push(args);
            return { id: 'run-tagplus-1', ...args.data };
          },
        },
      } as any,
      new IntegrationSecretsService(),
      {
        upsertCustomerProfile: async (input: any) => {
          projectionCalls.customers.push(input);
          return { action: 'imported', row: { id: 'profile-1' } };
        },
        upsertDebtCase: async (input: any) => {
          projectionCalls.debts.push(input);
          return { action: 'imported', row: { id: 'debt-1' } };
        },
      } as any,
      createTagPlusClientStub({
        listReceivables: async (credentials: any) => {
          assert.equal(credentials.token, 'tagplus-token-123456');
          return {
            source: 'scaffold',
            note: 'Sync TagPlus executado.',
            items: [
              {
                customerId: 'customer-1',
                customerName: 'Cliente ERP',
                phone: '11999990000',
                document: '12345678900',
                invoiceId: 'invoice-1',
                amount: '199,90',
                dueDate: '2026-04-20',
                status: 'aberto',
              },
            ],
          };
        },
      }),
      new TagPlusMapper(),
    );

    const result = await service.syncNow({ companyId: 21, connectionId: 'conn-tagplus-1', triggeredByUserId: 77 });

    assert.equal(result.ok, true);
    assert.equal(result.importedCount, 2);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.failedCount, 0);
    assert.equal(projectionCalls.customers.length, 1);
    assert.equal(projectionCalls.debts.length, 1);
    assert.equal(syncCreates[0].data.provider, 'TAGPLUS');
    assert.equal(syncUpdates[0].data.status, 'SUCCESS');
    assert.equal(connectionUpdates[0].data.status, 'CONNECTED');
    assert.ok(connectionUpdates[0].data.lastSyncAt instanceof Date);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});