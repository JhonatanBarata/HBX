import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { serializeTeamPolicyModuleAndAccessRows } from '../team/team-policy-persistence';

function buildUser(overrides: Record<string, any> = {}) {
  const company = overrides.company || {
    id: 1,
    name: 'Cliente A',
    companyKind: 'tenant',
  };
  return {
    id: 7,
    companyId: company.id,
    role: 'USER',
    isSystemMaster: false,
    company,
    ...overrides,
  };
}

function buildPolicy(access: Record<string, boolean> = {}, userId = 7) {
  return {
    id: `policy-${userId}`,
    userId,
    companyId: 1,
    status: 'active',
    subjectKind: null,
    modulesJson: serializeTeamPolicyModuleAndAccessRows({
      modules: [],
      access,
    }),
    allowedSegmentsJson: '[]',
    blockedSegmentsJson: '[]',
    allowedCitiesJson: '[]',
    allowedStatesJson: '[]',
    requiresLocation: null,
    requiredChannelsJson: '{}',
    visibilityJson: null,
  };
}

function buildHarness(input: {
  access?: Record<string, boolean>;
  products?: any[];
  user?: any;
} = {}) {
  const user = input.user || buildUser();
  const products = input.products || [
    {
      id: 1,
      companyId: 1,
      name: 'Produto A',
      description: null,
      price: 99.9,
      priceCents: 9990,
      status: 'active',
      sortOrder: 0,
      stock: 0,
    },
    {
      id: 2,
      companyId: 2,
      name: 'Produto B',
      description: null,
      price: 49.9,
      priceCents: 4990,
      status: 'active',
      sortOrder: 0,
      stock: 0,
    },
  ];
  const versions: any[] = [];

  const prisma = {
    user: {
      findUnique: async () => user,
    },
    userTeamPolicy: {
      findUnique: async () => buildPolicy(input.access || {}, Number(user.id || 7)),
    },
    userModuleAccess: {
      findMany: async () => [],
    },
    company: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
    },
    product: {
      findMany: async ({ where }: any) => products.filter((product) => {
        if (where.companyId !== undefined && product.companyId !== where.companyId) return false;
        if (where.status !== undefined && product.status !== where.status) return false;
        return true;
      }),
      findFirst: async ({ where }: any) => products.find((product) => {
        if (where.id !== undefined && product.id !== where.id) return false;
        if (where.companyId !== undefined && product.companyId !== where.companyId) return false;
        if (where.status !== undefined && product.status !== where.status) return false;
        return true;
      }) || null,
      findUnique: async ({ where }: any) => products.find((product) => product.id === where.id) || null,
      create: async ({ data }: any) => {
        const created = { id: products.length + 1, ...data };
        products.push(created);
        return created;
      },
      createMany: async ({ data }: any) => {
        const list = Array.isArray(data) ? data : [data];
        for (const row of list) products.push({ id: products.length + 1, ...row });
        return { count: list.length };
      },
      update: async ({ where, data }: any) => {
        const index = products.findIndex((product) => product.id === where.id);
        assert.notEqual(index, -1);
        products[index] = { ...products[index], ...data };
        return products[index];
      },
      delete: async ({ where }: any) => {
        const index = products.findIndex((product) => product.id === where.id);
        assert.notEqual(index, -1);
        const [removed] = products.splice(index, 1);
        return removed;
      },
    },
    productVersion: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        versions.push(data);
        return data;
      },
    },
  };
  const productVersionService = {
    createVersion: async (productId: number, data: any, authorId?: number) => {
      versions.push({ productId, data, authorId });
      return { productId, data, authorId };
    },
  };

  return {
    user,
    products,
    versions,
    service: new ProductsService(prisma as any, productVersionService as any),
  };
}

test('listProductsForUser scopes by tenant and hides price without products.viewPrice', async () => {
  const { service, user } = buildHarness({
    access: { 'products.viewPrice': false },
  });

  const rows = await service.listProductsForUser(user);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyId, 1);
  assert.equal(rows[0].price, null);
  assert.equal(rows[0].priceCents, null);
});

test('listProductsForUser requires products.view', async () => {
  const { service, user } = buildHarness({
    access: { 'products.view': false },
  });

  await assert.rejects(
    () => service.listProductsForUser(user),
    ForbiddenException,
  );
});

test('platform_infra users cannot operate tenant products', async () => {
  const user = buildUser({
    companyId: 99,
    company: {
      id: 99,
      name: 'HBX Infra',
      companyKind: 'platform_infra',
    },
  });
  const { service } = buildHarness({ user });

  await assert.rejects(
    () => service.listProductsForUser(user),
    /tenant obrigatorio/i,
  );
});

