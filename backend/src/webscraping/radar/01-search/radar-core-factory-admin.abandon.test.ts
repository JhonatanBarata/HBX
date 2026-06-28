import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreFactoryAdminMixin } from './radar-core-factory-admin.mixin';

// Instancia o mixin isolado e injeta os stubs que os métodos de abandono usam (prisma, logger e
// supportsMassDataCampaignPersistence — que vive em outro mixin no runtime real).
function makeFactory(batchRows: any[], aliveTasks = 0) {
  const instance: any = new (RadarCoreFactoryAdminMixin as any)();
  instance.logger = { warn() {}, log() {} };
  instance.supportsMassDataCampaignPersistence = async () => true;
  instance.prisma = {
    webscrapingCampaignBatch: { findMany: async () => batchRows },
    webscrapingCampaignTask: { count: async () => aliveTasks },
  };
  return instance;
}

const VIRGIN_TIMEOUT_CAMPAIGN = {
  id: 'camp-sp', city: 'São Paulo', state: 'SP',
  approvedCount: 0, currentAttempt: 12, consecutiveEmptyBatchCount: 8,
};

test('timeout-dominated activity does NOT exhaust a virgin city (bug do VPS: São Paulo)', async () => {
  // Todos os batches recentes falharam por timeout → transiente. approved=0 é culpa da fonte, não da
  // cidade. Mesmo com emptyBatches/attempts altos, NÃO abandona — re-tenta a mesma missão.
  const rows = Array.from({ length: 10 }, () => ({ status: 'failed', errorMessage: 'radar-web-enrichment HBX falhou; timeout' }));
  const factory = makeFactory(rows);
  const abandon = await factory.shouldAbandonMassDataCampaign(VIRGIN_TIMEOUT_CAMPAIGN, { lastCampaignId: 'camp-sp', consecutiveEmptyCount: 0 });
  assert.equal(abandon, false);
});

test('successful searches that only return duplicates DO exhaust the city (esgotamento real)', async () => {
  // A fonte respondeu (batches sem erro), salvou pouco e a fila secou → esgotamento real → abandona.
  const rows = Array.from({ length: 8 }, () => ({ status: 'completed', errorMessage: null, approvedCount: 0, duplicateCount: 20 }));
  const factory = makeFactory(rows, /* aliveTasks */ 0);
  const exhausted = { id: 'camp-x', city: 'Acarape', state: 'CE', approvedCount: 0, currentAttempt: 9, consecutiveEmptyBatchCount: 8 };
  const abandon = await factory.shouldAbandonMassDataCampaign(exhausted, { lastCampaignId: 'camp-x', consecutiveEmptyCount: 0 });
  assert.equal(abandon, true);
});

test('successful search with healthy yield is NOT abandoned', async () => {
  const rows = Array.from({ length: 6 }, () => ({ status: 'completed', errorMessage: null, approvedCount: 15 }));
  const factory = makeFactory(rows, /* aliveTasks */ 50);
  const healthy = { id: 'camp-good', city: 'Campinas', state: 'SP', approvedCount: 90, currentAttempt: 4, consecutiveEmptyBatchCount: 0 };
  const abandon = await factory.shouldAbandonMassDataCampaign(healthy, { lastCampaignId: 'camp-good', consecutiveEmptyCount: 0 });
  assert.equal(abandon, false);
});

test('getCampaignRecentSearchHealth separates timeout-dominated from successful search', async () => {
  const timeoutHeavy = makeFactory([
    ...Array.from({ length: 7 }, () => ({ status: 'failed', errorMessage: 'timeout' })),
    ...Array.from({ length: 3 }, () => ({ status: 'completed', errorMessage: null })),
  ]);
  const h1 = await timeoutHeavy.getCampaignRecentSearchHealth('c1');
  assert.equal(h1.timeoutDominated, true);
  assert.equal(h1.searched, true); // ainda houve 3 bem-sucedidos

  const cleanSearch = makeFactory(Array.from({ length: 10 }, () => ({ status: 'completed', errorMessage: null })));
  const h2 = await cleanSearch.getCampaignRecentSearchHealth('c2');
  assert.equal(h2.timeoutDominated, false);
  assert.equal(h2.searched, true);
});
