import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarSourceExecutorService } from './radar/01-search/radar-source-executor.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarWebsiteCrawlSourceService } from './radar/01-search/radar-website-crawl-source.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { CnpjPublicProviderService } from './radar/providers/cnpj-public/cnpj-public-provider.service';
import { LocalDirectoryProviderService } from './radar/providers/local-directories/local-directory-provider.service';
import { VerticalSourceProviderService } from './radar/providers/vertical-sources/vertical-source-provider.service';
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

// DNS fake do guard anti-SSRF: hosts de teste não resolvem no mundo real.
const publicSsrfLookup = async () => [{ address: '203.0.113.10', family: 4 }];

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
    getRadarCnpjPublicSource: () => overrides.cnpjPublicSource || new RadarCnpjPublicSourceService(),
    getRadarLocalDirectorySource: () => overrides.localDirectorySource || new RadarLocalDirectorySourceService(),
    getRadarVerticalSource: () => overrides.verticalSource || new RadarVerticalSourceService(),
    getRadarWebsiteCrawlSource: () => overrides.websiteCrawlSource || new RadarWebsiteCrawlSourceService(),
    getRadarWebEnrichmentSource: overrides.webEnrichmentSource ? () => overrides.webEnrichmentSource : undefined,
    getRadarClientRequestTimeoutMs: () => 1_000,
    fetcher: overrides.fetcher,
  };
}

test('radar search orchestrator planeja fontes por estrategia rapida (HBX_LEGACY_SOURCES default OFF: radar_database-first fora da rota do cliente)', () => withEnv({
  HBX_LEGACY_SOURCES: 'false',
  // Pinado (integração 02/07): sem isto o teste herda o .env do ambiente (o working copy
  // principal roda com a flag true) e o cnpj_public entra no plano, mudando implementedSources.
  // A intenção AQUI é testar só o legado — o mundo inteiro que afeta o plano fica controlado.
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'false',
}, () => {
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
  // Cutover P1 (02/07): radar_database-first é fonte legada, sai da rota do cliente com a
  // flag OFF (default). company_history/global_cache/hbx_engine continuam (não são legado).
  assert.deepEqual(plan.implementedSources.slice(0, 3), ['company_history', 'global_cache', 'hbx_engine']);
  assert.equal(plan.activeSources.includes('radar_database'), false);
  assert.equal(plan.activeSources.includes('google_textual'), false);
}));

test('radar search orchestrator com HBX_LEGACY_SOURCES=true: radar_database-first volta pra rota do cliente (rollback barato)', () => withEnv({
  HBX_LEGACY_SOURCES: 'true',
  // Pinado (integração 02/07): mesmo motivo do teste acima — controla o mundo inteiro do plano.
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'false',
}, () => {
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
}));

test('radar search orchestrator com cnpj_public ligado (mundo real do VPS): RFB entra ANTES do hbx_engine no plano fast', () => withEnv({
  HBX_LEGACY_SOURCES: 'false',
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
}, () => {
  // Irmão do teste acima cobrindo o OUTRO mundo (flag da Receita ligada, como no VPS):
  // trava a ordem fixa da árvore mestra — RFB (cnpj_public) antes do web (hbx_engine).
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
  assert.equal(plan.implementedSources.includes('cnpj_public'), true);
  assert.equal(
    plan.implementedSources.indexOf('cnpj_public') < plan.implementedSources.indexOf('hbx_engine'),
    true,
    'cnpj_public (RFB) deve vir ANTES do hbx_engine (web) na ordem fixa RFB->web',
  );
}));

// F0 (02/07): teste do modo `night_factory` REMOVIDO — a fábrica de descoberta autônoma foi
// demolida; o purpose 'factory' não produz mais estratégia própria (cai em fast/quality/deep).

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

test('radar strategy nao muda por lead_plus antes dos resultados (HBX_LEGACY_SOURCES default OFF)', () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'false',
  HBX_LEGACY_SOURCES: 'false',
}, () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan({ ...baseInput}, { purpose: 'manual' });

  assert.equal(plan.strategy.mode, 'fast');
  // Cutover P1: radar_database-first é legado, sai por default (flag OFF).
  assert.deepEqual(plan.activeSources, ['company_history', 'global_cache', 'hbx_engine']);
  assert.equal(plan.activeSources.includes('google_textual'), false);
}));

