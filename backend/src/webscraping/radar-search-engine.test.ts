import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarSourceExecutorService } from './radar/01-search/radar-source-executor.service';
import { RadarWebsiteCrawlSourceService } from './radar/01-search/radar-website-crawl-source.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { WebsiteCrawlProviderService } from './radar/providers/website-crawl/website-crawl-provider.service';
import { isOfficialWebsiteUrl } from './radar/providers/website-crawl/website-crawl-link-extractor';

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

function withEnv(values: Record<string, string>, fn: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }
  const restore = () => {
    for (const key of Object.keys(values)) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function createExecutorHost(overrides: Record<string, any> = {}) {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  return {
    prisma: overrides.prisma || {},
    logger: { warn: () => null },
    searchHbxEngine: overrides.searchHbxEngine || (async () => ({ results: [] })),
    getRadarInternalReprocessSource: () => overrides.reprocess || new RadarInternalReprocessSourceService(),
    getGoogleSearchProvider: () => overrides.googleProvider || new GoogleSearchProviderService(),
    getRadarSourceExpansion: () => new RadarSourceExpansionService(),
    getRadarSearchStrategy: () => new RadarSearchStrategyService(),
    getRadarSearchOrchestrator: () => orchestrator,
    getRadarWebsiteCrawlSource: () => overrides.websiteCrawlSource || new RadarWebsiteCrawlSourceService(),
    getRadarClientRequestTimeoutMs: () => 1_000,
  };
}

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

test('executor executa google_textual e preserva origem real', async () => withEnv({
  HBX_RADAR_GOOGLE_TEXTUAL_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const plan = new RadarSourcePlannerService().plan(
    { ...baseInput, qualityMode: 'lead_plus' },
    new RadarSearchStrategyService().resolve({ ...baseInput, qualityMode: 'lead_plus' }, { purpose: 'manual' }),
  );
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, qualityMode: 'lead_plus' },
    currentResults: [],
    seenPhones: new Set<string>(),
    options: {},
    sourcePlan: plan.filter((source) => source.source === 'google_textual'),
    remainingQuantity: 3,
    purpose: 'manual',
    host: createExecutorHost({
      searchHbxEngine: async () => ({
        results: [{
          name: 'Barbearia X',
          phone: '(19) 99999-0001',
          phoneDigits: '19999990001',
          website: 'https://barbeariax.com.br',
          city: 'Rio Claro',
        }],
      }),
    }),
  });

  assert.equal(result.optionalSources[0].source, 'google_textual');
  assert.equal(result.optionalResults[0].source, 'google_textual');
  assert.equal(result.sourceDiagnostics[0].status, 'completed');
  assert.equal(result.sourceEnginesUsed.includes('google_textual'), true);
}));

test('executor executa reprocess_missing_social e preserva origem real', async () => withEnv({
  HBX_RADAR_INTERNAL_REPROCESS_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'reprocess_missing_social',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 3,
    host: createExecutorHost({
      reprocess: {
        run: async () => ({
          source: 'reprocess_missing_social',
          status: 'completed',
          retryable: false,
          foundCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          reason: 'ok',
          results: [{ placeId: 'radar:1', name: 'Barbearia X', phone: '(19) 99999-0001', phoneDigits: '19999990001', source: 'reprocess_missing_social' }],
        }),
      },
    }),
  });

  assert.equal(result.optionalSources[0].source, 'reprocess_missing_social');
  assert.equal(result.optionalResults[0].source, 'reprocess_missing_social');
  assert.equal(result.sourceDiagnostics[0].status, 'completed');
}));

test('executor retorna partial_error quando google_textual falha', async () => withEnv({
  HBX_RADAR_GOOGLE_TEXTUAL_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, qualityMode: 'lead_plus' },
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'google_textual',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      searchHbxEngine: async () => {
        throw new Error('timeout google textual');
      },
    }),
  });

  assert.equal(result.sourceDiagnostics[0].status, 'partial_error');
  assert.equal(result.sourceDiagnostics[0].retryable, true);
  assert.equal(result.sourceDiagnostics[0].issue?.blocksDelivery, false);
}));

test('executor retorna partial_error quando internal reprocess falha', async () => withEnv({
  HBX_RADAR_INTERNAL_REPROCESS_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'reprocess_old_cards',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      reprocess: {
        run: async () => {
          throw new Error('db indisponivel');
        },
      },
    }),
  });

  assert.equal(result.sourceDiagnostics[0].status, 'partial_error');
  assert.equal(result.sourceDiagnostics[0].issue?.blocksDelivery, false);
}));

