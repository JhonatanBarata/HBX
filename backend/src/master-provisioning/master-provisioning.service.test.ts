import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { MasterProvisioningService } from './master-provisioning.service';

function buildService() {
  return new MasterProvisioningService({} as any);
}

test('buildProvisioningPlan creates tenant contract without platform infra privileges', () => {
  const service = buildService();

  const plan = service.buildProvisioningPlan({
    companyName: 'Cliente Exemplo',
    slug: 'hbx',
    planKey: 'hbx_melhor',
    manualAccess: true,
    billingCycle: 'ANNUAL',
    modules: ['vendas', 'webscraping'],
    limits: {
      commercialCardsMonthlyLimitOverride: 5000,
      commercialCardsDailyLimitOverride: 250,
      commissionDueBusinessDays: 5,
    },
    admin: {
      name: 'Dono',
      email: 'DONO@EXEMPLO.COM',
    },
    supportEmail: 'suporte@cliente.com',
    replyToEmail: 'responder@cliente.com',
    supportWhatsapp: '+55 11 99999-0000',
    products: [{ name: 'Produto inicial', description: 'Primeira oferta' }],
    assistedImplementation: {
      required: true,
      note: 'Implantacao guiada pelo Master.',
    },
  });

  assert.equal(plan.tenant.companyKind, 'tenant');
  assert.equal(plan.tenant.slug, 'hbx');
  assert.equal(plan.commercial.planKey, 'hbx_melhor');
  assert.equal(plan.commercial.manualAccess, true);
  assert.equal(plan.commercial.entitlementStatus, 'manual');
  assert.deepEqual(plan.modules.map((moduleItem) => moduleItem.key), ['vendas', 'webscraping']);
  assert.equal(plan.limits.commissionDueBusinessDays, 5);
  assert.equal(plan.admin?.email, 'dono@exemplo.com');
  assert.equal(plan.admin?.passwordProvided, false);
  assert.equal(plan.supportChannels.persistence, 'ready');
  assert.equal(plan.supportChannels.replyToEmail, 'responder@cliente.com');
  assert.equal(plan.products[0].persistence, 'ready');
  assert.equal(plan.products[0].status, 'active');
  assert.equal(plan.assistedImplementation.status, 'pending');
  assert.equal(plan.steps.find((step) => step.key === 'configure_support_channels')?.status, 'ready');
  assert.equal(plan.steps.find((step) => step.key === 'prepare_initial_products')?.status, 'ready');
});

test('buildProvisioningPlan defaults modules from selected plan and validates admin email', () => {
  const service = buildService();

  const plan = service.buildProvisioningPlan({
    companyName: 'Cliente Dois',
    planKey: 'hbx_padrao',
    manualAccess: false,
  });

  assert.equal(plan.tenant.companyKind, 'tenant');
  assert.equal(plan.commercial.entitlementStatus, 'pending_configuration');
  // Plano semeia módulos do catálogo comercial; gerencial NÃO entra mais (21/06):
  // virou admin-tier (acesso por role), fora de COMMERCIAL_PLAN_MODULE_KEYS.
  assert.ok(plan.modules.some((moduleItem) => moduleItem.key === 'vendas'));
  assert.equal(plan.modules.some((moduleItem) => moduleItem.key === 'gerencial'), false);
  assert.equal(plan.admin, null);
  assert.equal(plan.products[0].key, 'oferta-principal');
  assert.equal(plan.products[0].kind, 'tenant_product');
  assert.equal(plan.products[0].status, 'draft');

  assert.throws(
    () => service.buildProvisioningPlan({ companyName: 'Cliente Tres', admin: { email: '' } }),
    BadRequestException,
  );
});

test('provisionTenant persists initial products and support channels for the tenant', async () => {
  const productCreates: any[] = [];
  const companyCreates: any[] = [];
  const companyUpdates: any[] = [];
  const service = new MasterProvisioningService({
    company: { findUnique: async () => null },
    user: { findFirst: async () => null },
    $transaction: async (callback: any) => callback({
      company: {
        create: async ({ data }: any) => {
          companyCreates.push(data);
          return { id: 42 };
        },
        update: async ({ data }: any) => {
          companyUpdates.push(data);
          return { id: 42 };
        },
      },
      systemModule: { findMany: async () => [] },
      companyModule: { upsert: async () => ({}) },
      companyCommercialEntitlement: { upsert: async () => ({}) },
      user: { create: async () => ({ id: 77 }) },
      product: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          productCreates.push(data);
          return { id: productCreates.length };
        },
      },
    }),
  } as any);

  const result = await service.provisionTenant({
    companyName: 'Cliente Produto',
    slug: 'cliente-produto',
    manualAccess: false,
    admin: {
      email: 'admin@produto.com',
      password: 'senha-temporaria',
    },
    supportEmail: 'suporte@produto.com',
    replyToEmail: 'responder@produto.com',
    supportWhatsapp: '+55 11 97777-0000',
    products: [
      {
        key: 'consultoria',
        name: 'Consultoria',
        priceCents: 12345,
        defaultCommissionPercent: 12,
      },
    ],
  });

  assert.equal(companyCreates.length, 1);
  assert.equal(companyCreates[0].supportEmail, 'suporte@produto.com');
  assert.equal(companyCreates[0].replyToEmail, 'responder@produto.com');
  assert.equal(companyCreates[0].supportWhatsapp, '+55 11 97777-0000');
  assert.equal(productCreates.length, 1);
  assert.equal(productCreates[0].companyId, 42);
  assert.equal(productCreates[0].sku, 'consultoria');
  assert.equal(productCreates[0].status, 'active');
  assert.equal(productCreates[0].priceCents, 12345);
  assert.equal(productCreates[0].defaultCommissionPercent, 12);
  assert.equal(productCreates[0].createdByUserId, 77);
  assert.equal(result.products[0].created, true);
  assert.equal(result.products[0].productId, 1);
  // Ledger de nascimento persistido no full.
  assert.equal(companyUpdates.length, 1);
  const ledger = JSON.parse(companyUpdates[0].provisioningLedgerJson);
  assert.equal(ledger.preset, 'master_full');
  assert.equal(ledger.source, 'master_provisioning');
  assert.ok(ledger.steps.find((step: any) => step.key === 'create_tenant'));
});