test('radar strategy fast/quality: cnpj_public entra qdo HBX_RADAR_CNPJ_PUBLIC_ENABLED=true (C1, calibracao round-2)', () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
  HBX_LEGACY_SOURCES: 'false',
}, () => {
  // Furo medido 01/07 (barbearia/Goiânia): planner so incluia cnpj_public em deep/night_factory;
  // runs de cliente (fast/quality) reconstroem input sem freshness e nunca alcancavam a Receita
  // mesmo com a fonte local/gratis pronta e a flag ligada. Fix: flag ligada + targetType pj =>
  // cnpj_public ativo em QUALQUER modo. Cutover P1 (02/07): cnpj_public (RFB) agora entra
  // ANTES do hbx_engine na ordem fixa 1→8 (RFB→web); radar_database-first é legado (fora por
  // default).
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const fastPlan = orchestrator.plan({ ...baseInput }, { purpose: 'manual' });
  assert.equal(fastPlan.strategy.mode, 'fast');
  assert.deepEqual(fastPlan.activeSources, ['company_history', 'global_cache', 'cnpj_public', 'hbx_engine']);
  assert.equal(
    fastPlan.activeSources.indexOf('cnpj_public') < fastPlan.activeSources.indexOf('hbx_engine'),
    true,
    'cnpj_public (RFB) deve vir ANTES do hbx_engine (web) na ordem fixa RFB->web',
  );

  const qualityPlan = orchestrator.plan({ ...baseInput, freshness: 'live' }, { purpose: 'manual' });
  assert.equal(qualityPlan.activeSources.includes('cnpj_public'), true);
  assert.equal(
    qualityPlan.activeSources.indexOf('cnpj_public') < qualityPlan.activeSources.indexOf('hbx_engine'),
    true,
    'cnpj_public deve vir antes do hbx_engine tambem em quality',
  );
}));

test('radar strategy deep inclui stubs como skipped explicito (HBX_LEGACY_SOURCES=true traz local_directory/vertical_source de volta)', () => withEnv({
  // C1 (01/07): cnpj_public só entra no plano com a flag ligada (em qualquer modo).
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
  // local_directory/vertical_source são fontes legadas (P1) — precisam da flag ligada pra
  // aparecerem em deep, que também é rota de cliente.
  HBX_LEGACY_SOURCES: 'true',
}, () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan({ ...baseInput, freshness: 'hybrid', quantity: 100 }, { purpose: 'manual' });

  assert.equal(plan.strategy.mode, 'deep');
  assert.equal(plan.activeSources.includes('website_crawl_light'), true);
  assert.equal(plan.activeSources.includes('cnpj_public'), true);
  assert.equal(plan.activeSources.includes('local_directory'), true);
  assert.equal(plan.activeSources.includes('vertical_source'), true);
  assert.equal(plan.diagnostics.every((item) => item.status === 'skipped'), true);
  assert.equal(plan.implementedSources.includes('local_directory'), true);
  assert.equal(plan.implementedSources.includes('vertical_source'), true);
}));

test('radar strategy deep com HBX_LEGACY_SOURCES default OFF: local_directory/vertical_source/google_textual fora da rota', () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
  HBX_LEGACY_SOURCES: 'false',
}, () => {
  const orchestrator = new RadarSearchOrchestratorService(
    new RadarSearchStrategyService(),
    new RadarSourcePlannerService(),
    new RadarSourceExpansionService(),
  );
  const plan = orchestrator.plan({ ...baseInput, freshness: 'hybrid', quantity: 100 }, { purpose: 'manual' });

  assert.equal(plan.strategy.mode, 'deep');
  assert.equal(plan.activeSources.includes('cnpj_public'), true);
  assert.equal(plan.activeSources.includes('local_directory'), false);
  assert.equal(plan.activeSources.includes('vertical_source'), false);
  assert.equal(plan.activeSources.includes('google_textual'), false);
}));

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
  // google_textual e fonte legada (P1) — precisa da flag ligada pro planner habilitar.
  HBX_LEGACY_SOURCES: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const liveInput = { ...baseInput, freshness: 'live' as const };
  const plan = new RadarSourcePlannerService().plan(
    liveInput,
    new RadarSearchStrategyService().resolve(liveInput, { purpose: 'manual' }),
  );
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: liveInput,
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

test('executor ignora radar_web_enrichment na busca primaria mesmo se vier em sourcePlan legado', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      fetcher: async () => ({
        ok: true,
        text: async () => `
          <a class="result__a" href="https://barbeariax.com.br">Barbearia X Rio Claro site oficial</a>
          <a class="result__a" href="https://instagram.com/barbeariaxrioclaro">Barbearia X Rio Claro Instagram</a>
        `,
      }),
    }),
  });

  assert.equal(result.optionalSources.length, 0);
  assert.equal(result.optionalResults.length, 0);
  assert.equal(result.sourceDiagnostics.length, 0);
}));

