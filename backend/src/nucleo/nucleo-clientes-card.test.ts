import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NucleoCadastroService,
  enderecoDupKey,
  normalizeDupKey,
} from './nucleo-cadastro.service';

// W5 (10/07) — card de clientes do /entrega:
//   (1) normalização da detecção de duplicidade (pura, sem banco);
//   (2) GET /nucleo/clientes: pendências/dias/duplicata/débito/entregas (mock);
//   (3) DELETE bloqueado por dívida → 409 CLIENTE_COM_DEBITO (mock).

// ── (1) normalização de duplicidade (igualdade exata pós-normalização) ────────
test('W5 normalizeDupKey: lower + sem acento + espaços colapsados', () => {
  assert.equal(normalizeDupKey('  José   da  SILVA '), 'jose da silva');
  assert.equal(normalizeDupKey('PADARIA SÃO JOÃO'), normalizeDupKey('padaria sao joao'));
  assert.equal(normalizeDupKey('Açaí\tDo   Zé'), 'acai do ze');
});

test('W5 normalizeDupKey: vazio/null/só-espaço → null (não forma par)', () => {
  assert.equal(normalizeDupKey(''), null);
  assert.equal(normalizeDupKey('   '), null);
  assert.equal(normalizeDupKey(null), null);
  assert.equal(normalizeDupKey(undefined), null);
});

test('W5 enderecoDupKey: exige AMBOS endereco e numero não-vazios', () => {
  assert.equal(enderecoDupKey('Rua das Flores', '123'), 'rua das flores|123');
  assert.equal(enderecoDupKey('Rua das Flores', ''), null);
  assert.equal(enderecoDupKey('', '123'), null);
  assert.equal(enderecoDupKey(null, null), null);
  // mesma rua com acento/caixa diferente = mesmo par
  assert.equal(enderecoDupKey('RUA DAS  FLÔRES', ' 123 '), enderecoDupKey('rua das flores', '123'));
});

// ── mock de banco pro listClientes/softDeleteConta ────────────────────────────
type MockOpts = {
  pageRows: any[];
  universe?: any[]; // clientes ativos company-wide (detecção de duplicata)
  vinculos?: any[];
  entregasAgg?: any[];
  config?: any; // LogisticaConfig
  chargesPendentes?: any[]; // groupBy FinanceiroCharge pending
  entregasAguardando?: any[]; // groupBy Entrega aguardando_fechamento
};

