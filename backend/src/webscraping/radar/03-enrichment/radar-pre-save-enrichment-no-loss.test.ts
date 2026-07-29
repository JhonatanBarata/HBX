import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreQualityEnrichmentMixin } from './radar-core-quality-enrichment.mixin';

// ── INVARIANTE 29/07: ENRIQUECER NUNCA PODE PERDER CARD ──────────────────────────────────────
// Caso real "ADVOCACIA TOLEDO" (busca advocacia/Rio Claro): item entrou como `found` no run e
// NUNCA chegou na prateleira — 41 entregues, 40 no pool. O enriquecimento pré-save roda DUAS
// vezes por lote e cada rodada bate na rede; quando o merge colapsa/perde uma entidade numa
// das rodadas, o card existe num lado e some no outro, sem erro.
//
// CORREÇÃO-DA-PORTA 29/07 (lição de método): a versão anterior deste teste passava o lote
// pelo `enrichSearchRunResultsBeforeSave` com a rede morta — o enriquecedor devolvia VAZIO,
// a função retornava cedo e o merge injetado NUNCA rodava. Teste verde que não provava nada
// (mesma família do D4). Agora a reconciliação — a unidade que decide quem "se perdeu" — é
// testada DIRETO (reconcileEnrichedBatch), sem caminho vazio possível.

function makeInstance() {
  const instance: any = new (RadarCoreQualityEnrichmentMixin as any)();
  instance.logger = { warn: () => {} };
  return instance;
}

const TOLEDO = { placeId: 'hbx:pj:19996706025', name: 'ADVOCACIA TOLEDO', phoneDigits: '19996706025', city: 'Rio Claro' };
const BORGES = { placeId: 'hbx:pj:19997516677', name: 'BORGES OLIVEIRA', phoneDigits: '19997516677', city: 'Rio Claro' };

test('reconcile: merge que PERDE card devolve o perdido cru (ADVOCACIA TOLEDO nao some)', () => {
  const { batch, lostCount } = makeInstance().reconcileEnrichedBatch([TOLEDO, BORGES], [BORGES]);
  assert.equal(lostCount, 1);
  assert.deepEqual(batch.map((item: any) => item.name).sort(), ['ADVOCACIA TOLEDO', 'BORGES OLIVEIRA']);
});

test('reconcile: merge que preserva tudo nao duplica nada', () => {
  const { batch, lostCount } = makeInstance().reconcileEnrichedBatch([TOLEDO, BORGES], [TOLEDO, BORGES]);
  assert.equal(lostCount, 0);
  assert.equal(batch.length, 2);
});

test('reconcile: card sem placeId casa por TELEFONE (nao vira card fantasma duplicado)', () => {
  const semPlaceId = { name: 'ADVOCACIA TOLEDO', phone: '(19) 99670-6025', phoneDigits: '19996706025', city: 'Rio Claro' };
  // Merge devolve o MESMO card com placeId novo — identidade casa pelo telefone.
  const { batch, lostCount } = makeInstance().reconcileEnrichedBatch([semPlaceId], [TOLEDO]);
  assert.equal(lostCount, 0);
  assert.equal(batch.length, 1, 'mesmo telefone = mesma empresa; nao pode duplicar');
});

// ── VACINA D8 (29/07): o anti-perda NAO pode DESFAZER o dedup do merge. Mesma empresa com
// placeId diferente (cnpj_public:X × hbx:pj:Y, mesmo telefone): o merge colapsa de proposito;
// o casamento por placeId primario ressuscitava o perdedor CRU (justamente a linha
// cnpj_public, sem enriquecimento).
test('VACINA D8: duplicata legitimamente colapsada pelo merge NAO ressuscita', () => {
  const receita = { placeId: 'cnpj_public:12345678000190', cnpj: '12.345.678/0001-90', name: 'BORGES OLIVEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA', phoneDigits: '19997516677', city: 'Rio Claro' };
  const web = { placeId: 'hbx:pj:19997516677', name: 'Borges Oliveira Advocacia', phoneDigits: '19997516677', city: 'Rio Claro' };
  const { batch, lostCount } = makeInstance().reconcileEnrichedBatch([receita, web], [web]);
  assert.equal(lostCount, 0, 'colapso por telefone e dedup CORRETO, nao perda');
  assert.equal(batch.length, 1, 'duplicata colapsada pelo merge nao pode voltar como card extra');
});

test('VACINA D8: colapso por CNPJ tambem e reconhecido como dedup', () => {
  const receita = { placeId: 'cnpj_public:12345678000190', cnpj: '12345678000190', name: 'EMPRESA A LTDA', city: 'Rio Claro' };
  const web = { placeId: 'hbx:pj:sem-fone', cnpj: '12.345.678/0001-90', name: 'Empresa A', city: 'Rio Claro' };
  const { lostCount } = makeInstance().reconcileEnrichedBatch([receita, web], [web]);
  assert.equal(lostCount, 0);
});

test('reconcile: empresa DIFERENTE que o merge derruba continua voltando crua (invariante intacta)', () => {
  const receita = { placeId: 'cnpj_public:11111111000111', name: 'ADVOCACIA TOLEDO', phoneDigits: '19996706025', city: 'Rio Claro' };
  const { batch, lostCount } = makeInstance().reconcileEnrichedBatch([receita, BORGES], [BORGES]);
  assert.equal(lostCount, 1, 'telefone diferente e nenhuma identidade em comum = perda real');
  assert.deepEqual(batch.map((item: any) => item.name).sort(), ['ADVOCACIA TOLEDO', 'BORGES OLIVEIRA']);
});

// Plumbing: com a rede morta o pré-save degrada sem perder o lote (caminho de exceção).
test('enrichSearchRunResultsBeforeSave: rede morta nao perde o lote', async () => {
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => { throw new Error('rede desligada no teste'); };
  try {
    const instance = makeInstance();
    instance.shouldRunFreePreSaveEnrichment = () => true;
    instance.getRequiredChannelEnrichmentBatchLimit = () => 20;
    instance.getRadarWebsiteCrawlSource = () => null;
    instance.getHbxScrapingEngineUrl = () => 'http://engine';
    instance.getRadarClientRequestTimeoutMs = () => 1000;
    instance.searchHbxEngine = async () => ({ results: [] });
    instance.getRadarResultMerger = () => ({ mergeSources: () => ({ results: [] }) });
    const saida: any[] = await instance.enrichSearchRunResultsBeforeSave(
      { city: 'Rio Claro', state: 'SP', segment: 'advocacia', quantity: 100, targetType: 'pj', engine: 'hbx' } as any,
      [TOLEDO, BORGES],
      'hbx_engine',
      'http://engine',
    );
    assert.deepEqual(saida.map((item) => item.name).sort(), ['ADVOCACIA TOLEDO', 'BORGES OLIVEIRA']);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});