test.skip('radar_web_enrichment usa HBX engine social antes do fallback web', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const queries: string[] = [];
  let fetched = false;
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      searchHbxEngine: async (_input: any, _existing: string[], _engineUrl: string | undefined, options: any) => {
        queries.push(String(options.queryText || ''));
        return {
          results: [{
            name: 'Barbearia X Rio Claro',
            phone: '',
            phoneDigits: '',
            website: 'https://barbeariax.com.br',
            instagramUrl: 'https://instagram.com/barbeariaxrioclaro',
            socialStatus: 'found',
            socialConfidence: 82,
            source: 'hbx_scraping:free_pj',
          }],
        };
      },
      fetcher: async () => {
        fetched = true;
        throw new Error('fallback nao deveria rodar');
      },
    }),
  });

  assert.equal(queries[0], 'site:instagram.com "Barbearia X" "Rio Claro"');
  assert.equal(fetched, false);
  assert.equal(result.optionalResults[0].source, 'radar_web_enrichment');
  assert.equal(result.optionalResults[0].sourceEngine, 'radar_web_enrichment:hbx_engine');
  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/barbeariaxrioclaro');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'found');
  assert.equal((result.optionalResults[0] as any).socialConfidence, 82);
  assert.equal((result.sourceDiagnostics[0] as any).blocksDelivery, false);
}));

test.skip('radar_web_enrichment usa variantes de segmento nas queries HBX', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEB_ENRICHMENT_HBX_MAX_QUERIES: '14',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const queries: string[] = [];
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, segment: 'salão de beleza', normalizedSegment: 'salao de beleza'},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Studio Bella Hair',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      segment: 'salão de beleza',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      searchHbxEngine: async (_input: any, _existing: string[], _engineUrl: string | undefined, options: any) => {
        const query = String(options.queryText || '');
        queries.push(query);
        if (!query.includes('"cabeleireiro"')) return { results: [] };
        return {
          results: [{
            name: 'Studio Bella Hair Rio Claro',
            phone: '',
            phoneDigits: '',
            website: 'https://studiobella.com.br',
            instagramUrl: 'https://instagram.com/studiobellarioclaro',
            socialStatus: 'found',
            socialConfidence: 86,
            source: 'hbx_scraping:free_pj',
          }],
        };
      },
      fetcher: async () => {
        throw new Error('fallback nao deveria rodar');
      },
    }),
  });

  assert.equal(queries.some((query) => query.includes('"salão de beleza"')), true);
  assert.equal(queries.some((query) => query.includes('"cabeleireiro"')), true);
  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/studiobellarioclaro');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'found');
}));

test.skip('radar_web_enrichment aceita social compacto com marca e cidade no fallback web', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, segment: 'salão de beleza', normalizedSegment: 'salao de beleza'},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Studio Bella Hair',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      segment: 'salão de beleza',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      fetcher: async () => ({
        ok: true,
        text: async () => `
          <a class="result__a" href="https://instagram.com/studiobellarioclaro">@studiobellarioclaro</a>
        `,
      }),
    }),
  });

  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/studiobellarioclaro');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'candidate_review');
  assert.equal((result.sourceDiagnostics[0] as any).blocksDelivery, false);
}));

test.skip('radar_web_enrichment fallback tenta query social direta por nome localizado', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEB_ENRICHMENT_FALLBACK_MAX_QUERIES: '3',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const queries: string[] = [];
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, segment: 'salão de beleza', normalizedSegment: 'salao de beleza'},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Atelie dos Cabelos',
      phone: '(19) 99762-7977',
      phoneDigits: '19997627977',
      city: 'Rio Claro',
      segment: 'salão de beleza',
      source: 'hbx',
    } as any],
    seenPhones: ['19997627977'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      fetcher: async (url: any) => {
        const query = decodeURIComponent(String(url).split('q=')[1]?.split('&')[0] || '');
        if (query) queries.push(query);
        if (!query.includes('instagram')) {
          return { ok: true, text: async () => '<html></html>' };
        }
        return {
          ok: true,
          text: async () => `
            <li class="b_algo">
              <a href="https://instagram.com/ateliedoscabelosrc">Atelie dos Cabelos Rio Claro</a>
              <p>Atelie dos Cabelos Rio Claro SP agenda</p>
            </li>
          `,
        };
      },
    }),
  });

  assert.equal(queries[0], '"Atelie dos Cabelos" "Rio Claro" instagram');
  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/ateliedoscabelosrc');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'candidate_review');
}));

