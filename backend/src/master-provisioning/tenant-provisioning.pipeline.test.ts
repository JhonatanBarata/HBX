import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TENANT_PROVISIONING_PRESETS,
  buildProvisioningLedger,
  getTenantProvisioningPreset,
  seedTenantDefaultProductsTx,
  seedTenantModulesTx,
  serializeProvisioningLedger,
} from './tenant-provisioning.pipeline';

test('presets são declarativos e legíveis (diffs entre as 3 portas)', () => {
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.self_service, {
    seedsDefaultProducts: true,
    createsAdminWithPassword: false,
  });
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.master_invite, {
    seedsDefaultProducts: true,
    createsAdminWithPassword: false,
  });
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.master_full, {
    seedsDefaultProducts: true,
    createsAdminWithPassword: true,
  });
  assert.equal(getTenantProvisioningPreset('master_full').createsAdminWithPassword, true);
});

test('seedTenantModulesTx sem input NÃO toca em CompanyModule (post-it)', async () => {
  const upserts: any[] = [];
  let queried = false;
  const tx = {
    systemModule: { findMany: async () => { queried = true; return []; } },
    companyModule: { upsert: async (args: any) => { upserts.push(args); return {}; } },
  };
  const result = await seedTenantModulesTx(tx as any, 10, []);
  assert.equal(upserts.length, 0);
  assert.equal(queried, false);
  assert.deepEqual(result.resolvedModuleKeys, []);
});

test('seedTenantModulesTx com módulo input grava só a exceção explícita', async () => {
  const upserts: any[] = [];
  const tx = {
    systemModule: {
      findMany: async ({ where }: any) => where.key.in.map((key: string, i: number) => ({ id: i + 1, key })),
    },
    companyModule: { upsert: async (args: any) => { upserts.push(args); return {}; } },
  };
  const result = await seedTenantModulesTx(tx as any, 10, [
    { key: 'vendas', enabled: true, source: 'input' },
  ]);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].create.moduleId, 1);
  assert.deepEqual(result.resolvedModuleKeys, ['vendas']);
});

test('seedTenantDefaultProductsTx SEM produtos explícitos não cria nada (TASK 8)', async () => {
  const creates: any[] = [];
  const tx = {
    product: {
      findFirst: async () => null,
      create: async ({ data }: any) => { creates.push(data); return { id: creates.length }; },
    },
  };
  // Seed default agora é vazio → nenhuma criação, nenhuma linha retornada.
  const result = await seedTenantDefaultProductsTx(tx as any, 5, { source: 'auth_signup' });
  assert.deepEqual(result, []);
  assert.equal(creates.length, 0);
});

test('seedTenantDefaultProductsTx COM produtos explícitos ainda semeia (caminho intacto)', async () => {
  const creates: any[] = [];
  const tx = {
    product: {
      findFirst: async () => null,
      create: async ({ data }: any) => { creates.push(data); return { id: creates.length }; },
    },
  };
  const result = await seedTenantDefaultProductsTx(tx as any, 5, {
    source: 'master_full',
    products: [{ name: 'Água 500ml', price: 2 }],
  });
  assert.equal(result.length, 1);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].name, 'Água 500ml');
  assert.equal(creates[0].companyId, 5);
});

test('buildProvisioningLedger serializa versão/preset/passos', () => {
  const ledger = buildProvisioningLedger('master_invite', 'master_company_invite', [
    { key: 'create_tenant', status: 'done' },
    { key: 'prepare_initial_products', status: 'done', detail: '1 criado(s)' },
  ]);
  assert.equal(ledger.version, 1);
  assert.equal(ledger.preset, 'master_invite');
  const parsed = JSON.parse(serializeProvisioningLedger(ledger));
  assert.equal(parsed.source, 'master_company_invite');
  assert.equal(parsed.steps.length, 2);
  assert.ok(typeof parsed.bornAt === 'string');
});
