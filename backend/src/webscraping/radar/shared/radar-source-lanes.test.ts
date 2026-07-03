import test from 'node:test';
import assert from 'node:assert/strict';
import {
  radarSourceLaneOf,
  buildRadarSourceChainFromEngines,
  radarEnrichedByLanesOf,
  radarDiscoveryEnginesOf,
  tagRadarDiscoverySnapshot,
  splitRadarDiscoveryFromEnrichment,
  RADAR_DISCOVERY_SNAPSHOT_FIELD,
} from './radar-source-lanes';

// ─── Lanes: conhece os rótulos REAIS que o motor Python emite (bug 03/07: sumiam do split) ────────
test('radarSourceLaneOf: rótulos reais do motor Python caem na lane web', () => {
  assert.equal(radarSourceLaneOf('hbx_scraping:free_pj'), 'web');
  assert.equal(radarSourceLaneOf('hbx_scraping:web'), 'web');
  assert.equal(radarSourceLaneOf('hbx_scraping'), 'web');
  assert.equal(radarSourceLaneOf('hbx_scraping_social'), 'web');
  assert.equal(radarSourceLaneOf('hbx_scraping:social_discovery'), 'web');
  assert.equal(radarSourceLaneOf('hbx_agenda:web'), 'web');
  assert.equal(radarSourceLaneOf('hbx_agenda:abctelefonos'), 'web');
});

test('radarSourceLaneOf: Receita = rfb; engines de corrida NÃO têm lane de descoberta', () => {
  assert.equal(radarSourceLaneOf('cnpj_public'), 'rfb');
  assert.equal(radarSourceLaneOf('cnpj_public_stub'), 'rfb');
  // Corrida/fábrica processa, não descobre — sem lane (não pode virar carona de fusão)
  assert.equal(radarSourceLaneOf('hbx_mass_data'), null);
  assert.equal(radarSourceLaneOf('hbx_campaign'), null);
  assert.equal(radarSourceLaneOf('fabrica_enriquecimento'), null);
  assert.equal(radarSourceLaneOf('radar_database'), null);
  assert.equal(radarSourceLaneOf('current'), null);
  assert.equal(radarSourceLaneOf(''), null);
  assert.equal(radarSourceLaneOf(null), null);
});

// ─── CENÁRIO 1 (tarefa): card só-web ganha chain "web" ────────────────────────────────────────────
test('card achado só pela web (hbx_scraping:free_pj) ganha sourceChain "web"', () => {
  assert.equal(buildRadarSourceChainFromEngines(['hbx_scraping:free_pj']), 'web');
  // antes do fix esse rótulo não estava no mapa → cadeia null → card sumia do split do painel
  assert.equal(buildRadarSourceChainFromEngines(['hbx_engine', 'website_crawl_light']), 'web');
});

// ─── CENÁRIO 3 (tarefa): fusão REAL (descoberto pelos dois) = "rfb+web" ────────────────────────────
test('lead descoberto por Receita E web = sourceChain "rfb+web" (ordem fixa rfb→web)', () => {
  assert.equal(buildRadarSourceChainFromEngines(['cnpj_public', 'hbx_scraping:free_pj']), 'rfb+web');
  assert.equal(buildRadarSourceChainFromEngines(['hbx_scraping:free_pj', 'cnpj_public']), 'rfb+web');
});

test('só Receita = "rfb"; nada mapeável = null (campo opcional, card antigo não quebra)', () => {
  assert.equal(buildRadarSourceChainFromEngines(['cnpj_public']), 'rfb');
  assert.equal(buildRadarSourceChainFromEngines(['hbx_mass_data', 'current']), null);
  assert.equal(buildRadarSourceChainFromEngines([]), null);
});

test('radarEnrichedByLanesOf: lanes amigáveis, ordenadas rfb→web', () => {
  assert.deepEqual(radarEnrichedByLanesOf(['radar_web_enrichment']), ['web']);
  assert.deepEqual(radarEnrichedByLanesOf(['cnpj_public', 'hbx_scraping:web']), ['rfb', 'web']);
  assert.deepEqual(radarEnrichedByLanesOf(['hbx_mass_data']), []);
});

// ─── radarDiscoveryEnginesOf: acumulado do 01-search OU identidade própria; sem lixo sintético ────
test('radarDiscoveryEnginesOf: usa sourceEngines quando existe, senão cai na identidade', () => {
  assert.deepEqual(radarDiscoveryEnginesOf({ sourceEngines: ['cnpj_public', 'hbx'] }), ['cnpj_public', 'hbx']);
  assert.deepEqual(radarDiscoveryEnginesOf({ source: 'hbx_scraping:free_pj' }), ['hbx_scraping:free_pj']);
  assert.deepEqual(radarDiscoveryEnginesOf({ sourceEngine: 'cnpj_public' }), ['cnpj_public']);
  // rótulo sintético do merger ('current') nunca é descoberta
  assert.deepEqual(radarDiscoveryEnginesOf({ sourceEngines: ['current', 'cnpj_public'] }), ['cnpj_public']);
  assert.deepEqual(radarDiscoveryEnginesOf({ source: 'current' }), []);
});