test.skip('radar_web_enrichment le links sociais dentro de contactLinks e evidenceJson do HBX', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Aurea Barbosa Manicure',
      phone: '(19) 99718-9549',
      phoneDigits: '19997189549',
      city: 'Rio Claro',
      segment: 'salão de beleza',
      source: 'hbx',
    } as any],
    seenPhones: ['19997189549'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      searchHbxEngine: async () => ({
        results: [{
          name: 'Aurea Barbosa Manicure Rio Claro',
          contactLinks: ['https://instagram.com/aureabarbosa_manicure'],
          evidenceJson: {
            socialText: 'Facebook https://facebook.com/aureabarbosamanicurepedicureeepiladora Rio Claro',
          },
          source: 'hbx_scraping:free_pj',
        }],
      }),
      fetcher: async () => {
        throw new Error('fallback nao deveria rodar');
      },
    }),
  });

  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/aureabarbosa_manicure');
  assert.equal(result.optionalResults[0].facebookUrl, 'https://facebook.com/aureabarbosamanicurepedicureeepiladora');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'candidate_review');
}));

test.skip('radar_web_enrichment nao para quando HBX encontra apenas site', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
  HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED: 'false',
}, async () => {
  const executor = new RadarSourceExecutorService();
  let fetched = false;
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, segment: 'salão de beleza', normalizedSegment: 'salao de beleza'},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Studio Bella Hair',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      segment: 'salão de beleza',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      searchHbxEngine: async () => ({
        results: [{
          name: 'Studio Bella Hair Rio Claro',
          phone: '',
          phoneDigits: '',
          website: 'https://studiobella.com.br',
          socialStatus: 'missing',
          source: 'hbx_scraping:free_pj',
        }],
      }),
      fetcher: async () => {
        fetched = true;
        return {
          ok: true,
          text: async () => `
            <a class="result__a" href="https://instagram.com/studiobellarioclaro">@studiobellarioclaro</a>
          `,
        };
      },
    }),
  });

  assert.equal(fetched, true);
  assert.equal(String(result.optionalResults[0].website).replace(/\/+$/, ''), 'https://studiobella.com.br');
  assert.equal(result.optionalResults[0].instagramUrl, 'https://instagram.com/studiobellarioclaro');
  assert.equal((result.optionalResults[0] as any).socialStatus, 'candidate_review');
  assert.deepEqual((result.optionalResults[0] as any).evidenceJson.radarWebEnrichment.pipeline.map((item: any) => item.source), ['hbx_engine', 'fallback_web']);
  assert.equal((result.optionalResults[0] as any).evidenceJson.radarWebEnrichment.pipeline[0].fallbackRequired, true);
  assert.equal((result.optionalResults[0] as any).evidenceJson.radarWebEnrichment.finalChannels.social, true);
  assert.equal((result.optionalResults[0] as any).evidenceJson.radarWebEnrichment.blocksDelivery, false);
  assert.equal((result.sourceDiagnostics[0] as any).blocksDelivery, false);
}));

test.skip('radar_web_enrichment falha sem bloquear delivery', async () => withEnv({
  HBX_RADAR_WEB_ENRICHMENT_ENABLED: 'true',
  HBX_RADAR_WEB_ENRICHMENT_MAX_CARDS: '1',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput},
    currentResults: [{
      placeId: 'hbx:1',
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      source: 'hbx',
    } as any],
    seenPhones: ['19999990001'],
    options: {},
    sourcePlan: [{
      source: 'radar_web_enrichment',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 0,
    host: createExecutorHost({
      fetcher: async () => {
        throw new Error('web indisponivel');
      },
    }),
  });

  assert.equal(result.optionalResults.length, 0);
  assert.equal(result.sourceDiagnostics[0].status, 'partial_error');
  assert.equal(result.sourceDiagnostics[0].issue?.blocksDelivery, false);
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
    normalized: { ...baseInput},
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
            ssrfLookup: publicSsrfLookup,
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
    ssrfLookup: publicSsrfLookup,
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
    ssrfLookup: publicSsrfLookup,
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
    ssrfLookup: publicSsrfLookup,
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

test('website crawl provider detecta formulario orcamento chat e sinais de oportunidade', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    ssrfLookup: publicSsrfLookup,
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => `
        <html><body>
          <form action="/contato"><input name="nome"><input name="telefone"><button>Enviar</button></form>
          <a href="/orcamento">Solicite orçamento</a>
          <script src="https://embed.tawk.to/chat.js"></script>
        </body></html>
      `,
    }),
  });

  assert.equal(result.fields.hasContactForm, true);
  assert.equal(result.fields.hasBudgetIntent, true);
  assert.equal(result.fields.hasChatWidget, true);
  assert.equal(result.fields.formLinks.includes('https://barbeariax.com.br/contato'), true);
  assert.equal(result.fields.budgetLinks.includes('https://barbeariax.com.br/orcamento'), true);
  assert.equal(result.fields.opportunitySignals.includes('site_com_formulario'), true);
  assert.equal(result.fields.opportunitySignals.includes('site_com_link_orcamento'), true);
  assert.equal(result.fields.opportunitySignals.includes('site_com_chat_atendimento'), true);
});

