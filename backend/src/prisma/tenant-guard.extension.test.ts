import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TENANT_SCOPED_MODELS,
  TenantScopeViolationError,
  applyTenantGuard,
  resolveTenantGuardMode,
} from './tenant-guard.extension';
import { runWithTenantContext, withoutTenantScope } from './tenant-context';

// Exercita o núcleo da trava direto (applyTenantGuard), sem subir um PrismaClient
// real — o objeto que Prisma.defineExtension devolve é opaco (uma função).
function getAllOperations(mode: 'off' | 'report' | 'enforce') {
  return (params: {
    model: string;
    operation: string;
    args: any;
    query: (a: any) => Promise<any>;
  }) => applyTenantGuard(mode, params);
}

// query() fake: registra que foi chamado e devolve os args (prova de "deixou passar").
function fakeQuery() {
  const calls: any[] = [];
  const query = async (a: any): Promise<any> => {
    calls.push(a);
    return { passedThrough: true, args: a };
  };
  return { query, calls };
}

test('resolveTenantGuardMode: default por ambiente e override', () => {
  assert.equal(resolveTenantGuardMode({ NODE_ENV: 'production' } as any), 'report');
  assert.equal(resolveTenantGuardMode({ NODE_ENV: 'development' } as any), 'enforce');
  assert.equal(resolveTenantGuardMode({} as any), 'enforce');
  assert.equal(
    resolveTenantGuardMode({ NODE_ENV: 'production', HBX_TENANT_GUARD_MODE: 'off' } as any),
    'off',
  );
  assert.equal(
    resolveTenantGuardMode({ NODE_ENV: 'development', HBX_TENANT_GUARD_MODE: 'report' } as any),
    'report',
  );
});

test('lista tenant-scoped tem os modelos quentes e NÃO tem os globais', () => {
  // Sanidade da lista derivada do schema.
  for (const m of ['User', 'CompanyConversation', 'VendasLead', 'CustomerProfile', 'Product']) {
    assert.ok(TENANT_SCOPED_MODELS.has(m), `${m} deveria ser tenant-scoped`);
  }
  // Globais conhecidos NÃO entram (senão a lagoa do Radar / catálogos / o próprio
  // Company seriam guardados por engano).
  for (const g of ['Company', 'SystemModule', 'LeadContact', 'RadarMission']) {
    assert.ok(!TENANT_SCOPED_MODELS.has(g), `${g} NÃO deveria ser tenant-scoped`);
  }
});

test('(a) enforce: query tenant-scoped SEM companyId num request de tenant LANÇA', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, async () => {
    await assert.rejects(
      () =>
        op({
          model: 'VendasLead',
          operation: 'findMany',
          args: { where: { status: 'novo' } },
          query,
        }),
      (err: unknown) => {
        assert.ok(err instanceof TenantScopeViolationError);
        return true;
      },
    );
  });
  assert.equal(calls.length, 0, 'não deveria ter chegado ao banco');
});

test('(b) enforce: COM companyId no where raiz passa', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  const result: any = await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'VendasLead',
      operation: 'findMany',
      args: { where: { companyId: 7, status: 'novo' } },
      query,
    }),
  );
  assert.equal(calls.length, 1);
  assert.equal(result.passedThrough, true);
});

test('(b2) enforce: companyId dentro de AND raiz também passa', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'VendasLead',
      operation: 'findMany',
      args: { where: { AND: [{ status: 'novo' }, { companyId: 7 }] } },
      query,
    }),
  );
  assert.equal(calls.length, 1);
});

test('(b3) enforce: empresaId (Cadastros) conta como tenant key', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'CadastroFornecedor',
      operation: 'findMany',
      args: { where: { empresaId: 7 } },
      query,
    }),
  );
  assert.equal(calls.length, 1);
});

test('(c) modelo GLOBAL não é afetado (mesmo sem tenant no where)', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'LeadContact',
      operation: 'findMany',
      args: { where: {} },
      query,
    }),
  );
  assert.equal(calls.length, 1, 'modelo global deve passar direto');
});

test('(d) withoutTenantScope bypassa e NÃO lança em enforce', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    withoutTenantScope('lagoa-do-radar-master', () =>
      op({
        model: 'VendasLead',
        operation: 'findMany',
        args: { where: { status: 'novo' } },
        query,
      }),
    ),
  );
  assert.equal(calls.length, 1, 'bypass consciente deve deixar passar');
});

test('sem tenant no store (master puro / boot) NÃO acusa', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  // Sem runWithTenantContext ao redor = store vazio.
  await op({
    model: 'VendasLead',
    operation: 'findMany',
    args: { where: { status: 'novo' } },
    query,
  });
  assert.equal(calls.length, 1, 'sem tenant a exigir, deve passar');
});

test('report: query sem escopo PASSA (não lança) — modo seguro de prod', async () => {
  const op = getAllOperations('report');
  const { query, calls } = fakeQuery();

  const result: any = await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'VendasLead',
      operation: 'findMany',
      args: { where: { status: 'novo' } },
      query,
    }),
  );
  assert.equal(calls.length, 1, 'report deixa passar');
  assert.equal(result.passedThrough, true);
});

test('off: não intercepta nada', async () => {
  const op = getAllOperations('off');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'VendasLead',
      operation: 'findMany',
      args: { where: { status: 'novo' } },
      query,
    }),
  );
  assert.equal(calls.length, 1);
});

test('operações por-PK (findUnique) não são guardadas', async () => {
  const op = getAllOperations('enforce');
  const { query, calls } = fakeQuery();

  await runWithTenantContext({ companyId: 7 }, () =>
    op({
      model: 'VendasLead',
      operation: 'findUnique',
      args: { where: { id: 'abc' } },
      query,
    }),
  );
  assert.equal(calls.length, 1, 'findUnique resolve por chave única, fora do escopo do guard');
});

test('updateMany/deleteMany sem tenant LANÇAM em enforce (escrita em massa)', async () => {
  const op = getAllOperations('enforce');
  for (const operation of ['updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy']) {
    const { query } = fakeQuery();
    await runWithTenantContext({ companyId: 7 }, async () => {
      await assert.rejects(
        () =>
          op({
            model: 'VendasLead',
            operation,
            args: { where: { status: 'x' } },
            query,
          }),
        TenantScopeViolationError,
        `${operation} deveria lançar`,
      );
    });
  }
});
