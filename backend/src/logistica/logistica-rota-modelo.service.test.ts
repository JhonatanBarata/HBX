import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaModeloService } from './logistica-rota-modelo.service';

/**
 * PR18072026 W1 — CRUD de rota-modelo (roteiro salvo): nome + diaSemana
 * opcional + paradas em ordem. Company-scoped fail-closed (404 cross-tenant).
 */

function buildPrisma(seed: any[] = []) {
  const store = new Map<string, any>(seed.map((row) => [row.id, { ...row }]));
  let nextId = 1;
  const prisma: any = {
    logisticaRotaModelo: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        return Array.from(store.values()).filter((row) => row.companyId === where.companyId);
      },
      // PR20072026 W1 — findFirst também serve o lookup por NOME (case-insensitive)
      // de assertNomeUnico (where.id ausente, where.nome = {equals, mode}).
      findFirst: async (args: any) => {
        const where = args?.where || {};
        let rows = Array.from(store.values());
        if (where.id != null) rows = rows.filter((r) => r.id === where.id);
        if (where.companyId != null) rows = rows.filter((r) => r.companyId === where.companyId);
        if (where.nome && typeof where.nome === 'object') {
          const alvo = String(where.nome.equals ?? '').toLowerCase();
          rows = rows.filter((r) => String(r.nome ?? '').toLowerCase() === alvo);
        }
        const row = rows[0];
        if (!row) return null;
        return { id: row.id, nome: row.nome };
      },
      create: async (args: any) => {
        const id = `modelo-${nextId++}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        store.set(id, row);
        return row;
      },
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data, { updatedAt: new Date() });
        return row;
      },
      delete: async (args: any) => {
        store.delete(args.where.id);
        return { id: args.where.id };
      },
    },
  };
  return { prisma, store };
}

test('create: grava nome/diaSemana/paradas e devolve o DTO', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.create(7, {
    nome: 'Segunda — Centro',
    diaSemana: 1,
    paradas: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2', localId: 'l2' }],
  });

  assert.equal(dto.nome, 'Segunda — Centro');
  assert.equal(dto.diaSemana, 1);
  assert.deepEqual(dto.paradas, [{ customerProfileId: 'c1' }, { customerProfileId: 'c2', localId: 'l2' }]);
  assert.ok(dto.id);
});

test('create: nome vazio rejeita (400)', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: '   ' }), /Nome é obrigatório/);
});

test('create: nome > 80 chars rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'x'.repeat(81) }), /80 caracteres/);
});

test('create: diaSemana fora de 1..7 rejeita; omitido vira null', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'X', diaSemana: 8 }), /1 \(segunda\) a 7/);
  await assert.rejects(() => svc.create(7, { nome: 'X', diaSemana: 0 }), /1 \(segunda\) a 7/);
  const dto = await svc.create(7, { nome: 'Sem dia' });
  assert.equal(dto.diaSemana, null);
  assert.deepEqual(dto.paradas, []);
});

test('create: mais de 500 paradas rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  const paradas = Array.from({ length: 501 }, (_, i) => ({ customerProfileId: `c${i}` }));
  await assert.rejects(() => svc.create(7, { nome: 'X', paradas }), /500 paradas/);
});

test('create: parada sem customerProfileId rejeita', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(() => svc.create(7, { nome: 'X', paradas: [{ customerProfileId: '' } as any] }), /customerProfileId é obrigatório/);
});

test('list: só lista os modelos da PRÓPRIA empresa', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] },
    { id: 'm2', companyId: 8, nome: 'B', diaSemana: null, paradasJson: [] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  const list = await svc.list(7);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'm1');
});

test('update: edita nome/diaSemana/paradas (PATCH parcial); campos omitidos não mudam', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'Original', diaSemana: 1, paradasJson: [{ customerProfileId: 'c1' }] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.update(7, 'm1', { nome: 'Renomeado' });
  assert.equal(dto!.nome, 'Renomeado');
  assert.equal(dto!.diaSemana, 1, 'diaSemana omitido não muda');
  assert.deepEqual(dto!.paradas, [{ customerProfileId: 'c1' }], 'paradas omitidas não mudam');
});

test('update: id de OUTRA empresa → null (404 no controller), nada é escrito', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const res = await svc.update(999, 'm1', { nome: 'Hackeado' });
  assert.equal(res, null);
  assert.equal(store.get('m1')!.nome, 'A', 'nome original intocado');
});

test('remove: apaga o modelo da própria empresa e devolve true', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const ok = await svc.remove(7, 'm1');
  assert.equal(ok, true);
  assert.equal(store.has('m1'), false);
});

test('remove: id de OUTRA empresa → false, não apaga', async () => {
  const { prisma, store } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'A', diaSemana: null, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const ok = await svc.remove(999, 'm1');
  assert.equal(ok, false);
  assert.equal(store.has('m1'), true);
});

test('remove: id inexistente → false', async () => {
  const { prisma } = buildPrisma([]);
  const svc = new LogisticaRotaModeloService(prisma);
  assert.equal(await svc.remove(7, 'nao-existe'), false);
});

// PR20072026 W1 — nome único por empresa (case-insensitive/trim), 409 ROTA_NOME_DUPLICADO.

test('create: nome duplicado (case-insensitive) na MESMA empresa → 409 ROTA_NOME_DUPLICADO', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda — Centro', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(
    () => svc.create(7, { nome: '  segunda — centro  ' }),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.getResponse().code, 'ROTA_NOME_DUPLICADO');
      return true;
    },
  );
});

test('create: mesmo nome em OUTRA empresa não conflita', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.create(8, { nome: 'Segunda' });
  assert.equal(dto.nome, 'Segunda');
});

test('update: renomear para um nome já usado por OUTRO modelo → 409 ROTA_NOME_DUPLICADO', async () => {
  const { prisma } = buildPrisma([
    { id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] },
    { id: 'm2', companyId: 7, nome: 'Terça', diaSemana: 2, paradasJson: [] },
  ]);
  const svc = new LogisticaRotaModeloService(prisma);
  await assert.rejects(
    () => svc.update(7, 'm2', { nome: 'SEGUNDA' }),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.getResponse().code, 'ROTA_NOME_DUPLICADO');
      return true;
    },
  );
});

test('update: renomear pro MESMO nome do próprio modelo não conflita', async () => {
  const { prisma } = buildPrisma([{ id: 'm1', companyId: 7, nome: 'Segunda', diaSemana: 1, paradasJson: [] }]);
  const svc = new LogisticaRotaModeloService(prisma);
  const dto = await svc.update(7, 'm1', { nome: 'Segunda' });
  assert.equal(dto!.nome, 'Segunda');
});