test('website crawl provider detecta site sem WhatsApp claro e sem formulario', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    ssrfLookup: publicSsrfLookup,
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>Telefone (19) 3333-4444 <a href="https://instagram.com/barbeariax">Instagram</a></body></html>',
    }),
  });

  assert.equal(result.fields.opportunitySignals.includes('site_sem_whatsapp_claro'), true);
  assert.equal(result.fields.opportunitySignals.includes('site_sem_formulario'), true);
  assert.equal(result.fields.opportunitySignals.includes('telefone_fixo_sem_canal_digital'), true);
  assert.equal(result.fields.opportunitySignals.includes('social_sem_link_atendimento'), true);
  assert.equal(result.fields.siteIssues.includes('whatsapp_nao_encontrado_no_site'), true);
});

test('website crawl provider respeita timeout e limite de HTML', async () => {
  const provider = new WebsiteCrawlProviderService();
  const limited = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    maxHtmlBytes: 20,
    ssrfLookup: publicSsrfLookup,
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
    ssrfLookup: publicSsrfLookup,
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
      ssrfLookup: publicSsrfLookup,
      fetcher: async () => {
        throw new Error('timeout');
      },
    },
  });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.issue?.stage, 'site');
  assert.equal(result.issue?.blocksDelivery, false);
}));

test('cnpj_public desativado retorna skipped sem sucesso fake', async () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'false',
}, async () => {
  const source = new RadarCnpjPublicSourceService(new CnpjPublicProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [{
      cnpj: '12.345.678/0001-95',
      nomeFantasia: 'Barbearia X',
      city: 'Rio Claro',
      state: 'SP',
      situacao: 'ativa',
    }],
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'flag_cnpj_public_desativada');
  assert.equal(result.results.length, 0);
}));

test('cnpj_public ligado sem base configurada retorna skipped', async () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
}, async () => {
  const source = new RadarCnpjPublicSourceService(new CnpjPublicProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [],
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'cnpj_public_provider_sem_base_configurada');
  assert.equal(result.results.length, 0);
}));

test('cnpj_public normaliza empresa ativa sem inventar social ou telefone', async () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
}, async () => {
  const source = new RadarCnpjPublicSourceService(new CnpjPublicProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [{
      cnpj: '12.345.678/0001-95',
      nomeFantasia: 'Barbearia X',
      razaoSocial: 'Barbearia X Servicos Ltda',
      city: 'Rio Claro',
      state: 'SP',
      cnae: '9602-5/01',
      cnaeDescription: 'Cabeleireiros manicure e pedicure barbearia',
      situacao: 'ativa',
      porte: 'ME',
      matrizFilial: 'matriz',
    }],
    limit: 5,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.results[0].source, 'cnpj_public');
  assert.equal((result.results[0] as any).cnpj, '12345678000195');
  assert.equal(result.results[0].phone, '');
  assert.equal(result.results[0].instagramUrl, undefined);
  assert.equal(result.issue, null);
}));

test('cnpj_public provider filtra cidade UF segmento e situacao ativa', async () => {
  const provider = new CnpjPublicProviderService();
  const result = await provider.search({
    normalized: baseInput,
    records: [
      { cnpj: '11111111000191', nomeFantasia: 'Barbearia Centro', city: 'Rio Claro', state: 'SP', cnaeDescription: 'barbearia', situacao: 'ativa' },
      { cnpj: '22222222000191', nomeFantasia: 'Restaurante X', city: 'Rio Claro', state: 'SP', cnaeDescription: 'restaurante', situacao: 'ativa' },
      { cnpj: '33333333000191', nomeFantasia: 'Barbearia Campinas', city: 'Campinas', state: 'SP', cnaeDescription: 'barbearia', situacao: 'ativa' },
      { cnpj: '44444444000191', nomeFantasia: 'Barbearia Baixada', city: 'Rio Claro', state: 'SP', cnaeDescription: 'barbearia', situacao: 'baixada' },
    ],
  });

  // Segmento explícito ("barbearias") volta a ser filtro DURO (S2 LEAD-CENTRICO, 25/07 — o
  // dono reverteu a decisão de 03/07): "Restaurante X" agora é REJEITADO por segmento sem
  // match de CNAE, junto de cidade/UF (Campinas) e situação não-ativa (baixada) — só
  // "Barbearia Centro" sobra aceito.
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.results[0].name, 'Barbearia Centro');
  assert.equal(result.rejectedCount, 3);
});