function buildPrismaMock(opts: MockOpts) {
  const store = { deletionRecords: [] as any[], accountUpdates: [] as any[] };
  const prisma: any = {
    customerProfile: {
      count: async () => opts.pageRows.length,
      findMany: async (args: any) => {
        // universo da duplicata (company-wide) tem where.status='active'; a página tem skip/take.
        if (args?.where?.status === 'active') return opts.universe ?? opts.pageRows;
        return opts.pageRows;
      },
      findFirst: async (args: any) =>
        opts.pageRows.find(
          (r) => r.id === args?.where?.id && (args?.where?.companyId == null || r.companyId === args.where.companyId),
        ) || null,
      update: async (args: any) => {
        store.accountUpdates.push(args);
        return { id: args.where.id };
      },
    },
    clienteProduto: { findMany: async () => opts.vinculos ?? [] },
    entrega: {
      groupBy: async (args: any) =>
        args?.where?.cobrancaStatus === 'aguardando_fechamento'
          ? opts.entregasAguardando ?? []
          : opts.entregasAgg ?? [],
    },
    logisticaConfig: { findFirst: async () => opts.config ?? null },
    financeiroCharge: { groupBy: async () => opts.chargesPendentes ?? [] },
    deletionRecord: {
      create: async (args: any) => {
        store.deletionRecords.push(args.data);
        return args.data;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store };
}

const baseRow = (over: any = {}) => ({
  id: 'c1',
  companyId: 7,
  name: 'Dona Maria',
  cnpj: null,
  cidade: null,
  uf: null,
  isLead: false,
  isCliente: true,
  isFornecedor: false,
  origin: 'manual',
  status: 'active',
  endereco: 'Rua A',
  numero: '10',
  lat: -4,
  lng: -38,
  phoneNormalized: '5588999990000',
  _count: { contatos: 1 },
  ...over,
});

// ── (2) GET /nucleo/clientes — campos aditivos ────────────────────────────────
test('W5 listClientes: pendências na ordem fixa endereco→numero→gps→dia→whatsapp', async () => {
  const row = baseRow({ endereco: '  ', numero: null, lat: null, phoneNormalized: null });
  const { prisma } = buildPrismaMock({ pageRows: [row], universe: [row], vinculos: [] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.deepEqual(res.items[0].pendencias, ['endereco', 'numero', 'gps', 'dia', 'whatsapp']);
  assert.deepEqual(res.items[0].diasEntrega, []);
  assert.equal(res.items[0].entregasCount, 0);
});

test('W5 listClientes: vínculo ativo com diasSemana limpa pendência "dia" e une os dias', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    vinculos: [
      { customerProfileId: 'c1', diasSemana: '5,1', frequenciaDias: null },
      { customerProfileId: 'c1', diasSemana: '3', frequenciaDias: null },
    ],
    entregasAgg: [{ customerProfileId: 'c1', _count: { _all: 12 } }],
  });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.ok(!res.items[0].pendencias.includes('dia'));
  assert.deepEqual(res.items[0].diasEntrega, [1, 3, 5], 'união ISO ordenada asc');
  assert.equal(res.items[0].entregasCount, 12);
});

test('W5 listClientes: frequenciaDias > 0 também limpa "dia" (sem diasSemana)', async () => {
  const row = baseRow();
  const { prisma } = buildPrismaMock({
    pageRows: [row],
    universe: [row],
    vinculos: [{ customerProfileId: 'c1', diasSemana: null, frequenciaDias: 7 }],
  });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.ok(!res.items[0].pendencias.includes('dia'));
  assert.deepEqual(res.items[0].diasEntrega, []);
});

test('W5 listClientes: duplicata por NOME normalizado marca os dois lados', async () => {
  const a = baseRow({ id: 'a', name: 'Padaria São João', endereco: null, numero: null });
  const b = baseRow({ id: 'b', name: '  padaria   sao joao ', endereco: null, numero: null });
  const { prisma } = buildPrismaMock({ pageRows: [a, b], universe: [a, b] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.equal(res.items[0].duplicataDe?.id, 'b');
  assert.equal(res.items[1].duplicataDe?.id, 'a');
});

test('W5 listClientes: duplicata por endereco+numero (ambos não-vazios); nomes distintos', async () => {
  const a = baseRow({ id: 'a', name: 'Maria', endereco: 'Rua das Flores', numero: '123' });
  const b = baseRow({ id: 'b', name: 'Maria da Silva', endereco: 'RUA DAS FLÔRES', numero: ' 123 ' });
  const c = baseRow({ id: 'c', name: 'Outra', endereco: 'Rua das Flores', numero: null }); // sem numero → fora
  const { prisma } = buildPrismaMock({ pageRows: [a, b, c], universe: [a, b, c] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.listClientes(7, {});
  assert.equal(res.items[0].duplicataDe?.id, 'b');
  assert.equal(res.items[1].duplicataDe?.id, 'a');
  assert.equal(res.items[2].duplicataDe, null, 'endereco sem numero não forma par');
});

test('W5 listClientes: debitoAtual OMITIDO sem moduloFinanceiroAtivo; presente com ele', async () => {
  const row = baseRow();
  // OFF → campo ausente
  {
    const { prisma } = buildPrismaMock({ pageRows: [row], universe: [row], config: { moduloFinanceiroAtivo: false } });
    const res = await new NucleoCadastroService(prisma).listClientes(7, {});
    assert.ok(!('debitoAtual' in res.items[0]), 'sem módulo financeiro o campo é omitido');
  }
  // ON → pending charges + entregas aguardando_fechamento somados
  {
    const { prisma } = buildPrismaMock({
      pageRows: [row],
      universe: [row],
      config: { moduloFinanceiroAtivo: true },
      chargesPendentes: [{ customerProfileId: 'c1', _sum: { amount: 30.5 } }],
      entregasAguardando: [{ customerProfileId: 'c1', _sum: { valor: 12 } }],
    });
    const res = await new NucleoCadastroService(prisma).listClientes(7, {});
    assert.equal(res.items[0].debitoAtual, 42.5, 'espelho da regra saldoAbertoPorClientes');
  }
});

// ── (3) DELETE bloqueado por dívida → 409 ─────────────────────────────────────
test('W5 softDeleteConta: cliente com débito → 409 CLIENTE_COM_DEBITO (mesmo sem módulo financeiro)', async () => {
  const row = baseRow();
  const { prisma, store } = buildPrismaMock({
    pageRows: [row],
    // débito SEMPRE conta no delete — nem passamos config (moduloFinanceiroAtivo off)
    chargesPendentes: [{ customerProfileId: 'c1', _sum: { amount: 55.9 } }],
  });
  const service = new NucleoCadastroService(prisma);
  await assert.rejects(
    () => service.softDeleteConta(7, 'c1', { deletedByUserId: 5 }),
    (err: any) => {
      assert.equal(err?.constructor?.name, 'ConflictException', 'HTTP 409');
      const body = err?.getResponse?.();
      assert.equal(body?.error, 'CLIENTE_COM_DEBITO');
      assert.equal(body?.saldo, 55.9);
      return true;
    },
  );
  assert.equal(store.deletionRecords.length, 0, 'nada deletado com dívida');
  assert.equal(store.accountUpdates.length, 0);
});

test('W5 softDeleteConta: sem débito → soft-delete segue normal', async () => {
  const row = baseRow();
  const { prisma, store } = buildPrismaMock({ pageRows: [row] });
  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteConta(7, 'c1', { deletedByUserId: 5 });
  assert.equal(res?.id, 'c1');
  assert.equal(store.deletionRecords.length, 1);
  const upd = store.accountUpdates.find((u) => u.where.id === 'c1');
  assert.equal(upd.data.status, 'deleted');
});
