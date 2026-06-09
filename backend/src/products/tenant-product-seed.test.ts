import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';
import {
  buildHbxTenantProductSeeds,
  buildTenantProductSeeds,
  ensureHbxTenantProductsTx,
} from './tenant-product-seed';

test('buildTenantProductSeeds creates tenant_product as default product kind', () => {
  const seeds = buildTenantProductSeeds();

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].key, 'oferta-principal');
  assert.equal(seeds[0].kind, 'tenant_product');
});

test('buildHbxTenantProductSeeds creates HBX plans as platform_plan tenant data', () => {
  const seeds = buildHbxTenantProductSeeds();

  assert.equal(seeds.length, 3);
  assert.deepEqual(seeds.map((seed) => seed.key), ['hbx-list', 'hbx-lead', 'hbx-company']);
  assert.deepEqual(seeds.map((seed) => seed.kind), ['platform_plan', 'platform_plan', 'platform_plan']);
  assert.deepEqual(seeds.map((seed) => seed.planKey), [
    COMMERCIAL_PLAN_KEYS.LITE,
    COMMERCIAL_PLAN_KEYS.PADRAO,
    COMMERCIAL_PLAN_KEYS.MELHOR,
  ]);
  assert.deepEqual(seeds.map((seed) => seed.billingCycle), ['MONTHLY', 'MONTHLY', 'MONTHLY']);
  assert.deepEqual(seeds.map((seed) => seed.saleMode), ['checkout', 'checkout', 'assisted']);
  assert.equal(JSON.parse(seeds[2].metadataJson).legacyAlias, 'hbx_company');
});

test('ensureHbxTenantProductsTx does not create products when HBX is not a tenant', async () => {
  let seenWhere: any = null;
  let createCalls = 0;
  const result = await ensureHbxTenantProductsTx({
    company: {
      findFirst: async ({ where }: any) => {
        seenWhere = where;
        return null;
      },
    },
    product: {
      create: async () => {
        createCalls += 1;
      },
    },
  });

  assert.deepEqual(seenWhere, { slug: 'hbx', companyKind: 'tenant' });
  assert.equal(result.foundTenant, false);
  assert.equal(result.products.length, 0);
  assert.equal(createCalls, 0);
});

test('ensureHbxTenantProductsTx is idempotent and creates only missing tenant products', async () => {
  const created: any[] = [];
  const result = await ensureHbxTenantProductsTx({
    company: {
      findFirst: async () => ({ id: 9, slug: 'hbx' }),
    },
    product: {
      findFirst: async ({ where }: any) => {
        const skus = (where.OR || []).map((item: any) => item.sku).filter(Boolean);
        return skus.includes('hbx-list') ? { id: 101 } : null;
      },
      create: async ({ data }: any) => {
        created.push(data);
        return { id: 200 + created.length };
      },
    },
  });

  assert.equal(result.foundTenant, true);
  assert.equal(result.companyId, 9);
  assert.equal(result.products.length, 3);
  assert.equal(result.products[0].created, false);
  assert.equal(result.products[0].productId, 101);
  assert.equal(created.length, 2);
  assert.deepEqual(created.map((row) => row.sku), ['hbx-lead', 'hbx-company']);
  assert.deepEqual(created.map((row) => row.companyId), [9, 9]);
});