test('executor executa cnpj_public e preserva origem real', async () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, freshness: 'hybrid', quantity: 100 },
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'cnpj_public',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      cnpjPublicSource: {
        run: async () => ({
          source: 'cnpj_public',
          status: 'completed',
          retryable: false,
          foundCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          reason: 'ok',
          results: [{ placeId: 'cnpj_public:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: null, cnpj: '12345678000190', source: 'cnpj_public' }],
        }),
      },
    }),
  });

  assert.equal(result.optionalSources[0].source, 'cnpj_public');
  assert.equal(result.optionalResults[0].source, 'cnpj_public');
  assert.equal(result.sourceDiagnostics[0].status, 'completed');
}));

test('local_directory desativado retorna skipped sem sucesso fake', async () => withEnv({
  HBX_RADAR_LOCAL_DIRECTORIES_ENABLED: 'false',
}, async () => {
  const source = new RadarLocalDirectorySourceService(new LocalDirectoryProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [{ name: 'Barbearia X', city: 'Rio Claro', state: 'SP', segment: 'barbearia' }],
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'flag_local_directories_desativada');
  assert.equal(result.results.length, 0);
}));

test('local_directory ligado sem base configurada retorna skipped', async () => withEnv({
  HBX_RADAR_LOCAL_DIRECTORIES_ENABLED: 'true',
}, async () => {
  const source = new RadarLocalDirectorySourceService(new LocalDirectoryProviderService());
  const result = await source.run({ normalized: baseInput, records: [] });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'local_directory_provider_sem_base_configurada');
}));

test('local_directory normaliza descoberta com baixa confianca e nao confirma social', async () => withEnv({
  HBX_RADAR_LOCAL_DIRECTORIES_ENABLED: 'true',
}, async () => {
  const source = new RadarLocalDirectorySourceService(new LocalDirectoryProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [{
      name: 'Barbearia X',
      phone: '(19) 3333-4444',
      website: 'https://guiamais.com.br/barbearia-x',
      directoryUrl: 'https://guia.local/barbearia-x',
      sourceName: 'Guia Local',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/barbeariax',
    }],
  });
  const lead = result.results[0] as any;

  assert.equal(result.status, 'completed');
  assert.equal(lead.source, 'local_directory');
  assert.equal(lead.website, null);
  assert.equal(lead.directoryConfidence, 42);
  assert.equal(lead.instagramUrl, undefined);
  assert.equal(lead.socialStatus, 'candidate_review');
  assert.equal(lead.evidenceJson.localDirectory.socialCandidates.instagramUrl, 'https://instagram.com/barbeariax');
}));

test('local_directory provider filtra cidade UF e segmento', async () => {
  const provider = new LocalDirectoryProviderService();
  const result = await provider.search({
    normalized: baseInput,
    records: [
      { name: 'Barbearia Centro', city: 'Rio Claro', state: 'SP', segment: 'barbearia', phone: '(19) 3333-4444' },
      { name: 'Restaurante Centro', city: 'Rio Claro', state: 'SP', segment: 'restaurante', phone: '(19) 3333-5555' },
      { name: 'Barbearia Campinas', city: 'Campinas', state: 'SP', segment: 'barbearia', phone: '(19) 3333-6666' },
    ],
  });

  assert.equal(result.acceptedCount, 1);
  assert.equal(result.results[0].name, 'Barbearia Centro');
  assert.equal(result.rejectedCount, 2);
});

test('executor executa local_directory e preserva origem real', async () => withEnv({
  HBX_RADAR_LOCAL_DIRECTORIES_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, freshness: 'hybrid', quantity: 100 },
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'local_directory',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      localDirectorySource: {
        run: async () => ({
          source: 'local_directory',
          status: 'completed',
          retryable: false,
          foundCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          reason: 'ok',
          results: [{ placeId: 'local_directory:1', name: 'Barbearia X', phone: '(19) 3333-4444', phoneDigits: '1933334444', website: null, source: 'local_directory' }],
        }),
      },
    }),
  });

  assert.equal(result.optionalSources[0].source, 'local_directory');
  assert.equal(result.optionalResults[0].source, 'local_directory');
  assert.equal(result.sourceDiagnostics[0].status, 'completed');
}));

test('vertical_source desativado retorna skipped sem sucesso fake', async () => withEnv({
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'false',
}, async () => {
  const source = new RadarVerticalSourceService(new VerticalSourceProviderService());
  const result = await source.run({
    normalized: baseInput,
    records: [{ name: 'Studio Beleza X', vertical: 'beleza', city: 'Rio Claro', state: 'SP' }],
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'flag_vertical_sources_desativada');
  assert.equal(result.results.length, 0);
}));

test('vertical_source ligado sem base configurada retorna skipped', async () => withEnv({
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'true',
}, async () => {
  const source = new RadarVerticalSourceService(new VerticalSourceProviderService());
  const result = await source.run({ normalized: baseInput, records: [] });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'vertical_source_provider_sem_base_configurada');
}));

