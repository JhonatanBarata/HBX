import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService } from './nucleo-cadastro.service';

/**
 * PR18072026 W1 — `CustomerProfile.observacoes` (VarChar 500): aceito no
 * create/update de contas (nucleo), trim + max 500, exposto em getCliente e
 * listClientes (o "lista/detalhe de clientes usados pelo app" do contrato).
 */

function buildPrismaMock() {
  const store = { profiles: [] as any[], contatos: [] as any[] };
  let pid = 0;

  const matchProfile = (p: any, w: any) =>
    (w.companyId == null || p.companyId === w.companyId) &&
    (w.id == null || p.id === w.id) &&
    (w.cnpj == null || p.cnpj === w.cnpj) &&
    (w.document == null || p.document === w.document) &&
    (w.phoneNormalized == null || p.phoneNormalized === w.phoneNormalized);

  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) => store.profiles.find((p) => matchProfile(p, args?.where || {})) || null,
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
      findMany: async () => store.profiles,
    },
    contato: {
      findFirst: async () => null,
      create: async () => ({ id: 'c1' }),
      update: async () => ({ id: 'c1' }),
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
    // PONTE CADASTRO→AGENDA (26/07) — o card consulta os planos da Agenda V2.
    logisticaPlanoEntrega: { findMany: async () => [] },
    financeiroCharge: { groupBy: async () => [] },
  };
  return { prisma, store };
}

test('createConta: grava observacoes (trim + max 500)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.createConta(1, { nome: 'Dona Maria', observacoes: '  Deixa na portaria.  ', cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);
  assert.equal(store.profiles[0].observacoes, 'Deixa na portaria.');
});

test('createConta: observacoes muito longa é truncada em 500', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.createConta(1, { nome: 'Dona Maria', observacoes: 'x'.repeat(600), cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);
  assert.equal(store.profiles[0].observacoes.length, 500);
});

test('createConta: observacoes omitida nasce null', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.createConta(1, { nome: 'Dona Maria', cep: '60000-000', numero: '10', endereco: 'Rua A' } as any);
  assert.equal(store.profiles[0].observacoes, null);
});

test('updateConta: edita observacoes; string vazia LIMPA (vira null)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Dona Maria', observacoes: 'Antiga' });

  await svc.updateConta(1, 'p1', { observacoes: 'Cachorro bravo, tocar interfone.' } as any);
  assert.equal(store.profiles[0].observacoes, 'Cachorro bravo, tocar interfone.');

  await svc.updateConta(1, 'p1', { observacoes: '   ' } as any);
  assert.equal(store.profiles[0].observacoes, null, 'string vazia (pós-trim) limpa o campo');
});

test('updateConta: observacoes omitida no PATCH não mexe no valor existente', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Dona Maria', observacoes: 'Original' });

  await svc.updateConta(1, 'p1', { nome: 'Dona Maria Silva' } as any);
  assert.equal(store.profiles[0].observacoes, 'Original', 'PATCH parcial sem observacoes não apaga');
});

test('getCliente: expõe observacoes na ficha', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Dona Maria', tipo: 'pf', observacoes: 'Deixa com o porteiro.' });

  const cliente = await svc.getCliente(1, 'p1');
  assert.equal(cliente?.observacoes, 'Deixa com o porteiro.');
});

test('getCliente: observacoes ausente vira null (nunca undefined)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);
  store.profiles.push({ id: 'p1', companyId: 1, name: 'Dona Maria', tipo: 'pf' });

  const cliente = await svc.getCliente(1, 'p1');
  assert.equal(cliente?.observacoes, null);
});

test('listClientes: card do /entrega expõe observacoes por item', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);
  store.profiles.push({
    id: 'p1',
    companyId: 1,
    name: 'Dona Maria',
    isCliente: true,
    status: 'active',
    observacoes: 'Só recebe depois das 14h.',
  });

  const result = await svc.listClientes(1, {});
  assert.equal(result.items[0].observacoes, 'Só recebe depois das 14h.');
});
