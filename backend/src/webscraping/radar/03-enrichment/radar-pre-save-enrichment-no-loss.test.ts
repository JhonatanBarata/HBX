import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreQualityEnrichmentMixin } from './radar-core-quality-enrichment.mixin';

// ── INVARIANTE 29/07: ENRIQUECER NUNCA PODE PERDER CARD ──────────────────────────────────────
// Caso real "ADVOCACIA TOLEDO" (busca advocacia/Rio Claro): item entrou como `found` no run e
// NUNCA chegou na prateleira — 41 entregues, 40 no pool. A causa é estrutural: o
// enriquecimento pré-save roda DUAS vezes por lote (uma pra gravar os itens do run, outra pro
// pool) e cada rodada bate na rede — o log do VPS tinha "HBX falhou; tentando fallback web:
// aborted due to timeout". Quando o merge colapsa/perde uma entidade numa das rodadas, o card
// existe num lado e some no outro, sem erro nenhum.

// A rede fica FORA do teste: o enriquecedor real tentaria motor+fallback web e cada caso
// levava ~14s de timeout. Aqui ele falha na hora — o que importa é o lote de SAÍDA.
const originalFetch = (globalThis as any).fetch;
test.before(() => {
  (globalThis as any).fetch = async () => { throw new Error('rede desligada no teste'); };
});
test.after(() => {
  (globalThis as any).fetch = originalFetch;
});

function makeInstance(mergeBehavior: (results: any[]) => any[]) {
  const instance: any = new (RadarCoreQualityEnrichmentMixin as any)();
  instance.logger = { warn: () => {} };
  instance.shouldRunFreePreSaveEnrichment = () => true;
  instance.getRequiredChannelEnrichmentBatchLimit = () => 20;
  instance.getRadarWebsiteCrawlSource = () => null;
  instance.getHbxScrapingEngineUrl = () => 'http://engine';
  instance.getRadarClientRequestTimeoutMs = () => 1000;
  instance.searchHbxEngine = async () => ({ results: [] });
  // O merger é quem pode perder entidade — o teste injeta esse comportamento.
  instance.getRadarResultMerger = () => ({
    mergeSources: (groups: any[]) => {
      const all = groups.flatMap((group: any) => group.results || []);
      return { results: mergeBehavior(all) };
    },
  });
  return instance;
}

const NORMALIZED: any = { city: 'Rio Claro', state: 'SP', segment: 'advocacia', quantity: 100, targetType: 'pj', engine: 'hbx' };

const LOTE = [
  { placeId: 'hbx:pj:19996706025', name: 'ADVOCACIA TOLEDO', phoneDigits: '19996706025', city: 'Rio Claro' },
  { placeId: 'hbx:pj:19997516677', name: 'BORGES OLIVEIRA', phoneDigits: '19997516677', city: 'Rio Claro' },
];

test('pre-save: merge que PERDE card devolve o perdido cru (ADVOCACIA TOLEDO nao some)', async () => {
  // Merge derruba justamente o Toledo (o que aconteceu em produção).
  const instance = makeInstance((all) => all.filter((item: any) => item.name !== 'ADVOCACIA TOLEDO'));
  const saida: any[] = await (instance as any).enrichSearchRunResultsBeforeSave(
    NORMALIZED,
    LOTE,
    'hbx_engine',
    'http://engine',
  );
  const nomes = saida.map((item) => item.name).sort();
  assert.deepEqual(nomes, ['ADVOCACIA TOLEDO', 'BORGES OLIVEIRA'], 'nenhum lead pode se perder no merge');
});

test('pre-save: merge que preserva tudo nao duplica nada', async () => {
  const instance = makeInstance((all) => {
    const porId = new Map<string, any>();
    for (const item of all) porId.set(String(item.placeId), item);
    return Array.from(porId.values());
  });
  const saida: any[] = await (instance as any).enrichSearchRunResultsBeforeSave(
    NORMALIZED,
    LOTE,
    'hbx_engine',
    'http://engine',
  );
  assert.equal(saida.length, 2);
  assert.deepEqual(saida.map((item) => item.name).sort(), ['ADVOCACIA TOLEDO', 'BORGES OLIVEIRA']);
});

test('pre-save: card sem placeId reconcilia por TELEFONE (nao vira card fantasma duplicado)', async () => {
  const semPlaceId = [
    { name: 'ADVOCACIA TOLEDO', phone: '(19) 99670-6025', phoneDigits: '19996706025', city: 'Rio Claro' },
  ];
  // Merge devolve o MESMO card com placeId novo — identidade tem de casar pelo telefone.
  const instance = makeInstance(() => [
    { placeId: 'hbx:pj:19996706025', name: 'ADVOCACIA TOLEDO', phoneDigits: '19996706025', city: 'Rio Claro' },
  ]);
  const saida: any[] = await (instance as any).enrichSearchRunResultsBeforeSave(
    NORMALIZED,
    semPlaceId,
    'hbx_engine',
    'http://engine',
  );
  assert.equal(saida.length, 1, 'mesmo telefone = mesma empresa; nao pode duplicar');
});
