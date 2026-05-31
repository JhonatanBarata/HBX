import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';

const baseInput: any = {
  city: 'Rio Claro',
  state: 'SP',
  segment: 'barbearias',
  radiusKm: 0,
  originLat: null,
  originLng: null,
  regionalCities: [],
  quantity: 10,
  engine: 'hbx',
  targetType: 'pj',
  filters: { minRating: null, minReviews: null, onlyWithWebsite: false },
  filtersJson: '{}',
  searchSignature: 'sig',
  cacheSignature: 'cache',
  normalizedCity: 'rio claro',
  normalizedSegment: 'barbearias',
  excludePhoneDigits: [],
  qualityMode: 'list',
  salesProfile: null,
  preferredChannels: [],
  requiredChannels: [],
  channelMatchMode: 'prefer',
  freshness: 'database_first',
};

test('radar search orchestrator planeja fontes por estrategia rapida', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan(baseInput, {
    purpose: 'manual',
    flags: {
      radarEnabled: true,
      historyEnabled: true,
      globalCacheEnabled: true,
    },
  });

  assert.equal(plan.strategy.mode, 'fast');
  assert.deepEqual(plan.implementedSources.slice(0, 4), ['radar_database', 'company_history', 'global_cache', 'hbx_engine']);
  assert.equal(plan.activeSources.includes('google_textual'), false);
});

test('radar source expansion gera fontes novas da fase 6', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const input = {
    ...baseInput,
    quantity: 100,
    freshness: 'hybrid',
    segment: 'barbearias',
    normalizedSegment: 'barbearias',
  };
  const plan = orchestrator.plan(input, {
    purpose: 'manual',
    flags: {
      radarEnabled: true,
      historyEnabled: true,
      globalCacheEnabled: true,
    },
  });

  assert.equal(plan.strategy.mode, 'deep');
  assert.equal(plan.expansion.googleTextualQueries.includes('"barbearias" "Rio Claro" SP whatsapp'), true);
  assert.equal(plan.expansion.siteCrawlPaths.includes('/contato'), true);
  assert.equal(plan.expansion.directorySeeds.some((query) => query.includes('guia comercial')), true);
  assert.equal(plan.expansion.verticalStrategies.some((item) => item.vertical === 'beleza'), true);
  assert.equal(plan.expansion.opportunitySignals.some((item) => item.signal === 'instagram_sem_whatsapp_claro'), true);
  assert.equal(plan.expansion.reprocessRules.some((item) => item.rule === 'cards_sem_social'), true);
});

test('radar result merger deduplica por telefone antes de misturar fontes', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{
        placeId: 'radar:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        city: 'Rio Claro',
      } as any],
    },
    {
      source: 'hbx_engine',
      results: [{
        placeId: 'hbx:1',
        name: 'Barbearia X Rio Claro',
        phone: '19999990001',
        phoneDigits: '19999990001',
        city: 'Rio Claro',
      } as any],
    },
  ]);

  assert.equal(merged.results.length, 1);
  assert.equal(merged.counts.radar_database, 1);
  assert.equal(merged.counts.hbx_engine, 0);
});

test('radar strategy quality usa radar database, hbx engine e google textual', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan({ ...baseInput, qualityMode: 'lead_plus' }, { purpose: 'manual' });

  assert.equal(plan.strategy.mode, 'quality');
  assert.deepEqual(plan.activeSources, ['radar_database', 'hbx_engine', 'google_textual', 'reprocess_missing_social']);
  assert.equal(plan.implementedSources.includes('google_textual'), true);
});

test('radar strategy deep inclui stubs como skipped explicito', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan({ ...baseInput, freshness: 'hybrid', quantity: 100 }, { purpose: 'manual' });

  assert.equal(plan.strategy.mode, 'deep');
  assert.equal(plan.activeSources.includes('website_crawl_light'), true);
  assert.equal(plan.activeSources.includes('local_directories_stub'), true);
  assert.equal(plan.activeSources.includes('cnpj_public_stub'), true);
  assert.equal(plan.diagnostics.every((item) => item.status === 'skipped'), true);
  assert.equal(plan.diagnostics.some((item) => item.source === 'local_directories_stub' && item.reason.includes('stub')), true);
});

test('google textual provider monta queries de intencao sem Places', () => {
  const provider = new GoogleSearchProviderService();
  const queries = provider.buildLeadDiscoveryQueries(baseInput);
  const requests = provider.buildLeadDiscoveryRequests(baseInput, [], { limit: 5 });

  assert.equal(queries.includes('"barbearias" "Rio Claro" SP whatsapp'), true);
  assert.equal(queries.includes('site:instagram.com "barbearias" "Rio Claro"'), true);
  assert.equal(queries.includes('"barbearias" "Rio Claro" SP CNPJ'), true);
  assert.equal(requests.every((request) => request.usePlacesApi === false), true);
});

test('provider google textual falha e gera issue nao bloqueante', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const result = orchestrator.buildOptionalSourceFailure({
    source: 'google_textual',
    stage: 'provider_google',
    error: new Error('timeout'),
  });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.retryable, true);
  assert.equal(result.issue?.stage, 'provider_google');
  assert.equal(result.issue?.blocksDelivery, false);
});

test('radar result merger preserva social confirmado e nao troca telefone por vazio', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{
        placeId: 'radar:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        city: 'Rio Claro',
        instagramUrl: 'https://instagram.com/barbeariax',
        socialStatus: 'found',
        website: 'https://barbeariax.com.br',
      } as any],
    },
    {
      source: 'google_textual',
      results: [{
        placeId: 'google_textual:1',
        name: 'Barbearia X',
        phone: '',
        phoneDigits: '',
        city: 'Rio Claro',
        socialStatus: 'missing',
        website: 'https://guiacidade.com/barbeariax',
      } as any],
    },
  ]);

  assert.equal(merged.results.length, 1);
  assert.equal(merged.results[0].phoneDigits, '19999990001');
  assert.equal(merged.results[0].instagramUrl, 'https://instagram.com/barbeariax');
  assert.equal((merged.results[0] as any).socialStatus, 'found');
  assert.equal(merged.results[0].website, 'https://barbeariax.com.br');
});

test('reprocessamento interno seleciona cards com social missing ou error', async () => {
  const service = new RadarInternalReprocessSourceService();
  const prisma = {
    radarLeadPool: {
      findMany: async () => [
        { id: '1', name: 'Barbearia A', phone: '(19) 99999-0001', phoneDigits: '19999990001', city: 'Rio Claro', state: 'SP', segment: 'barbearias', socialStatus: 'missing' },
        { id: '2', name: 'Barbearia B', phone: '(19) 99999-0002', phoneDigits: '19999990002', city: 'Rio Claro', state: 'SP', segment: 'barbearias', socialStatus: 'error' },
      ],
    },
  };
  const result = await service.run({
    prisma,
    normalized: baseInput,
    source: 'reprocess_missing_social',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.acceptedCount, 2);
  assert.deepEqual(result.results.map((item) => item.source), ['reprocess_missing_social', 'reprocess_missing_social']);
});

test('fonte opcional nao altera deliveryStatus para blocked ou error', () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const failure = orchestrator.buildOptionalSourceFailure({
    source: 'google_textual',
    error: new Error('indisponivel'),
  });

  assert.equal(failure.issue?.blocksDelivery, false);
  assert.equal((failure as any).deliveryStatus, undefined);
});