// ─── CENÁRIO 2 (tarefa): separação DESCOBERTA × ENRIQUECIMENTO no merge de pré-save ───────────────
// Simula o que o RadarResultMergerService faz: carimba o rótulo do GRUPO + o da fonte de
// enriquecimento em sourceEngines de todo resultado. O split deve devolver descoberta pura e
// mover o resto pra enrichmentEngines (a carona que fabricava "fusão" fictícia de 53,8%).
test('lead rfb enriquecido por web fica chain "rfb" + enrichedBy web (sem fusão fictícia)', () => {
  const [tagged] = tagRadarDiscoverySnapshot([{ source: 'cnpj_public', sourceEngines: ['cnpj_public'] }]);
  assert.deepEqual((tagged as any)[RADAR_DISCOVERY_SNAPSHOT_FIELD], ['cnpj_public']);

  // pós-merge: o merger acumulou o rótulo do lote (mergeLabel 'cnpj_public') + a fonte de
  // enriquecimento ('radar_web_enrichment') em sourceEngines.
  const afterMerge = { ...(tagged as any), sourceEngines: ['cnpj_public', 'radar_web_enrichment'] };
  const split = splitRadarDiscoveryFromEnrichment(afterMerge, 'cnpj_public');

  assert.deepEqual(split.sourceEngines, ['cnpj_public'], 'descoberta = só Receita');
  assert.deepEqual(split.enrichmentEngines, ['radar_web_enrichment'], 'web só enriqueceu');
  assert.equal((split as any)[RADAR_DISCOVERY_SNAPSHOT_FIELD], undefined, 'campo-snapshot é interno, não vaza');

  // consequência no medidor: descoberta = rfb, enriquecimento = web → NÃO é fusão
  assert.equal(buildRadarSourceChainFromEngines(split.sourceEngines), 'rfb');
  assert.deepEqual(radarEnrichedByLanesOf(split.enrichmentEngines || []), ['web']);
});

test('lead web-only enriquecido por web: descoberta preservada (hbx_scraping:free_pj), sem carona', () => {
  // motor Python entrega source sem sourceEngines → snapshot cai na identidade
  const [tagged] = tagRadarDiscoverySnapshot([{ source: 'hbx_scraping:free_pj' }]);
  assert.deepEqual((tagged as any)[RADAR_DISCOVERY_SNAPSHOT_FIELD], ['hbx_scraping:free_pj']);

  // merger carimbou o lote 'hbx' + o enriquecimento 'radar_web_enrichment'
  const afterMerge = { ...(tagged as any), sourceEngines: ['hbx', 'radar_web_enrichment'] };
  const split = splitRadarDiscoveryFromEnrichment(afterMerge, 'hbx');

  assert.deepEqual(split.sourceEngines, ['hbx_scraping:free_pj'], 'descoberta = rótulo real do motor, não o lote "hbx"');
  assert.deepEqual(split.enrichmentEngines, ['radar_web_enrichment']);
  assert.equal(buildRadarSourceChainFromEngines(split.sourceEngines), 'web');
});

test('splitRadarDiscoveryFromEnrichment: fusão REAL de descoberta não é rebaixada a enriquecimento', () => {
  // os dois lados descobriram no 01-search (snapshot já com as 2 lanes)
  const [tagged] = tagRadarDiscoverySnapshot([{ sourceEngines: ['cnpj_public', 'hbx_scraping:free_pj'] }]);
  const afterMerge = { ...(tagged as any), sourceEngines: ['cnpj_public', 'hbx_scraping:free_pj', 'radar_web_enrichment'] };
  const split = splitRadarDiscoveryFromEnrichment(afterMerge, 'hbx');

  assert.deepEqual(split.sourceEngines, ['cnpj_public', 'hbx_scraping:free_pj']);
  assert.deepEqual(split.enrichmentEngines, ['radar_web_enrichment']);
  assert.equal(buildRadarSourceChainFromEngines(split.sourceEngines), 'rfb+web');
});

test('splitRadarDiscoveryFromEnrichment: resultado sem snapshot (lead novo do enriquecimento) fica intacto', () => {
  const lead = { sourceEngines: ['radar_web_enrichment'] };
  const split = splitRadarDiscoveryFromEnrichment(lead, 'hbx');
  assert.deepEqual(split.sourceEngines, ['radar_web_enrichment'], 'sem snapshot = descoberta é o próprio enriquecimento');
  assert.equal((split as any).enrichmentEngines, undefined);
});
