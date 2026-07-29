import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaIndicadaService } from './logistica-rota-indicada.service';

/**
 * ROTA PRONTA (29/07) — indicação de rota salva pra equipe (popup Aceitar/Negar
 * no APK). A CENA que estes testes vigiam: web indica → app da pessoa vê a
 * pendente → Negar vira aviso "Rota X negada por Y" no web; Aceitar → aplicada.
 * Fail-closed: outra empresa/outra pessoa → 404, sempre.
 */

function buildPrisma(opts: { modelos?: any[]; users?: any[] } = {}) {
  const modelos = new Map<string, any>((opts.modelos ?? []).map((m) => [m.id, { ...m }]));
  const users = (opts.users ?? []).map((u) => ({ isActive: true, isSystemMaster: false, ...u }));
  const store = new Map<string, any>();
  let nextId = 1;

  const matches = (row: any, where: any = {}): boolean => {
    if (where.id != null && row.id !== String(where.id)) return false;
    if (where.companyId != null && row.companyId !== where.companyId) return false;
    if (where.rotaModeloId != null && row.rotaModeloId !== where.rotaModeloId) return false;
    if (where.paraUserId != null && row.paraUserId !== where.paraUserId) return false;
    if (where.status != null) {
      if (typeof where.status === 'string' && row.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(row.status)) return false;
    }
    if ('avisoVistoEm' in where && where.avisoVistoEm === null && row.avisoVistoEm != null) return false;
    return true;
  };
  const withInclude = (row: any, args: any) =>
    args?.include?.rotaModelo ? { ...row, rotaModelo: modelos.get(row.rotaModeloId) ?? null } : { ...row };

  const prisma: any = {
    logisticaRotaModelo: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const m = modelos.get(String(where.id ?? ''));
        if (!m || m.companyId !== where.companyId) return null;
        return { ...m };
      },
    },
    user: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const u = users.find((row) => row.id === where.id && row.companyId === where.companyId
          && row.isActive === where.isActive && row.isSystemMaster === where.isSystemMaster);
        return u ? { id: u.id } : null;
      },
      findMany: async (args: any) => {
        const where = args?.where || {};
        return users
          .filter((u) => (where.id?.in ?? []).includes(u.id) && u.companyId === where.companyId)
          .map((u) => ({ id: u.id, name: u.name ?? null, username: u.username ?? null, email: u.email ?? null }));
      },
    },
    logisticaRotaIndicada: {
      create: async (args: any) => {
        const id = `ind-${nextId++}`;
        const row = { id, status: 'pendente', respondidaEm: null, aplicadaEm: null, avisoVistoEm: null, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        store.set(id, row);
        return { ...row };
      },
      findFirst: async (args: any) => {
        const row = Array.from(store.values()).find((r) => matches(r, args?.where));
        return row ? withInclude(row, args) : null;
      },
      findMany: async (args: any) => Array.from(store.values()).filter((r) => matches(r, args?.where)).map((r) => withInclude(r, args)),
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data, { updatedAt: new Date() });
        return withInclude(row, args);
      },
      updateMany: async (args: any) => {
        const alvo = Array.from(store.values()).filter((r) => matches(r, args?.where));
        alvo.forEach((r) => Object.assign(r, args.data, { updatedAt: new Date() }));
        return { count: alvo.length };
      },
    },
  };
  return { prisma, store };
}

const MODELO = { id: 'm1', companyId: 7, tipo: 'LIVRE', nome: 'Rota Centro', diaSemana: 3, paradasJson: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2' }] };
const EQUIPE = [
  { id: 10, companyId: 7, name: 'Ana Admin' },
  { id: 20, companyId: 7, name: 'João Motorista' },
];

test('indicar: cria pendente com nome congelado e conta as paradas', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const dto = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(dto.status, 'pendente');
  assert.equal(dto.nome, 'Rota Centro');
  assert.equal(dto.paradas, 2);
  assert.equal(dto.diaSemana, 3);
});

test('indicar: modelo de outra empresa → 404; pessoa fora da empresa → 400', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  await assert.rejects(() => svc.indicar(99, 'm1', 20, 10), /não encontrada/);
  await assert.rejects(() => svc.indicar(7, 'm1', 555, 10), /Pessoa não encontrada/);
});

test('indicar de novo pra mesma pessoa: a pendente anterior morre cancelada (nunca 2 popups)', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const primeira = await svc.indicar(7, 'm1', 20, 10);
  const segunda = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(store.get(primeira.id)!.status, 'cancelada');
  assert.equal(store.get(segunda.id)!.status, 'pendente');
  const vivas = await svc.pendentes(7, 20);
  assert.equal(vivas.length, 1);
  assert.equal(vivas[0].id, segunda.id);
});

test('pendentes: só as MINHAS vivas, com quem indicou pelo nome', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  await svc.indicar(7, 'm1', 20, 10);
  assert.equal((await svc.pendentes(7, 10)).length, 0);
  const minhas = await svc.pendentes(7, 20);
  assert.equal(minhas.length, 1);
  assert.equal(minhas[0].porNome, 'Ana Admin');
});

test('responder Negar: vira negada com respondidaEm; o web lista pro aviso', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  const res = await svc.responder(7, ind.id, 20, false);
  assert.equal(res.status, 'negada');
  const lista = await svc.listar(7);
  assert.equal(lista[0].status, 'negada');
  assert.equal(lista[0].nome, 'Rota Centro');
  assert.equal(lista[0].paraNome, 'João Motorista');
  assert.equal(lista[0].avisoVisto, false);
});

test('responder: outra pessoa (ou repetido) → 404 fail-closed', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  await assert.rejects(() => svc.responder(7, ind.id, 10, true), /não encontrada/);
  await svc.responder(7, ind.id, 20, false);
  await assert.rejects(() => svc.responder(7, ind.id, 20, true), /não encontrada/);
});

test('Aceitar → aceita segue viva em pendentes; aplicada fecha o ciclo', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  await svc.responder(7, ind.id, 20, true);
  const vivas = await svc.pendentes(7, 20);
  assert.equal(vivas.length, 1);
  assert.equal(vivas[0].status, 'aceita');
  const done = await svc.aplicada(7, ind.id, 20);
  assert.equal(done.status, 'aplicada');
  assert.equal((await svc.pendentes(7, 20)).length, 0);
  await assert.rejects(() => svc.aplicada(7, ind.id, 20), /não encontrada/);
});

test('avisoVisto: dispensa a negada uma vez só; pendente não dispensa', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(await svc.avisoVisto(7, ind.id), false);
  await svc.responder(7, ind.id, 20, false);
  assert.equal(await svc.avisoVisto(7, ind.id), true);
  assert.equal(await svc.avisoVisto(7, ind.id), false);
  assert.equal((await svc.listar(7))[0].avisoVisto, true);
});
