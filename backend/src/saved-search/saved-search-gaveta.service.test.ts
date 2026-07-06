import test from 'node:test';
import assert from 'node:assert/strict';

import { SavedSearchService } from './saved-search.service';

// LEADS-FINAL 03 (06/07) — cobre o ADAPTER (name/filtersJson) sobre o mesmo model/tabela
// SavedSearch do WORM-15 (listGavetaForUser/createGavetaForUser/deleteGavetaForUser).
// resolveContext (privado) é sobrescrito via `as any` — mesmo espírito de override usado em
// webscraping.service.test.ts (`(service as any).cnpjBaseQuery = {...}`): resolveVendasAccessContext
// de verdade encadeia policy/módulo real (fora de escopo aqui, já coberto em team-access-runtime).

type Row = {
  id: string;
  companyId: number;
  ownerId: number;
  nome: string;
  filtroJson: string;
  assignedSellerId: number | null;
  lastRunAt: Date | null;
  lastCount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: overrides.id || 'ss-1',
    companyId: 7,
    ownerId: 9,
    nome: 'Padarias SP',
    filtroJson: JSON.stringify({ city: 'Sao Paulo', segment: 'Padarias' }),
    assignedSellerId: null,
    lastRunAt: null,
    lastCount: null,
    createdAt: new Date('2026-07-06T10:00:00.000Z'),
    updatedAt: new Date('2026-07-06T10:00:00.000Z'),
    ...overrides,
  };
}

function makePrismaMock(rows: Row[]) {
  return {
    savedSearch: {
      findMany: async ({ where }: any) => rows.filter((r) => matchesWhere(r, where)),
      findFirst: async ({ where }: any) => rows.find((r) => matchesWhere(r, where)) || null,
      create: async ({ data }: any) => {
        const row = makeRow({ id: `ss-${rows.length + 1}`, ...data });
        rows.push(row);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx >= 0) rows.splice(idx, 1);
        return null;
      },
    },
  } as any;
}

// Mock simples: só honra companyId/id/OR (ownerId|assignedSellerId) — o suficiente pro
// escopo admin×vendedor sem reimplementar Prisma.
function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  if (where.companyId != null && row.companyId !== where.companyId) return false;
  if (where.id != null && row.id !== where.id) return false;
  if (where.ownerId != null && row.ownerId !== where.ownerId) return false;
  if (where.assignedSellerId != null && row.assignedSellerId !== where.assignedSellerId) return false;
  if (where.OR) {
    const ok = where.OR.some((clause: any) => matchesWhere(row, clause));
    if (!ok) return false;
  }
  return true;
}

function makeService(rows: Row[], context: { companyId: number; userId: number; canAssignSeller: boolean }) {
  const service = new SavedSearchService(makePrismaMock(rows), null as any) as any;
  service.resolveContext = async () => context;
  service.canAssignSeller = () => context.canAssignSeller;
  return service as SavedSearchService;
}

test('listGavetaForUser: devolve o contrato exato { id, name, filtersJson, createdAt, lastUsedAt }', async () => {
  const rows = [makeRow()];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: true });

  const result = await service.listGavetaForUser({});

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  const item = result[0] as any;
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'filtersJson', 'id', 'lastUsedAt', 'name'].sort());
  assert.equal(item.id, 'ss-1');
  assert.equal(item.name, 'Padarias SP');
  assert.equal(item.filtersJson, JSON.stringify({ city: 'Sao Paulo', segment: 'Padarias' }));
  assert.equal(item.createdAt, '2026-07-06T10:00:00.000Z');
  assert.equal(item.lastUsedAt, null);
});

test('listGavetaForUser: vendedor comum SO ve as proprias (ownerId), nao a empresa toda', async () => {
  const rows = [
    makeRow({ id: 'mine', ownerId: 9 }),
    makeRow({ id: 'colleague', ownerId: 99 }),
  ];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  const result = await service.listGavetaForUser({});
  const ids = (result as any[]).map((r) => r.id);
  assert.deepEqual(ids, ['mine']);
});