test('website_crawl_light desativado retorna skipped', async () => withEnv({
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [{ placeId: 'lead:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br', city: 'Rio Claro' } as any],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'website_crawl_light',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost(),
  });

  assert.equal(result.sourceDiagnostics[0].status, 'skipped');
  assert.equal(result.sourceDiagnostics[0].reason, 'flag_website_crawl_light_desativada');
}));

test('executor executa website_crawl_light e preserva origem real', async () => withEnv({
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [{ placeId: 'lead:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br', city: 'Rio Claro' } as any],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'website_crawl_light',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      websiteCrawlSource: {
        run: async () => ({
          source: 'website_crawl_light',
          status: 'completed',
          retryable: false,
          foundCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          reason: 'ok',
          results: [{ placeId: 'lead:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br', email: 'agenda@barbeariax.com.br' }],
        }),
      },
    }),
  });

  assert.equal(result.optionalSources[0].source, 'website_crawl_light');
  assert.equal(result.optionalResults[0].source, 'website_crawl_light');
  assert.equal(result.sourceEnginesUsed.includes('website_crawl_light'), true);
}));

test('website_crawl_light falha e nao bloqueia delivery', async () => withEnv({
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const provider = new WebsiteCrawlProviderService();
  const source = new RadarWebsiteCrawlSourceService(provider);
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [{ placeId: 'lead:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br', city: 'Rio Claro' } as any],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'website_crawl_light',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      websiteCrawlSource: {
        run: (input: any) => source.run({
          ...input,
          options: {
            paths: ['/'],
            fetcher: async () => {
              throw new Error('fetch indisponivel');
            },
          },
        }),
      },
    }),
  });

  assert.equal(result.sourceDiagnostics[0].status, 'partial_error');
  assert.equal(result.sourceDiagnostics[0].retryable, true);
  assert.equal(result.sourceDiagnostics[0].issue?.stage, 'site');
  assert.equal(result.sourceDiagnostics[0].issue?.blocksDelivery, false);
  assert.equal((result.sourceDiagnostics[0] as any).deliveryStatus, undefined);
}));

test('website crawl provider rejeita redes sociais google marketplace e diretorios', () => {
  assert.equal(isOfficialWebsiteUrl('https://instagram.com/barbeariax'), false);
  assert.equal(isOfficialWebsiteUrl('https://facebook.com/barbeariax'), false);
  assert.equal(isOfficialWebsiteUrl('https://maps.google.com/?q=barbearia'), false);
  assert.equal(isOfficialWebsiteUrl('https://www.ifood.com.br/delivery/foo'), false);
  assert.equal(isOfficialWebsiteUrl('https://www.guiamais.com.br/foo'), false);
  assert.equal(isOfficialWebsiteUrl('https://barbeariax.com.br'), true);
});

test('website crawl provider extrai email de HTML', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>Contato: agenda@barbeariax.com.br</body></html>',
    }),
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.fields.emails, ['agenda@barbeariax.com.br']);
});

test('website crawl provider extrai telefone e WhatsApp de HTML', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<a href="tel:+5519999990001">Ligue</a><a href="https://wa.me/5519999990001">WhatsApp</a>',
    }),
  });

  assert.equal(result.fields.phoneDigits.includes('5519999990001'), true);
  assert.equal(result.fields.whatsappPhoneDigits.includes('5519999990001'), true);
});

test('website crawl provider extrai Instagram e Facebook de links', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<a href="https://instagram.com/barbeariax/">Instagram</a><a href="https://facebook.com/barbeariax/">Facebook</a>',
    }),
  });

  assert.equal(result.fields.instagramUrls[0], 'https://instagram.com/barbeariax');
  assert.equal(result.fields.facebookUrls[0], 'https://facebook.com/barbeariax');
});

test('website crawl provider respeita timeout e limite de HTML', async () => {
  const provider = new WebsiteCrawlProviderService();
  const limited = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    maxHtmlBytes: 20,
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>agenda@barbeariax.com.br</body></html>',
    }),
  });
  const timedOut = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    timeoutMs: 5,
    fetcher: async (_url, init) => new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => 'ok',
      }), 50);
    }),
  });

  assert.deepEqual(limited.fields.emails, []);
  assert.equal(timedOut.status, 'partial_error');
  assert.equal(timedOut.retryable, true);
});

