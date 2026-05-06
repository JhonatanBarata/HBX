import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { WebscrapingService } from './webscraping.service';

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

function createResponse(status: number, body: any): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createPrisma(overrides?: Record<string, any>) {
  return {
    hasTable: async () => true,
    hasColumn: async () => true,
    company: {
      findUnique: async () => ({
        id: 7,
        onboardingStatus: 'active_paid',
        paymentStatus: 'PAID',
        subscriptionStatus: 'active',
      }),
    },
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-1' }),
      delete: async () => null,
    },
    webscrapingUsageLog: {
      count: async () => 0,
      create: async () => ({ id: 'usage-1' }),
    },
    webscrapingGlobalCacheEntry: {
      findUnique: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'global-cache-1' }),
      delete: async () => null,
    },
    ...(overrides || {}),
  } as any;
}

function createUser() {
  return {
    id: 9,
    companyId: 7,
    name: 'Jhonatan',
    username: 'jhonatan',
    role: 'ADMIN',
    company: { name: 'HBX' },
    masterContext: { active: false, companyName: null },
  };
}

function createSearchRunPrisma(initialRun: Record<string, any>) {
  const run = {
    id: 'run-1',
    companyId: 7,
    userId: 9,
    status: 'running',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lanchonetes',
    engine: 'hbx',
    targetType: 'pj',
    targetQuantity: 100,
    foundCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    errorMessage: null,
    assignedEngineId: null,
    assignedEngineUrl: null,
    assignedEngineIndex: null,
    googleEmergencyUsedCount: 0,
    lastFoundCountChangeAt: null,
    attemptCount: 0,
    failedBatchCount: 0,
    consecutiveEmptyBatchCount: 0,
    consecutiveEngineErrorCount: 0,
    lastBatchError: null,
    lastBatchStatus: null,
    nextRetryAt: null,
    lastQueryUsed: null,
    lastEngineUrl: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-05-06T12:00:00.000Z'),
    updatedAt: new Date('2026-05-06T12:00:00.000Z'),
    ...initialRun,
  };
  const items: any[] = [];

  const applyData = (data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === 'object' && 'increment' in value) {
        run[key] = Number(run[key] || 0) + Number((value as any).increment || 0);
      } else {
        run[key] = value;
      }
    }
    run.updatedAt = new Date();
    return { ...run, items: [...items] };
  };

  const prisma = createPrisma({
    webscrapingSearchRun: {
      findFirst: async () => ({ ...run, items: [...items] }),
      findUnique: async () => ({ ...run, items: [...items] }),
      update: async ({ data }: any) => applyData(data),
      updateMany: async ({ data }: any) => {
        applyData(data);
        return { count: 1 };
      },
      count: async () => 0,
    },
    webscrapingSearchRunItem: {
      findMany: async (input?: any) => {
        const where = input?.where || {};
        let rows = [...items];
        if (where.runId) rows = rows.filter((item) => item.runId === where.runId);
        if (where.status) rows = rows.filter((item) => item.status === where.status);
        return rows;
      },
      create: async ({ data }: any) => {
        const item = {
          id: `item-${items.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        items.push(item);
        return item;
      },
    },
    hbxEngineLock: {
      findUnique: async () => ({
        id: 'hbx-engine-1',
        status: 'busy',
        cooldownUntil: null,
      }),
      update: async () => ({ id: 'hbx-engine-1' }),
      updateMany: async () => ({ count: 1 }),
      upsert: async ({ create }: any) => create,
      findMany: async () => [],
    },
  });

  return { prisma, run, items };
}

function disableSearchRunAutoPump(service: WebscrapingService) {
  (service as any).scheduleSearchRunPump = () => undefined;
  (service as any).scheduleNextDueSearchRunPump = async () => undefined;
}

function createCampaignPrisma(initialCampaign: Record<string, any> = {}) {
  const campaign = {
    id: 'campaign-1',
    companyId: 7,
    userId: 9,
    status: 'running',
    mode: 'radar_database',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lanchonetes',
    targetType: 'pj',
    targetTotal: 100,
    batchSize: 25,
    foundCount: 0,
    approvedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    complaintCount: 0,
    deniedCount: 0,
    noAnswerCount: 0,
    currentAttempt: 0,
    maxAttempts: 40,
    consecutiveEmptyBatchCount: 0,
    consecutiveErrorCount: 0,
    lastQueryUsed: null,
    lastEngineUrl: null,
    lastErrorMessage: null,
    nextRunAt: null,
    nightOnly: false,
    allowedStartHour: 0,
    allowedEndHour: 6,
    timezone: 'America/Sao_Paulo',
    startedAt: null,
    pausedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-05-06T12:00:00.000Z'),
    updatedAt: new Date('2026-05-06T12:00:00.000Z'),
    ...initialCampaign,
  };
  const batches: any[] = [];
  const leads: any[] = [];

  const applyCampaignData = (data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === 'object' && 'increment' in value) {
        campaign[key] = Number(campaign[key] || 0) + Number((value as any).increment || 0);
      } else {
        campaign[key] = value;
      }
    }
    campaign.updatedAt = new Date();
    return { ...campaign, batches: [...batches] };
  };

  const prisma = createPrisma({
    webscrapingCampaign: {
      create: async ({ data, include }: any) => {
        Object.assign(campaign, data, { id: campaign.id, createdAt: campaign.createdAt, updatedAt: new Date() });
        return include ? { ...campaign, batches: [...batches] } : { ...campaign };
      },
      findUnique: async () => ({ ...campaign, batches: [...batches] }),
      findFirst: async () => ({ ...campaign, batches: [...batches] }),
      findMany: async () => [{ ...campaign, batches: [...batches] }],
      update: async ({ data }: any) => applyCampaignData(data),
      updateMany: async ({ data }: any) => {
        applyCampaignData(data);
        return { count: 1 };
      },
    },
    webscrapingCampaignBatch: {
      create: async ({ data }: any) => {
        const batch = {
          id: `batch-${batches.length + 1}`,
          approvedCount: 0,
          duplicateCount: 0,
          rejectedCount: 0,
          createdAt: new Date(),
          ...data,
        };
        batches.push(batch);
        return batch;
      },
      update: async ({ where, data }: any) => {
        const batch = batches.find((item) => item.id === where.id);
        if (batch) Object.assign(batch, data);
        return batch;
      },
      findMany: async () => [...batches],
    },
    radarLeadPool: {
      findMany: async (input?: any) => {
        const where = input?.where || {};
        if (where.campaignId) return leads.filter((lead) => lead.campaignId === where.campaignId);
        if (where.normalizedCity || where.normalizedSegment) {
          return leads.filter((lead) =>
            (!where.normalizedCity || lead.normalizedCity === where.normalizedCity) &&
            (!where.normalizedSegment || lead.normalizedSegment === where.normalizedSegment));
        }
        return [...leads];
      },
      findFirst: async (input?: any) => {
        const candidates = input?.where?.OR || [];
        return leads.find((lead) => candidates.some((where: any) =>
          (where.phoneDigits && where.phoneDigits === lead.phoneDigits) ||
          (where.placeId && where.placeId === lead.placeId))) || null;
      },
      create: async ({ data }: any) => {
        const lead = { id: `lead-${leads.length + 1}`, status: 'clean', createdAt: new Date(), updatedAt: new Date(), ...data };
        leads.push(lead);
        return lead;
      },
      update: async ({ where, data }: any) => {
        const lead = leads.find((item) => item.id === where.id);
        if (lead) Object.assign(lead, data, { updatedAt: new Date() });
        return lead;
      },
    },
    radarLeadEvent: {
      create: async ({ data }: any) => ({ id: 'event-1', ...data }),
    },
    radarLeadCompanyState: {
      findFirst: async () => null,
      upsert: async ({ create }: any) => create,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    hbxEngineLock: {
      findUnique: async () => ({ id: 'hbx-engine-1', status: 'busy', cooldownUntil: null }),
      update: async () => ({ id: 'hbx-engine-1' }),
      updateMany: async () => ({ count: 1 }),
      upsert: async ({ create }: any) => create,
      findMany: async () => [],
    },
  });

  return { prisma, campaign, batches, leads };
}

function disableRadarCampaignAutoPump(service: WebscrapingService) {
  (service as any).scheduleRadarCampaignPump = () => undefined;
}

test('runtime sem config retorna mensagem publica limpa', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const previousNativeKey = process.env.WEBSCRAPING_GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.WEBSCRAPING_GOOGLE_PLACES_API_KEY;

  try {
    const service = new WebscrapingService(createPrisma());
    const runtime = await service.getRuntime({ id: 9, companyId: 7, role: 'USER' });

    assert.equal(runtime.native.code, 'configuration_pending');
    assert.equal(runtime.native.message, 'Modulo temporariamente em configuracao.');
    assert.equal(runtime.diagnostics, undefined);
  } finally {
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousNativeKey === undefined) delete process.env.WEBSCRAPING_GOOGLE_PLACES_API_KEY;
    else process.env.WEBSCRAPING_GOOGLE_PLACES_API_KEY = previousNativeKey;
  }
});

test('busca valida retorna contatos e persiste historico nativo', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const fetchCalls: string[] = [];
  const previousFetch = global.fetch;
  global.fetch = (async (input: any) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url.includes('places:searchText')) {
      return createResponse(200, {
        places: [{ id: 'place-1', displayName: { text: 'Clinica Centro' } }],
      }) as any;
    }
    return createResponse(200, {
      displayName: { text: 'Clinica Centro' },
      internationalPhoneNumber: '+55 11 99888-7766',
      nationalPhoneNumber: '(11) 99888-7766',
      websiteUri: 'https://clinica.example.com',
      formattedAddress: 'Rua Central, 100',
      rating: 4.7,
      userRatingCount: 142,
    }) as any;
  }) as any;

  const upsertCalls: Array<Record<string, unknown>> = [];
  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'history-1' };
      },
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Sao Paulo - SP',
      segment: 'Clinicas',
      quantity: 5,
      onlyWithWebsite: true,
    });

    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Clinica Centro');
    assert.equal(response.results[0].website, 'https://clinica.example.com');
    assert.equal(response.meta.source, 'google');
    assert.equal(response.meta.technicalCacheUsed, false);
    assert.equal(upsertCalls.length, 1);
    assert.equal(fetchCalls.length >= 2, true);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('busca segue funcionando com schema legado sem colunas opcionais do historico', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  global.fetch = (async () =>
    createResponse(200, {
      results: [
        {
          name: 'Oficina Centro',
          phone: '(19) 99999-0000',
          phoneDigits: '19999990000',
          source: 'hbx_scraping:web',
          score: 77,
        },
      ],
    }) as any) as any;

  const historyReads: any[] = [];
  const upsertCalls: any[] = [];
  const service = new WebscrapingService(createPrisma({
    hasColumn: async (_tableName: string, columnName: string) =>
      !['source', 'score', 'opportunityReason'].includes(String(columnName || '').trim()),
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async (input: any) => {
        historyReads.push(input);
        const placeSelect = input?.select?.places?.select || {};
        assert.equal('source' in placeSelect, false);
        assert.equal('score' in placeSelect, false);
        assert.equal('opportunityReason' in placeSelect, false);
        return null;
      },
      findMany: async (input: any) => {
        historyReads.push(input);
        const placeSelect = input?.select?.places?.select || {};
        assert.equal('source' in placeSelect, false);
        assert.equal('score' in placeSelect, false);
        assert.equal('opportunityReason' in placeSelect, false);
        return [];
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async (input: any) => {
        upsertCalls.push(input);
        return { id: 'history-legacy-1' };
      },
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Campinas - SP',
      segment: 'Oficinas',
      engine: 'hbx',
      targetType: 'pj',
      quantity: 10,
    });

    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Oficina Centro');
    assert.equal(historyReads.length >= 2, true);
    assert.equal(upsertCalls.length, 1);
    const placeRow = upsertCalls[0].create.places.create[0];
    assert.equal('source' in placeRow, false);
    assert.equal('score' in placeRow, false);
    assert.equal('opportunityReason' in placeRow, false);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('pesquisa repetida reaproveita historico sem chamar Google novamente', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;

  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  let trialCountChecks = 0;

  const service = new WebscrapingService(createPrisma({
    company: {
      findUnique: async () => ({
        id: 7,
        onboardingStatus: 'active_trial',
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
      }),
    },
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'history-1',
        userId: 9,
        city: 'Sao Paulo - SP',
        segment: 'Clinicas',
        quantity: 5,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        }),
        searchSignature: 'signature',
        resultCount: 1,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
        lastUsedAt: new Date('2026-04-01T12:00:00.000Z'),
        places: [
          {
            id: 'place-row-1',
            placeId: 'place-1',
            rank: 1,
            name: 'Clinica Centro',
            phone: '+55 11 99888-7766',
            phoneDigits: '11998887766',
            rating: 4.7,
            reviews: 142,
            address: 'Rua Central, 100',
            website: 'https://clinica.example.com',
          },
        ],
      }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-1' }),
      delete: async () => null,
    },
    webscrapingUsageLog: {
      count: async () => {
        trialCountChecks += 1;
        return 99;
      },
      create: async () => ({ id: 'usage-1' }),
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Sao Paulo - SP',
      segment: 'Clinicas',
      quantity: 1,
    });

    assert.equal(response.meta.source, 'history');
    assert.equal(response.results.length, 1);
    assert.equal(response.meta.technicalCacheUsed, false);
    assert.equal(fetchSpy.length, 0);
    assert.equal(trialCountChecks, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('reaproveitar historico ignora limite do trial e devolve resultado salvo', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;

  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  let trialCountChecks = 0;

  const service = new WebscrapingService(createPrisma({
    company: {
      findUnique: async () => ({
        id: 7,
        onboardingStatus: 'active_trial',
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
      }),
    },
    webscrapingSearchHistory: {
      findFirst: async () => ({
        id: 'history-1',
        userId: 9,
        city: 'Rio Claro - SP',
        segment: 'Lanchonetes',
        quantity: 10,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        }),
        searchSignature: 'signature',
        resultCount: 1,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
        lastUsedAt: new Date('2026-04-01T12:00:00.000Z'),
        places: [
          {
            id: 'place-row-1',
            placeId: 'place-1',
            rank: 1,
            name: 'BRUNAO LANCHES',
            phone: '+55 19 99888-7766',
            phoneDigits: '19998887766',
            rating: 4.7,
            reviews: 142,
            address: 'Rua Central, 100',
            website: 'https://lanches.example.com',
          },
        ],
      }),
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-1' }),
      delete: async () => null,
    },
    webscrapingUsageLog: {
      count: async () => {
        trialCountChecks += 1;
        return 99;
      },
      create: async () => ({ id: 'usage-1' }),
    },
  }));

  try {
    const response = await service.reuseHistorySearchForUser(createUser(), 'history-1');

    assert.equal(response.meta.source, 'history');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'BRUNAO LANCHES');
    assert.equal(fetchSpy.length, 0);
    assert.equal(trialCountChecks, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('cache tecnico global reaproveita busca publica entre empresas sem chamar Google', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;

  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma({
    webscrapingGlobalCacheEntry: {
      findUnique: async () => ({
        id: 'global-cache-1',
        cacheSignature: 'cache-signature',
        normalizedCity: 'sao paulo - sp',
        normalizedSegment: 'clinicas',
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        }),
        resultCount: 1,
        cacheValidUntil: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
        lastFetchedAt: new Date('2026-04-01T12:00:00.000Z'),
        lastServedAt: new Date('2026-04-01T12:00:00.000Z'),
        places: [
          {
            id: 'global-place-1',
            placeId: 'place-1',
            rank: 1,
            name: 'Clinica Centro',
            phone: '+55 11 99888-7766',
            phoneDigits: '11998887766',
            rating: 4.7,
            reviews: 142,
            address: 'Rua Central, 100',
            website: 'https://clinica.example.com',
          },
        ],
      }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'global-cache-1' }),
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Sao Paulo - SP',
      segment: 'Clinicas',
      quantity: 1,
    });

    assert.equal(response.meta.source, 'global_cache');
    assert.equal(response.meta.technicalCacheUsed, true);
    assert.equal(response.meta.technicalCacheReusedCount, 1);
    assert.equal(response.results.length, 1);
    assert.equal(fetchSpy.length, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('quota comercial bloqueia terceira busca Google do dia e registra tentativa bloqueada', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  const createdLogs: Array<Record<string, unknown>> = [];
  const service = new WebscrapingService(createPrisma({
    company: {
      findUnique: async () => ({
        id: 7,
        onboardingStatus: 'active_trial',
        paymentStatus: 'TRIAL',
        subscriptionStatus: 'trialing',
      }),
    },
    webscrapingUsageLog: {
      count: async () => 2,
      create: async (input: Record<string, unknown>) => {
        createdLogs.push(input);
        return { id: 'usage-blocked-1' };
      },
    },
  }));

  try {
    await assert.rejects(
      () =>
        service.searchContactsForUser(createUser(), {
          city: 'Sao Paulo - SP',
          segment: 'Clinicas',
          quantity: 1,
        }),
      (error: any) => {
        assert.equal(error?.response?.code, 'google_daily_limit_reached');
        assert.match(String(error?.response?.message || ''), /2 busca\(s\) Google por dia/i);
        return true;
      },
    );

    assert.equal(createdLogs.length, 1);
    assert.equal(fetchSpy.length, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('exportacao XLSX nativa gera arquivo com colunas esperadas', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;

  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'history-1',
        userId: 9,
        city: 'Campinas - SP',
        segment: 'Oficinas',
        quantity: 1,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        }),
        searchSignature: 'signature',
        resultCount: 1,
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        updatedAt: new Date('2026-04-01T12:00:00.000Z'),
        lastUsedAt: new Date('2026-04-01T12:00:00.000Z'),
        places: [
          {
            id: 'place-row-1',
            placeId: 'place-1',
            rank: 1,
            name: 'Oficina Centro',
            phone: '+55 19 99888-7766',
            phoneDigits: '19998887766',
            rating: 4.5,
            reviews: 87,
            address: 'Av. Brasil, 500',
            website: 'https://oficina.example.com',
          },
        ],
      }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-1' }),
      delete: async () => null,
    },
  }));

  try {
    const exported = await service.exportContactsForUser(createUser(), {
      city: 'Campinas - SP',
      segment: 'Oficinas',
      quantity: 1,
    });
    const workbook = XLSX.read(exported.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets.Contatos;

    assert.equal(Boolean(worksheet), true);
    assert.equal(worksheet.A2?.v, 'Oficina Centro');
    assert.equal(worksheet.B2?.v, '+55 19 99888-7766');
    assert.match(String(worksheet.B2?.l?.Target || ''), /^https:\/\/wa\.me\/5519998887766\?text=/);
    assert.equal(worksheet.F2?.v, 'Abrir site');
    assert.match(String(worksheet.G2?.v || ''), /Oficina Centro/);
    assert.match(exported.filename, /^prospeccao-/);
  } finally {
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('engine google continua como padrao e limita quantidade a 20', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const previousFetch = global.fetch;
  const searchBodies: any[] = [];
  global.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('places:searchText')) {
      searchBodies.push(JSON.parse(String(init?.body || '{}')));
      return createResponse(200, {
        places: [{ id: 'place-1', displayName: { text: 'Clinica Centro' } }],
      }) as any;
    }
    return createResponse(200, {
      displayName: { text: 'Clinica Centro' },
      internationalPhoneNumber: '+55 11 99888-7766',
      nationalPhoneNumber: '(11) 99888-7766',
      formattedAddress: 'Rua Central, 100',
      rating: 4.7,
      userRatingCount: 142,
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Sao Paulo - SP',
      segment: 'Clinicas',
      quantity: 50,
    });

    assert.equal(response.query.engine, 'google');
    assert.equal(response.query.targetType, 'pj');
    assert.equal(response.query.quantity, 20);
    assert.equal(response.meta.source, 'google');
    assert.equal(searchBodies[0].pageSize, 20);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
  }
});

test('engine hbx chama motor local e aceita agenda_pf sem segmento', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  global.fetch = (async (input: any, init?: any) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')),
    });
    return createResponse(200, {
      engine: 'hbx_scraping',
      count: 1,
      results: [
        {
          name: 'Contato Limeira',
          phone: '(19) 99999-0000',
          phoneDigits: '19999990000',
          rating: null,
          reviews: null,
          address: null,
          website: null,
          source: 'hbx_agenda:web',
          score: 12,
          cpf: 'nao-deve-sair',
          cnpj: 'nao-deve-sair',
          document: 'nao-deve-sair',
          probableWhatsApp: true,
          googleMapsUrl: 'https://maps.google.com/example',
        },
      ],
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Limeira',
      state: 'SP',
      engine: 'hbx',
      targetType: 'agenda_pf',
      quantity: 150,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://localhost:8001/search');
    assert.deepEqual(calls[0].body, {
      city: 'Limeira',
      state: 'SP',
      segment: '',
      targetType: 'agenda_pf',
      limit: 100,
      fresh: false,
    });
    assert.equal(response.query.engine, 'hbx');
    assert.equal(response.query.targetType, 'agenda_pf');
    assert.equal(response.query.quantity, 100);
    assert.equal(response.meta.source, 'hbx');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Contato Limeira');
    assert.equal(response.results[0].phoneDigits, '19999990000');
    assert.equal(response.results[0].rating, null);
    assert.equal(response.results[0].reviews, null);
    assert.equal(response.results[0].address, null);
    assert.equal(response.results[0].website, null);
    assert.equal('cpf' in response.results[0], false);
    assert.equal('cnpj' in response.results[0], false);
    assert.equal('document' in response.results[0], false);
    assert.equal('probableWhatsApp' in response.results[0], false);
    assert.equal('googleMapsUrl' in response.results[0], false);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('engine hbx aplica limite 100 para pj e envia targetType', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001/';

  const previousFetch = global.fetch;
  const calls: any[] = [];
  global.fetch = (async (input: any, init?: any) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')),
    });
    return createResponse(200, {
      results: [
        {
          name: 'Oficina Centro',
          phone: '(19) 3333-4444',
          phoneDigits: '1933334444',
          source: 'hbx_scraping:web',
          score: 70,
        },
      ],
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Americana - SP',
      segment: 'oficina mecanica',
      engine: 'hbx',
      targetType: 'pj',
      quantity: 80,
    });

    assert.equal(calls[0].url, 'http://localhost:8001/search');
    assert.equal(calls[0].body.city, 'Americana');
    assert.equal(calls[0].body.state, 'SP');
    assert.equal(calls[0].body.targetType, 'pj');
    assert.equal(calls[0].body.limit, 80);
    assert.equal(response.query.quantity, 80);
    assert.equal(response.results.length, 1);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('busca livre hbx pj aceita apenas termo e limita em 100', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  const calls: any[] = [];
  global.fetch = (async (input: any, init?: any) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')),
    });
    return createResponse(200, {
      results: [
        {
          name: 'Madeireira Central',
          phone: '(11) 4000-1111',
          phoneDigits: '1140001111',
          address: 'Rua das Madeiras, 10',
          website: 'https://madeireira.example.com',
          source: 'hbx_scraping:free_pj',
          score: 88,
        },
      ],
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(createUser(), {
      segment: 'Madeireira',
      engine: 'hbx',
      targetType: 'pj',
      quantity: 150,
    });

    assert.equal(calls[0].url, 'http://localhost:8001/search');
    assert.equal(calls[0].body.city, '');
    assert.equal(calls[0].body.state, '');
    assert.equal(calls[0].body.segment, 'Madeireira');
    assert.equal(calls[0].body.limit, 100);
    assert.equal(calls[0].body.excludePhoneDigits, undefined);
    assert.equal(response.query.quantity, 100);
    assert.equal(response.query.city, '');
    assert.equal(response.query.state, null);
    assert.equal(response.results[0].source, 'hbx_scraping:free_pj');
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('buscar mais hbx envia excludePhoneDigits e retorna apenas cards novos', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  const calls: any[] = [];
  global.fetch = (async (input: any, init?: any) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')),
    });
    return createResponse(200, {
      results: [
        {
          name: 'Madeireira Antiga',
          phone: '(11) 4000-1111',
          phoneDigits: '1140001111',
          source: 'hbx_scraping:free_pj',
          score: 95,
        },
        {
          name: 'Madeireira Nova',
          phone: '(11) 4000-2222',
          phoneDigits: '1140002222',
          source: 'hbx_scraping:free_pj',
          score: 92,
        },
      ],
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => ({
        id: 'history-madeireira',
        userId: 9,
        city: '',
        segment: 'Madeireira',
        quantity: 100,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
          engine: 'hbx',
          targetType: 'pj',
          state: '',
        }),
        searchSignature: 'engine:hbx|targetType:pj|city:|state:|segment:madeireira|filters:{}',
        resultCount: 1,
        createdAt: new Date('2026-05-03T12:00:00.000Z'),
        updatedAt: new Date('2026-05-03T12:00:00.000Z'),
        lastUsedAt: new Date('2026-05-03T12:00:00.000Z'),
        places: [
          {
            id: 'place-old',
            placeId: 'hbx:pj:1140001111',
            rank: 1,
            name: 'Madeireira Antiga',
            phone: '(11) 4000-1111',
            phoneDigits: '1140001111',
            rating: null,
            reviews: 0,
            address: 'Rua 1',
            website: '',
            source: 'hbx_scraping:free_pj',
            score: 90,
          },
        ],
      }),
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-madeireira' }),
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchMoreHistoryForUser(createUser(), 'history-madeireira', 100);

    assert.deepEqual(calls[0].body.excludePhoneDigits, ['1140001111']);
    assert.equal(calls[0].body.fresh, true);
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].phoneDigits, '1140002222');
    assert.equal(response.meta.fetchedCount, 1);
    assert.equal(response.meta.totalStoredCount, 2);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('busca hbx retorna cards salvos como parcial quando motor falha', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error('engine down');
  }) as any;

  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'history-madeireira',
        userId: 9,
        city: '',
        segment: 'Madeireira',
        quantity: 100,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
          engine: 'hbx',
          targetType: 'pj',
          state: '',
        }),
        searchSignature: 'engine:hbx|targetType:pj|city:|state:|segment:madeireira|filters:{}',
        resultCount: 1,
        createdAt: new Date('2026-05-03T12:00:00.000Z'),
        updatedAt: new Date('2026-05-03T12:00:00.000Z'),
        lastUsedAt: new Date('2026-05-03T12:00:00.000Z'),
        places: [
          {
            id: 'place-old',
            placeId: 'hbx:pj:1140001111',
            rank: 1,
            name: 'Madeireira Salva',
            phone: '(11) 4000-1111',
            phoneDigits: '1140001111',
            rating: null,
            reviews: 0,
            address: 'Rua 1',
            website: '',
            source: 'hbx_scraping:free_pj',
            score: 90,
          },
        ],
      }),
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-madeireira' }),
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      segment: 'Madeireira',
      engine: 'hbx',
      targetType: 'pj',
      quantity: 100,
    });

    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Madeireira Salva');
    assert.equal(response.meta.status, 'partial_error');
    assert.match(String(response.meta.message || ''), /Busca parcial: 1 cards/i);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('busca hbx persiste estado no historico para permitir reaproveitamento', async () => {
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const previousFetch = global.fetch;
  global.fetch = (async () =>
    createResponse(200, {
      results: [
        {
          name: 'Maria Oliveira',
          phone: '(19) 99999-1234',
          phoneDigits: '19999991234',
          source: 'hbx_scraping:web',
          score: 60,
        },
      ],
    }) as any) as any;

  const upsertCalls: any[] = [];
  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async (input: any) => {
        upsertCalls.push(input);
        return { id: 'history-hbx-1' };
      },
      delete: async () => null,
    },
  }));

  try {
    const response = await service.searchContactsForUser(createUser(), {
      city: 'Araras - SP',
      segment: 'plano de saude',
      engine: 'hbx',
      targetType: 'pf',
      quantity: 20,
    });

    assert.equal(response.meta.historyId, 'history-hbx-1');
    assert.equal(upsertCalls.length, 1);
    const filtersJson = JSON.parse(upsertCalls[0].create.filtersJson);
    assert.equal(filtersJson.engine, 'hbx');
    assert.equal(filtersJson.targetType, 'pf');
    assert.equal(filtersJson.state, 'SP');
    assert.match(upsertCalls[0].create.searchSignature, /state:sp/);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('reaproveitar historico hbx recupera estado salvo na assinatura antiga', async () => {
  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => ({
        id: 'history-hbx-old',
        userId: 9,
        city: 'Araras',
        segment: 'plano de saude',
        quantity: 20,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
          engine: 'hbx',
          targetType: 'pf',
        }),
        searchSignature: 'engine:hbx|targetType:pf|city:araras|state:sp|segment:plano de saude|quantity:20|filters:{}',
        resultCount: 1,
        createdAt: new Date('2026-04-27T20:00:00.000Z'),
        updatedAt: new Date('2026-04-27T20:00:00.000Z'),
        lastUsedAt: new Date('2026-04-27T20:00:00.000Z'),
        places: [
          {
            id: 'place-row-hbx-1',
            placeId: 'hbx:pf:19999991234',
            rank: 1,
            name: 'Maria Oliveira',
            phone: '(19) 99999-1234',
            phoneDigits: '19999991234',
            rating: null,
            reviews: 0,
            address: '',
            website: '',
            source: 'hbx_scraping:web',
            score: 60,
          },
        ],
      }),
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-hbx-old' }),
      delete: async () => null,
    },
  }));

  try {
    const response = await service.reuseHistorySearchForUser(createUser(), 'history-hbx-old');

    assert.equal(response.query.engine, 'hbx');
    assert.equal(response.query.targetType, 'pf');
    assert.equal(response.query.city, 'Araras');
    assert.equal(response.query.state, 'SP');
    assert.equal(response.meta.source, 'history');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Maria Oliveira');
    assert.equal(fetchSpy.length, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test('reaproveitar historico hbx antigo sem estado nao retorna 400', async () => {
  const previousFetch = global.fetch;
  const fetchSpy: string[] = [];
  global.fetch = (async () => {
    fetchSpy.push('called');
    return createResponse(500, {}) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma({
    webscrapingSearchHistory: {
      findFirst: async () => ({
        id: 'history-hbx-no-state',
        userId: 9,
        city: 'Araras',
        segment: 'Clinicas',
        quantity: 20,
        filtersJson: JSON.stringify({
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
          engine: 'hbx',
          targetType: 'pj',
        }),
        searchSignature: 'engine:hbx|targetType:pj|city:araras|segment:clinicas|quantity:20|filters:{}',
        resultCount: 1,
        createdAt: new Date('2026-04-27T20:00:00.000Z'),
        updatedAt: new Date('2026-04-27T20:00:00.000Z'),
        lastUsedAt: new Date('2026-04-27T20:00:00.000Z'),
        places: [
          {
            id: 'place-row-hbx-no-state',
            placeId: 'hbx:pj:19999991234',
            rank: 1,
            name: 'Clinica Araras',
            phone: '(19) 99999-1234',
            phoneDigits: '19999991234',
            rating: null,
            reviews: 0,
            address: '',
            website: '',
            source: 'hbx_scraping:web',
            score: 60,
          },
        ],
      }),
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-hbx-no-state' }),
      delete: async () => null,
    },
  }));

  try {
    const response = await service.reuseHistorySearchForUser(createUser(), 'history-hbx-no-state');

    assert.equal(response.query.engine, 'hbx');
    assert.equal(response.query.state, null);
    assert.equal(response.meta.source, 'history');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Clinica Araras');
    assert.equal(fetchSpy.length, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test('search-run hbx trata 502 como retryable e salva 2 contatos no lote seguinte', async () => {
  const previousFetch = global.fetch;
  const previousBatchLimit = process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
  const previousMaxAttempts = process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
  process.env.HBX_SEARCH_RUN_BATCH_LIMIT = '10';
  process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = '20';

  let fetchCount = 0;
  global.fetch = (async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return {
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => 'Bad Gateway',
      } as any;
    }
    return createResponse(200, {
      results: [
        {
          name: 'Lanchonete Centro',
          phone: '(19) 99999-0001',
          phoneDigits: '19999990001',
          source: 'hbx_scraping:web',
          score: 90,
        },
        {
          name: 'Lanches Avenida',
          phone: '(19) 99999-0002',
          phoneDigits: '19999990002',
          source: 'hbx_scraping:web',
          score: 88,
        },
      ],
    }) as any;
  }) as any;

  const { prisma, run } = createSearchRunPrisma({
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma);
  disableSearchRunAutoPump(service);
  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };

  try {
    await (service as any).processSearchRun('run-1', createUser(), undefined, lease);
    assert.equal(run.status, 'queued');
    assert.equal(run.attemptCount, 1);
    assert.equal(run.failedBatchCount, 1);
    assert.equal(run.foundCount, 0);
    assert.equal(run.nextRetryAt instanceof Date, true);
    assert.notEqual(run.status, 'failed');

    run.nextRetryAt = null;
    await (service as any).processSearchRun('run-1', createUser(), undefined, lease);

    assert.equal(run.foundCount, 2);
    assert.equal(run.status, 'running');
    assert.match(String(run.errorMessage || ''), /Encontramos 2 contatos ate agora/i);
    assert.notEqual(run.status, 'failed');
  } finally {
    global.fetch = previousFetch;
    if (previousBatchLimit === undefined) delete process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
    else process.env.HBX_SEARCH_RUN_BATCH_LIMIT = previousBatchLimit;
    if (previousMaxAttempts === undefined) delete process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
    else process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = previousMaxAttempts;
  }
});

test('search-run hbx so finaliza lote vazio quando maxEmptyBatches e atingido', async () => {
  const previousFetch = global.fetch;
  const previousBatchLimit = process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
  const previousMaxAttempts = process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
  const previousMaxEmpty = process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES;
  process.env.HBX_SEARCH_RUN_BATCH_LIMIT = '10';
  process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = '20';
  process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES = '5';

  global.fetch = (async () =>
    createResponse(200, {
      results: [],
    }) as any) as any;

  const { prisma, run } = createSearchRunPrisma({
    targetQuantity: 100,
  });
  const service = new WebscrapingService(prisma);
  disableSearchRunAutoPump(service);
  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };

  try {
    for (let index = 0; index < 4; index += 1) {
      await (service as any).processSearchRun('run-1', createUser(), undefined, lease);
      assert.equal(run.status, 'running');
      assert.equal(run.lastBatchStatus, 'empty_batch');
      assert.equal(run.finishedAt, null);
    }

    await (service as any).processSearchRun('run-1', createUser(), undefined, lease);

    assert.equal(run.attemptCount, 5);
    assert.equal(run.consecutiveEmptyBatchCount, 5);
    assert.equal(run.status, 'failed');
    assert.match(String(run.errorMessage || ''), /5 lotes/i);
    assert.match(String(run.errorMessage || ''), /Ultima query/i);
  } finally {
    global.fetch = previousFetch;
    if (previousBatchLimit === undefined) delete process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
    else process.env.HBX_SEARCH_RUN_BATCH_LIMIT = previousBatchLimit;
    if (previousMaxAttempts === undefined) delete process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
    else process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = previousMaxAttempts;
    if (previousMaxEmpty === undefined) delete process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES;
    else process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES = previousMaxEmpty;
  }
});

test('campanha radar cria target 10000 sem executar lote no HTTP de criacao', async () => {
  const { prisma, campaign } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  disableRadarCampaignAutoPump(service);

  const response = await service.createRadarCampaignForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'Lanchonetes',
    targetType: 'pj',
    targetTotal: 10000,
    batchSize: 25,
    nightOnly: false,
  });

  assert.equal(response.targetTotal, 10000);
  assert.equal(response.batchSize, 25);
  assert.equal(response.status, 'queued');
  assert.equal(campaign.currentAttempt, 0);
  assert.equal(campaign.maxAttempts >= 400, true);
});

test('campanha radar trata 502 como retryable e salva 2 contatos no segundo lote', async () => {
  const previousFetch = global.fetch;
  const previousMaxAttempts = process.env.HBX_RADAR_MAX_EMPTY_BATCHES;
  process.env.HBX_RADAR_MAX_EMPTY_BATCHES = '12';

  let fetchCount = 0;
  const requestBodies: any[] = [];
  global.fetch = (async (_input: any, init?: any) => {
    requestBodies.push(JSON.parse(String(init?.body || '{}')));
    fetchCount += 1;
    if (fetchCount === 1) {
      return {
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => 'Bad Gateway',
      } as any;
    }
    return createResponse(200, {
      results: [
        { name: 'Lanchonete Centro', phone: '(19) 99999-0001', phoneDigits: '19999990001', source: 'hbx_scraping:web', score: 90 },
        { name: 'Lanches Avenida', phone: '(19) 99999-0002', phoneDigits: '19999990002', source: 'hbx_scraping:web', score: 88 },
      ],
    }) as any;
  }) as any;

  const { prisma, campaign, leads } = createCampaignPrisma({ targetTotal: 100, batchSize: 25 });
  const service = new WebscrapingService(prisma);
  disableRadarCampaignAutoPump(service);
  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };

  try {
    await (service as any).processRadarCampaignBatch('campaign-1', lease);
    assert.equal(campaign.status, 'queued');
    assert.equal(campaign.currentAttempt, 1);
    assert.equal(campaign.consecutiveErrorCount, 1);
    assert.equal(campaign.nextRunAt instanceof Date, true);
    assert.notEqual(campaign.status, 'failed');

    campaign.nextRunAt = null;
    await (service as any).processRadarCampaignBatch('campaign-1', lease);

    assert.equal(leads.length, 2);
    assert.equal(campaign.foundCount, 2);
    assert.equal(campaign.approvedCount, 2);
    assert.equal(campaign.status, 'running');
    assert.match(String(campaign.lastErrorMessage || ''), /Encontramos 2 cards ate agora/i);
    assert.equal(requestBodies[1].limit, 25);
    assert.equal(requestBodies[1].batchLimit, 25);
    assert.deepEqual(requestBodies[1].excludePhoneDigits, undefined);
    assert.notEqual(campaign.status, 'failed');
  } finally {
    global.fetch = previousFetch;
    if (previousMaxAttempts === undefined) delete process.env.HBX_RADAR_MAX_EMPTY_BATCHES;
    else process.env.HBX_RADAR_MAX_EMPTY_BATCHES = previousMaxAttempts;
  }
});

test('campanha radar so encerra lote vazio quando maxEmptyBatches e atingido', async () => {
  const previousFetch = global.fetch;
  const previousMaxEmpty = process.env.HBX_RADAR_MAX_EMPTY_BATCHES;
  process.env.HBX_RADAR_MAX_EMPTY_BATCHES = '5';

  global.fetch = (async () => createResponse(200, { results: [] }) as any) as any;

  const { prisma, campaign } = createCampaignPrisma({ targetTotal: 100, batchSize: 25, maxAttempts: 40 });
  const service = new WebscrapingService(prisma);
  disableRadarCampaignAutoPump(service);
  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };

  try {
    for (let index = 0; index < 4; index += 1) {
      await (service as any).processRadarCampaignBatch('campaign-1', lease);
      assert.equal(campaign.status, 'queued');
      assert.equal(campaign.finishedAt, null);
    }

    await (service as any).processRadarCampaignBatch('campaign-1', lease);

    assert.equal(campaign.currentAttempt, 5);
    assert.equal(campaign.consecutiveEmptyBatchCount, 5);
    assert.equal(campaign.status, 'completed_insufficient_results');
    assert.match(String(campaign.lastErrorMessage || ''), /5 lotes/i);
    assert.match(String(campaign.lastErrorMessage || ''), /Ultima query/i);
  } finally {
    global.fetch = previousFetch;
    if (previousMaxEmpty === undefined) delete process.env.HBX_RADAR_MAX_EMPTY_BATCHES;
    else process.env.HBX_RADAR_MAX_EMPTY_BATCHES = previousMaxEmpty;
  }
});
