import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

import { buildTenantGuardExtension, TenantScopeViolationError } from './tenant-guard.extension';
import { runWithTenantContext, withoutTenantScope } from './tenant-context';

// ============================================================================
// Prova de isolamento de tenant contra o Postgres LOCAL (multi-tenancy Sprint 1).
// ============================================================================
//
// Este é o teste de INTEGRAÇÃO: sobe um PrismaClient de verdade com a extensão da
// trava (enforce) e exercita 2 empresas (A e B) com 1 Product cada, provando com o
// motor real do Prisma que:
//   (a) query tenant-scoped SEM companyId, num request de tenant, LANÇA;
//   (b) COM companyId retorna só as linhas daquela empresa (B não vaza pra A);
//   (c) modelo global não é afetado;
//   (d) withoutTenantScope bypassa.
//
// Requer o Postgres local (backend/.env → app-db-1). Se o banco não estiver
// acessível neste ambiente, o teste é PULADO (não quebra o gate) — a prova
// obrigatória do guard vive no unit test tenant-guard.extension.test.ts, que roda
// sem banco. Roda com: npm run build && node --test dist/prisma/tenant-isolation.integration.test.js
//
// Não usa e2e HTTP (o backend não tem harness supertest/jest); vai direto no client
// estendido, que é exatamente o caminho que o PrismaService monta em produção.

const SUFFIX = `iso_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

async function dbReachable(base: PrismaClient): Promise<boolean> {
  try {
    await base.$queryRawUnsafe('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

test('isolamento de tenant contra o Postgres local', async (t) => {
  const base = new PrismaClient();
  const reachable = await dbReachable(base);
  if (!reachable) {
    await base.$disconnect();
    t.skip('Postgres local indisponível — prova do guard fica no unit test.');
    return;
  }

  // Client ESTENDIDO com a trava em enforce (mesmo caminho do PrismaService).
  const prisma = base.$extends(buildTenantGuardExtension('enforce')) as unknown as PrismaClient;

  let companyAId = 0;
  let companyBId = 0;
  let productAId = 0;
  let productBId = 0;

  try {
    // Seed via withoutTenantScope (setup master legítimo) pra não bater na trava.
    await withoutTenantScope('seed-teste-isolamento', async () => {
      const a = await prisma.company.create({ data: { name: `Empresa A ${SUFFIX}`, slug: `a-${SUFFIX}` } });
      const b = await prisma.company.create({ data: { name: `Empresa B ${SUFFIX}`, slug: `b-${SUFFIX}` } });
      companyAId = a.id;
      companyBId = b.id;
      const pa = await prisma.product.create({ data: { name: `Prod A ${SUFFIX}`, price: 10, companyId: a.id } });
      const pb = await prisma.product.create({ data: { name: `Prod B ${SUFFIX}`, price: 20, companyId: b.id } });
      productAId = pa.id;
      productBId = pb.id;
    });

    // (a) No contexto do tenant A, findMany SEM companyId → LANÇA.
    await runWithTenantContext({ companyId: companyAId }, async () => {
      await assert.rejects(
        () => prisma.product.findMany({ where: { name: { contains: SUFFIX } } }),
        (err: unknown) => {
          assert.ok(err instanceof TenantScopeViolationError, 'esperava TenantScopeViolationError');
          return true;
        },
      );
    });

    // (b) COM companyId → só vê os produtos da própria empresa; B não vaza.
    await runWithTenantContext({ companyId: companyAId }, async () => {
      const rows = await prisma.product.findMany({
        where: { companyId: companyAId, name: { contains: SUFFIX } },
      });
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(productAId), 'A deveria ver o próprio produto');
      assert.ok(!ids.includes(productBId), 'produto de B VAZOU para A');
      assert.ok(rows.every((r) => r.companyId === companyAId), 'linha de outra empresa apareceu');
    });

    // (c) Modelo GLOBAL (Company) não é guardado: findMany sem tenant passa.
    await runWithTenantContext({ companyId: companyAId }, async () => {
      const companies = await prisma.company.findMany({ where: { name: { contains: SUFFIX } } });
      assert.ok(companies.length >= 2, 'Company é global — não deveria ser filtrada pela trava');
    });

    // (d) withoutTenantScope: leitura cross-tenant consciente passa (não lança).
    await runWithTenantContext({ companyId: companyAId }, async () => {
      const all = await withoutTenantScope('relatorio-cross-tenant-teste', () =>
        prisma.product.findMany({ where: { name: { contains: SUFFIX } } }),
      );
      const ids = all.map((r) => r.id);
      assert.ok(ids.includes(productAId) && ids.includes(productBId), 'bypass deveria ver A e B');
    });
  } finally {
    // Limpeza (fora da trava). Ordem: produtos → empresas (FK).
    await withoutTenantScope('cleanup-teste-isolamento', async () => {
      try {
        await prisma.product.deleteMany({ where: { name: { contains: SUFFIX } } });
        await prisma.company.deleteMany({ where: { name: { contains: SUFFIX } } });
      } catch {
        /* melhor-esforço */
      }
    });
    await base.$disconnect();
  }
});