test('listGavetaForUser: admin/gerente ve a empresa TODA, nao so as proprias', async () => {
  const rows = [
    makeRow({ id: 'mine', ownerId: 9 }),
    makeRow({ id: 'colleague', ownerId: 99 }),
  ];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: true });

  const result = await service.listGavetaForUser({});
  const ids = (result as any[]).map((r) => r.id).sort();
  assert.deepEqual(ids, ['colleague', 'mine']);
});

test('listGavetaForUser: NUNCA vaza pesquisa de outra empresa (companyId isolado)', async () => {
  const rows = [
    makeRow({ id: 'own-company', companyId: 7, ownerId: 9 }),
    makeRow({ id: 'other-company', companyId: 999, ownerId: 9 }),
  ];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: true });

  const result = await service.listGavetaForUser({});
  const ids = (result as any[]).map((r) => r.id);
  assert.deepEqual(ids, ['own-company']);
});

test('createGavetaForUser: cria com name/filtersJson e devolve o registro no contrato pedido', async () => {
  const rows: Row[] = [];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  const created: any = await service.createGavetaForUser({}, {
    name: '  Lanchonetes RJ  ',
    filtersJson: JSON.stringify({ city: 'Rio de Janeiro', segment: 'Lanchonetes', lixo: 'descartar' }),
  });

  assert.equal(created.name, 'Lanchonetes RJ');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyId, 7);
  assert.equal(rows[0].ownerId, 9);
  // sanitizeFiltro descarta chaves desconhecidas (mesma regra do WORM-15 original).
  const persisted = JSON.parse(rows[0].filtroJson);
  assert.equal(persisted.city, 'Rio de Janeiro');
  assert.equal(persisted.segment, 'Lanchonetes');
  assert.equal('lixo' in persisted, false, 'chave desconhecida nunca vira deposito de lixo');
});

test('createGavetaForUser: nome vazio -> BadRequestException (nunca grava pesquisa sem nome)', async () => {
  const rows: Row[] = [];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  await assert.rejects(
    () => service.createGavetaForUser({}, { name: '   ', filtersJson: '{}' }),
    /BadRequestException|Nome/,
  );
});

test('createGavetaForUser: filtersJson invalido (nao-JSON) -> BadRequestException, nunca grava lixo', async () => {
  const rows: Row[] = [];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  await assert.rejects(
    () => service.createGavetaForUser({}, { name: 'Teste', filtersJson: '{isso nao e json' }),
    /BadRequestException|filtersJson/,
  );
  assert.equal(rows.length, 0);
});

test('deleteGavetaForUser: dono apaga a propria pesquisa -> { ok: true }', async () => {
  const rows = [makeRow({ id: 'to-delete', ownerId: 9 })];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  const result = await service.deleteGavetaForUser({}, 'to-delete');
  assert.deepEqual(result, { ok: true });
  assert.equal(rows.length, 0);
});

test('deleteGavetaForUser: vendedor NAO apaga pesquisa de outro usuario -> NotFoundException', async () => {
  const rows = [makeRow({ id: 'not-mine', ownerId: 99 })];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: false });

  await assert.rejects(
    () => service.deleteGavetaForUser({}, 'not-mine'),
    /NotFoundException|nao encontrada/,
  );
  assert.equal(rows.length, 1, 'pesquisa de outro usuario continua intacta');
});

test('deleteGavetaForUser: admin/gerente PODE apagar pesquisa de outro usuario da mesma empresa', async () => {
  const rows = [makeRow({ id: 'colleague-search', ownerId: 99 })];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: true });

  const result = await service.deleteGavetaForUser({}, 'colleague-search');
  assert.deepEqual(result, { ok: true });
  assert.equal(rows.length, 0);
});

test('deleteGavetaForUser: id inexistente -> NotFoundException', async () => {
  const rows = [makeRow({ id: 'existing' })];
  const service = makeService(rows, { companyId: 7, userId: 9, canAssignSeller: true });

  await assert.rejects(() => service.deleteGavetaForUser({}, 'ghost-id'));
  assert.equal(rows.length, 1);
});
