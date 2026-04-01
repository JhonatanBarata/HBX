import test from 'node:test';
import assert from 'node:assert/strict';

import { IntegrationConnectionsService } from './integration-connections.service';
import { IntegrationSecretsService } from './integration-secrets.service';

function createPrismaStub(initialRows: any[] = []) {
  const rows = [...initialRows];

  function matchesWhere(row: any, where: Record<string, any> = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'not' in value) {
        return row[key] !== value.not;
      }
      return row[key] === value;
    });
  }

  return {
    rows,
    integrationConnection: {
      findMany: async (args: any = {}) => {
        const matched = rows.filter((row) => matchesWhere(row, args?.where));
        return matched.map((row) => ({ ...row, syncRuns: [] }));
      },
      findFirst: async (args: any = {}) => {
        const row = rows.find((candidate) => matchesWhere(candidate, args?.where));
        if (!row) return null;
        if (args?.select) {
          const selected: Record<string, unknown> = {};
          for (const key of Object.keys(args.select)) {
            selected[key] = row[key];
          }
          return selected;
        }
        return {
          ...row,
          syncRuns: args?.include?.syncRuns ? [] : row.syncRuns || [],
        };
      },
      create: async (args: any) => {
        const row = {
          id: `conn-${rows.length + 1}`,
          status: 'DISCONNECTED',
          lastTestedAt: null,
          lastTestStatus: null,
          lastTestMessage: null,
          lastSyncAt: null,
          lastSuccessAt: null,
          lastError: null,
          isActive: true,
          createdAt: new Date('2026-04-01T12:00:00.000Z'),
          updatedAt: new Date('2026-04-01T12:00:00.000Z'),
          ...args.data,
        };
        rows.push(row);
        return row;
      },
      update: async (args: any) => {
        const row = rows.find((candidate) => candidate.id === args.where.id);
        if (!row) {
          throw new Error('row not found');
        }
        Object.assign(row, args.data, { updatedAt: new Date('2026-04-01T13:00:00.000Z') });
        return row;
      },
    },
  };
}

function createService(prisma: any, spies?: { auvo?: any; tagplus?: any }) {
  return new IntegrationConnectionsService(
    prisma,
    new IntegrationSecretsService(),
    spies?.auvo || {
      testConnection: async () => ({ ok: true, status: 'CONNECTED', message: 'AUVO ok' }),
      syncNow: async () => ({ ok: true, importedCount: 1, updatedCount: 0, failedCount: 0 }),
    },
    spies?.tagplus || {
      testConnection: async () => ({ ok: true, status: 'CONNECTED', message: 'TagPlus ok' }),
      syncNow: async () => ({ ok: true, importedCount: 1, updatedCount: 0, failedCount: 0 }),
    },
  );
}

test('create, list, update and resolve secret keep provider envelope and masked preview', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const prisma = createPrismaStub();
    const service = createService(prisma);

    const created = await service.createByCompanyId(7, {
      provider: 'AUVO',
      instanceName: 'Operacao piloto',
      secret: 'auvo-token-123456',
      isActive: true,
    });

    assert.equal(created.provider, 'AUVO');
    assert.equal(created.providerModel?.id, 'AUVO');
    assert.equal(created.secretConfigured, true);
    assert.equal(created.secretPreview, 'token: ***123456');
    assert.equal(created.credentialSummary?.fields[0]?.label, 'Token AUVO');
    assert.equal(prisma.rows.length, 1);
    assert.notEqual(prisma.rows[0].secretCiphertext, 'auvo-token-123456');
    assert.match(String(new IntegrationSecretsService().decryptSecret(prisma.rows[0].secretCiphertext)), /"provider":"AUVO"/);

    await assert.rejects(
      () =>
        service.createByCompanyId(7, {
          provider: 'AUVO',
          instanceName: 'Operacao piloto',
          secret: 'duplicate-token',
          isActive: true,
        }),
      /Ja existe uma conexao ativa equivalente/,
    );

    const updated = await service.updateByCompanyId(7, created.id, {
      instanceName: 'Operacao piloto principal',
      secret: 'auvo-token-654321',
    });

    assert.equal(updated.instanceName, 'Operacao piloto principal');
    assert.equal(updated.secretPreview, 'token: ***654321');
    assert.equal(await service.resolveSecretByCompany(7, created.id), 'auvo-token-654321');

    const listed = await service.listByCompanyId(7, 'AUVO');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].instanceName, 'Operacao piloto principal');
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});

test('test and sync dispatch to the provider-specific services by company scope', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';

  try {
    const secrets = new IntegrationSecretsService();
    const prisma = createPrismaStub([
      {
        id: 'conn-auvo',
        companyId: 9,
        provider: 'AUVO',
        instanceName: 'Equipe campo',
        secretCiphertext: secrets.encryptSecret(JSON.stringify({ version: 1, provider: 'AUVO', credentials: { token: 'auvo-token' } })),
        secretPreview: 'token: ***-token',
        status: 'DISCONNECTED',
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestMessage: null,
        lastSyncAt: null,
        lastSuccessAt: null,
        lastError: null,
        isActive: true,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
      },
      {
        id: 'conn-tagplus',
        companyId: 9,
        provider: 'TAGPLUS',
        instanceName: 'ERP financeiro',
        secretCiphertext: secrets.encryptSecret(JSON.stringify({ version: 1, provider: 'TAGPLUS', credentials: { token: 'tagplus-token' } })),
        secretPreview: 'token: ***-token',
        status: 'DISCONNECTED',
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestMessage: null,
        lastSyncAt: null,
        lastSuccessAt: null,
        lastError: null,
        isActive: true,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
      },
    ]);

    const calls = {
      auvoTest: [] as any[],
      auvoSync: [] as any[],
      tagTest: [] as any[],
      tagSync: [] as any[],
    };

    const service = createService(prisma, {
      auvo: {
        testConnection: async (companyId: number, input: any) => {
          calls.auvoTest.push({ companyId, input });
          return { ok: true, status: 'CONNECTED', message: 'AUVO ok' };
        },
        syncNow: async (input: any) => {
          calls.auvoSync.push(input);
          return { ok: true, importedCount: 2, updatedCount: 1, failedCount: 0 };
        },
      },
      tagplus: {
        testConnection: async (companyId: number, input: any) => {
          calls.tagTest.push({ companyId, input });
          return { ok: true, status: 'CONNECTED', message: 'TagPlus ok' };
        },
        syncNow: async (input: any) => {
          calls.tagSync.push(input);
          return { ok: true, importedCount: 1, updatedCount: 2, failedCount: 0 };
        },
      },
    });

    const auvoTest = await service.testByCompanyId(9, 'conn-auvo');
    const tagSync = await service.syncNowByCompanyId(9, 'conn-tagplus', { windowDays: 7 });

    assert.equal(auvoTest.status, 'CONNECTED');
    assert.equal(tagSync.updatedCount, 2);
    assert.deepEqual(calls.auvoTest[0], { companyId: 9, input: { integrationId: 'conn-auvo' } });
    assert.equal(calls.tagSync[0].companyId, 9);
    assert.equal(calls.tagSync[0].connectionId, 'conn-tagplus');
    assert.equal(calls.tagSync[0].windowDays, 7);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});