test('vertical_source falha como partial_error nao bloqueante', async () => withEnv({
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'true',
}, async () => {
  const source = new RadarVerticalSourceService({
    search: async () => {
      throw new Error('timeout');
    },
  } as any);
  const result = await source.run({ normalized: baseInput, records: [{ name: 'Barbearia X' }] });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.retryable, true);
  assert.equal(result.issue?.blocksDelivery, false);
  assert.equal(result.results.length, 0);
}));

test('vertical_source normaliza evidencia por segmento sem confirmar social sozinho', async () => withEnv({
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'true',
}, async () => {
  const source = new RadarVerticalSourceService(new VerticalSourceProviderService());
  const result = await source.run({
    normalized: baseInput,
    strategies: [{ vertical: 'beleza', sources: ['instagram', 'local_guides'], signal: 'atendimento_por_agenda' }],
    records: [{
      name: 'Studio Beleza X',
      vertical: 'beleza',
      sourceType: 'instagram',
      sourceName: 'Instagram',
      sourceUrl: 'https://instagram.com/studiobelezax',
      website: 'https://instagram.com/studiobelezax',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/studiobelezax',
    }],
  });
  const lead = result.results[0] as any;

  assert.equal(result.status, 'completed');
  assert.equal(lead.source, 'vertical_source');
  assert.equal(lead.website, null);
  assert.equal(lead.instagramUrl, undefined);
  assert.equal(lead.socialStatus, 'candidate_review');
  assert.equal(lead.verticalSource, 'beleza');
  assert.equal(lead.evidenceJson.verticalSource.socialCandidates.instagramUrl, 'https://instagram.com/studiobelezax');
  assert.equal(lead.opportunitySignals.includes('vertical_beleza_agenda'), true);
}));

test('vertical_source provider filtra cidade UF segmento e vertical', async () => {
  const provider = new VerticalSourceProviderService();
  const result = await provider.search({
    normalized: baseInput,
    strategies: [{ vertical: 'beleza' }],
    records: [
      { name: 'Barbearia Centro', vertical: 'beleza', city: 'Rio Claro', state: 'SP', segment: 'barbearia' },
      { name: 'Pizzaria Centro', vertical: 'alimentacao', city: 'Rio Claro', state: 'SP', segment: 'pizzaria' },
      { name: 'Barbearia Campinas', vertical: 'beleza', city: 'Campinas', state: 'SP', segment: 'barbearia' },
    ],
  });

  assert.equal(result.acceptedCount, 1);
  assert.equal(result.results[0].name, 'Barbearia Centro');
  assert.equal(result.rejectedCount, 2);
});

test('executor executa vertical_source e preserva origem real', async () => withEnv({
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'true',
}, async () => {
  const executor = new RadarSourceExecutorService();
  const result = await executor.execute({
    context: { companyId: 7, userId: 9, user: {} },
    normalized: { ...baseInput, freshness: 'hybrid', quantity: 100 },
    currentResults: [],
    seenPhones: [],
    options: {},
    sourcePlan: [{
      source: 'vertical_source',
      priority: 10,
      enabled: true,
      implemented: true,
      optional: true,
      stopWhenEnough: false,
      reason: 'test',
    }],
    remainingQuantity: 2,
    host: createExecutorHost({
      verticalSource: {
        run: async () => ({
          source: 'vertical_source',
          status: 'completed',
          retryable: false,
          foundCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          reason: 'ok',
          results: [{ placeId: 'vertical_source:1', name: 'Barbearia X', phone: '', phoneDigits: '', website: null, source: 'vertical_source', verticalSource: 'beleza' }],
        }),
      },
    }),
  });

  assert.equal(result.optionalSources[0].source, 'vertical_source');
  assert.equal(result.optionalResults[0].source, 'vertical_source');
  assert.equal(result.sourceDiagnostics[0].status, 'completed');
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
    {
      source: 'vertical_source',
      results: [{ placeId: 'v:1', name: 'Barbearia X', phone: '', phoneDigits: '19999990001', city: 'Rio Claro', verticalSource: 'beleza' } as any],
    },
  ]);

  assert.equal(merged.results.length, 1);
  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.google_textual), true);
  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.reprocess_missing_social), true);
  assert.equal(Boolean((merged.results[0] as any).sourceEvidence.vertical_source), true);
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

