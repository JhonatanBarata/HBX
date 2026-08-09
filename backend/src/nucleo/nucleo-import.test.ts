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
  let lid = 0;

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
      // 06/08 — o createConta passou a procurar CONTAS NA MESMA PORTA (aviso de
      // endereço repetido) e este mock não acompanhou: sem o findMany toda linha do
      // import morria com "is not a function", e a suíte ficava vermelha por um
      // motivo que não tinha nada a ver com import.
      findMany: async () => [],
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
    // MULTILOCAL (11/07) — createConta agora semeia o LOCAL PRINCIPAL quando a linha tem
    // endereço; mock mínimo pra o seed não estourar (o import não afere locais).
    localEntrega: {
      findFirst: async () => null,
      count: async () => 0,
      create: async () => ({ id: `l${++lid}` }),
      update: async (args: any) => ({ id: args.where.id }),
    },
  };
  return { prisma, store };
}

test('importContas importa válidas, pula sem nome e transforma CNPJ em PJ', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  const res = await svc.importContas(1, [
    { nome: 'Dona Maria', telefone: '(85) 99999-0001', endereco: 'Rua A, 10', cep: '60000-000', cidade: 'Fortaleza', uf: 'Ceará' },
    { nome: '  ', telefone: '123' }, // pulada — sem nome
    { nome: 'Padaria X', cnpj: '11.222.333/0001-81', endereco: 'Rua B, 20', cep: '60000-001', uf: 'ce' }, // vira PJ
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

  const linha = { nome: 'Zé', telefone: '85999990002', endereco: 'Rua A, 10', cep: '60000-000' };
  await svc.importContas(1, [linha]);
  await svc.importContas(1, [linha]);

  assert.equal(store.profiles.length, 1);
  assert.equal(store.contatos.length, 1);
});

test('importContas: UF não reconhecida fica vazia (não grava lixo)', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  await svc.importContas(1, [{ nome: 'Fulano', endereco: 'Rua A, 10', cep: '60000-000', uf: 'estado inexistente' }]);
  const fulano = store.profiles.find((p) => p.name === 'Fulano');
  assert.equal(fulano.uf, null);
});

// 09/08 — a regra de endereço fechado chega no IMPORT porque ele passa pelo
// `createConta`. Importante que seja POR LINHA: uma planilha com 3 boas e 1 furada
// entrega as 3 e devolve a furada em `errors` — reprovar o arquivo inteiro faria o
// dono desistir do import e voltar a digitar um por um.
test('importContas: linha de CLIENTE sem CEP não entra, e não derruba as outras', async () => {
  const { prisma, store } = buildPrismaMock();
  const svc = new NucleoCadastroService(prisma as any);

  const res = await svc.importContas(1, [
    { nome: 'Com CEP', telefone: '85999990010', endereco: 'Rua A, 10', cep: '60000-000' },
    { nome: 'Sem CEP', telefone: '85999990011', endereco: 'Rua B, 20' },
  ]);

  assert.equal(res.imported, 1);
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].nome, 'Sem CEP');
  assert.match(res.errors[0].message, /CEP/i);
  assert.equal(store.profiles.length, 1, 'a linha furada não vira cadastro');
});
