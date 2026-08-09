import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService } from './nucleo-cadastro.service';
import { normalizeSearch } from './nucleo-search.util';

// NÚCLEO-CRM — 3 bugs de rota reproduzidos em produção (11/07):
//   BUG 2/3: POST /nucleo/contas e /nucleo/contatos com nome só-espaço/tab devolviam
//     500 (o service fazia `throw new Error(...)` puro depois do trim — o filtro global
//     de exceções só sabe traduzir HttpException pra status HTTP; Error puro vira 500).
//     Aqui testamos o SERVICE diretamente (bypass do DTO) pra provar que a correção é
//     de verdade no service (defesa em profundidade, não só na borda do DTO — ver
//     nucleo-r5.dto.test.ts pra a blindagem na borda).
//   BUG 1: busca por nome acentuado ("Déia") não achava o cliente (ILIKE é acento-
//     sensível). Aqui testamos que o WRITE path grava `searchName` normalizado e que o
//     READ path (listEmpresas/listClientes) inclui a cláusula OR de busca por ele.

function buildPrismaMock() {
  const store = { profiles: [] as any[], contatos: [] as any[] };
  let pid = 0;
  let cid = 0;

  const matchProfile = (p: any, w: any) =>
    (w.companyId == null || p.companyId === w.companyId) &&
    (w.id == null || p.id === w.id) &&
    (w.cnpj == null || p.cnpj === w.cnpj) &&
    (w.document == null || p.document === w.document) &&
    (w.phoneNormalized == null || p.phoneNormalized === w.phoneNormalized);

  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) =>
        store.profiles.find((p) => matchProfile(p, args?.where || {})) || null,
      create: async (args: any) => {
        const row = { id: `p${++pid}`, ...args.data };
        store.profiles.push(row);
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.profiles.find((p) => p.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return { id: args.where.id };
      },
      count: async () => store.profiles.length,
      findMany: async (args: any) => {
        // listClientes dispara MAIS de um findMany (a página + o universo de
        // duplicata em loadClientesCardExtras) — guarda TODAS as chamadas, o teste
        // procura a que tem where.OR (a busca por texto).
        (prisma as any)._findManyCalls.push(args);
        return store.profiles;
      },
    },
    contato: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        return (
          store.contatos.find(
            (c) =>
              (w.companyId == null || c.companyId === w.companyId) &&
              (w.customerProfileId == null || c.customerProfileId === w.customerProfileId) &&
              (w.isPrincipal == null || c.isPrincipal === w.isPrincipal),
          ) || null
        );
      },
      create: async (args: any) => {
        const row = { id: `c${++cid}`, ...args.data };
        store.contatos.push(row);
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.contatos.find((c) => c.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return { id: args.where.id };
      },
      updateMany: async () => ({ count: 0 }),
    },
    localEntrega: {
      findFirst: async () => null,
      count: async () => 0,
      create: async () => ({ id: 'l1' }),
      update: async (args: any) => ({ id: args.where.id }),
      findMany: async () => [],
    },
    clienteProduto: { findMany: async () => [] },
    entrega: { groupBy: async () => [] },
    logisticaConfig: { findFirst: async () => null },
    financeiroCharge: { groupBy: async () => [] },
    _findManyCalls: [] as any[],
  };
  return { prisma, store };
}

/** Acha, entre TODAS as chamadas de `customerProfile.findMany`, a que tem `where.OR`
 * (a query de busca por texto) — listClientes dispara mais de uma (página + universo
 * de duplicata em loadClientesCardExtras). */
function findSearchCall(prisma: any): any {
  return (prisma._findManyCalls as any[]).find((args) => Array.isArray(args?.where?.OR));
}

// ── BUG 2: createConta ────────────────────────────────────────────────────────
test('BUG 2: createConta com nome só-espaço → BadRequestException (400), não Error puro', async () => {
  const { prisma } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await assert.rejects(
    () => svc.createConta(1, { nome: '   ' } as any),
    (e: any) => {
      assert.equal(e?.constructor?.name, 'BadRequestException', 'deve ser BadRequestException (400), não Error puro (500)');
      return true;
    },
  );
});

