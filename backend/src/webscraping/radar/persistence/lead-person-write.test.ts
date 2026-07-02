import test from 'node:test';
import assert from 'node:assert/strict';
import { LeadPersonWriteService, buildPersonKey, normalizePersonName } from './lead-person-write.service';

/**
 * WORM-16 — LeadPersonWriteService: caminho único de escrita da pessoa (sócio da Receita).
 * Prova idempotência por (radarLeadId, personKey), dedup no lote, e best-effort (não estoura).
 */

function createFakePrisma(existing: Array<Record<string, any>> = []) {
  const store = [...existing];
  return {
    store,
    leadPerson: {
      findFirst: async ({ where }: any) =>
        store.find((p) => p.radarLeadId === where.radarLeadId && p.personKey === where.personKey) || null,
      create: async ({ data }: any) => { store.push({ ...data }); return data; },
    },
  };
}

test('normalizePersonName tira acento/caixa/espaço duplo', () => {
  assert.equal(normalizePersonName('  Martín   HÍRKE  '), 'martin hirke');
  assert.equal(buildPersonKey('receita_qsa', 'José Silva'), 'receita_qsa:jose silva');
});

test('grava pessoa nova e pula duplicata na 2ª chamada (idempotente)', async () => {
  const prisma = createFakePrisma();
  const svc = new LeadPersonWriteService();
  const first = await svc.writePeople(prisma, 'lead1', [
    { name: 'Martin Hirke Bijsterveld', role: 'Sócio-Administrador', source: 'receita_qsa', rank: 1 },
  ]);
  assert.equal(first.written, 1);
  assert.equal(prisma.store.length, 1);
  assert.equal(prisma.store[0].role, 'Sócio-Administrador');

  const second = await svc.writePeople(prisma, 'lead1', [
    { name: 'Martin Hirke Bijsterveld', role: 'Sócio-Administrador', source: 'receita_qsa', rank: 1 },
  ]);
  assert.equal(second.written, 0, 'não regrava');
  assert.equal(second.skipped, 1);
  assert.equal(prisma.store.length, 1);
});

test('dedup dentro do mesmo lote (ownerName == ownerNames[0])', async () => {
  const prisma = createFakePrisma();
  const svc = new LeadPersonWriteService();
  const res = await svc.writePeople(prisma, 'lead2', [
    { name: 'João Souza', role: null, source: 'receita_qsa', rank: 1 },
    { name: 'joão souza', role: null, source: 'receita_qsa', rank: 2 },
    { name: 'Maria Lima', role: 'Sócia', source: 'receita_qsa', rank: 3 },
  ]);
  assert.equal(res.written, 2, 'João entra 1x, Maria 1x');
  assert.equal(prisma.store.length, 2);
});

test('nome vazio/curto é ignorado; não estoura sem delegate', async () => {
  const svc = new LeadPersonWriteService();
  const prisma = createFakePrisma();
  const res = await svc.writePeople(prisma, 'lead3', [
    { name: '', source: 'receita_qsa' },
    { name: 'X', source: 'receita_qsa' },
    { name: 'Ana Paula', source: 'receita_qsa' },
  ]);
  assert.equal(res.written, 1);
  // prisma sem leadPerson não deve estourar
  const noDelegate = await svc.writePeople({} as any, 'lead4', [{ name: 'Ana', source: 'receita_qsa' }]);
  assert.deepEqual(noDelegate, { written: 0, skipped: 0 });
});
