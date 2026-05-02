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

test('engine hbx aplica limite 50 para pj e envia targetType', async () => {
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
    assert.equal(calls[0].body.limit, 50);
    assert.equal(response.query.quantity, 50);
    assert.equal(response.results.length, 1);
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