test('result merger preserva websiteIntelligence e sinais comerciais do crawl', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'hbx_engine',
      results: [{
        placeId: 'hbx:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
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
        opportunitySignals: ['site_sem_whatsapp_claro', 'site_sem_formulario'],
        opportunityReason: 'Site sem WhatsApp claro para atendimento.',
        recommendedChannel: 'email',
        websiteIntelligence: {
          source: 'website_crawl_light',
          hasContactForm: false,
          hasBudgetIntent: false,
          hasChatWidget: false,
          siteIssues: ['whatsapp_nao_encontrado_no_site'],
          opportunitySignals: ['site_sem_whatsapp_claro'],
        },
      } as any],
    },
  ]);
  const lead = merged.results[0] as any;

  assert.equal(lead.opportunitySignals.includes('site_sem_whatsapp_claro'), true);
  assert.equal(lead.websiteIntelligence.siteIssues.includes('whatsapp_nao_encontrado_no_site'), true);
  assert.equal(lead.opportunityReason, 'Site sem WhatsApp claro para atendimento.');
  assert.equal(lead.recommendedChannel, 'email');
});

test('result merger cria evidencia por campo com fonte e confianca', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'hbx_engine',
      results: [{
        placeId: 'hbx:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
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
        email: 'agenda@barbeariax.com.br',
        instagramUrl: 'https://instagram.com/barbeariax',
        socialStatus: 'partial',
      } as any],
    },
  ]);
  const lead = merged.results[0] as any;

  assert.equal(lead.phoneEvidence.source, 'hbx_engine');
  assert.equal(lead.websiteEvidence.source, 'hbx_engine');
  assert.equal(lead.emailEvidence.source, 'website_crawl_light');
  assert.equal(lead.socialEvidence.source, 'website_crawl_light');
  assert.equal(typeof lead.fieldEvidence.phone.confidence, 'number');
  assert.equal(lead.sourceEvidence.website_crawl_light.email, 'agenda@barbeariax.com.br');
});

test('result merger nao sobrescreve WhatsApp confirmed por status fraco', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{
        placeId: 'radar:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        whatsappStatus: 'confirmed',
      } as any],
    },
    {
      source: 'google_textual',
      results: [{
        placeId: 'google:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        whatsappStatus: 'error',
      } as any],
    },
  ]);

  assert.equal((merged.results[0] as any).whatsappStatus, 'confirmed');
  assert.equal((merged.results[0] as any).whatsappEvidence.source, 'radar_database');
});

test('result merger nao troca email forte por vazio ou fonte fraca', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{
        placeId: 'radar:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        email: 'comercial@barbeariax.com.br',
        emailStatus: 'confirmed',
      } as any],
    },
    {
      source: 'local_directories_stub',
      results: [{
        placeId: 'dir:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        email: 'lista@diretorio.com.br',
        emailStatus: 'unverified',
      } as any],
    },
    {
      source: 'website_crawl_light',
      results: [{
        placeId: 'crawl:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        email: '',
      } as any],
    },
  ]);

  assert.equal(merged.results[0].email, 'comercial@barbeariax.com.br');
  assert.equal((merged.results[0] as any).emailEvidence.source, 'radar_database');
});

test('result merger preserva website proprio contra diretorio', () => {
  const merger = new RadarResultMergerService();
  const merged = merger.mergeSources([
    {
      source: 'hbx_engine',
      results: [{
        placeId: 'hbx:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
      } as any],
    },
    {
      source: 'local_directories_stub',
      results: [{
        placeId: 'dir:1',
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://guiamais.com.br/barbeariax',
      } as any],
    },
  ]);

  assert.equal(merged.results[0].website, 'https://barbeariax.com.br');
  assert.equal((merged.results[0] as any).websiteEvidence.source, 'hbx_engine');
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
  const cnpjSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-cnpj-public-source.service.ts'), 'utf8');
  const localDirectorySource = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-local-directory-source.service.ts'), 'utf8');
  const verticalSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/01-search/radar-vertical-source.service.ts'), 'utf8');
  const cnpjProvider = readFileSync(join(process.cwd(), 'src/webscraping/radar/providers/cnpj-public/cnpj-public-provider.service.ts'), 'utf8');
  const localDirectoryProvider = readFileSync(join(process.cwd(), 'src/webscraping/radar/providers/local-directories/local-directory-provider.service.ts'), 'utf8');
  const verticalProvider = readFileSync(join(process.cwd(), 'src/webscraping/radar/providers/vertical-sources/vertical-source-provider.service.ts'), 'utf8');
  const provider = readFileSync(join(process.cwd(), 'src/webscraping/radar/providers/website-crawl/website-crawl-provider.service.ts'), 'utf8');

  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(source), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(websiteSource), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(cnpjSource), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(localDirectorySource), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(verticalSource), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(cnpjProvider), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(localDirectoryProvider), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(verticalProvider), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(provider), false);
});
