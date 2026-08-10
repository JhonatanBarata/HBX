import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TENANT_PROVISIONING_PRESETS,
  buildProvisioningLedger,
  getTenantProvisioningPreset,
  seedLogisticaConfigTx,
  seedTenantDefaultProductsTx,
  seedTenantModulesTx,
  serializeProvisioningLedger,
} from './tenant-provisioning.pipeline';

test('presets são declarativos e legíveis (diffs entre as 3 portas)', () => {
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.self_service, {
    seedsDefaultProducts: true,
    grantsManualEntitlements: false,
    createsAdminWithPassword: false,
  });
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.master_invite, {
    seedsDefaultProducts: true,
    grantsManualEntitlements: false,
    createsAdminWithPassword: false,
  });
  assert.deepEqual(TENANT_PROVISIONING_PRESETS.master_full, {
    seedsDefaultProducts: true,
    grantsManualEntitlements: true,
    createsAdminWithPassword: true,
  });
  assert.equal(getTenantProvisioningPreset('master_full').grantsManualEntitlements, true);
});

test('seedTenantModulesTx com apenas plan_default NÃO toca em CompanyModule (post-it)', async () => {
  const upserts: any[] = [];
  let queried = false;
  const tx = {
    systemModule: { findMany: async () => { queried = true; return []; } },
    companyModule: { upsert: async (args: any) => { upserts.push(args); return {}; } },
  };
  const result = await seedTenantModulesTx(tx as any, 10, [
    { key: 'vendas', enabled: true, source: 'plan_default' },
    { key: 'webscraping', enabled: true, source: 'plan_default' },
  ]);
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
    { key: 'webscraping', enabled: false, source: 'plan_default' },
  ]);
  // Só o de source=input entra; o plan_default é ignorado.
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

// ── ROTA v2 F2b (10/08) — empresa nova nasce no nível CREDITO ────────────────
test('seedLogisticaConfigTx: cria a LogisticaConfig com logisticaNivel CREDITO explícito', async () => {
  const creates: any[] = [];
  const tx = {
    logisticaConfig: {
      findUnique: async () => null,
      create: async ({ data }: any) => { creates.push(data); return { id: 'lc1', ...data }; },
    },
  };
  await seedLogisticaConfigTx(tx as any, 41);
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0], { companyId: 41, logisticaNivel: 'CREDITO' });
});

test('seedLogisticaConfigTx: idempotente — linha já existente não é tocada', async () => {
  let createCalled = false;
  const tx = {
    logisticaConfig: {
      findUnique: async () => ({ id: 'lc1' }),
      create: async () => { createCalled = true; return {}; },
    },
  };
  await seedLogisticaConfigTx(tx as any, 41);
  assert.equal(createCalled, false, 'linha já existe — create nunca deveria rodar');
});

test('seedLogisticaConfigTx: corrida (P2002) nunca derruba o nascimento do tenant', async () => {
  const tx = {
    logisticaConfig: {
      findUnique: async () => null,
      create: async () => {
        const err: any = new Error('unique constraint');
        err.code = 'P2002';
        throw err;
      },
    },
  };
  await assert.doesNotReject(() => seedLogisticaConfigTx(tx as any, 41));
});

test('seedLogisticaConfigTx: erro que NÃO é P2002 propaga (não engole erro real)', async () => {
  const tx = {
    logisticaConfig: {
      findUnique: async () => null,
      create: async () => { throw new Error('conexão caiu'); },
    },
  };
  await assert.rejects(() => seedLogisticaConfigTx(tx as any, 41), /conexão caiu/);
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