test('createProductForUser requires products.edit and products.changePrice for price fields', async () => {
  const blocked = buildHarness({
    access: { 'products.edit': false },
  });

  await assert.rejects(
    () => blocked.service.createProductForUser(blocked.user, { name: 'Plano A' }),
    ForbiddenException,
  );

  const noPriceAccess = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': false },
  });

  await assert.rejects(
    () => noPriceAccess.service.createProductForUser(noPriceAccess.user, { name: 'Plano A', priceCents: 12990 }),
    ForbiddenException,
  );

  const noDiscountAccess = buildHarness({
    access: { 'products.edit': true, 'products.discount': false },
  });

  await assert.rejects(
    () => noDiscountAccess.service.createProductForUser(noDiscountAccess.user, {
      name: 'Plano com desconto',
      allowDiscount: true,
    }),
    ForbiddenException,
  );

  const allowed = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': true },
  });
  const created = await allowed.service.createProductForUser(allowed.user, { name: 'Plano A', priceCents: 12990 });

  assert.equal(created.companyId, 1);
  assert.equal(created.kind, 'tenant_product');
  assert.equal(created.price, 129.9);
  assert.equal(created.priceCents, 12990);
  assert.equal(created.createdByUserId, 7);
});

test('updateProductForUser blocks cross-tenant writes and protects price changes', async () => {
  const blocked = buildHarness({
    access: { 'products.edit': false },
  });

  await assert.rejects(
    () => blocked.service.updateProductForUser(blocked.user, 1, { name: 'Bloqueado' }),
    ForbiddenException,
  );

  const noPriceAccess = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': false },
  });

  await assert.rejects(
    () => noPriceAccess.service.updateProductForUser(noPriceAccess.user, 1, { priceCents: 12000 }),
    ForbiddenException,
  );

  const allowed = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': true },
  });

  await assert.rejects(
    () => allowed.service.updateProductForUser(allowed.user, 2, { name: 'Outro tenant' }),
    ForbiddenException,
  );

  const updated = await allowed.service.updateProductForUser(allowed.user, 1, { name: 'Produto Atualizado' });
  assert.equal(updated.name, 'Produto Atualizado');
  assert.equal(allowed.versions.length, 1);
});

test('archiveProductForUser marks product archived instead of deleting', async () => {
  const { service, user, products, versions } = buildHarness({
    access: { 'products.edit': true },
  });

  const result = await service.archiveProductForUser(user, 1);

  assert.deepEqual(result, { success: true });
  assert.equal(products.length, 2);
  assert.equal(products[0].status, 'archived');
  assert.equal(versions.length, 1);
});

test('deleteProductForUser (TASK 8) apaga de verdade — não sobra linha arquivada', async () => {
  const { service, user, products } = buildHarness({
    access: { 'products.edit': true },
  });

  const result = await service.deleteProductForUser(user, 1);

  assert.deepEqual(result, { success: true });
  assert.equal(products.length, 1, 'o produto 1 some de vez (hard delete, não archive)');
  assert.equal(products.find((p: any) => p.id === 1), undefined);
});

test('deleteProductForUser exige products.edit e bloqueia cross-tenant', async () => {
  const blocked = buildHarness({ access: { 'products.edit': false } });
  await assert.rejects(
    () => blocked.service.deleteProductForUser(blocked.user, 1),
    ForbiddenException,
  );

  const allowed = buildHarness({ access: { 'products.edit': true } });
  await assert.rejects(
    () => allowed.service.deleteProductForUser(allowed.user, 2), // produto da empresa 2 (outro tenant)
    ForbiddenException,
  );
});

test('resolveSellableProductForUser requires products.sell and active tenant product', async () => {
  const blocked = buildHarness({
    access: { 'products.sell': false },
  });

  await assert.rejects(
    () => blocked.service.resolveSellableProductForUser(blocked.user, 1),
    ForbiddenException,
  );

  const allowed = buildHarness({
    access: { 'products.sell': true },
  });

  const product = await allowed.service.resolveSellableProductForUser(allowed.user, 1);
  assert.equal(product.id, 1);

  await assert.rejects(
    () => allowed.service.resolveSellableProductForUser(allowed.user, 2),
    /not found/i,
  );
});

test('importProductsForUser cria em lote, pula linha sem nome e converte preço', async () => {
  const { service, user, products } = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': true },
  });

  const res = await service.importProductsForUser(user, [
    { name: 'Galão 20L', price: 12.5, unidade: 'galão 20L', usaLogistica: true },
    { name: '', price: 9 }, // pulada (sem nome)
    { name: 'Água 500ml', price: 2 },
  ]);

  assert.equal(res.total, 3);
  assert.equal(res.imported, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.errors.length, 0);
  // 2 iniciais do harness + 2 importados
  assert.equal(products.length, 4);
  const galao = products.find((p: any) => p.name === 'Galão 20L');
  assert.equal(galao.companyId, 1);
  assert.equal(galao.priceCents, 1250);
  assert.equal(galao.usaLogistica, true);
});

test('importProductsForUser exige products.edit', async () => {
  const { service, user } = buildHarness({ access: { 'products.edit': false } });
  await assert.rejects(
    () => service.importProductsForUser(user, [{ name: 'X' }]),
    ForbiddenException,
  );
});

test('importProductsForUser bloqueia preço sem products.changePrice', async () => {
  const { service, user } = buildHarness({
    access: { 'products.edit': true, 'products.changePrice': false },
  });
  await assert.rejects(
    () => service.importProductsForUser(user, [{ name: 'X', price: 10 }]),
    ForbiddenException,
  );
  // sem preço, a mesma política deixa importar
  const ok = await service.importProductsForUser(user, [{ name: 'Serviço' }]);
  assert.equal(ok.imported, 1);
});
