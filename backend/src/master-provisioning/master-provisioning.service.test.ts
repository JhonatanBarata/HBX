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
    modules: ['vendas', 'webscraping', 'bot_ia'],
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
  assert.deepEqual(plan.modules.map((moduleItem) => moduleItem.key), ['vendas', 'webscraping', 'bot_ia']);
  assert.equal(plan.limits.commissionDueBusinessDays, 5);
  assert.equal(plan.admin?.email, 'dono@exemplo.com');
  assert.equal(plan.admin?.passwordProvided, false);
  assert.equal(plan.supportChannels.persistence, 'pending_schema');
  assert.equal(plan.supportChannels.replyToEmail, 'responder@cliente.com');
  assert.equal(plan.products[0].persistence, 'ready');
  assert.equal(plan.products[0].status, 'active');
  assert.equal(plan.assistedImplementation.status, 'pending');
  assert.equal(plan.steps.find((step) => step.key === 'configure_support_channels')?.status, 'pending_schema');
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
  assert.ok(plan.modules.some((moduleItem) => moduleItem.key === 'gerencial'));
  assert.equal(plan.admin, null);
  assert.equal(plan.products[0].key, 'oferta-principal');
  assert.equal(plan.products[0].kind, 'tenant_product');
  assert.equal(plan.products[0].status, 'draft');

  assert.throws(
    () => service.buildProvisioningPlan({ companyName: 'Cliente Tres', admin: { email: '' } }),
    BadRequestException,
  );
});

test('provisionTenant persists initial products for the tenant', async () => {
  const productCreates: any[] = [];
  const service = new MasterProvisioningService({
    company: { findUnique: async () => null },
    user: { findFirst: async () => null },
    $transaction: async (callback: any) => callback({
      company: { create: async () => ({ id: 42 }) },
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
    products: [
      {
        key: 'consultoria',
        name: 'Consultoria',
        priceCents: 12345,
        defaultCommissionPercent: 12,
      },
    ],
  });

  assert.equal(productCreates.length, 1);
  assert.equal(productCreates[0].companyId, 42);
  assert.equal(productCreates[0].sku, 'consultoria');
  assert.equal(productCreates[0].status, 'active');
  assert.equal(productCreates[0].priceCents, 12345);
  assert.equal(productCreates[0].defaultCommissionPercent, 12);
  assert.equal(productCreates[0].createdByUserId, 77);
  assert.equal(result.products[0].created, true);
  assert.equal(result.products[0].productId, 1);
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
