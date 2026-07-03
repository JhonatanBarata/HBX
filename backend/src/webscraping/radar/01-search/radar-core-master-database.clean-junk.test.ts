import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from '../../webscraping.service';

// Sprint 3 HBX-OWNER: cobre a COSTURA da limpeza de lixo (cleanJunkMasterDatabaseCards) —
// a composição isJunkRadarLead (que ESPELHA o isJunkLead do agent) e o shape preview vs confirm.
// As PRIMITIVAS (looksLikeNonBusinessName / isRealisticBrPhone) já têm teste dedicado em
// radar-core-shared.junk-name.test.ts; aqui NÃO se re-testa a régua, só a montagem.

function makeService(rows: any[]) {
  const deletedBatches: string[][] = [];
  const prisma = {
    hasTable: async () => true,
    hasColumn: async () => true,
    radarLeadPool: {
      // findMany paginado (skip/take) sobre o array de rows fake.
      findMany: async ({ skip = 0, take = 1000 }: any = {}) => rows.slice(skip, skip + take),
    },
  } as any;
  const service = new WebscrapingService(prisma) as any;
  // supportsRadarPersistence é private/lazy — força "banco migrado" no teste.
  service.supportsRadarPersistence = async () => true;
  // Neutraliza o pipeline de filtros pesados: o clean-junk só precisa de um where/ filtros válidos.
  service.normalizeRadarFilters = () => ({});
  service.buildRadarWhere = () => ({});
  // Intercepta o MESMO caminho de exclusão usado em produção (permanentDeleteMasterDatabaseCards),
  // registrando os lotes e devolvendo affected = tamanho do lote.
  service.permanentDeleteMasterDatabaseCards = async (_user: any, { leadIds }: any) => {
    deletedBatches.push(leadIds);
    return { ok: true, affected: leadIds.length };
  };
  return { service, deletedBatches };
}

test('isJunkRadarLead espelha a regra do agent (nome-lixo OU sem contato util)', () => {
  const { service } = makeService([]);

  // nome nao parece empresa -> lixo, mesmo com telefone bom
  assert.equal(service.isJunkRadarLead({ name: 'What is the best pizza in the world?', phone: '85999998888' }), true);
  // sem telefone real E sem e-mail valido -> lixo
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '0000', email: '' }), true);
  // telefone BR realista -> NAO e lixo
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '85999998888' }), false);
  // sem telefone, mas e-mail valido -> NAO e lixo
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '', email: 'contato@padaria.com', emailStatus: 'confirmed' }), false);
  // e-mail com emailStatus 'missing'/'invalid' NAO conta como valido -> lixo
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '', email: 'x@y.com', emailStatus: 'missing' }), true);
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '', email: 'x@y.com', emailStatus: 'invalid' }), true);
  // usa phoneDigits quando phone vazio
  assert.equal(service.isJunkRadarLead({ name: 'Padaria do Ze', phone: '', phoneDigits: '85999998888' }), false);
});

test('cleanJunk PREVIEW: preview:true + scanned + junk + sample[<=8], sem apagar', async () => {
  const rows = [
    { id: 'a', name: 'Padaria do Ze', phone: '85999998888' }, // bom
    { id: 'b', name: 'How to fix your car at home', phone: '85999990000' }, // nome-lixo
    { id: 'c', name: 'Loja X', phone: '0000', email: '' }, // sem contato -> lixo
    { id: 'd', name: 'Mercado Y', phone: '', email: 'oi@mercado.com', emailStatus: 'confirmed' }, // bom
  ];
  const { service, deletedBatches } = makeService(rows);
  const out = await service.cleanJunkMasterDatabaseCards({ id: 1 }, {});

  assert.equal(out.preview, true);
  assert.equal(out.scanned, 4);
  assert.equal(out.junk, 2);
  assert.ok(Array.isArray(out.sample));
  assert.ok(out.sample.length <= 8);
  assert.equal(out.cleared, undefined); // preview NAO devolve cleared
  assert.equal(deletedBatches.length, 0); // preview NAO apaga nada
});

test('cleanJunk CONFIRM: apaga pelo caminho permanentDelete e devolve { scanned, junk, cleared }', async () => {
  const rows = [
    { id: 'a', name: 'Padaria do Ze', phone: '85999998888' }, // bom
    { id: 'b', name: 'How to fix your car at home', phone: '85999990000' }, // nome-lixo
    { id: 'c', name: 'Loja X', phone: '0000', email: '' }, // sem contato -> lixo
  ];
  const { service, deletedBatches } = makeService(rows);
  const out = await service.cleanJunkMasterDatabaseCards({ id: 1 }, { confirm: true });

  assert.equal(out.preview, undefined); // confirm NAO e preview
  assert.equal(out.scanned, 3);
  assert.equal(out.junk, 2);
  assert.equal(out.cleared, 2);
  // apagou exatamente os ids de lixo, pelo MESMO caminho de exclusao em massa
  assert.equal(deletedBatches.length, 1);
  assert.deepEqual(deletedBatches[0], ['b', 'c']);
});

test('cleanJunk sem lixo: junk=0, cleared=0, nenhuma exclusao', async () => {
  const rows = [
    { id: 'a', name: 'Padaria do Ze', phone: '85999998888' },
    { id: 'b', name: 'Mercado Y', phone: '', email: 'oi@mercado.com', emailStatus: 'confirmed' },
  ];
  const { service, deletedBatches } = makeService(rows);
  const out = await service.cleanJunkMasterDatabaseCards({ id: 1 }, { confirm: true });

  assert.equal(out.scanned, 2);
  assert.equal(out.junk, 0);
  assert.equal(out.cleared, 0);
  assert.equal(deletedBatches.length, 0);
});
