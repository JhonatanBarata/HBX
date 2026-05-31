import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';

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

  assert.equal(plan.strategy.mode, 'rapido');
  assert.deepEqual(plan.implementedSources.slice(0, 4), ['radar_database', 'company_history', 'global_cache', 'hbx_engine']);
  assert.equal(plan.activeSources.includes('social_async'), true);
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

  assert.equal(plan.strategy.mode, 'profundo');
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