test('provisionTenant WITHOUT explicit modules does NOT write CompanyModule (post-it)', async () => {
  const moduleUpserts: any[] = [];
  let systemModuleQueried = false;
  const companyUpdates: any[] = [];
  const service = new MasterProvisioningService({
    company: { findUnique: async () => null },
    user: { findFirst: async () => null },
    $transaction: async (callback: any) => callback({
      company: {
        create: async () => ({ id: 99 }),
        update: async ({ data }: any) => {
          companyUpdates.push(data);
          return { id: 99 };
        },
      },
      systemModule: {
        findMany: async () => {
          systemModuleQueried = true;
          return [];
        },
      },
      companyModule: { upsert: async (args: any) => { moduleUpserts.push(args); return {}; } },
      companyCommercialEntitlement: { upsert: async () => ({}) },
      user: { create: async () => ({ id: 1 }) },
      product: { findFirst: async () => null, create: async () => ({ id: 1 }) },
    }),
  } as any);

  // manualAccess=true (default) mas SEM modules explícitos: o full concede
  // entitlements do plano, porém o post-it NÃO grava nenhum CompanyModule.
  await service.provisionTenant({ companyName: 'Sem Modulos Explicitos', planKey: 'hbx_padrao' });

  assert.equal(moduleUpserts.length, 0);
  assert.equal(systemModuleQueried, false);
  const ledger = JSON.parse(companyUpdates[0].provisioningLedgerJson);
  assert.equal(ledger.steps.find((step: any) => step.key === 'release_modules')?.status, 'skipped');
});

test('provisionTenant WITH explicit modules writes CompanyModule (exceção do master)', async () => {
  const moduleUpserts: any[] = [];
  const service = new MasterProvisioningService({
    company: { findUnique: async () => null },
    user: { findFirst: async () => null },
    $transaction: async (callback: any) => callback({
      company: { create: async () => ({ id: 7 }), update: async () => ({ id: 7 }) },
      systemModule: {
        findMany: async ({ where }: any) => where.key.in.map((key: string, index: number) => ({ id: index + 1, key })),
      },
      companyModule: { upsert: async (args: any) => { moduleUpserts.push(args); return {}; } },
      companyCommercialEntitlement: { upsert: async () => ({}) },
      user: { create: async () => ({ id: 1 }) },
      product: { findFirst: async () => null, create: async () => ({ id: 1 }) },
    }),
  } as any);

  await service.provisionTenant({
    companyName: 'Com Modulos',
    planKey: 'hbx_padrao',
    modules: ['vendas', 'webscraping'],
  });

  assert.equal(moduleUpserts.length, 2);
});

test('backfillTenantProducts dry-run reports products that would be created', async () => {
  const service = new MasterProvisioningService({
    company: {
      findMany: async () => [{ id: 10, name: 'Tenant sem catalogo' }],
    },
    product: {
      findFirst: async () => null,
    },
  } as any);

  const result = await service.backfillTenantProducts({ dryRun: true });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.companyCount, 1);
  assert.equal(result.createdCount, 0);
  assert.equal(result.wouldCreateCount, 1);
  assert.equal(result.rows[0].products[0].key, 'oferta-principal');
});

test('seedHbxTenantProducts dry-run reports HBX tenant products without creating them', async () => {
  const service = new MasterProvisioningService({
    company: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where, { slug: 'hbx', companyKind: 'tenant' });
        return { id: 20, slug: 'hbx' };
      },
    },
    product: {
      findFirst: async () => null,
    },
  } as any);

  const result = await service.seedHbxTenantProducts({ dryRun: true });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.foundTenant, true);
  assert.equal(result.companyId, 20);
  assert.equal(result.createdCount, 0);
  assert.equal(result.wouldCreateCount, 3);
  assert.deepEqual(result.products.map((product) => product.key), ['hbx-list', 'hbx-lead', 'hbx-company']);
});
