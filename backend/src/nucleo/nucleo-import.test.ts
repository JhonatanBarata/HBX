import test from 'node:test';
import assert from 'node:assert/strict';

import { NucleoCadastroService } from './nucleo-cadastro.service';

// NÚCLEO-CRM — importação em massa (planilha). Prova que `importContas`:
//   · roda o MESMO caminho idempotente do cadastro manual (createConta);
//   · pula linha sem nome (não derruba a batelada);
//   · CNPJ preenchido → a conta vira PJ automaticamente;
//   · UF aceita nome do estado ("Ceará") e devolve a sigla;
//   · reimportar o mesmo telefone NÃO duplica.

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
  };
  return { prisma, store };
}

test('importContas importa válidas, pula sem nome e transforma CNPJ em PJ', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  const res = await svc.importContas(1, [
    { nome: 'Dona Maria', telefone: '(85) 99999-0001', cidade: 'Fortaleza', uf: 'Ceará' },
    { nome: '  ', telefone: '123' }, // pulada — sem nome
    { nome: 'Padaria X', cnpj: '11.222.333/0001-81', uf: 'ce' }, // vira PJ
  ]);

  assert.equal(res.total, 3);
  assert.equal(res.imported, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.errors.length, 0);
  assert.equal(store.profiles.length, 2);

  const maria = store.profiles.find((p) => p.name === 'Dona Maria');
  assert.equal(maria.tipo, 'pf');
  assert.equal(maria.uf, 'CE'); // "Ceará" → CE
  assert.equal(maria.isCliente, true); // import nasce cliente

  const padaria = store.profiles.find((p) => p.name === 'Padaria X');
  assert.equal(padaria.tipo, 'pj');
  assert.equal(padaria.cnpj, '11222333000181');
});

test('importContas é idempotente por telefone (reimportar não duplica)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.importContas(1, [{ nome: 'Zé', telefone: '85999990002' }]);
  await svc.importContas(1, [{ nome: 'Zé', telefone: '85999990002' }]);

  assert.equal(store.profiles.length, 1);
  assert.equal(store.contatos.length, 1);
});

test('importContas: UF não reconhecida fica vazia (não grava lixo)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.importContas(1, [{ nome: 'Fulano', uf: 'estado inexistente' }]);
  const fulano = store.profiles.find((p) => p.name === 'Fulano');
  assert.equal(fulano.uf, null);
});
