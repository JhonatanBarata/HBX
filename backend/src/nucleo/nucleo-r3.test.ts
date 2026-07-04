import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService, pickRicherAccount } from './nucleo-cadastro.service';

// NÚCLEO-CRM R3 — prova a INTEGRIDADE da espinha:
//   (a) merge de contas duplicadas: 2 contas → 1 conta com refs migradas + perdedora
//       em DeletionRecord (snapshot). Quem tem MAIS DADO vence como base.
//   (c) soft-delete: esconde o registro E grava o snapshot em DeletionRecord.
// Charge-por-entrega atômico (unique) é provado no logistica.service.test.ts (R2 idem).

// ── Banco em memória: só o que mergeContas/softDelete* tocam ──────────────────
function buildPrismaMock(accounts: any[]) {
  const store = {
    accounts: [...accounts],
    entregaMoves: [] as any[],
    contatoMoves: [] as any[],
    clienteProdutoMoves: [] as any[],
    chargeMoves: [] as any[],
    vendasLeadMoves: [] as any[],
    accountUpdates: [] as any[],
    deleted: [] as string[],
    deletionRecords: [] as any[],
  };

  const moveMany =
    (bucket: any[]) => async (args: any) => {
      bucket.push(args);
      return { count: 1 }; // finge 1 ref movida por tabela (observável no teste)
    };

  const prisma: any = {
    customerProfile: {
      findFirst: async (args: any) => {
        const id = args?.where?.id;
        const companyId = args?.where?.companyId;
        return (
          store.accounts.find((a) => a.id === id && (companyId == null || a.companyId === companyId)) || null
        );
      },
      update: async (args: any) => {
        store.accountUpdates.push(args);
        const acc = store.accounts.find((a) => a.id === args.where.id);
        if (acc) Object.assign(acc, args.data);
        return acc || { id: args.where.id };
      },
      delete: async (args: any) => {
        store.deleted.push(args.where.id);
        store.accounts = store.accounts.filter((a) => a.id !== args.where.id);
        return { id: args.where.id };
      },
    },
    entrega: {
      updateMany: moveMany(store.entregaMoves),
      findFirst: async () => null,
    },
    contato: { updateMany: moveMany(store.contatoMoves) },
    clienteProduto: { updateMany: moveMany(store.clienteProdutoMoves) },
    financeiroCharge: { updateMany: moveMany(store.chargeMoves) },
    vendasLead: { updateMany: moveMany(store.vendasLeadMoves) },
    deletionRecord: {
      create: async (args: any) => {
        store.deletionRecords.push(args.data);
        return { id: store.deletionRecords.length, ...args.data };
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, store };
}

// ── pickRicherAccount (regra pura do vencedor) ────────────────────────────────
test('R3 pickRicherAccount: a conta com MAIS dado vence', () => {
  const pobre = { id: 'a', createdAt: new Date('2026-01-01'), name: 'X', cnpj: null, document: null, phone: null, email: null, endereco: null, cidade: null, uf: null, cep: null, lat: null, lng: null } as any;
  const rica = { id: 'b', createdAt: new Date('2026-06-01'), name: 'X', cnpj: '123', document: '123', phone: '5588', email: 'a@b.c', endereco: 'Rua', cidade: 'For', uf: 'CE', cep: '600', lat: -4, lng: -38 } as any;
  assert.equal(pickRicherAccount(pobre, rica).id, 'b', 'a mais rica vence mesmo sendo mais nova');
});

test('R3 pickRicherAccount: empate de dado → a mais ANTIGA vence', () => {
  const velha = { id: 'z', createdAt: new Date('2026-01-01'), name: 'X' } as any;
  const nova = { id: 'a', createdAt: new Date('2026-06-01'), name: 'Y' } as any;
  // ambas têm só 1 campo (name) → empate de riqueza → createdAt asc
  assert.equal(pickRicherAccount(velha, nova).id, 'z', 'empate → mais antiga');
});

// ── (a) MERGE — 2 contas → 1 com refs migradas + perdedora em DeletionRecord ──
test('R3 merge: funde 2 contas → refs migram p/ o vencedor e a perdedora vira DeletionRecord', async () => {
  const winner = {
    id: 'conta-rica', companyId: 7, tipo: 'pj', name: 'Padaria', cnpj: '111', document: '111',
    phone: '5588', phoneNormalized: '5588', email: 'p@x.com', endereco: 'Rua A', cidade: 'For',
    uf: 'CE', cep: '600', lat: -4, lng: -38, status: 'active',
    isLead: false, isCliente: true, isFornecedor: false, origin: 'manual', createdAt: new Date('2026-01-01'),
  };
  const loser = {
    id: 'conta-pobre', companyId: 7, tipo: 'pj', name: 'Padaria', cnpj: null, document: null,
    phone: null, phoneNormalized: null, email: null, endereco: null, cidade: null,
    uf: null, cep: null, lat: null, lng: null, status: 'active',
    isLead: true, isCliente: false, isFornecedor: false, origin: 'radar', createdAt: new Date('2026-02-01'),
  };
  const { prisma, store } = buildPrismaMock([winner, loser]);
  const service = new NucleoCadastroService(prisma);

  // funde a POBRE na RICA (a rica vence por dado, mesmo passando a pobre como source).
  const res = await service.mergeContas(7, 'conta-pobre', 'conta-rica', { deletedByUserId: 42 });

  assert.ok(res, 'merge retorna resultado');
  assert.equal(res?.winnerId, 'conta-rica', 'a conta mais rica é a base');
  assert.equal(res?.loserId, 'conta-pobre');
  // as 5 tabelas de refs foram migradas (1 updateMany cada)
  assert.equal(store.entregaMoves.length, 1);
  assert.equal(store.contatoMoves.length, 1);
  assert.equal(store.clienteProdutoMoves.length, 1);
  assert.equal(store.chargeMoves.length, 1);
  assert.equal(store.vendasLeadMoves.length, 1);
  // todas apontam loser → winner
  for (const m of [store.entregaMoves[0], store.contatoMoves[0], store.chargeMoves[0]]) {
    assert.equal(m.where.customerProfileId, 'conta-pobre');
    assert.equal(m.data.customerProfileId, 'conta-rica');
  }
  // papel isLead da perdedora foi ACUMULADO no vencedor
  const fill = store.accountUpdates.find((u) => u.where.id === 'conta-rica');
  assert.ok(fill, 'vencedor foi atualizado');
  assert.equal(fill.data.isLead, true, 'papel isLead acumulado do loser');
  // a perdedora virou DeletionRecord (snapshot) e foi removida
  const dr = store.deletionRecords.find((r) => r.entityId === 'conta-pobre');
  assert.ok(dr, 'DeletionRecord da perdedora existe');
  assert.equal(dr.entityType, 'CustomerProfile');
  assert.equal(dr.deletedByUserId, 42);
  assert.ok(String(dr.snapshot).includes('conta-pobre'), 'snapshot tem os dados da perdedora');
  assert.ok(store.deleted.includes('conta-pobre'), 'perdedora removida do banco');
  assert.ok(!store.deleted.includes('conta-rica'), 'vencedor sobrevive');
});

test('R3 merge: fundir consigo mesma = no-op seguro', async () => {
  const acc = { id: 'a', companyId: 7, status: 'active', isLead: false, isCliente: true, isFornecedor: false, createdAt: new Date() } as any;
  const { prisma, store } = buildPrismaMock([acc]);
  const service = new NucleoCadastroService(prisma);
  const res = await service.mergeContas(7, 'a', 'a');
  assert.equal(res?.noop, true);
  assert.equal(store.deleted.length, 0, 'não apaga nada');
  assert.equal(store.deletionRecords.length, 0);
});

test('R3 merge: conta de OUTRO tenant → null (isolamento)', async () => {
  const a = { id: 'a', companyId: 7, status: 'active', isLead: false, isCliente: true, isFornecedor: false, createdAt: new Date() } as any;
  const b = { id: 'b', companyId: 99, status: 'active', isLead: false, isCliente: true, isFornecedor: false, createdAt: new Date() } as any;
  const { prisma } = buildPrismaMock([a, b]);
  const service = new NucleoCadastroService(prisma);
  const res = await service.mergeContas(7, 'a', 'b'); // b é de outra empresa
  assert.equal(res, null, 'não funde cross-tenant');
});

// ── (c) SOFT-DELETE — esconde + grava snapshot ────────────────────────────────
test('R3 soft-delete conta: esconde (status=deleted, papéis off) E grava snapshot', async () => {
  const acc = {
    id: 'c1', companyId: 7, tipo: 'pj', name: 'X', cnpj: '9', document: '9', phone: null,
    phoneNormalized: null, email: null, endereco: null, cidade: null, uf: null, cep: null,
    lat: null, lng: null, status: 'active', isLead: true, isCliente: true, isFornecedor: false,
    origin: 'manual', createdAt: new Date(),
  };
  const { prisma, store } = buildPrismaMock([acc]);
  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteConta(7, 'c1', { deletedByUserId: 5, motivo: 'duplicada' });

  assert.equal(res?.id, 'c1');
  // snapshot gravado
  const dr = store.deletionRecords.find((r) => r.entityId === 'c1');
  assert.ok(dr, 'DeletionRecord existe');
  assert.equal(dr.entityType, 'CustomerProfile');
  assert.equal(dr.motivo, 'duplicada');
  assert.ok(String(dr.snapshot).includes('c1'));
  // escondido: status deleted + papéis off (some das janelas)
  const upd = store.accountUpdates.find((u) => u.where.id === 'c1');
  assert.ok(upd, 'conta atualizada');
  assert.equal(upd.data.status, 'deleted');
  assert.equal(upd.data.isCliente, false);
  assert.equal(upd.data.isLead, false);
});

test('R3 soft-delete conta: já deletada = idempotente (não grava 2º snapshot)', async () => {
  const acc = { id: 'c2', companyId: 7, status: 'deleted', isLead: false, isCliente: false, isFornecedor: false, createdAt: new Date() } as any;
  const { prisma, store } = buildPrismaMock([acc]);
  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteConta(7, 'c2');
  assert.equal(res?.id, 'c2');
  assert.equal(store.deletionRecords.length, 0, 'idempotente: nenhum novo snapshot');
});

test('R3 soft-delete conta: outro tenant → null', async () => {
  const acc = { id: 'c3', companyId: 99, status: 'active', isLead: false, isCliente: true, isFornecedor: false, createdAt: new Date() } as any;
  const { prisma } = buildPrismaMock([acc]);
  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteConta(7, 'c3');
  assert.equal(res, null);
});

test('R3 soft-delete contato: grava snapshot e remove', async () => {
  const prisma: any = {
    contato: {
      findFirst: async () => ({ id: 'k1', companyId: 7, customerProfileId: 'c1', nome: 'João', cargo: null, whatsapp: '5588', phone: null, email: null, isPrincipal: true, source: 'manual' }),
      delete: async (args: any) => ({ id: args.where.id }),
    },
    deletionRecord: { create: async (a: any) => a.data },
  };
  const records: any[] = [];
  const deletes: string[] = [];
  prisma.deletionRecord.create = async (a: any) => { records.push(a.data); return a.data; };
  prisma.contato.delete = async (a: any) => { deletes.push(a.where.id); return { id: a.where.id }; };
  prisma.$transaction = async (fn: any) => fn(prisma);

  const service = new NucleoCadastroService(prisma);
  const res = await service.softDeleteContato(7, 'k1', { deletedByUserId: 3 });
  assert.equal(res?.id, 'k1');
  assert.equal(records.length, 1);
  assert.equal(records[0].entityType, 'Contato');
  assert.ok(String(records[0].snapshot).includes('João'));
  assert.ok(deletes.includes('k1'), 'contato removido');
});