test('BUG 2: createConta com nome só-tab → BadRequestException', async () => {
  const { prisma } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await assert.rejects(
    () => svc.createConta(1, { nome: '\t\t' } as any),
    (e: any) => e?.constructor?.name === 'BadRequestException',
  );
});

// ── BUG 3: addContato ─────────────────────────────────────────────────────────
test('BUG 3: addContato com nome só-espaço → BadRequestException (400), não Error puro', async () => {
  const { prisma, store } = buildPrismaMock();
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Conta X' });
  const svc = new NucleoCadastroService(prisma as any);

  await assert.rejects(
    () => svc.addContato(1, { customerProfileId: 'p1', nome: '   ' } as any),
    (e: any) => {
      assert.equal(e?.constructor?.name, 'BadRequestException', 'deve ser BadRequestException (400), não Error puro (500)');
      return true;
    },
  );
});

// ── BUG 1: write path grava searchName normalizado ────────────────────────────
test('BUG 1: createConta grava searchName sem acento (create)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.createConta(1, { nome: 'Déia Conceição', cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);
  const row = store.profiles.find((p) => p.name === 'Déia Conceição');
  assert.ok(row, 'conta deveria ter sido criada');
  assert.equal(row.searchName, normalizeSearch('Déia Conceição'));
  assert.equal(row.searchName, 'deia conceicao');
});

test('BUG 1: createConta grava searchName no ramo UPDATE (idempotência por telefone)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.createConta(1, { nome: 'André', whatsapp: '85999990000', cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);
  // mesma empresa + mesmo telefone → resolve pro MESMO registro (ramo update)
  await svc.createConta(1, { nome: 'André Souza', whatsapp: '85999990000', cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);

  assert.equal(store.profiles.length, 1, 'idempotência por telefone: não deve duplicar');
  assert.equal(store.profiles[0].name, 'André Souza');
  assert.equal(store.profiles[0].searchName, normalizeSearch('André Souza'));
  assert.equal(store.profiles[0].searchName, 'andre souza');
});

test('BUG 1: updateConta atualiza searchName quando o nome muda', async () => {
  const { prisma, store } = buildPrismaMock();
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Jose', searchName: 'jose' });
  const svc = new NucleoCadastroService(prisma as any);

  await svc.updateConta(1, 'p1', { nome: 'José da Conceição' } as any);
  assert.equal(store.profiles[0].searchName, 'jose da conceicao');
});

// ── BUG 1: read path (listEmpresas/listClientes) busca por searchName ─────────
test('BUG 1: listEmpresas inclui cláusula OR searchName com a query normalizada', async () => {
  const { prisma } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.listEmpresas(1, { query: 'Déia' } as any);
  const args = findSearchCall(prisma as any);
  const or = args?.where?.OR ?? [];
  const hasSearchNameClause = or.some(
    (clause: any) => clause?.searchName?.contains === 'deia',
  );
  assert.ok(hasSearchNameClause, 'where.OR deveria conter { searchName: { contains: "deia" } }');
  // ADITIVO: a cláusula antiga por `name` (ILIKE) continua presente.
  const hasNameClause = or.some((clause: any) => clause?.name?.contains === 'Déia');
  assert.ok(hasNameClause, 'where.OR deveria MANTER { name: { contains: "Déia", mode: insensitive } }');
});

test('BUG 1: listClientes inclui cláusula OR searchName com a query normalizada', async () => {
  const { prisma } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.listClientes(1, { query: 'José' } as any);
  const args = findSearchCall(prisma as any);
  const or = args?.where?.OR ?? [];
  const hasSearchNameClause = or.some(
    (clause: any) => clause?.searchName?.contains === 'jose',
  );
  assert.ok(hasSearchNameClause, 'where.OR deveria conter { searchName: { contains: "jose" } }');
});