test('website crawl source retorna partial_error em erro de fetch', async () => withEnv({
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'true',
}, async () => {
  const source = new RadarWebsiteCrawlSourceService(new WebsiteCrawlProviderService());
  const result = await source.run({
    currentResults: [{ placeId: 'lead:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br' } as any],
    options: {
      paths: ['/'],
      fetcher: async () => {
        throw new Error('timeout');
      },
    },
  });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.issue?.stage, 'site');
  assert.equal(result.issue?.blocksDelivery, false);
}));

test('local_directories_stub e cnpj_public_stub continuam skipped, nunca completed', async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: baseInput,
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: ['local_directories_stub', 'cnpj_public_stub'].map((source, index) => ({
      source: source as any,
      priority: index + 1,
      enabled: true,
      implemented: false,
      optional: true,
      stopWhenEnough: false,
      reason: 'stub explicito',
    })),
    remainingQuantity: 2,
    host: createExecutorHost(),
  });

  assert.equal(result.sourceDiagnostics.length, 2);
  assert.equal(result.sourceDiagnostics.every((item) => item.status === 'skipped'), true);
  assert.equal(result.sourceDiagnostics.every((item) => item.reason.includes('stub')), true);
});

test('radar result merger preserva sourceEvidence por fonte real', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'google_textual',
      results: [{ placeId: 'g:1', name: 'Barbearia X', phone: '(19) 99999-0001', phoneDigits: '19999990001', city: 'Rio Claro' } as any],
    },
    {
      source: 'reprocess_missing_social',
      results: [{ placeId: 'r:1', name: 'Barbearia X', phone: '', phoneDigits: '19999990001', city: 'Rio Claro', instagramUrl: 'https://instagram.com/barbeariax' } as any],
    },
  ]);

  assert.equal(merged.results.length, 1);
  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.google_textual), true);
  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.reprocess_missing_social), true);
});

test('result merger preserva telefone social confirmado e adiciona dados do website crawl', () => {
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
        website: 'https://barbeariax.com.br',
        instagramUrl: 'https://instagram.com/barbeariax',
        socialStatus: 'found',
        whatsappStatus: 'confirmed',
      } as any],
    },
    {
      source: 'website_crawl_light',
      results: [{
        placeId: 'crawl:1',
        name: 'Barbearia X',
        phone: '',
        phoneDigits: '',
        website: 'https://barbeariax.com.br',
        instagramUrl: '',
        socialStatus: 'missing',
        email: 'agenda@barbeariax.com.br',
        cnpj: '12.345.678/0001-90',
        address: 'Rua Um, 123 - Rio Claro',
      } as any],
    },
  ]);

  assert.equal(merged.results.length, 1);
  assert.equal(merged.results[0].phoneDigits, '19999990001');
  assert.equal(merged.results[0].instagramUrl, 'https://instagram.com/barbeariax');
  assert.equal((merged.results[0] as any).socialStatus, 'found');
  assert.equal((merged.results[0] as any).whatsappStatus, 'confirmed');
  assert.equal(merged.results[0].email, 'agenda@barbeariax.com.br');
  assert.equal((merged.results[0] as any).cnpj, '12.345.678/0001-90');
});

test('result merger adiciona sourceEvidence.website_crawl_light', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{ placeId: 'radar:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br' } as any],
    },
    {
      source: 'website_crawl_light',
      results: [{ placeId: 'crawl:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: 'https://barbeariax.com.br', email: 'agenda@barbeariax.com.br' } as any],
    },
  ]);

  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.website_crawl_light), true);
  assert.equal((merged.results[0] as any).sourceEvidence.website_crawl_light.email, 'agenda@barbeariax.com.br');
});

test('public search mixin delega optional source para executor', () => {
  const source = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-core-public-search.mixin.ts'), 'utf8');
  const optionalBlock = source.slice(source.indexOf('HBX_RADAR_SEARCH_STRATEGY_ENGINE_ENABLED'), source.indexOf('const historyResults'));

  assert.match(optionalBlock, /getRadarSourceExecutor\(\)\.execute/);
  assert.doesNotMatch(optionalBlock, /getRadarInternalReprocessSource\(\)\.run/);
  assert.doesNotMatch(optionalBlock, /buildLeadDiscoveryRequests/);
});

test('optional source executor nao chama Vendas nem altera importedCount', () => {
  const source = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-source-executor.service.ts'), 'utf8');
  const websiteSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-website-crawl-source.service.ts'), 'utf8');
  const provider = readFileSync(join(process.cwd(), 'src/webscraping/radar/providers/website-crawl/website-crawl-provider.service.ts'), 'utf8');

  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(source), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(websiteSource), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(provider), false);
});
