import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { WebscrapingService } from './webscraping.service';
import { shouldRadarIssueBlockDelivery } from './radar/shared/radar-stage-policy';
import { SourceBudgetService } from './source-budget/source-budget.service';

// SourceBudgetService.tryConsumePaid('google_places') é FAIL-CLOSED e usa um PrismaClient PRÓPRIO,
// real (`_counterDb`, lazy), independente do mock de Prisma que cada teste injeta no
// WebscrapingService — este worktree não tem .env/DATABASE_URL, então o PrismaClient real falha ao
// conectar e o governor bloqueia Google Places em QUALQUER teste que o exercite (estado estático
// global do processo, mesmo mecanismo coberto em source-budget.service.test.ts). Nenhum teste deste
// arquivo verifica o governor BLOQUEANDO — quem cobre isso é o teste dedicado do próprio serviço.
// Injeta aqui um contador fake sempre-abaixo-do-teto pra isolar os testes de Google Places do
// PrismaClient real, mesmo padrão `injectDb`/`_counterDb` já usado em source-budget.service.test.ts.
(SourceBudgetService as any)._counterDb = {
  sourceApiUsage: {
    async upsert(args: any) {
      return { source: args?.where?.source_yearMonth?.source, yearMonth: args?.where?.source_yearMonth?.yearMonth, count: 0 };
    },
    async update(args: any) {
      return { source: args?.where?.source_yearMonth?.source, yearMonth: args?.where?.source_yearMonth?.yearMonth, count: 1 };
    },
    async findMany() {
      return [];
    },
  },
};

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
        isActive: true,
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

test('HBX batch divide segmentos com virgula em no maximo 5 tarefas alternando cidade antes de relaxar segmento', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Araraquara',
    state: 'SP',
    segment: 'oficina, auto center, funilaria, pneus, borracharia, guincho',
    radiusKm: 100,
    originLat: null,
    originLng: null,
    regionalCities: [
      { city: 'Araraquara', state: 'SP', normalizedCity: 'araraquara', distanceKm: 0 },
      { city: 'Sao Carlos', state: 'SP', normalizedCity: 'sao carlos', distanceKm: 42 },
    ],
    normalizedCity: 'araraquara',
    normalizedSegment: 'oficina auto center funilaria pneus borracharia guincho',
    targetType: 'pj',
  };

  const segments = service.splitHbxBatchSegments(input.segment);
  const tasks = service.buildHbxBatchQueryTasks(input);

  assert.deepEqual(segments, ['oficina', 'auto center', 'funilaria', 'pneus', 'borracharia']);
  assert.equal(tasks[0].searchScope.currentCity, 'Araraquara');
  assert.equal(tasks[0].searchScope.currentSegment, 'oficina');
  assert.equal(tasks[6].searchScope.currentCity, 'Araraquara');
  assert.equal(tasks[6].searchScope.currentSegment, 'auto center');
  assert.equal(tasks[30].searchScope.currentCity, 'Sao Carlos');
  assert.equal(tasks[30].searchScope.currentSegment, 'oficina');
});

test('normalizacao do Radar ignora coordenada antiga que nao bate com a cidade selecionada', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const input = service.normalizeSearchInput({
    city: 'Araraquara',
    state: 'SP',
    segment: 'auto elétricas',
    quantity: 30,
    radiusKm: 100,
    originLat: -22.4082,
    originLng: -47.5624,
    engine: 'hbx',
    targetType: 'pj',
  });

  assert.equal(input.city, 'Araraquara');
  assert.equal(input.state, 'SP');
  assert.notEqual(input.regionalCities[1]?.city, 'Rio Claro');
  assert.ok(input.regionalCities.some((row: any) => row.city === 'São Carlos' || row.city === 'Sao Carlos'));
  assert.ok(input.regionalCities.every((row: any) => row.city !== 'Rio Claro' || row.distanceKm > 50));
});

test('HBX batch expande automotivo para segmentos existentes no estoque Radar', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const segments = service.splitHbxBatchSegments('automotivo');
  const normalizedSegments = segments.map((segment: string) => segment.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase());

  assert.ok(normalizedSegments.some((segment: string) => segment.includes('auto pe')));
  assert.ok(segments.includes('oficinas'));
  assert.ok(normalizedSegments.some((segment: string) => segment.includes('oficinas mec')));
  assert.ok(normalizedSegments.some((segment: string) => segment.includes('auto el')));
  assert.ok(segments.includes('centros automotivos'));
});

test('normalizacao do Radar nao cruza UF no raio por padrao', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const input = service.normalizeSearchInput({
    city: 'Águas da Prata',
    state: 'SP',
    segment: 'barbearias',
    quantity: 20,
    radiusKm: 100,
    engine: 'hbx',
    targetType: 'pj',
  });

  assert.ok(input.regionalCities.length > 1);
  assert.ok(input.regionalCities.every((row: any) => row.state === 'SP'));
  assert.equal(input.regionalCities.some((row: any) => row.city === 'Poços de Caldas'), false);
  assert.equal(input.regionalCities.some((row: any) => row.city === 'Andradas'), false);
});

test('DDD esperado reconhece Araraquara como DDD 16', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  assert.deepEqual(service.buildExpectedDdds({ city: 'Araraquara', state: 'SP', segment: 'auto elétricas' }), ['16']);
});

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

test('buildSearchResponse entrega leads List fracos sem aplicar corte Lead+', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Boituva',
    state: 'SP',
    segment: 'farmacias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [{
    placeId: 'hbx:pj:1532631284',
    name: 'Farmacia Teste',
    phone: '(15) 3263-1284',
    phoneDigits: '1532631284',
    rating: null,
    reviews: 0,
    address: 'Boituva, SP',
    website: null,
    source: 'hbx_scraping:free_pj',
    score: 0,
  }], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 1,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.equal(response.results.length, 1);
  assert.equal(response.meta.deliveredCount, 1);
  assert.equal(response.meta.filteredOutCount, 0);
});

test('buildSearchResponse usa score HBX como evidencia de segmento no List', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Boituva',
    state: 'SP',
    segment: 'farmacias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [{
    placeId: 'hbx:pj:1532632490',
    name: 'Celio Cesar Marcusso & Cia. Ltda',
    phone: '(15) 3263-2490',
    phoneDigits: '1532632490',
    rating: null,
    reviews: 0,
    address: 'Avenida Alexandrina Bertoldi Hostingerlino, 249, Boituva',
    website: null,
    source: 'hbx_scraping:free_pj',
    score: 70,
  }], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 1,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].score, undefined);
  assert.equal(response.results[0].quality, undefined);
});

test('buildSearchResponse bloqueia nomes genericos mesmo com score HBX no List', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Boituva',
    state: 'SP',
    segment: 'bares',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [{
    placeId: 'hbx:pj:15999999999',
    name: 'Pesquise outros bares em Boituva',
    phone: '(15) 99999-9999',
    phoneDigits: '15999999999',
    rating: null,
    reviews: 0,
    address: 'Boituva, SP',
    website: null,
    source: 'hbx_scraping:free_pj',
    score: 70,
  }], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 1,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.equal(response.results.length, 0);
  assert.equal(response.meta.filteredOutCount, 1);
});

test('buildSearchResponse bloqueia padroes ruins aprendidos do banco no List', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rubiácea',
    state: 'SP',
    segment: 'imobiliárias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [
    {
      placeId: 'bad:category',
      name: 'Imobiliárias em Rubiácea',
      phone: '(18) 99999-0001',
      phoneDigits: '18999990001',
      rating: null,
      reviews: 0,
      address: 'Rubiácea, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
    {
      placeId: 'bad:tourism',
      name: 'Conheça o Rio Paraná',
      phone: '(18) 99999-0002',
      phoneDigits: '18999990002',
      rating: null,
      reviews: 0,
      address: 'Rubiácea, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
    {
      placeId: 'bad:other-segment',
      name: 'Favelas modas & Barbearia',
      phone: '(18) 99999-0003',
      phoneDigits: '18999990003',
      rating: null,
      reviews: 0,
      address: 'Rubiácea, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
    {
      placeId: 'good:company',
      name: 'Imobiliária Meu Imóvel em Rubiácea',
      phone: '(18) 99999-0004',
      phoneDigits: '18999990004',
      rating: null,
      reviews: 0,
      address: 'Rubiácea, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
  ], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 4,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.deepEqual(response.results.map((item: any) => item.name), ['Imobiliária Meu Imóvel em Rubiácea']);
  assert.equal(response.meta.filteredOutCount, 3);
});

test('buildSearchResponse bloqueia titulos de conteudo e html entity antigos', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'salões de beleza',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [
    {
      placeId: 'bad:whatsapp-title',
      name: 'WhatsApp da Mateus Auto Peças e Acessórios em Araraquara SP',
      phone: '(19) 99999-1001',
      phoneDigits: '19999991001',
      rating: null,
      reviews: 0,
      address: 'Rio Claro, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 100,
    },
    {
      placeId: 'bad:best',
      name: 'Os 40 melhores salões de beleza do Brasil',
      phone: '(19) 99999-1002',
      phoneDigits: '19999991002',
      rating: null,
      reviews: 0,
      address: 'Rio Claro, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
    {
      placeId: 'bad:html',
      name: 'Itapevi &#8211; SP',
      phone: '(19) 99999-1003',
      phoneDigits: '19999991003',
      rating: null,
      reviews: 0,
      address: 'Rio Claro, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 90,
    },
    {
      placeId: 'good:barber',
      name: 'Barbearia Santa Fé',
      phone: '(19) 99999-1004',
      phoneDigits: '19999991004',
      rating: null,
      reviews: 0,
      address: 'Rio Claro, SP',
      website: null,
      source: 'hbx_scraping:free_pj',
      score: 70,
    },
  ], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 4,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.deepEqual(response.results.map((item: any) => item.name), ['Barbearia Santa Fé']);
  assert.equal(response.meta.filteredOutCount, 3);
});

test('buildSearchResponse normaliza Lead+ para List e entrega card real basico', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Boituva',
    state: 'SP',
    segment: 'farmacias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, [{
    placeId: 'hbx:pj:1532631284',
    name: 'Farmacia Teste',
    phone: '(15) 3263-1284',
    phoneDigits: '1532631284',
    rating: null,
    reviews: 0,
    address: 'Boituva, SP',
    website: null,
    source: 'hbx_scraping:free_pj',
    score: 0,
  }], {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 1,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].name, 'Farmacia Teste');
  assert.equal(response.results[0].deliveryProduct, 'list');
  assert.equal(response.results[0].billable, true);
  assert.equal(response.results[0].debitEligible, true);
  assert.equal(response.results[0].visibilityTier, 'list_basic');
  assert.equal(response.meta.deliveredCount, 1);
  assert.equal(response.meta.filteredOutCount, 0);
});

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
      findMany: async (input?: any) => {
        const where = input?.where || {};
        if (where.companyId != null && Number(where.companyId) !== Number(run.companyId)) return [];
        if (where.engine && String(where.engine) !== String(run.engine)) return [];
        if (where.status?.in && !where.status.in.includes(run.status)) return [];
        if (where.status && !where.status.in && String(where.status) !== String(run.status)) return [];
        if (where.assignedEngineId === null && run.assignedEngineId != null) return [];
        return [{ ...run, items: [...items] }];
      },
      create: async ({ data, select }: any) => {
        applyData(data);
        const row = { ...run, items: [...items] };
        if (!select) return row;
        return Object.fromEntries(Object.keys(select).map((key) => [key, (row as any)[key]]));
      },
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
        if (where.id) rows = rows.filter((item) => item.id === where.id);
        if (where.runId) rows = rows.filter((item) => item.runId === where.runId);
        if (where.status) rows = rows.filter((item) => item.status === where.status);
        return rows;
      },
      findUnique: async (input?: any) => {
        const where = input?.where || {};
        return items.find((item) => item.id === where.id) || null;
      },
      findFirst: async (input?: any) => {
        const where = input?.where || {};
        return items.find((item) => (
          (!where.id || item.id === where.id)
          && (!where.companyId || item.companyId === where.companyId)
          && (!where.runId || item.runId === where.runId)
          && (!where.status || item.status === where.status)
        )) || null;
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
      update: async ({ where, data }: any) => {
        const item = items.find((row) => row.id === where.id);
        if (!item) return null;
        Object.assign(item, data);
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

test('LeadQuality rejeita segmento errado e aprova evidencias fortes', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const tiaLuiza = service.evaluateLeadQuality({
    name: 'Tia Luiza',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
  }, { requestedSegment: 'oficina', targetType: 'pj' });
  const autoMecanica = service.evaluateLeadQuality({
    name: 'Auto Mecânica São José',
    phone: '(19) 99999-0002',
    phoneDigits: '19999990002',
  }, { requestedSegment: 'oficina', targetType: 'pj' });
  const dentista = service.evaluateLeadQuality({
    name: 'Clínica Odontológica Sorriso',
    phone: '(19) 99999-0003',
    phoneDigits: '19999990003',
  }, { requestedSegment: 'dentista', targetType: 'pj' });
  const generic = service.evaluateLeadQuality({
    name: 'Lista Telefônica',
    phone: '(19) 99999-0004',
    phoneDigits: '19999990004',
  }, { requestedSegment: 'oficina', targetType: 'pj' });

  assert.equal(tiaLuiza.status, 'segment_mismatch');
  assert.equal(tiaLuiza.billable, false);
  assert.equal(autoMecanica.status, 'approved');
  assert.equal(autoMecanica.billable, true);
  assert.equal(dentista.status, 'approved');
  assert.equal(generic.status, 'generic_directory');
  assert.equal(generic.billable, false);
});

test('LeadQuality reconhece restaurantes reais em busca ampla de alimentacao', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    requestedSegment: 'alimentos naturais, pizzarias, restaurantes',
    requestedCity: 'Rio Claro',
    requestedState: 'SP',
    targetType: 'pj',
  };

  const pizza = service.evaluateLeadQuality({
    name: "Domino's Pizza",
    phone: '(19) 3525-5459',
    phoneDigits: '1935255459',
  }, input);
  const espetinho = service.evaluateLeadQuality({
    name: 'Espetinho da 26',
    phone: '(19) 99957-2299',
    phoneDigits: '19999572299',
  }, input);

  assert.notEqual(pizza.status, 'segment_mismatch');
  assert.notEqual(espetinho.status, 'segment_mismatch');
  assert.ok(pizza.segmentMatchScore >= 55);
  assert.ok(espetinho.segmentMatchScore >= 55);
});

test('HBX mapper rejeita pagina generica de diretorio perto de mim', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Águas da Prata',
    state: 'SP',
    segment: 'barbearias',
    quantity: 20,
    engine: 'hbx',
    targetType: 'pj',
  });

  const mapped = service.mapHbxContactResult({
    name: 'Barbearias Aguas Da Prata Sp perto de mim',
    website: 'https://listaamarela.com.br',
    sourceUrl: 'https://listaamarela.com.br/barbearias-aguas-da-prata-sp',
    source: 'hbx_scraping:free_pj',
  }, input);

  assert.equal(mapped, null);
});

test('Radar dedupe nao usa dominio de diretorio como website forte', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const dedup = {
    rows: [],
    placeIds: new Set<string>(),
    phoneDigits: new Set<string>(),
    websiteKeys: new Set<string>(['listaamarela.com.br']),
    compositeKeys: new Set<string>(),
  };

  const classified = service.classifyRunItem({
    name: 'Barbearia Real',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: 'https://listaamarela.com.br',
  }, dedup, { runId: 'run-lista', index: 0, city: 'Águas da Prata', state: 'SP', segment: 'barbearias' });

  assert.equal(classified.status, 'found');
  assert.equal(classified.websiteKey, '');
});

test('saveSearchRunResults salva baixa aderencia como found para revisao', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    segment: 'oficina',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'oficina',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [
      {
        name: 'Tia Luiza',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        source: 'hbx_scraping:web',
      },
      {
        name: 'Auto Mecânica São José',
        phone: '(19) 99999-0002',
        phoneDigits: '19999990002',
        source: 'hbx_scraping:web',
      },
    ],
    'hbx',
  );
  await service.recalculateSearchRunCounters(run.id);
  const response = service.buildSearchRunResponse({ ...run, items });

  assert.equal(counts.found, 2);
  assert.equal(counts.skipped, 0);
  assert.equal(run.foundCount, 2);
  assert.equal(response.results.length, 2);
  assert.equal(items[0].status, 'found');
  assert.equal(JSON.parse(items[0].rawJson).quality.status, 'segment_mismatch');
});

test('saveSearchRunResults no List entrega card real com telefone mesmo sem enriquecimento', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'alimentos naturais, pizzarias, restaurantes',
    targetQuantity: 30,
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'alimentos naturais, pizzarias, restaurantes',
    quantity: 30,
    engine: 'hbx',
    targetType: 'pj',
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [
      {
        name: 'Pizzaria A Grandona',
        phone: '(19) 3023-1067',
        phoneDigits: '1930231067',
        source: 'hbx_scraping:free_pj',
      },
      {
        name: 'Barril 2000 Restaurante',
        phone: '(19) 3524-6857',
        phoneDigits: '1935246857',
        source: 'hbx_scraping:free_pj',
      },
    ],
    'hbx',
  );

  assert.equal(counts.found, 2);
  assert.equal(items.length, 2);
  assert.equal(items[0].status, 'found');
  assert.equal(items[1].status, 'found');
});

test('saveSearchRunResults no Lead+ nao descarta card primario fraco antes do enriquecimento', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'bicicletarias, calçados',
    targetQuantity: 30,
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'bicicletarias, calçados',
    quantity: 30,
    engine: 'hbx',
    targetType: 'pj',
    preferredChannels: ['whatsapp'],
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [
      {
        name: 'Humanitarian Calçados',
        phone: '(19) 3513-9668',
        phoneDigits: '1935139668',
        source: 'hbx_scraping:free_pj',
      },
      {
        name: 'Bicicletaria E Borracharia Santana',
        phone: '(19) 3534-9873',
        phoneDigits: '1935349873',
        source: 'hbx_scraping:free_pj',
      },
    ],
    'hbx',
  );

  assert.equal(counts.found, 2);
  assert.equal(counts.skipped, 0);
  assert.equal(items.length, 2);
  assert.equal(items[0].status, 'found');
  assert.equal(items[1].status, 'found');
  assert.equal(JSON.parse(items[0].rawJson).quality.status, 'weak_contact');
});

test('saveSearchRunResults nao corta candidato primario por social obrigatorio antes do enriquecimento', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Sao Paulo',
    state: 'SP',
    segment: 'beleza',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  service.searchHbxEngine = async () => ({
    results: [{
      name: 'Lc Esmalteria Cabelo e Estetica Sao Paulo',
      phone: '(11) 96429-2108',
      phoneDigits: '11964292108',
      website: 'https://lcesmalteria.com.br',
      instagramUrl: 'https://instagram.com/lcesmalteria',
      socialStatus: 'found',
      businessCategory: 'salao de beleza',
      source: 'hbx_scraping:free_pj',
    }],
  });
  const normalized = service.normalizeSearchInput({
    city: 'Sao Paulo',
    state: 'SP',
    segment: 'beleza',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [{
      name: 'Lc Esmalteria Cabelo e Estetica',
      phone: '(11) 96429-2108',
      phoneDigits: '11964292108',
      businessCategory: 'salao de beleza',
      source: 'hbx_scraping:free_pj',
    }],
    'hbx',
  );

  assert.equal(counts.found, 1);
  assert.equal(counts.skipped, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'found');
  assert.equal(JSON.parse(items[0].rawJson).qualityGate.deliverable, true);
});

test('saveSearchRunResults com email obrigatorio enriquece gratis antes de salvar', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  const calls: any[] = [];
  service.searchHbxEngine = async (input: any, existing: any, engineUrl: any, options: any) => {
    calls.push({ input, existing, engineUrl, options });
    return {
      results: [{
        name: 'Barbearia X Rio Claro',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        website: 'https://barbeariax.com.br',
        instagramUrl: 'https://instagram.com/barbeariaxrioclaro',
        email: 'agenda@barbeariax.com.br',
        emailStatus: 'confirmed',
        title: 'Barbearia X Rio Claro site oficial',
        snippet: 'Barbearia X Rio Claro contato email agenda',
        source: 'hbx_scraping:free_pj',
      }],
    };
  };
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['email'],
    channelMatchMode: 'all_required',
    freshness: 'live',
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [{
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'barbearias',
      source: 'hbx_scraping:free_pj',
    }],
    'hbx',
    0,
    'http://hbx-engine-1:8001',
  );

  assert.equal(calls.length > 0, true);
  assert.equal(calls[0].engineUrl, 'http://hbx-engine-1:8001');
  assert.equal(counts.found, 1);
  assert.equal(counts.skipped, 0);
  assert.equal(items.length, 1);
  const raw = JSON.parse(items[0].rawJson);
  assert.equal(raw.email, 'agenda@barbeariax.com.br');
  assert.equal(raw.emailStatus, 'confirmed');
  assert.equal(raw.qualityGate.deliverable, true);
  const contact = service.mapRunItemToContact(items[0]);
  assert.equal(service.candidateHasRequiredChannels(contact, normalized), true);
});

test('persistRadarLeadPoolBatch com email obrigatorio enriquece gratis antes do filtro duro', async () => {
  const saved: any[] = [];
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        saved.push(data);
        return { id: 'radar-email-1', ...data };
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  })) as any;
  const calls: any[] = [];
  service.searchHbxEngine = async (input: any, existing: any, engineUrl: any, options: any) => {
    calls.push({ input, existing, engineUrl, options });
    return {
      results: [{
        name: 'Barbearia X Rio Claro',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        city: 'Rio Claro',
        state: 'SP',
        segment: 'barbearias',
        website: 'https://barbeariax.com.br',
        email: 'agenda@barbeariax.com.br',
        emailStatus: 'confirmed',
        title: 'Barbearia X Rio Claro site oficial',
        snippet: 'Barbearia X Rio Claro contato email agenda',
        source: 'hbx_scraping:free_pj',
      }],
    };
  };
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['email'],
    channelMatchMode: 'all_required',
    freshness: 'live',
  });

  const counts = await service.persistRadarLeadPoolBatch(normalized, [{
    name: 'Barbearia X',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx_scraping:free_pj',
  }], 'hbx_mass_data', {
    engineUrl: 'http://hbx-engine-1:8001',
  });

  assert.equal(calls.length > 0, true);
  assert.equal(calls[0].engineUrl, 'http://hbx-engine-1:8001');
  assert.equal(counts.approvedCount, 1);
  assert.equal(counts.rejectedCount, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].email, 'agenda@barbeariax.com.br');
  assert.equal(saved[0].emailStatus, 'confirmed');
  assert.equal(service.candidateHasRequiredChannels(saved[0], normalized), true);
});

test('persistRadarLeadPoolBatch no Lead+ materializa card List fraco no Radar', async () => {
  const saved: any[] = [];
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        saved.push(data);
        return { id: 'radar-lead-1', ...data };
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  })) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'bicicletarias, calçados',
    quantity: 30,
    engine: 'hbx',
    targetType: 'pj',
    preferredChannels: ['whatsapp'],
  });

  const counts = await service.persistRadarLeadPoolBatch(normalized, [
    {
      name: 'Humanitarian Calçados',
      phone: '(19) 3513-9668',
      phoneDigits: '1935139668',
      segment: 'calçados',
      source: 'hbx_scraping:free_pj',
    },
  ], 'hbx');

  assert.equal(counts.approvedCount, 1);
  assert.equal(counts.rejectedCount, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Humanitarian Calçados');
});

test('isRunItemQualityDeliverable no Lead+ sem canal obrigatorio entrega card primario fraco', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'bicicletarias, calçados',
    targetType: 'pj',
    requiredChannels: [],
    channelMatchMode: 'prefer',
  };
  const item = {
    id: 'item-humanitarian',
    status: 'found',
    name: 'Humanitarian Calçados',
    phone: '(19) 3513-9668',
    phoneDigits: '1935139668',
    rawJson: JSON.stringify({
      name: 'Humanitarian Calçados',
      phone: '(19) 3513-9668',
      phoneDigits: '1935139668',
      quality: {
        status: 'weak_contact',
        billable: false,
        segmentMatchScore: 85,
        contactQualityScore: 50,
        commercialScore: 56,
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable no List entrega card com canal social mesmo sem telefone', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: [],
    preferredChannels: ['whatsapp'],
    channelMatchMode: 'prefer',
  };
  const item = {
    id: 'item-social-sem-telefone',
    status: 'found',
    name: 'Barbearia Social',
    phone: '',
    phoneDigits: '',
    rawJson: JSON.stringify({
      name: 'Barbearia Social',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/barbeariasocial',
      quality: {
        status: 'weak_contact',
        billable: false,
        segmentMatchScore: 80,
        contactQualityScore: 42,
        commercialScore: 52,
      },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'discard',
        discardReason: 'weak_contactability',
        finalRankScore: 34,
        recommendedChannel: 'review',
        channelAvailability: { instagram: true, phone: false, whatsapp: false },
        productFit: { listFit: 50, leadFit: 40, botFit: 30, recoveryFit: 20, websiteFit: 10 },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), false);
});

test('isRunItemQualityDeliverable ignora canal obrigatorio ausente', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const item = {
    id: 'item-sem-instagram-v2',
    status: 'found',
    name: 'Barbearia Sem Insta V2',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Sem Insta V2',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      quality: { status: 'weak_contact', billable: false },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'discard',
        discardReason: 'required_channel_missing',
        finalRankScore: 39,
        recommendedChannel: 'review',
        channelAvailability: { instagram: false, phone: true, whatsapp: true },
        productFit: { listFit: 50, leadFit: 40, botFit: 30, recoveryFit: 20, websiteFit: 10 },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: [],
  }), false);
  assert.equal(service.isRunItemQualityDeliverable(item, {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  }), false);
});

test('isRunItemQualityDeliverable protege negativo mesmo no List', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: [],
  };
  const item = {
    id: 'item-protegido',
    status: 'found',
    name: 'Barbearia Protegida',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Protegida',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'protect',
        protectionReason: 'opt_out',
        finalRankScore: 0,
        recommendedChannel: 'discard',
        channelAvailability: { phone: true },
        productFit: { listFit: 0, leadFit: 0, botFit: 0, recoveryFit: 0, websiteFit: 0 },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), false);
  assert.equal(service.isRunItemPrimaryDeliverable(item, input), false);
});

test('Radar entrega Facebook obrigatorio sem descartar telefone quando existir', async () => {
  // Sem site/email/instagram, os 2 candidatos caem em hasPoorFields() -> shouldRunFreePreSaveEnrichment
  // dispara o enriquecimento gratis real (HBX engine + probes sociais + fallback web). Sem mock de
  // fetch, isso bate em rede de verdade (localhost:8001 + instagram/facebook/bing/ddg) e pode travar
  // o processo por minutos no Windows. Mesmo padrao do teste irmao abaixo ("Radar corta telefone
  // obrigatorio..."): fetch falha rapido, o gate de enriquecimento cai no catch e segue com os dados
  // originais (que ja satisfazem o requiredChannels=['facebook'] deste teste).
  const previousFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error('rede desativada no teste');
  }) as any;
  try {
    const { prisma, run, items } = createSearchRunPrisma({
      segment: 'lanchonete',
      targetQuantity: 10,
    });
    const service = new WebscrapingService(prisma) as any;
    const normalized = service.normalizeSearchInput({
      city: 'Campinas',
      state: 'SP',
      segment: 'lanchonete',
      quantity: 10,
      engine: 'hbx',
      targetType: 'pj',
      requiredChannels: ['facebook'],
      channelMatchMode: 'all_required',
    });

    const counts = await service.saveSearchRunResults(
      { companyId: 7, userId: 9, user: createUser() },
      normalized,
      run.id,
      [
        {
          name: 'Lanchonete Social',
          phone: '',
          phoneDigits: '',
          facebookUrl: 'https://facebook.com/lanchonetesocial',
          businessCategory: 'lanchonete',
          source: 'hbx_scraping:web',
        },
        {
          name: 'Lanchonete Central',
          phone: '(19) 99999-0002',
          phoneDigits: '19999990002',
          facebookUrl: 'https://facebook.com/lanchonetecentral',
          businessCategory: 'lanchonete',
          source: 'hbx_scraping:web',
        },
      ],
      'hbx',
    );

    assert.equal(counts.found, 2);
    assert.equal(items.length, 2);
    assert.equal(items[0].status, 'found');
    assert.equal(items[0].phoneDigits, '');
    assert.equal(items[1].status, 'found');
    assert.equal(items[1].phoneDigits, '19999990002');
  } finally {
    global.fetch = previousFetch;
  }
});

test('Radar corta telefone obrigatorio em all_required quando enriquecimento gratis nao completa o canal', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error('rede desativada no teste');
  }) as any;
  const { prisma, run, items } = createSearchRunPrisma({
    segment: 'lanchonete',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'lanchonete',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['phone', 'facebook'],
    channelMatchMode: 'all_required',
  });

  try {
    const counts = await service.saveSearchRunResults(
      { companyId: 7, userId: 9, user: createUser() },
      normalized,
      run.id,
      [
        {
          name: 'Lanchonete Dona Maria',
          phone: '',
          phoneDigits: '',
          facebookUrl: 'https://facebook.com/lanchonetedonamaria',
          businessCategory: 'lanchonete',
          source: 'hbx_scraping:web',
        },
        {
          name: 'Lanchonete Avenida Brasil',
          phone: '(19) 99999-0003',
          phoneDigits: '19999990003',
          facebookUrl: 'https://facebook.com/lanchoneteavenidabrasil',
          businessCategory: 'lanchonete',
          source: 'hbx_scraping:web',
        },
      ],
      'hbx',
    );

    assert.equal(counts.invalid, 0);
    assert.equal(counts.found, 1);
    assert.equal(counts.skipped, 1);
    assert.equal(items[0].status, 'skipped');
    assert.equal(items[1].status, 'found');
    assert.equal(items[1].phoneDigits, '19999990003');
  } finally {
    global.fetch = previousFetch;
  }
});

test('Radar sem filtro de canal entrega card social-only da VPS', async () => {
  const { prisma, run, items } = createSearchRunPrisma({
    segment: 'lanchonete',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'lanchonete',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });

  const counts = await service.saveSearchRunResults(
    { companyId: 7, userId: 9, user: createUser() },
    normalized,
    run.id,
    [
      {
        name: 'Lanchonete Social',
        phone: '',
        phoneDigits: '',
        instagramUrl: 'https://instagram.com/lanchonetesocial',
        businessCategory: 'lanchonete',
        source: 'hbx_scraping:web',
      },
    ],
    'hbx',
  );

  assert.equal(counts.found, 1);
  assert.equal(items[0].status, 'found');
  assert.equal(items[0].phoneDigits, '');
});

test('buildRadarWhere nao usa canal obrigatorio como filtro de listagem', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const facebookOnly = service.normalizeRadarFilters({
    city: 'Campinas',
    state: 'SP',
    segment: 'lanchonete',
    requiredChannels: ['facebook'],
    channelMatchMode: 'all_required',
  });
  const phoneAndFacebook = service.normalizeRadarFilters({
    city: 'Campinas',
    state: 'SP',
    segment: 'lanchonete',
    requiredChannels: ['phone', 'facebook'],
    channelMatchMode: 'all_required',
  });

  assert.equal(JSON.stringify(service.buildRadarWhere(facebookOnly, 7, { requirePhone: true })).includes('"phoneDigits":{"not":null}'), false);
  assert.equal(JSON.stringify(service.buildRadarWhere(phoneAndFacebook, 7, { requirePhone: true })).includes('"phoneDigits":{"not":null}'), false);
});

test('buildHbxBatchQueries nao gera query PJ sem nicho', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'oficina',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });
  const queries = service.buildHbxBatchQueries(normalized) as string[];

  assert.ok(queries.length > 0);
  assert.equal(queries.some((query) => /\bempresa\s+Campinas\s+SP\s+(celular|telefone|whatsapp)\b/i.test(query)), false);
  assert.equal(queries.some((query) => /\binstagram\b|\bfacebook\b/i.test(query)), false);
  assert.equal(queries.every((query) => normalizeQueryForTest(query).includes('oficina')), true);
});

test('buildHbxBatchQueries usa rede social quando canal social foi pedido', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'oficina',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    preferredChannels: ['instagram'],
  });
  const queries = service.buildHbxBatchQueries(normalized) as string[];

  assert.equal(queries.some((query) => /site:instagram\.com/i.test(query)), true);
  assert.equal(queries.some((query) => /\binstagram oficial\b/i.test(query)), true);
});

test('buildHbxBatchQueries nao usa rede social no Lead Plus sem filtro de canal', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'beleza',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });
  const queries = service.buildHbxBatchQueries(normalized) as string[];

  assert.equal(queries.some((query) => /site:instagram\.com/i.test(query)), false);
  assert.equal(queries.some((query) => /site:facebook\.com/i.test(query)), false);
});

test('buildSearchRunResponse items preserva campos sociais do rawJson', () => {
  const { run, items } = createSearchRunPrisma({
    foundCount: 1,
    targetQuantity: 1,
    metricsJson: JSON.stringify({ channelFilters: {} }),
  });
  const service = new WebscrapingService(createPrisma()) as any;
  items.push({
    id: 'item-social',
    runId: run.id,
    placeId: 'hbx:pj:19999990002',
    name: 'Auto Social',
    phone: '(19) 99999-0002',
    phoneDigits: '19999990002',
    website: 'https://autosocial.example.com',
    status: 'found',
    source: 'hbx',
    createdAt: new Date('2026-05-06T12:01:00.000Z'),
    rawJson: JSON.stringify({
      name: 'Auto Social',
      phone: '(19) 99999-0002',
      phoneDigits: '19999990002',
      instagramUrl: 'https://instagram.com/autosocial',
      facebookUrl: 'https://facebook.com/autosocial',
      email: 'contato@autosocial.com.br',
      emailStatus: 'confirmed',
      socialStatus: 'found',
      whatsappStatus: 'confirmed',
      whatsappCheckStatus: 'confirmed',
      recommendedChannel: 'whatsapp',
      opportunityScore: 82,
      opportunityReason: 'Contato acionavel.',
      enrichmentScore: 77,
      qualityV2: { decision: 'deliver', finalRankScore: 82, channelAvailability: { instagram: true } },
    }),
  });

  const response = service.buildSearchRunResponse({ ...run, items });
  const item = response.items[0];

  assert.equal(item.instagramUrl, 'https://instagram.com/autosocial');
  assert.equal(item.facebookUrl, 'https://facebook.com/autosocial');
  assert.equal(item.email, 'contato@autosocial.com.br');
  assert.equal(item.whatsappStatus, 'confirmed');
  assert.equal(item.recommendedChannel, undefined);
  assert.equal(item.opportunityScore, 82);
  assert.equal(item.opportunityReason, undefined);
  assert.equal(item.enrichmentScore, 77);
  assert.equal(item.qualityV2, undefined);
  assert.equal(item.premiumLocked, true);
  assert.equal(item.premiumTeaser, true);
});

test('buildSearchRunResponse preserva contato basico e mascara inteligencia em List', () => {
  const { run, items } = createSearchRunPrisma({
    foundCount: 1,
    targetQuantity: 1,
    metricsJson: JSON.stringify({ channelFilters: {} }),
  });
  const service = new WebscrapingService(createPrisma()) as any;
  items.push({
    id: 'item-rich-list',
    runId: run.id,
    placeId: 'google:rich-list',
    name: 'Oficina Rica Auto Center',
    phone: '(19) 98888-0004',
    phoneDigits: '19988880004',
    website: 'https://oficinarica.com.br',
    status: 'found',
    source: 'hbx',
    createdAt: new Date('2026-05-06T12:02:00.000Z'),
    rawJson: JSON.stringify({
      name: 'Oficina Rica Auto Center',
      phone: '(19) 98888-0004',
      phoneDigits: '19988880004',
      website: 'https://oficinarica.com.br',
      instagramUrl: 'https://instagram.com/oficinarica',
      facebookUrl: 'https://facebook.com/oficinarica',
      email: 'contato@oficinarica.com.br',
      googleMapsUrl: 'https://maps.google.com/?cid=123',
      rating: 4.8,
      reviews: 123,
      whatsappStatus: 'missing',
      whatsappCheckStatus: 'missing',
      recommendedChannel: 'email',
      opportunityScore: 74,
      enrichmentScore: 68,
      signals: {
        whatsappStatus: 'missing',
        googleMapsUrl: 'https://maps.google.com/?cid=123',
      },
    }),
  });

  const response = service.buildSearchRunResponse({ ...run, items });
  const item = response.items[0];

  assert.equal(item.website, 'https://oficinarica.com.br');
  assert.equal(item.instagramUrl, 'https://instagram.com/oficinarica');
  assert.equal(item.facebookUrl, 'https://facebook.com/oficinarica');
  assert.equal(item.email, 'contato@oficinarica.com.br');
  assert.equal(item.googleMapsUrl, 'https://maps.google.com/?cid=123');
  assert.equal(item.rating, 4.8);
  assert.equal(item.reviews, 123);
  assert.equal(item.whatsappStatus, 'missing');
  assert.equal(item.recommendedChannel, undefined);
  assert.equal(item.opportunityScore, 74);
  assert.equal(item.opportunityReason, undefined);
  assert.equal(item.premiumLocked, true);
  assert.equal(item.premiumFeatureStatus, 'locked');
});

test('mapRunItemToContact preserva social fields do rawJson', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const contact = service.mapRunItemToContact({
    placeId: 'hbx:pj:19999990003',
    name: 'Auto Mapeada',
    phone: '(19) 99999-0003',
    phoneDigits: '19999990003',
    rawJson: JSON.stringify({
      instagramUrl: 'https://instagram.com/automapeada',
      facebookUrl: 'https://facebook.com/automapeada',
      email: 'oi@automapeada.com.br',
      whatsappStatus: 'confirmed',
      recommendedChannel: 'whatsapp',
      opportunityScore: 71,
      opportunityReason: 'Bom contato.',
      qualityV2: { decision: 'review', finalRankScore: 71 },
    }),
  });

  assert.equal(contact.instagramUrl, 'https://instagram.com/automapeada');
  assert.equal(contact.facebookUrl, 'https://facebook.com/automapeada');
  assert.equal(contact.email, 'oi@automapeada.com.br');
  assert.equal(contact.whatsappStatus, 'confirmed');
  assert.equal(contact.recommendedChannel, 'whatsapp');
  assert.equal(contact.opportunityScore, 71);
  assert.equal(contact.qualityV2?.finalRankScore, 71);
});

test('persistRadarLeadPoolBatch preserva social ja enriquecido ao sincronizar card primario', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error('rede desativada no teste');
  }) as any;
  let updated: any = null;
  const existing = {
    id: 'radar-silcar',
    companyId: null,
    placeId: 'hbx:pj:1732023332',
    name: 'Silcar Pneus Ltda',
    phone: '(17) 3202-3332',
    phoneDigits: '1732023332',
    ddd: '17',
    city: 'Araraquara',
    state: 'SP',
    segment: 'borracharias',
    instagramUrl: 'https://instagram.com/silcarpneusoficial',
    facebookUrl: 'https://facebook.com/SilcarPneusOficial',
    socialStatus: 'found',
    socialConfidence: 92,
    status: 'rejected',
    rejectionReason: 'ddd_mismatch',
    metadataJson: JSON.stringify({
      delivery: {
        visibilityTier: 'blocked',
        qualityReason: 'Contato publico ausente.',
      },
    }),
    sourceEngines: JSON.stringify(['hbx']),
  };
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => existing,
      update: async ({ data }: any) => {
        updated = data;
        return { ...existing, ...data };
      },
      create: async ({ data }: any) => {
        updated = data;
        return data;
      },
    },
  })) as any;
  const input = service.normalizeSearchInput({
    city: 'Araraquara',
    state: 'SP',
    segment: 'borracharias',
    quantity: 1,
    radiusKm: 100,
    originLat: -21.7845,
    originLng: -48.178,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  });

  try {
    await service.persistRadarLeadPoolBatch(input, [{
      placeId: 'hbx:pj:1732023332',
      name: 'Silcar Pneus Ltda',
      phone: '(17) 3202-3332',
      phoneDigits: '1732023332',
      city: 'Araraquara',
      state: 'SP',
      segment: 'borracharias',
      source: 'hbx',
      quality: {
        status: 'weak_contact',
        billable: false,
        segmentMatchScore: 60,
        contactQualityScore: 50,
        commercialScore: 59,
        reasons: ['Contato insuficiente para entrega billable.'],
      },
    }], 'hbx');

    assert.equal(updated.status, 'clean');
    assert.equal(updated.rejectionReason, null);
    assert.equal(updated.instagramUrl, 'https://instagram.com/silcarpneusoficial');
    assert.equal(updated.facebookUrl, 'https://facebook.com/SilcarPneusOficial');
    assert.equal(updated.socialStatus, 'found');
    assert.ok(updated.socialConfidence >= 80);
    const enrichment = JSON.parse(updated.enrichmentJson);
    const metadata = JSON.parse(updated.metadataJson);
    assert.equal(enrichment.signals.instagramUrl, 'https://instagram.com/silcarpneusoficial');
    assert.equal(enrichment.qualityV2.channelAvailability.instagram, true);
    assert.notEqual(metadata.delivery.visibilityTier, 'blocked');
  } finally {
    global.fetch = previousFetch;
  }
});

test('persistRadarLeadPoolBatch preserva campos ricos ao sincronizar card primario', async () => {
  let created: any = null;
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      update: async ({ data }: any) => data,
      create: async ({ data }: any) => {
        created = data;
        return data;
      },
    },
  })) as any;
  const input = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'oficinas mecanicas',
    quantity: 1,
    radiusKm: 20,
    engine: 'hbx',
    targetType: 'pj',
  });

  await service.persistRadarLeadPoolBatch(input, [{
    placeId: 'google:rich-primary',
    name: 'Oficina Rica Auto Center',
    phone: '(19) 98888-0004',
    phoneDigits: '19988880004',
    city: 'Campinas',
    state: 'SP',
    segment: 'oficinas mecanicas',
    address: 'Rua Um, 123 - Campinas, SP',
    website: 'https://oficinarica.com.br',
    instagramUrl: 'https://instagram.com/oficinarica',
    facebookUrl: 'https://facebook.com/oficinarica',
    email: 'contato@oficinarica.com.br',
    googleMapsUrl: 'https://maps.google.com/?cid=123',
    rating: 4.8,
    reviews: 123,
    whatsappStatus: 'missing',
    whatsappCheckStatus: 'missing',
    source: 'hbx',
    quality: {
      status: 'approved',
      billable: true,
      segmentMatchScore: 90,
      contactQualityScore: 85,
      commercialScore: 88,
      reasons: [],
    },
  }], 'hbx');

  assert.ok(created);
  assert.equal(created.website, 'https://oficinarica.com.br');
  assert.equal(created.instagramUrl, 'https://instagram.com/oficinarica');
  assert.equal(created.facebookUrl, 'https://facebook.com/oficinarica');
  assert.equal(created.email, 'contato@oficinarica.com.br');
  assert.equal(created.googleMapsUrl, 'https://maps.google.com/?cid=123');
  assert.equal(created.rating, 4.8);
  assert.equal(created.reviews, 123);
  const enrichment = JSON.parse(created.enrichmentJson);
  assert.equal(enrichment.whatsappStatus, 'missing');
  assert.equal(enrichment.signals.website, 'https://oficinarica.com.br');
  assert.equal(enrichment.signals.instagramUrl, 'https://instagram.com/oficinarica');
  assert.equal(enrichment.signals.facebookUrl, 'https://facebook.com/oficinarica');
  assert.equal(enrichment.signals.emailCandidate, 'contato@oficinarica.com.br');
  assert.equal(enrichment.signals.googleMapsUrl, 'https://maps.google.com/?cid=123');
  assert.equal(enrichment.signals.whatsappStatus, 'missing');
});

test('persistRadarLeadPoolBatch preserva social confiavel ja aprovado pelo motor HBX', async () => {
  const createdRows: any[] = [];
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      update: async ({ data }: any) => data,
      create: async ({ data }: any) => {
        createdRows.push(data);
        return data;
      },
    },
  })) as any;
  const input = service.normalizeSearchInput({
    city: 'Piracicaba',
    state: 'SP',
    segment: 'imobiliárias',
    quantity: 6,
    radiusKm: 100,
    engine: 'hbx',
    targetType: 'pj',
  });
  const quality = {
    status: 'approved',
    billable: true,
    segmentMatchScore: 90,
    contactQualityScore: 80,
    commercialScore: 85,
    reasons: [],
  };

  await service.persistRadarLeadPoolBatch(input, [
    ['Marth Consultoria Imobiliária Ltda', 'https://instagram.com/marthimoveis', 'https://facebook.com/imobiliariamarth'],
    ['Imobiliária Junqueira', 'https://instagram.com/imobjunqueira', 'https://facebook.com/Imobiliaria.Junqueira'],
    ['ALUGUE OU COMPRE Imóveis em Piracicaba e Região', 'https://instagram.com/pauloimobiliaria', 'https://facebook.com/pauloimobiliaria'],
    ['Fly a Imobiliária do Campestre', 'https://instagram.com/imobiliariafly', 'https://facebook.com/imobiliariafly'],
    ['AMD Imóveis Atendimento Humanizado e Personalizado para você!', 'https://instagram.com/amd_imoveis', 'https://facebook.com/profile.php'],
    ['IMÓVEIS EM PIRACICABA', 'https://instagram.com/pedroso_imobiliaria', 'https://facebook.com/imobiliariapedrosopiracicaba'],
  ].map(([name, instagramUrl, facebookUrl], index) => ({
    placeId: `hbx:pj:1999999000${index}`,
    name,
    phone: `(19) 99999-000${index}`,
    phoneDigits: `1999999000${index}`,
    city: 'Piracicaba',
    state: 'SP',
    segment: 'imobiliárias',
    website: `https://imobiliaria-${index}.com.br`,
    instagramUrl,
    facebookUrl,
    socialStatus: 'found',
    socialConfidence: 80,
    source: 'hbx_scraping:free_pj',
    sourceEngine: 'hbx',
    quality,
  })), 'hbx');

  assert.equal(createdRows.length, 6);
  assert.deepEqual(
    createdRows.map((row) => row.instagramUrl),
    [
      'https://instagram.com/marthimoveis',
      'https://instagram.com/imobjunqueira',
      'https://instagram.com/pauloimobiliaria',
      'https://instagram.com/imobiliariafly',
      'https://instagram.com/amd_imoveis',
      'https://instagram.com/pedroso_imobiliaria',
    ],
  );
  assert.equal(createdRows.every((row) => row.socialStatus === 'found' && row.socialConfidence >= 80), true);
});

test('maskRadarSmartFieldsForList preserva contato natural e bloqueia inteligencia premium', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const item = service.maskRadarSmartFieldsForList({
    name: 'Oficina Rica',
    phone: '(19) 98888-0004',
    phoneDigits: '19988880004',
    website: 'https://oficinarica.com.br',
    instagramUrl: 'https://instagram.com/oficinarica',
    facebookUrl: 'https://facebook.com/oficinarica',
    email: 'contato@oficinarica.com.br',
    googleMapsUrl: 'https://maps.google.com/?cid=123',
    businessCategory: 'Oficina mecânica',
    rating: 4.8,
    reviews: 123,
    whatsappStatus: 'missing',
    recommendedChannel: 'email',
    painType: 'site_fraco',
    painPitch: 'Pitch premium',
    enrichmentJson: { premium: true },
    qualityV2: { version: 'lead-quality-v2' },
  });

  assert.equal(item.website, 'https://oficinarica.com.br');
  assert.equal(item.instagramUrl, 'https://instagram.com/oficinarica');
  assert.equal(item.facebookUrl, 'https://facebook.com/oficinarica');
  assert.equal(item.email, 'contato@oficinarica.com.br');
  assert.equal(item.googleMapsUrl, 'https://maps.google.com/?cid=123');
  assert.equal(item.businessCategory, 'Oficina mecânica');
  assert.equal(item.rating, 4.8);
  assert.equal(item.reviews, 123);
  assert.equal(item.whatsappStatus, 'missing');

  assert.equal(item.recommendedChannel, null);
  assert.equal(item.painType, null);
  assert.equal(item.painPitch, null);
  assert.equal(item.enrichmentJson, null);
  assert.equal(item.qualityV2, null);
  assert.equal(item.premiumLocked, true);
  assert.equal(item.premiumFeatureStatus, 'locked');
});

test('hasUsablePublicContactChannel aceita card rico sem telefone', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  assert.equal(service.hasUsablePublicContactChannel({
    name: 'Oficina Rica',
    email: 'contato@oficinarica.com.br',
    emailStatus: 'probable',
  }), true);
  assert.equal(service.hasUsablePublicContactChannel({
    name: 'Oficina Maps',
    googleMapsUrl: 'https://www.google.com/maps/place/Oficina+Maps',
  }), true);
  assert.equal(service.hasUsablePublicContactChannel({
    name: 'Oficina Fonte',
    sourceUrl: 'https://oficinafonte.com.br',
  }), true);
});

test('isRunItemQualityDeliverable nao rejeita item sem Instagram quando filtro legado exige Instagram', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-sem-instagram',
    status: 'found',
    name: 'Barbearia Sem Insta',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Sem Insta',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'whatsapp',
        channelAvailability: { instagram: false, phone: true, whatsapp: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
  assert.equal(service.isRunItemPrimaryDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable aceita item com Instagram quando filtro exige Instagram', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-com-instagram',
    status: 'found',
    name: 'Barbearia Com Insta',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Com Insta',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/barbeariacominsta',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { instagram: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable aceita Facebook sozinho mesmo com filtro legado Instagram/Facebook', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram', 'facebook'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-com-facebook',
    status: 'found',
    name: 'Barbearia Com Face',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Com Face',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      facebookUrl: 'https://facebook.com/barbeariacomface',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { instagram: false, facebook: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable aceita Instagram e Facebook quando ambos sao obrigatorios', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram', 'facebook'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-com-instagram-facebook',
    status: 'found',
    name: 'Barbearia Com Redes',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    rawJson: JSON.stringify({
      name: 'Barbearia Com Redes',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/barbeariacomredes',
      facebookUrl: 'https://facebook.com/barbeariacomredes',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { instagram: true, facebook: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable nao bloqueia canal real por channelAvailability antigo falso', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    targetType: 'pj',
    requiredChannels: ['instagram', 'facebook', 'website'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-dominos-stale-quality',
    status: 'found',
    name: "Domino's Pizza",
    phone: '(19) 3551-0101',
    phoneDigits: '1935510101',
    rawJson: JSON.stringify({
      name: "Domino's Pizza",
      phone: '(19) 3551-0101',
      phoneDigits: '1935510101',
      city: 'Rio Claro',
      segment: 'pizzarias',
      website: 'https://dominopizza.com',
      websiteStatus: 'none',
      instagramUrl: 'https://instagram.com/dominopizzas',
      facebookUrl: 'https://facebook.com/DominosPizzaRioClaro',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { instagram: true, facebook: true, website: false, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable nao usa social incompativel como bloqueio de canal legado', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Araraquara',
    state: 'SP',
    segment: 'pneus',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-social-incompativel',
    status: 'found',
    name: 'Casa dos Pneus',
    phone: '(16) 3333-1111',
    phoneDigits: '1633331111',
    rawJson: JSON.stringify({
      name: 'Casa dos Pneus',
      phone: '(16) 3333-1111',
      phoneDigits: '1633331111',
      city: 'Araraquara',
      segment: 'pneus',
      instagramUrl: 'https://instagram.com/casaseniorararaquara',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { instagram: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable nao usa social fraco como bloqueio de canal legado', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    targetType: 'pj',
    requiredChannels: ['facebook'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-sula-aero-lanches',
    status: 'found',
    name: "Sula's Lanches e Pizzas",
    phone: '(19) 3377-3296',
    phoneDigits: '1933773296',
    rawJson: JSON.stringify({
      name: "Sula's Lanches e Pizzas",
      phone: '(19) 3377-3296',
      phoneDigits: '1933773296',
      city: 'Rio Claro',
      segment: 'pizzarias',
      facebookUrl: 'https://facebook.com/aerolanchesrc',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { facebook: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable nao usa site obrigatorio legado como bloqueio', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    targetType: 'pj',
    requiredChannels: ['website'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-site-outra-marca',
    status: 'found',
    name: 'Pizza Do Ricardo e Restaurante',
    phone: '(19) 99797-3137',
    phoneDigits: '19997973137',
    rawJson: JSON.stringify({
      name: 'Pizza Do Ricardo e Restaurante',
      phone: '(19) 99797-3137',
      phoneDigits: '19997973137',
      city: 'Rio Claro',
      segment: 'pizzarias',
      website: 'https://pizza.dominos.com',
      websiteStatus: 'present',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { website: true, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('isRunItemQualityDeliverable aceita site compativel com nome e categoria', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    targetType: 'pj',
    requiredChannels: ['website'],
    channelMatchMode: 'all_required',
  };
  const item = {
    id: 'item-site-compativel',
    status: 'found',
    name: 'Restaurante, Choperia e Pizzaria Fênix',
    phone: '(19) 3542-7261',
    phoneDigits: '1935427261',
    rawJson: JSON.stringify({
      name: 'Restaurante, Choperia e Pizzaria Fênix',
      phone: '(19) 3542-7261',
      phoneDigits: '1935427261',
      city: 'Rio Claro',
      segment: 'pizzarias',
      website: 'https://restaurantefenix.com',
      websiteStatus: 'present',
      quality: { status: 'approved', billable: true },
      qualityV2: {
        version: 'lead-quality-v2',
        decision: 'review',
        finalRankScore: 72,
        recommendedChannel: 'review',
        channelAvailability: { website: false, phone: true },
      },
    }),
  };

  assert.equal(service.isRunItemQualityDeliverable(item, input), true);
});

test('matchesRadarChannelFilters aceita site presente mesmo com websiteStatus antigo none', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const filters = {
    requiredChannels: ['instagram', 'facebook', 'website'],
    channelMatchMode: 'all_required',
  };
  const row = {
    id: 'row-millano-stale-site-status',
    name: 'Pizzaria Millano S',
    city: 'Limeira',
    state: 'SP',
    segment: 'pizzarias',
    phone: '(19) 3444-8659',
    phoneDigits: '1934448659',
    website: 'https://pizzariamillanos.wabiz.delivery',
    websiteStatus: 'none',
    instagramUrl: 'https://instagram.com/pizzariamillanos',
    facebookUrl: 'https://facebook.com/pizzamillanos',
  };

  assert.equal(service.matchesRadarChannelFilters(row, filters), true);
});

test('candidateHasRequiredChannels aplica email obrigatorio com all_required', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    requiredChannels: ['email'],
    channelMatchMode: 'all_required',
  };

  assert.equal(service.candidateHasRequiredChannels({
    name: 'Pizzaria Sem Email',
    phoneDigits: '19999990001',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
  }, input), false);

  assert.equal(service.candidateHasRequiredChannels({
    name: 'Pizzaria Com Email',
    phoneDigits: '19999990001',
    email: 'contato@pizzariacomemail.com.br',
    emailStatus: 'confirmed',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
  }, input), true);

  assert.equal(service.candidateHasRequiredChannels({
    name: 'Pizzaria Prefer',
    phoneDigits: '19999990001',
  }, { ...input, channelMatchMode: 'prefer' }), true);
});

test('matchesRadarChannelFilters bloqueia row sem canal obrigatorio', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const filters = {
    requiredChannels: ['email'],
    channelMatchMode: 'all_required',
  };

  assert.equal(service.matchesRadarChannelFilters({
    id: 'sem-email',
    name: 'Pizzaria Sem Email',
    phoneDigits: '19999990001',
  }, filters), false);

  assert.equal(service.matchesRadarChannelFilters({
    id: 'com-email',
    name: 'Pizzaria Com Email',
    phoneDigits: '19999990001',
    email: 'contato@pizzariacomemail.com.br',
    emailStatus: 'confirmed',
  }, filters), true);
});

test('buildRadarLeadPublic sanitiza email de asset e social incompativel', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const item = service.buildRadarLeadPublic({
    id: 'lead-sanitized',
    name: "Sula's Lanches e Pizzas",
    phone: '(19) 3377-3296',
    phoneDigits: '1933773296',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    email: 'icon@2x.png',
    emailStatus: 'confirmed',
    facebookUrl: 'https://facebook.com/aerolanchesrc',
    socialStatus: 'found',
    socialConfidence: 90,
  }, { includeSmartFields: true });

  assert.equal(item.email, null);
  assert.equal(item.facebookUrl, null);
  assert.equal(item.socialStatus, 'missing');
  assert.equal(item.deliveryProduct, 'list');
});

test('canUseRadarSmartLeadFields libera somente HBX Lead Plus ou superior', async () => {
  const liteService = new WebscrapingService(createPrisma({
    company: {
      findUnique: async () => ({
        selectedPlanKey: 'hbx_lite',
        isActive: true,
        premiumAccess: false,
        paymentStatus: 'PAID',
        subscriptionStatus: 'active',
        onboardingStatus: 'active_paid',
      }),
    },
  })) as any;
  const leadService = new WebscrapingService(createPrisma({
    company: {
      findUnique: async () => ({
        selectedPlanKey: 'hbx_padrao',
        isActive: true,
        premiumAccess: false,
        paymentStatus: 'PAID',
        subscriptionStatus: 'active',
        onboardingStatus: 'active_paid',
      }),
    },
  })) as any;

  assert.equal(await liteService.canUseRadarSmartLeadFields(7), false);
  assert.equal(await leadService.canUseRadarSmartLeadFields(7), true);
});

test('enrichRadarLeadViaLeadPlusEngine prioriza Instagram, Facebook, site e email', async () => {
  const previousFetch = global.fetch;
  let body: any = null;
  global.fetch = (async (_url: any, init?: any) => {
    body = JSON.parse(String(init?.body || '{}'));
    return createResponse(200, { instagramUrl: 'https://instagram.com/padariareal' }) as any;
  }) as any;
  const service = new WebscrapingService(createPrisma()) as any;
  service.canAcquireHbxEngineFromPool = async () => false;
  service.recordVendasRadarEnrichmentStatus = async () => null;

  try {
    const response = await service.enrichRadarLeadViaLeadPlusEngine(
      { companyId: 7, userId: 9, user: createUser() },
      {
        id: 'radar-1',
        name: 'Padaria Real',
        phone: '(19) 3333-0000',
        phoneDigits: '1933330000',
        city: 'Campinas',
        state: 'SP',
        segment: 'padarias',
      },
    );

    assert.equal(response.instagramUrl, 'https://instagram.com/padariareal');
    assert.deepEqual(body.preferredChannels, ['instagram', 'facebook', 'website', 'email']);
    assert.deepEqual(body.requiredChannels, []);
  } finally {
    global.fetch = previousFetch;
  }
});

test('buildHbxBatchAttemptTask intercala segmentos antes da proxima variacao', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Americana',
    state: 'SP',
    segment: 'açougues, alimentos naturais, bares',
    radiusKm: 0,
    quantity: 40,
    engine: 'hbx',
    targetType: 'pj',
  });

  const first = service.buildHbxBatchAttemptTask(normalized, 1);
  const sixth = service.buildHbxBatchAttemptTask(normalized, 6);
  const seventh = service.buildHbxBatchAttemptTask(normalized, 7);

  assert.equal(first.input.city, 'Americana');
  assert.equal(first.input.segment, 'açougues');
  assert.equal(sixth.input.segment, 'bares');
  assert.equal(seventh.input.segment, 'açougues');
  assert.equal(first.searchScope.segmentCount, 3);
});

test('updateSearchRunMetrics preserva metadados de alcance e filtros', async () => {
  const { prisma, run } = createSearchRunPrisma({
    metricsJson: JSON.stringify({
      radiusKm: 100,
      originLat: -22.74,
      originLng: -47.33,
      regionalCities: [{ city: 'Americana', state: 'SP', distanceKm: 0 }],
      channelFilters: { preferredChannels: ['whatsapp'], channelMatchMode: 'prefer' },
      salesProfile: { targetSegments: ['açougues'] },
      status: 'queued',
    }),
  });
  const service = new WebscrapingService(prisma) as any;

  await service.updateSearchRunMetrics(run.id, {
    status: 'running',
    increment: { parsedContacts: 2 },
  });
  const metrics = JSON.parse((run as any).metricsJson);

  assert.equal(metrics.radiusKm, 100);
  assert.equal(metrics.regionalCities[0].city, 'Americana');
  assert.equal(metrics.channelFilters.preferredChannels[0], 'whatsapp');
  assert.equal(metrics.salesProfile.targetSegments[0], 'açougues');
  assert.equal(metrics.parsedContacts, 2);
  assert.equal(metrics.status, 'running');
});

test('startRadarSearchRunForUser usa estoque sem perfil quando perfil lead plus zera cards locais', async () => {
  const { prisma, run } = createSearchRunPrisma({});
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  service.supportsRadarPersistence = async () => true;

  const relaxedRow = {
    id: 'radar-1',
    placeId: 'place-1',
    name: 'Auto Pecas Local',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    city: 'Sumare',
    state: 'SP',
    segment: 'auto pecas',
    opportunityScore: 82,
    status: 'clean',
  };
  const calls: any[] = [];
  service.queryRadarRowsForCompany = async (_companyId: number, filters: any) => {
    calls.push(filters);
    return filters.salesProfile ? [] : [relaxedRow];
  };
  // LIMPEZA-DESTRUTIVA L1: o START nunca reivindica; se markRadarDelivered for chamado, falha.
  let markRadarDeliveredCalls = 0;
  service.markRadarDelivered = async () => { markRadarDeliveredCalls += 1; return []; };
  service.recalculateSearchRunCounters = async () => ({ foundCount: 1, duplicateCount: 0, skippedCount: 0 });
  service.buildRadarSearchRunResponse = async () => ({ status: run.status });

  const response = await service.startRadarSearchRunForUser(createUser(), {
    city: 'Hortolandia',
    state: 'SP',
    segment: 'auto pecas, oficinas mecanicas',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
    salesProfile: { targetSegments: ['servicos locais'] },
  });

  const metrics = JSON.parse((run as any).metricsJson);
  // Estoque existe na vitrine, mas o run vai pra FILA (queued) — nada entregue no funil.
  assert.equal(response.status, 'queued');
  assert.equal(run.status, 'queued');
  assert.equal(markRadarDeliveredCalls, 0);
  // O fallback de perfil (consulta com perfil -> vazio -> consulta sem perfil) segue valendo.
  assert.equal(calls.length, 2);
  assert.equal(calls[0].salesProfile.targetSegments[0], 'servicos locais');
  assert.equal(calls[1].salesProfile, null);
  assert.equal(metrics.relaxedStockLookup, true);
});

test('LIMPEZA-DESTRUTIVA L2: VENDEDOR com 20 cards pendentes em Vendas NAO pausa mais a busca (gate de estoque morto)', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'completed',
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 20,
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  service.supportsRadarPersistence = async () => true;
  // Cota comercial (a única trava de quantidade que sobrevive) segue folgada:
  // se o run pausar aqui, só pode ser por ela — nunca pelo estoque do funil.
  service.commercialUsageLimits = {
    getUsageSnapshot: async () => ({
      cards: { dailyRemaining: 999999, remaining: 999999 },
    }),
    limitRequestedCardsBySellerActiveQuota: async () => ({
      limit: 20,
      quota: { seller: true, paused: false, activeCount: 0, effectiveLimit: 20, availableSlots: 20, code: null },
    }),
    getSellerActiveCardQuotaSnapshot: async () => ({
      seller: true, paused: false, activeCount: 0, effectiveLimit: 20, availableSlots: 20, code: null,
    }),
  };
  let queriedStock = false;
  service.queryRadarRowsForCompany = async () => {
    queriedStock = true;
    return [];
  };
  service.buildRadarSearchRunResponse = async (_user: any, runId: string) => ({
    runId,
    status: run.status,
    message: run.errorMessage,
  });

  const sellerUser = {
    id: 44,
    companyId: 7,
    name: 'Henrique',
    role: 'USER',
    isSystemMaster: false,
    company: { slug: 'hbx' },
    masterContext: { active: false },
  };

  const response = await service.startRadarSearchRunForUser(sellerUser, {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearias',
    quantity: 20,
    engine: 'hbx',
    targetType: 'pj',
  });

  // Sem RadarVendasSyncService/getPendingCountForSeller: mesmo com 20 cards
  // pendentes na carteira do vendedor, o run vai pra FILA — busca sempre roda
  // até targetQuantity, nunca olhando o funil.
  assert.equal(response.status, 'queued');
  assert.equal(run.status, 'queued');
  assert.notEqual(run.lastBatchStatus, 'vendas_stock_limit_start');
  assert.equal(queriedStock, true);
});

test('VENDAS-REFAB S1 / LIMPEZA-DESTRUTIVA L2: ADMIN com 20 cards pendentes na EMPRESA NAO pausa a busca (gate de estoque morto)', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'completed',
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 20,
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  service.supportsRadarPersistence = async () => true;
  // Cota comercial da empresa (teto real do Master, único freio de quantidade
  // que sobrevive à L2) segue folgada — não é isso que está em teste aqui.
  service.commercialUsageLimits = {
    getUsageSnapshot: async () => ({
      cards: { dailyRemaining: 999999, remaining: 999999 },
    }),
    limitRequestedCardsBySellerActiveQuota: async () => ({
      limit: 20,
      quota: { seller: false },
    }),
    getSellerActiveCardQuotaSnapshot: async () => ({ seller: false }),
  };
  let queriedStock = false;
  service.queryRadarRowsForCompany = async () => {
    queriedStock = true;
    return [{
      id: 'radar-admin-1',
      placeId: 'place-admin-1',
      name: 'Barbearia Admin',
      phone: '(19) 99999-0002',
      phoneDigits: '19999990002',
      city: 'Campinas',
      state: 'SP',
      segment: 'barbearias',
      opportunityScore: 80,
      status: 'clean',
    }];
  };
  service.markRadarDelivered = async (_companyId: number, _userId: number, rows: any[]) => rows;
  service.recalculateSearchRunCounters = async () => ({ foundCount: 1, duplicateCount: 0, skippedCount: 0 });
  service.buildRadarSearchRunResponse = async (_user: any, runId: string) => ({
    runId,
    status: run.status,
    message: run.errorMessage,
  });

  const response = await service.startRadarSearchRunForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearias',
    quantity: 20,
    engine: 'hbx',
    targetType: 'pj',
  });

  assert.notEqual(response.status, 'sleeping');
  assert.notEqual(run.status, 'sleeping');
  assert.notEqual(run.lastBatchStatus, 'vendas_stock_limit_start');
  assert.equal(queriedStock, true);
});

test('LIMPEZA-DESTRUTIVA L2: startRadarSearchRunForUser vendedor nunca consulta estoque (pendente de ninguem) pra decidir a busca', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'completed',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'oficinas',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  service.supportsRadarPersistence = async () => true;
  service.commercialUsageLimits = {
    getUsageSnapshot: async () => ({
      cards: {
        dailyRemaining: 999999,
        remaining: 999999,
      },
    }),
    limitRequestedCardsBySellerActiveQuota: async () => ({
      limit: 10,
      quota: {
        seller: true,
        paused: false,
        activeCount: 0,
        effectiveLimit: 10,
        availableSlots: 10,
        code: null,
      },
    }),
    getSellerActiveCardQuotaSnapshot: async () => ({
      seller: true,
      paused: false,
      activeCount: 0,
      effectiveLimit: 10,
      availableSlots: 10,
      code: null,
    }),
  };
  let queriedStock = false;
  service.queryRadarRowsForCompany = async () => {
    queriedStock = true;
    return [{
      id: 'radar-seller-1',
      placeId: 'place-seller-1',
      name: 'Oficina Seller',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'oficinas',
      opportunityScore: 82,
      status: 'clean',
    }];
  };
  service.markRadarDelivered = async (_companyId: number, _userId: number, rows: any[]) => rows;
  service.recalculateSearchRunCounters = async () => ({ foundCount: 1, duplicateCount: 0, skippedCount: 0 });
  service.buildRadarSearchRunResponse = async (_user: any, runId: string) => ({
    runId,
    status: run.status,
    message: run.errorMessage,
  });

  const response = await service.startRadarSearchRunForUser({
    id: 44,
    companyId: 7,
    name: 'Henrique',
    role: 'USER',
    isSystemMaster: false,
    company: { slug: 'hbx' },
    masterContext: { active: false },
  }, {
    city: 'Rio Claro',
    state: 'SP',
    segment: 'oficinas',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
  });

  // Sem gate de estoque: a busca vira fila (queued) direto, sem qualquer
  // dependência de RadarVendasSyncService/getPendingCount(-ForSeller).
  assert.equal(response.status, 'queued');
  assert.equal(run.status, 'queued');
  assert.equal(run.lastBatchStatus, null);
  assert.equal(queriedStock, true);
});

test('LIMPEZA-DESTRUTIVA L2: resumePausedSearchRunIfPossible retoma Radar pausado por cota quando a EMPRESA libera espaco', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'sleeping',
    companyId: 7,
    userId: 9,
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 20,
    lastBatchStatus: 'vendas_card_limit_start',
    errorMessage: 'Radar pausado.',
    nextRetryAt: new Date(Date.now() - 1000),
    metricsJson: JSON.stringify({
      radarPauseReason: 'vendas_card_limit_start',
      status: 'sleeping',
    }),
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  // Sem gate de estoque: quem decide se o run pausado pode retomar é só a cota
  // comercial da EMPRESA (CommercialUsageLimitsService) — aqui ela liberou espaco.
  service.commercialUsageLimits = {
    getUsageSnapshot: async () => ({
      cards: { remaining: 5 },
    }),
  };

  const resumed = await service.resumePausedSearchRunIfPossible(run);

  assert.equal(resumed, true);
  assert.equal(run.status, 'queued');
  assert.equal(run.lastBatchStatus, 'resumed_after_limit');
  assert.equal(run.finishedAt, null);
  assert.equal(run.nextRetryAt instanceof Date, true);
});

test('search-run worker nao repassa requiredChannels legado para motor HBX', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'queued',
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetQuantity: 5,
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  service.processNextQueuedSearchRun = async () => undefined;
  let receivedRequiredChannels: string[] = [];
  service.searchHbxEngine = async (input: any) => {
    receivedRequiredChannels = [...(input.requiredChannels || [])];
    return {
      results: [],
      status: 'completed',
      message: null,
      urlsDiscovered: 0,
      pagesFetched: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      httpStatus: 200,
    };
  };

  await service.startSearchRunForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    engine: 'hbx',
    targetType: 'pj',
    quantity: 5,
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
  });

  const savedMetrics = JSON.parse(String((run as any).metricsJson || '{}'));
  assert.deepEqual(savedMetrics.channelFilters.requiredChannels, ['instagram']);
  assert.equal(savedMetrics.channelFilters.channelMatchMode, 'all_required');

  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };
  await service.processSearchRun(run.id, createUser(), undefined, lease);

  assert.deepEqual(receivedRequiredChannels, []);
});

test('Radar Direct mantem filtros sociais no backend antes de chamar searchContactsForUser', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  let receivedInput: Record<string, any> | null = null;
  service.searchContactsForUser = async (_user: any, input: Record<string, any>) => {
    receivedInput = input;
    return {
      results: [],
      meta: {
        source: 'hbx',
        fetchedCount: 0,
        status: 'completed',
        message: null,
      },
    };
  };
  service.applyRadarWhatsappCheck = async (_context: any, items: any[]) => ({ items, meta: { checked: false } });
  service.canUseRadarSmartLeadFields = async () => true;

  const filters = service.normalizeRadarFilters({
    city: 'São Paulo',
    state: 'SP',
    segment: 'farmacia',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'any_required',
  });

  await service.searchRadarDirectForUser(createUser(), filters, 'test');

  assert.deepEqual(receivedInput?.requiredChannels, ['instagram']);
  assert.equal(receivedInput?.channelMatchMode, 'any_required');
});

test('mapHbxContactResult aceita card social-first quando canal social e obrigatorio', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'São Paulo',
    state: 'SP',
    segment: 'farmacia',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'any_required',
  });

  const mapped = service.mapHbxContactResult({
    name: 'Farmácia Social São Paulo',
    phone: '',
    phoneDigits: '',
    instagramUrl: 'https://instagram.com/farmaciasocial',
    source: 'hbx_scraping:social_discovery',
    score: 70,
  }, normalized);
  const quality = service.getCandidateQuality(mapped, normalized);

  assert.ok(mapped);
  assert.equal(mapped.phoneDigits, '');
  assert.equal(mapped.instagramUrl, 'https://instagram.com/farmaciasocial');
  assert.equal(service.isApprovedLeadQuality(quality), true);
});

test('mapHbxContactResult aceita card social-first na busca padrao sem filtro', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'lanchonete',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const mapped = service.mapHbxContactResult({
    name: 'Lanchonete Social Campinas',
    phone: '',
    phoneDigits: '',
    instagramUrl: 'https://instagram.com/lanchonetesocialcampinas',
    source: 'hbx_scraping:social_discovery',
    score: 70,
  }, normalized);
  const quality = service.getCandidateQuality(mapped, normalized);

  assert.ok(mapped);
  assert.equal(mapped.phoneDigits, '');
  assert.equal(mapped.instagramUrl, 'https://instagram.com/lanchonetesocialcampinas');
  assert.equal(service.isApprovedLeadQuality(quality), true);
});

test('mapHbxContactResult mapeia rede social vinda de sourceUrl generico', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Campinas',
    state: 'SP',
    segment: 'beleza',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'any_required',
  });

  const mapped = service.mapHbxContactResult({
    name: 'Studio Bonita Campinas',
    phone: '',
    phoneDigits: '',
    sourceUrl: 'https://www.instagram.com/studiobonitacampinas/?hl=pt-br',
    source: 'hbx_scraping:social_discovery',
    score: 70,
  }, normalized);

  assert.ok(mapped);
  assert.equal(mapped.instagramUrl, 'https://www.instagram.com/studiobonitacampinas');
  assert.equal(String(mapped.placeId).startsWith('hbx:pj:social:'), true);
});

test('mapHbxContactResult preserva contrato de enriquecimento vindo do HBX engine', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const mapped = service.mapHbxContactResult({
    name: 'Barbearia X',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    instagramUrl: 'https://instagram.com/barbeariaxrioclaro',
    socialStatus: 'found',
    socialConfidence: 78,
    email: 'agenda@barbeariax.com.br',
    emailStatus: 'confirmed',
    enrichmentJson: {
      social: {
        instagramUrl: {
          query: 'site:instagram.com "Barbearia X" "Rio Claro"',
          score: 78,
        },
      },
    },
    source: 'hbx_scraping:free_pj',
    score: 80,
  }, normalized);

  assert.ok(mapped);
  assert.equal(mapped.socialStatus, 'found');
  assert.equal(mapped.socialConfidence, 78);
  assert.equal(mapped.emailStatus, 'confirmed');
  assert.equal((mapped.enrichmentJson as any).social.instagramUrl.score, 78);
});

test('processSearchRun nao enfileira lookup social automatico na busca primaria', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () =>
    createResponse(200, {
      results: [{
        name: 'Barbearia X',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        city: 'Rio Claro',
        state: 'SP',
        source: 'hbx_scraping:free_pj',
        socialStatus: 'missing',
        score: 90,
      }],
    }) as any) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 10,
  });
  const service = new WebscrapingService(prisma) as any;
  disableSearchRunAutoPump(service);
  let enqueued = false;
  service.enqueueRadarSocialLookupForSavedLeads = (context: any, runId: string, input: any, leadIds: string[]) => {
    enqueued = true;
  };

  try {
    await service.processSearchRun(run.id, createUser(), undefined, {
      engineId: 'hbx-engine-1',
      engineIndex: 0,
      url: 'http://engine-1',
      lockedUntil: new Date(Date.now() + 60_000),
      googleEmergencyMode: false,
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'found');
    assert.equal(enqueued, false);
    assert.equal(JSON.parse(items[0].rawJson).socialStatus, 'pending');
    assert.notEqual(run.status, 'failed');
  } finally {
    global.fetch = previousFetch;
  }
});

test('runRadarSocialLookupForSavedLead acha Instagram por marca e cidade no handle', async () => {
  const previousFetch = global.fetch;
  const bodies: any[] = [];
  global.fetch = (async (_url: any, init?: any) => {
    const body = JSON.parse(String(init?.body || '{}'));
    bodies.push(body);
    return createResponse(200, {
      results: body.query === 'site:instagram.com "Alugtec" "Rio Claro"'
        ? [{
            name: 'ALUGTEC (@alugtecrioclaro) - Rio Claro, SP',
            title: 'ALUGTEC (@alugtecrioclaro) - Rio Claro, SP - Instagram',
            instagramUrl: 'https://www.instagram.com/alugtecrioclaro/',
            city: 'Rio Claro',
            state: 'SP',
            source: 'hbx_scraping:social_discovery',
          }]
        : [],
    }) as any;
  }) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'aluguel de equipamentos',
    targetQuantity: 1,
  });
  items.push({
    id: 'item-1',
    runId: run.id,
    companyId: 7,
    placeId: 'hbx:pj:1935312615',
    name: 'Alugtec Rental Pemt Ltda',
    phone: '(19) 3531-2615',
    phoneDigits: '1935312615',
    website: null,
    websiteKey: null,
    address: 'Rio Claro, SP',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'aluguel de equipamentos',
    source: 'hbx',
    status: 'found',
    duplicateReason: null,
    rawJson: JSON.stringify({ name: 'Alugtec Rental Pemt Ltda', phone: '(19) 3531-2615', phoneDigits: '1935312615', socialStatus: 'pending' }),
    createdAt: new Date(),
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'aluguel de equipamentos',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  try {
    const result = await service.runRadarSocialLookupForSavedLead({ companyId: 7, userId: 9, user: createUser() }, 'item-1', normalized);
    const raw = JSON.parse(items[0].rawJson);

    assert.equal(bodies.some((body) => body.query === '"Alugtec" "Rio Claro" instagram'), true);
    assert.equal(bodies.some((body) => body.query === '"1935312615" instagram'), true);
    assert.equal(bodies.some((body) => body.query === 'site:instagram.com "Alugtec" "Rio Claro"'), true);
    assert.equal(bodies.some((body) => body.query === 'site:instagram.com "Alugtec Rental Pemt Ltda" "Rio Claro"'), true);
    assert.equal(result.status, 'partial');
    assert.equal(raw.instagramUrl, 'https://www.instagram.com/alugtecrioclaro');
    assert.equal(raw.socialStatus, 'partial');
    assert.equal(raw.socialConfidence >= 75, true);
  } finally {
    global.fetch = previousFetch;
  }
});

test('runRadarSocialLookupForSavedLead usa nome e cidade e atualiza Instagram confiavel', async () => {
  const previousFetch = global.fetch;
  const bodies: any[] = [];
  global.fetch = (async (_url: any, init?: any) => {
    const body = JSON.parse(String(init?.body || '{}'));
    bodies.push(body);
    return createResponse(200, {
      results: body.query === 'site:instagram.com "Barbearia X" "Rio Claro"'
        ? [{
            name: 'Barbearia X Rio Claro',
            instagramUrl: 'https://www.instagram.com/barbeariaxrioclaro/',
            city: 'Rio Claro',
            state: 'SP',
            source: 'hbx_scraping:social_discovery',
          }]
        : [],
    }) as any;
  }) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 1,
  });
  items.push({
    id: 'item-1',
    runId: run.id,
    companyId: 7,
    placeId: 'hbx:pj:19999990001',
    name: 'Barbearia X',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: null,
    websiteKey: null,
    address: 'Rio Claro, SP',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx',
    status: 'found',
    duplicateReason: null,
    rawJson: JSON.stringify({ name: 'Barbearia X', phone: '(19) 99999-0001', phoneDigits: '19999990001', socialStatus: 'pending' }),
    createdAt: new Date(),
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  try {
    const result = await service.runRadarSocialLookupForSavedLead({ companyId: 7, userId: 9, user: createUser() }, 'item-1', normalized);
    const raw = JSON.parse(items[0].rawJson);

    assert.equal(bodies.some((body) => body.query === '"Barbearia X" "Rio Claro" instagram'), true);
    assert.equal(bodies.some((body) => body.query === 'site:instagram.com "Barbearia X" "Rio Claro"'), true);
    assert.equal(bodies.some((body) => body.query === '"19999990001" instagram'), true);
    assert.equal(bodies.some((body) => String(body.query || '').includes('barbearias')), true);
    assert.equal(result.status, 'partial');
    assert.equal(raw.instagramUrl, 'https://www.instagram.com/barbeariaxrioclaro');
    assert.equal(raw.socialStatus, 'partial');
    assert.equal(raw.socialConfidence >= 75, true);
    assert.match(String(raw.enrichmentJson || ''), /instagramUrl/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('runRadarSocialLookupForSavedLead nao salva resultado social generico', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () =>
    createResponse(200, {
      results: [{
        name: 'Hashtag Barbearia',
        instagramUrl: 'https://www.instagram.com/explore/tags/barbearia/',
        city: 'Rio Claro',
        state: 'SP',
        source: 'hbx_scraping:social_discovery',
      }],
    }) as any) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 1,
  });
  items.push({
    id: 'item-1',
    runId: run.id,
    companyId: 7,
    placeId: 'hbx:pj:19999990001',
    name: 'Barbearia X',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: null,
    websiteKey: null,
    address: 'Rio Claro, SP',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx',
    status: 'found',
    duplicateReason: null,
    rawJson: JSON.stringify({ name: 'Barbearia X', phone: '(19) 99999-0001', phoneDigits: '19999990001', socialStatus: 'pending' }),
    createdAt: new Date(),
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  try {
    await service.runRadarSocialLookupForSavedLead({ companyId: 7, userId: 9, user: createUser() }, 'item-1', normalized);
    const raw = JSON.parse(items[0].rawJson);

    assert.equal(raw.instagramUrl, null);
    assert.equal(raw.facebookUrl, null);
    assert.equal(raw.socialStatus, 'missing');
    assert.equal(items[0].status, 'found');
  } finally {
    global.fetch = previousFetch;
  }
});

test('runRadarSocialLookupForSavedLead falha sem bloquear nem falhar o card', async () => {
  const previousFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error('motor ocupado');
  }) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 1,
  });
  items.push({
    id: 'item-1',
    runId: run.id,
    companyId: 7,
    placeId: 'hbx:pj:19999990001',
    name: 'Barbearia X',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: null,
    websiteKey: null,
    address: 'Rio Claro, SP',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx',
    status: 'found',
    duplicateReason: null,
    rawJson: JSON.stringify({
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      instagramUrl: 'instagram.com/accounts/login',
      socialStatus: 'pending',
    }),
    createdAt: new Date(),
  });
  const service = new WebscrapingService(prisma) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  try {
    const result = await service.runRadarSocialLookupForSavedLead({ companyId: 7, userId: 9, user: createUser() }, 'item-1', normalized);
    const raw = JSON.parse(items[0].rawJson);

    assert.equal(result.status, 'error');
    assert.equal(raw.socialStatus, 'error');
    assert.equal(raw.deliveryStatus, 'deliverable');
    assert.equal(raw.instagramUrl, 'instagram.com/accounts/login');
    assert.equal(items[0].status, 'found');
    assert.equal(run.status, 'running');
  } finally {
    global.fetch = previousFetch;
  }
});

test('Radar bloqueia requiredChannels na entrega apenas em any_required/all_required', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const base = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
    preferredChannels: ['whatsapp'],
  });
  const lead = {
    name: 'Pizzaria Sem Wpp Confirmado',
    phone: '(19) 3333-4444',
    phoneDigits: '1933334444',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzaria',
    whatsappStatus: 'unverified',
  };

  assert.equal(service.isListDeliverableCard(lead, base), true);
  assert.equal(service.isListDeliverableCard(lead, { ...base, requiredChannels: ['whatsapp'], channelMatchMode: 'prefer' }), true);
  assert.equal(service.isListDeliverableCard(lead, { ...base, requiredChannels: ['whatsapp'], channelMatchMode: 'any_required' }), false);
});

test('Radar stage policy deixa social falhar sem bloquear entrega', () => {
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'social', code: 'social_lookup_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'post_delivery_update', code: 'post_delivery_update_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'presentation', code: 'presentation_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'enrichment', code: 'enrichment_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'email', code: 'email_enrichment_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'whatsapp', code: 'whatsapp_check_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'site', code: 'site_enrichment_failed' }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'provider_secondary', code: 'secondary_provider_failed', blocksDelivery: true }), false);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'quality_gate', code: 'quality_below_minimum' }), true);
  assert.equal(shouldRadarIssueBlockDelivery({ stage: 'persistence', code: 'persistence_failed' }), true);
});

test('Radar entrega card qualificado mesmo com socialStatus error, candidate_review ou partial', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const response = service.buildSearchResponse(input, ['error', 'candidate_review', 'partial'].map((socialStatus, index) => ({
      placeId: `hbx:pj:1999999000${index}`,
      name: `Pizzaria Social ${socialStatus}`,
      phone: `(19) 99999-000${index}`,
      phoneDigits: `1999999000${index}`,
      city: 'Rio Claro',
      state: 'SP',
      segment: 'pizzarias',
      socialStatus,
      deliveryStatus: 'deliverable',
      leadStatus: 'qualified',
      source: 'hbx_scraping:free_pj',
      score: 82,
    })), {
    historyId: null,
    source: 'hbx',
    reusedCount: 0,
    fetchedCount: 3,
    technicalCacheUsed: false,
    technicalCacheReusedCount: 0,
    technicalCacheValidUntil: null,
  });

  assert.equal(response.results.length, 3);
  assert.deepEqual(response.results.map((item: any) => item.socialStatus), ['error', 'candidate_review', 'partial']);
  assert.equal(response.results.every((item: any) => item.leadStatus === 'qualified'), true);
  assert.equal(response.results.every((item: any) => item.deliveryStatus === 'deliverable'), true);
  assert.equal(response.meta.deliveredCount, 3);
});

test('Radar Quality Gate separa qualidade minima de enriquecimento social', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });
  const leadSemSocial = {
    name: 'Pizzaria Avenida',
    phone: '(19) 3333-4444',
    phoneDigits: '1933334444',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    socialStatus: 'missing',
    score: 60,
  };
  const gate = service.getRadarQualityGate().evaluate({
    candidate: leadSemSocial,
    filters: input,
    quality: service.getCandidateQuality(leadSemSocial, input),
    qualityV2: service.getCandidateQualityV2(leadSemSocial, input),
    host: service.buildRadarQualityGateHost(),
  });

  assert.equal(gate.deliverable, true);
  assert.equal(gate.blocksDelivery, false);
  assert.equal(gate.qualityDecision, 'deliver_with_pending_enrichment');
  assert.equal(gate.weakSignals.includes('social_missing'), true);
  assert.equal(gate.positiveSignals.includes('phone_valid'), true);
  assert.equal(gate.missing.includes('minimum_contact'), false);
  assert.equal(service.isListDeliverableCard(leadSemSocial, input), true);
});

test('Radar Quality Gate permite telefone valido com social pendente ou erro', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  for (const socialStatus of ['pending', 'searching', 'missing', 'weak', 'candidate_review', 'error']) {
    const lead = {
      name: `Pizzaria Canal ${socialStatus}`,
      phone: '(19) 3333-4444',
      phoneDigits: '1933334444',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'pizzarias',
      socialStatus,
      score: 72,
    };
    const gate = service.getRadarQualityGate().evaluate({
      candidate: lead,
      filters: input,
      quality: service.getCandidateQuality(lead, input),
      qualityV2: service.getCandidateQualityV2(lead, input),
      host: service.buildRadarQualityGateHost(),
    });

    assert.equal(gate.deliverable, true, socialStatus);
    assert.equal(gate.blocksDelivery, false, socialStatus);
    assert.equal(gate.qualityDecision, 'deliver_with_pending_enrichment', socialStatus);
    assert.equal(gate.hardBlockers.length, 0, socialStatus);
  }
});

test('Radar Quality Gate 2.0 entrega lead forte com sinais positivos', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });
  const lead = {
    name: 'Pizzaria Avenida',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    website: 'https://pizzariaavenida.com.br',
    instagramUrl: 'https://instagram.com/pizzariaavenida',
    socialStatus: 'found',
    email: 'contato@pizzariaavenida.com.br',
    emailStatus: 'confirmed',
    whatsappStatus: 'confirmed',
    address: 'Rua Um, 123 - Rio Claro',
    sourceEngines: ['hbx_engine', 'website_crawl_light'],
    score: 88,
  };
  const gate = service.getRadarQualityGate().evaluate({
    candidate: lead,
    filters: input,
    quality: service.getCandidateQuality(lead, input),
    qualityV2: service.getCandidateQualityV2(lead, input),
    host: service.buildRadarQualityGateHost(),
  });

  assert.equal(gate.deliverable, true);
  assert.equal(gate.qualityDecision, 'deliver');
  assert.equal(gate.positiveSignals.includes('whatsapp_confirmed'), true);
  assert.equal(gate.positiveSignals.includes('social_confirmed'), true);
  assert.equal(gate.positiveSignals.includes('multi_source_evidence'), true);
  assert.equal(gate.hardBlockers.length, 0);
});

test('Radar Quality Gate 2.0 bloqueia telefone invalido quando canal principal exige telefone', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });
  const filters = { ...input, requiredChannels: ['whatsapp'] };
  const lead = {
    name: 'Pizzaria Telefone Ruim',
    phone: '123',
    phoneDigits: '123',
    website: 'https://pizzariatelefoneruim.com.br',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    score: 80,
  };
  const gate = service.getRadarQualityGate().evaluate({
    candidate: lead,
    filters,
    quality: service.getCandidateQuality(lead, filters),
    qualityV2: service.getCandidateQualityV2(lead, filters),
    host: service.buildRadarQualityGateHost(),
  });

  assert.equal(gate.deliverable, false);
  assert.equal(gate.blocksDelivery, true);
  assert.equal(gate.qualityDecision, 'reject');
  assert.equal(gate.hardBlockers.includes('invalid_primary_phone'), true);
});

test('Radar Quality Gate 2.0 sinaliza review quando revisao manual e explicita', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });
  const lead = {
    name: 'Pizzaria Revisao',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    score: 80,
    manualReviewRequired: true,
  };
  const gate = service.getRadarQualityGate().evaluate({
    candidate: lead,
    filters: input,
    quality: service.getCandidateQuality(lead, input),
    qualityV2: service.getCandidateQualityV2(lead, input),
    host: service.buildRadarQualityGateHost(),
  });

  assert.equal(gate.deliverable, false);
  assert.equal(gate.qualityDecision, 'review');
  assert.equal(gate.hardBlockers.includes('manual_review_required'), true);
});

test('Radar Quality Gate bloqueia falta de contato minimo e diretorio generico', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  assert.equal(service.isListDeliverableCard({
    name: 'Pizzaria Sem Canal',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    socialStatus: 'missing',
    score: 80,
  }, input), false);

  assert.equal(service.isListDeliverableCard({
    name: 'Pizzarias em Rio Claro',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'pizzarias',
    score: 90,
  }, input), false);
});

test('Radar social nao acessa Vendas diretamente', () => {
  const socialDir = join(process.cwd(), 'src/webscraping/radar/04-socials');
  const lookup = readFileSync(join(socialDir, 'radar-social-lookup.service.ts'), 'utf8');
  const writer = readFileSync(join(socialDir, 'radar-social-result-writer.service.ts'), 'utf8');

  assert.equal(/vendasLead|vendasLeadTimelineEvent|syncToVendasLead/.test(lookup), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|syncToVendasLead/.test(writer), false);
});

test('Radar nao bloqueia DDD diferente quando cidade esta dentro do raio', async () => {
  const saved: any[] = [];
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        saved.push(data);
        return { id: 'lead-ddd', ...data };
      },
      update: async ({ data }: any) => ({ id: 'lead-ddd', ...data }),
    },
  })) as any;
  const input = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'oficina',
    radiusKm: 100,
    quantity: 1,
    engine: 'hbx',
    targetType: 'pj',
  });

  const counts = await service.persistRadarLeadPoolBatch(input, [{
    placeId: 'ddd:nearby',
    name: 'Auto Center Sao Carlos',
    phone: '(16) 3333-4444',
    phoneDigits: '1633334444',
    city: 'São Carlos',
    state: 'SP',
    segment: 'auto center',
    rating: null,
    reviews: 0,
    address: 'São Carlos, SP',
    website: null,
    source: 'hbx_scraping:free_pj',
  }], 'hbx');

  assert.equal(counts.approvedCount, 1);
  assert.equal(saved[0].status, 'clean');
  assert.equal(saved[0].rejectionReason, null);
});

test('Radar duplicate forte por telefone bloqueia item repetido', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const dedup = {
    rows: [],
    placeIds: new Set<string>(),
    phoneDigits: new Set<string>(['19999990001']),
    websiteKeys: new Set<string>(),
    compositeKeys: new Set<string>(),
  };
  const classified = service.classifyRunItem({
    name: 'Pizzaria Duplicada',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: null,
  }, dedup, { runId: 'run-dup', index: 0, city: 'Rio Claro', state: 'SP', segment: 'pizzaria' });

  assert.equal(classified.status, 'duplicate');
  assert.match(classified.duplicateReason, /Telefone repetido/i);
});

test('LIMPEZA-DESTRUTIVA L1: Radar search-run em andamento NUNCA autoimporta para Vendas (USERMASTER incluso) e sempre enche a vitrine', async () => {
  const run = {
    id: 'run-live-import',
    companyId: 7,
    userId: 9,
    status: 'running',
    city: 'Aguas da Prata',
    state: 'SP',
    segment: 'barbearias',
    engine: 'hbx',
    targetType: 'pj',
    targetQuantity: 20,
    foundCount: 1,
    importedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    attemptCount: 3,
    metricsJson: '{}',
    nextRetryAt: null,
    errorMessage: null,
    items: [{
      id: 'item-live-import',
      status: 'found',
      name: 'Barbearia Real',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      website: null,
      city: 'Aguas da Prata',
      state: 'SP',
      segment: 'barbearias',
      source: 'hbx',
      rawJson: JSON.stringify({
        name: 'Barbearia Real',
        phone: '(19) 99999-0001',
        phoneDigits: '19999990001',
        city: 'Aguas da Prata',
        state: 'SP',
        segment: 'barbearias',
      }),
    }],
  };
  const service = new WebscrapingService(createPrisma({
    webscrapingSearchRun: {
      findFirst: async () => run,
    },
  })) as any;
  let syncToPoolCalls = 0;
  let markRadarDeliveredCalls = 0;
  service.syncRadarSearchRunItemsToPool = async () => { syncToPoolCalls += 1; };
  service.markRadarDelivered = async () => { markRadarDeliveredCalls += 1; return []; };
  service.findRadarPoolRowsForRunItems = async () => [];
  service.canUseRadarSmartLeadFields = async () => false;
  service.applyRadarWhatsappCheck = async (_context: any, items: any[]) => ({ items, meta: { mode: 'off' } });

  // Usuário USERMASTER (o papel do dono) — o caso que sempre escapou do refab por papel.
  const usermaster = { ...createUser(), role: 'USERMASTER' };
  const response = await service.buildRadarSearchRunResponse(usermaster, run.id);

  // Vitrine sempre enchida (skipClaim morreu — o método nem aceita mais essa opção).
  assert.ok(syncToPoolCalls >= 1);
  // Funil NUNCA reivindicado automaticamente pelo run, nem pra USERMASTER.
  assert.equal(markRadarDeliveredCalls, 0);
  assert.equal(response.status, 'running');
  assert.equal(response.meta.autoImport.ran, false);
});

test('LIMPEZA-DESTRUTIVA L1: syncRadarSearchRunItemsToPool nao aceita mais skipClaim e nunca chama markRadarDelivered', async () => {
  const { prisma, run } = createSearchRunPrisma({
    status: 'running',
    city: 'Aguas da Prata',
    state: 'SP',
    segment: 'barbearias',
    targetQuantity: 1,
    foundCount: 0,
    importedCount: 0,
  });
  const service = new WebscrapingService(prisma) as any;
  let markRadarDeliveredCalls = 0;
  service.markRadarDelivered = async () => { markRadarDeliveredCalls += 1; return []; };
  service.persistRadarLeadPoolBatch = async () => undefined;

  // Assinatura antiga aceitava um 3º argumento { skipClaim }; hoje o método só recebe
  // (context, run) — mesmo passando um 3º argumento por engano, nada reivindica.
  await service.syncRadarSearchRunItemsToPool({ companyId: 7, userId: 9 }, run, { skipClaim: false });

  assert.equal(markRadarDeliveredCalls, 0);
  assert.equal(typeof service.shouldAutoImportRadarRunToVendas, 'undefined');
  assert.equal(typeof service.autoImportRadarSearchRunToVendas, 'undefined');
});

function normalizeQueryForTest(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const tasks: any[] = Array.isArray(initialCampaign.tasks) ? [...initialCampaign.tasks] : [];
  const coverageRows: any[] = [];

  const applyCampaignData = (data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === 'object' && 'increment' in value) {
        campaign[key] = Number(campaign[key] || 0) + Number((value as any).increment || 0);
      } else {
        campaign[key] = value;
      }
    }
    campaign.updatedAt = new Date();
    return { ...campaign, batches: [...batches], tasks: [...tasks] };
  };

  const prisma = createPrisma({
    webscrapingCampaign: {
      create: async ({ data, include }: any) => {
        Object.assign(campaign, data, { id: campaign.id, createdAt: campaign.createdAt, updatedAt: new Date() });
        return include ? { ...campaign, batches: [...batches], tasks: [...tasks] } : { ...campaign };
      },
      findUnique: async () => ({ ...campaign, batches: [...batches], tasks: [...tasks] }),
      findFirst: async () => ({ ...campaign, batches: [...batches], tasks: [...tasks] }),
      findMany: async () => [{ ...campaign, batches: [...batches], tasks: [...tasks] }],
      update: async ({ data }: any) => applyCampaignData(data),
      updateMany: async ({ data }: any) => {
        applyCampaignData(data);
        return { count: 1 };
      },
    },
    webscrapingCampaignBatch: {
      findFirst: async () => null,
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
    webscrapingCampaignTask: {
      groupBy: async ({ where }: any) => {
        const filtered = tasks.filter((task) => !where?.campaignId || task.campaignId === where.campaignId);
        const counts = new Map<string, number>();
        for (const task of filtered) counts.set(task.status, (counts.get(task.status) || 0) + 1);
        return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
      },
      findFirst: async (input?: any) => {
        const where = input?.where || {};
        const rows = tasks.filter((task) =>
          (!where.campaignId || task.campaignId === where.campaignId) &&
          (!where.state || task.state === where.state) &&
          (!where.city || task.city === where.city) &&
          (!where.segment || task.segment === where.segment) &&
          (!where.targetType || task.targetType === where.targetType) &&
          (!where.status || task.status === where.status),
        );
        return rows[0] || null;
      },
      findMany: async (input?: any) => {
        const where = input?.where || {};
        return tasks.filter((task) =>
          (!where.campaignId || task.campaignId === where.campaignId) &&
          (!where.status || task.status === where.status || (Array.isArray(where.status?.in) && where.status.in.includes(task.status))),
        );
      },
      findUnique: async ({ where }: any) => tasks.find((task) => task.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const task = tasks.find((item) => item.id === where.id);
        if (task) Object.assign(task, data, { updatedAt: new Date() });
        return task;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const task of tasks) {
          if (where?.id && task.id !== where.id) continue;
          if (where?.campaignId && task.campaignId !== where.campaignId) continue;
          if (where?.status && task.status !== where.status) continue;
          Object.assign(task, data, { updatedAt: new Date() });
          count += 1;
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where?.campaignId_state_city_segment_targetType;
        const existing = tasks.find((task) =>
          task.campaignId === key?.campaignId &&
          task.state === key?.state &&
          task.city === key?.city &&
          task.segment === key?.segment &&
          task.targetType === key?.targetType,
        );
        if (existing) {
          Object.assign(existing, update || {}, { updatedAt: new Date() });
          return existing;
        }
        const task = {
          id: `task-${tasks.length + 1}`,
          status: 'queued',
          attemptCount: 0,
          foundCount: 0,
          duplicateCount: 0,
          rejectedCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        tasks.push(task);
        return task;
      },
    },
    radarLeadPool: {
      count: async (input?: any) => {
        const where = input?.where || {};
        if (where.normalizedCity || where.normalizedSegment || where.state) {
          return leads.filter((lead) =>
            (!where.normalizedCity || lead.normalizedCity === where.normalizedCity) &&
            (!where.normalizedSegment || lead.normalizedSegment === where.normalizedSegment) &&
            (!where.state || lead.state === where.state)).length;
        }
        return leads.length;
      },
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
      findUnique: async (input?: any) => {
        const where = input?.where || {};
        return leads.find((lead) => (
          (where.id && lead.id === where.id) ||
          (where.placeId && lead.placeId === where.placeId)
        )) || null;
      },
      findFirst: async (input?: any) => {
        const where = input?.where || {};
        if (where.normalizedCity || where.normalizedSegment || where.state) {
          return leads.find((lead) =>
            (!where.normalizedCity || lead.normalizedCity === where.normalizedCity) &&
            (!where.normalizedSegment || lead.normalizedSegment === where.normalizedSegment) &&
            (!where.state || lead.state === where.state)) || null;
        }
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
    // SPRINT 4 MOTOR-RFB-FILA: plano de cobertura durável lido por getRadarCoverageForCombo no
    // ranking de candidatos autônomos. Sem registro prévio == combo nunca coberto (findUnique null),
    // mesma semântica de banco vazio; upsert guardado pra quem quiser inspecionar gravação em teste.
    radarCoverage: {
      findUnique: async ({ where }: any) => {
        const key = where?.state_city_segment_targetType;
        return coverageRows.find((row) =>
          row.state === key?.state &&
          row.city === key?.city &&
          row.segment === key?.segment &&
          row.targetType === key?.targetType) || null;
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where?.state_city_segment_targetType;
        const existing = coverageRows.find((row) =>
          row.state === key?.state &&
          row.city === key?.city &&
          row.segment === key?.segment &&
          row.targetType === key?.targetType);
        if (existing) {
          Object.assign(existing, update || {}, { updatedAt: new Date() });
          return existing;
        }
        const row = { createdAt: new Date(), updatedAt: new Date(), ...create };
        coverageRows.push(row);
        return row;
      },
    },
  });

  return { prisma, campaign, batches, leads, tasks, coverageRows };
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
  // PINA o papel: este teste cobre o comportamento de PRODUÇÃO (VPS), onde fonte paga é permitida
  // via governor. Sem pinar, a trava Lei nº1 (HBX_ROLE ausente/local ⇒ pago recusado) muda o resultado
  // conforme o ambiente. O cenário local é coberto pelo teste irmão da trava logo abaixo.
  const previousRole = process.env.HBX_ROLE;
  process.env.HBX_ROLE = 'vps';
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
    if (previousRole === undefined) delete process.env.HBX_ROLE;
    else process.env.HBX_ROLE = previousRole;
  }
});

test('TRAVA LEI Nº1: mesmo cenário com HBX_ROLE=local → Google Places RECUSADO sem chamada paga', async () => {
  // Teste irmão do de cima: idêntico, só muda o papel. No localhost do dono a fonte paga NUNCA
  // dispara — a trava física (role-guard) recusa ANTES de qualquer fetch cobrado. Trava o
  // comportamento nos DOIS mundos: vps=permite (acima), local=recusa (aqui).
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const previousRole = process.env.HBX_ROLE;
  process.env.HBX_ROLE = 'local';
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const paidFetchCalls: string[] = [];
  const previousFetch = global.fetch;
  global.fetch = (async (input: any) => {
    const url = String(input);
    if (url.includes('googleapis.com')) paidFetchCalls.push(url);
    return createResponse(200, { places: [] }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    await assert.rejects(
      () => service.searchContactsForUser(createUser(), {
        city: 'Sao Paulo - SP',
        segment: 'Clinicas',
        quantity: 5,
        onlyWithWebsite: true,
      }),
      (error: any) => {
        assert.equal(Number(error?.status), 503, 'trava deve surfar como ServiceUnavailable (503)');
        assert.match(String(error?.message || ''), /governor por fonte/i);
        return true;
      },
    );
    assert.equal(paidFetchCalls.length, 0, 'NENHUMA chamada paga pode sair no papel local (R$0)');
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousRole === undefined) delete process.env.HBX_ROLE;
    else process.env.HBX_ROLE = previousRole;
  }
});

test('Google e bloqueado para finalidade automatica e cai para HBX', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  delete process.env.GOOGLE_PLACES_API_KEY;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';

  const fetchCalls: string[] = [];
  const previousFetch = global.fetch;
  global.fetch = (async (input: any) => {
    fetchCalls.push(String(input));
    return createResponse(200, {
      results: [
        {
          name: 'Loja Autonoma',
          phone: '(19) 99999-3333',
          phoneDigits: '19999993333',
          source: 'hbx_scraping:web',
        },
      ],
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(
      createUser(),
      {
        city: 'Campinas - SP',
        segment: 'Lojas',
        engine: 'google',
        targetType: 'pj',
        quantity: 10,
      },
      {
        purpose: 'mass_data',
        skipRadarLookup: true,
        skipRadarPersist: true,
        skipPrivateHistory: true,
        skipTechnicalCache: true,
        recordUsage: false,
      },
    );

    assert.equal(response.query.engine, 'hbx');
    assert.equal(response.results[0].name, 'Loja Autonoma');
    assert.equal(fetchCalls.some((url) => url.includes('googleapis.com')), false);
    assert.equal(fetchCalls.some((url) => url.includes('/search')), true);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('Google e permitido quando radar pull manual pede engine google', async () => {
  const previousGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  // comportamento de PRODUÇÃO (VPS): pago permitido via governor — pinar papel (trava Lei nº1).
  const previousRole = process.env.HBX_ROLE;
  process.env.HBX_ROLE = 'vps';
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const fetchCalls: string[] = [];
  const previousFetch = global.fetch;
  global.fetch = (async (input: any) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url.includes('places:searchText')) {
      return createResponse(200, {
        places: [{ id: 'place-google-1', displayName: { text: 'Clinica Manual' } }],
      }) as any;
    }
    return createResponse(200, {
      displayName: { text: 'Clinica Manual' },
      internationalPhoneNumber: '+55 11 97777-1111',
      nationalPhoneNumber: '(11) 97777-1111',
      websiteUri: 'https://manual.example.com',
      formattedAddress: 'Rua Manual, 10',
      rating: 4.5,
      userRatingCount: 22,
    }) as any;
  }) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.searchContactsForUser(
      createUser(),
      {
        city: 'Sao Paulo',
        state: 'SP',
        segment: 'Clinicas',
        engine: 'google',
        targetType: 'pj',
        quantity: 5,
      },
      {
        purpose: 'radar_pull',
        skipRadarLookup: true,
        skipRadarPersist: true,
        skipPrivateHistory: true,
        skipTechnicalCache: true,
        recordUsage: false,
      },
    );

    assert.equal(response.query.engine, 'google');
    assert.equal(response.meta.source, 'google');
    assert.equal(response.results[0].name, 'Clinica Manual');
    assert.equal(fetchCalls.some((url) => url.includes('googleapis.com')), true);
  } finally {
    global.fetch = previousFetch;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = previousGoogleKey;
    if (previousRole === undefined) delete process.env.HBX_ROLE;
    else process.env.HBX_ROLE = previousRole;
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
        isActive: true,
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
        isActive: true,
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
  // pina papel de PRODUÇÃO: o que este teste cobre é a QUOTA COMERCIAL bloqueando — sem pinar,
  // a trava Lei nº1 (papel local) poderia bloquear antes e o teste passaria pelo motivo errado.
  const previousRole = process.env.HBX_ROLE;
  process.env.HBX_ROLE = 'vps';
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
        isActive: true,
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
    if (previousRole === undefined) delete process.env.HBX_ROLE;
    else process.env.HBX_ROLE = previousRole;
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
  // comportamento de PRODUÇÃO (VPS): pago permitido via governor — pinar papel (trava Lei nº1).
  const previousRole = process.env.HBX_ROLE;
  process.env.HBX_ROLE = 'vps';
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
    if (previousRole === undefined) delete process.env.HBX_ROLE;
    else process.env.HBX_ROLE = previousRole;
  }
});

test.skip('engine hbx chama motor local e aceita agenda_pf sem segmento', async () => {
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
          phone: '(19) 98765-4321',
          phoneDigits: '19987654321',
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

    assert.ok(calls.length >= 1);
    assert.equal(calls[0].url, 'http://localhost:8001/search');
    assert.equal(calls[0].body.city, 'Limeira');
    assert.equal(calls[0].body.state, 'SP');
    assert.equal(calls[0].body.segment, '');
    assert.equal(calls[0].body.targetType, 'agenda_pf');
    assert.equal(calls[0].body.limit, 100);
    assert.equal(calls[0].body.quantity, 100);
    assert.equal(calls[0].body.fresh, false);
    assert.equal(calls[0].body.freshness, 'hybrid');
    assert.deepEqual(calls[0].body.preferredChannels, []);
    assert.deepEqual(calls[0].body.requiredChannels, []);
    assert.equal(calls[0].body.channelMatchMode, 'prefer');
    assert.equal(response.query.engine, 'hbx');
    assert.equal(response.query.targetType, 'agenda_pf');
    assert.equal(response.query.quantity, 100);
    assert.equal(response.meta.source, 'hbx');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Contato Limeira');
    assert.equal(response.results[0].phoneDigits, '19987654321');
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

test('radar_pull hbx coloca motor com falha em cooldown e tenta outro', async () => {
  const previousAttempts = process.env.HBX_RADAR_PULL_ENGINE_ATTEMPTS;
  process.env.HBX_RADAR_PULL_ENGINE_ATTEMPTS = '2';

  const previousFetch = global.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  global.fetch = (async (input: any, init?: any) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')),
    });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 503,
        text: async () => 'engine warming up',
        json: async () => ({}),
      } as any;
    }
    return createResponse(200, {
      results: [
        {
          name: 'Oficina Reserva',
          phone: '(19) 98888-7777',
          phoneDigits: '19988887777',
          source: 'hbx_scraping:web',
          score: 82,
        },
      ],
    }) as any;
  }) as any;

  const acquired: string[] = [];
  const markedCooldown: string[] = [];
  const released: string[] = [];
  const fakePool = {
    acquireEngine: async (_runId: string, _companyId: number, _userId: number, options?: any) => {
      const next = acquired.length === 0
        ? { engineId: 'hbx-engine-1', engineIndex: 0, url: 'http://engine-1', lockedUntil: new Date(), googleEmergencyMode: false }
        : { engineId: 'hbx-engine-2', engineIndex: 1, url: 'http://engine-2', lockedUntil: new Date(), googleEmergencyMode: false };
      assert.notEqual(options?.purpose, 'mass_data');
      acquired.push(next.engineId);
      return next;
    },
    markEngineBatchError: async (engineId: string) => {
      markedCooldown.push(engineId);
    },
    releaseEngine: async (engineId: string) => {
      released.push(engineId);
    },
  };
  const prisma = createPrisma({
    hbxEngineLock: {
      updateMany: async () => ({ count: 1 }),
    },
  });
  const service = new WebscrapingService(prisma, fakePool as any);

  try {
    const response = await service.searchContactsForUser(
      createUser(),
      {
        city: 'Campinas',
        state: 'SP',
        segment: 'oficina mecanica',
        engine: 'hbx',
        targetType: 'pj',
        quantity: 10,
      },
      {
        skipRadarLookup: true,
        skipPrivateHistory: true,
        skipTechnicalCache: true,
        skipRadarPersist: true,
        recordUsage: false,
        purpose: 'radar_pull',
      },
    );

    assert.deepEqual(acquired, ['hbx-engine-1', 'hbx-engine-2']);
    assert.deepEqual(markedCooldown, ['hbx-engine-1']);
    assert.deepEqual(released, ['hbx-engine-1', 'hbx-engine-2']);
    assert.equal(calls[0].url, 'http://engine-1/search');
    assert.equal(calls[1].url, 'http://engine-2/search');
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].name, 'Oficina Reserva');
  } finally {
    global.fetch = previousFetch;
    if (previousAttempts === undefined) delete process.env.HBX_RADAR_PULL_ENGINE_ATTEMPTS;
    else process.env.HBX_RADAR_PULL_ENGINE_ATTEMPTS = previousAttempts;
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
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

test('search-run hbx encerra entrega parcial perto da meta quando lotes ficam estagnados', async () => {
  const previousFetch = global.fetch;
  const previousBatchLimit = process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
  const previousMaxAttempts = process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
  const previousMaxEmpty = process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES;
  const previousMaxStalled = process.env.HBX_SEARCH_RUN_MAX_STALLED_PARTIAL_BATCHES;
  process.env.HBX_SEARCH_RUN_BATCH_LIMIT = '10';
  process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = '200';
  process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES = '120';
  process.env.HBX_SEARCH_RUN_MAX_STALLED_PARTIAL_BATCHES = '5';

  global.fetch = (async () =>
    createResponse(200, {
      results: [],
    }) as any) as any;

  const { prisma, run, items } = createSearchRunPrisma({
    targetQuantity: 30,
    foundCount: 29,
    attemptCount: 4,
    consecutiveEmptyBatchCount: 4,
    segment: 'oficina, auto center, funilaria, pneus, borracharia',
    metricsJson: JSON.stringify({ radiusKm: 100 }),
  });
  for (let index = 0; index < 29; index += 1) {
    items.push({
      id: `prefill-${index + 1}`,
      runId: 'run-1',
      companyId: 7,
      userId: 9,
      status: 'found',
      placeId: `prefill-${index + 1}`,
      name: `Oficina ${index + 1}`,
      phone: `(19) 99999-${String(index + 1).padStart(4, '0')}`,
      phoneDigits: `1999999${String(index + 1).padStart(4, '0')}`,
      city: 'Campinas',
      state: 'SP',
      segment: 'oficina',
      source: 'hbx_scraping:web',
    });
  }
  const service = new WebscrapingService(prisma);
  disableSearchRunAutoPump(service);
  (service as any).supportsHistoryPersistence = async () => false;
  const lease = {
    engineId: 'hbx-engine-1',
    engineIndex: 0,
    url: 'http://engine-1',
    lockedUntil: new Date(Date.now() + 60_000),
    googleEmergencyMode: false,
  };

  try {
    await (service as any).processSearchRun('run-1', createUser(), undefined, lease);

    assert.equal(run.attemptCount, 5);
    assert.equal(run.consecutiveEmptyBatchCount, 5);
    assert.equal(run.status, 'completed_insufficient_results');
    assert.match(String(run.errorMessage || ''), /Entreguei 29 de 30 card\(s\); faltou 1/i);
    assert.doesNotMatch(String(run.errorMessage || ''), /cidade|cidades/i);
  } finally {
    global.fetch = previousFetch;
    if (previousBatchLimit === undefined) delete process.env.HBX_SEARCH_RUN_BATCH_LIMIT;
    else process.env.HBX_SEARCH_RUN_BATCH_LIMIT = previousBatchLimit;
    if (previousMaxAttempts === undefined) delete process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS;
    else process.env.HBX_SEARCH_RUN_MAX_ATTEMPTS = previousMaxAttempts;
    if (previousMaxEmpty === undefined) delete process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES;
    else process.env.HBX_SEARCH_RUN_MAX_EMPTY_BATCHES = previousMaxEmpty;
    if (previousMaxStalled === undefined) delete process.env.HBX_SEARCH_RUN_MAX_STALLED_PARTIAL_BATCHES;
    else process.env.HBX_SEARCH_RUN_MAX_STALLED_PARTIAL_BATCHES = previousMaxStalled;
  }
});

test('listagem radar tolera engine=hbx sem quebrar', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-engine-hbx',
    name: 'Loja Radar',
    phone: '(19) 99999-4444',
    phoneDigits: '19999994444',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'clean',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new WebscrapingService(prisma);

  const response = await service.listRadarLeadsForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    engine: 'hbx',
    limit: 20,
  });

  assert.equal(response.total, 1);
  assert.equal(response.items[0].name, 'Loja Radar');
});

// ─── VENDAS-REFAB S3 — "Total no Brasil"/"Leads na base (Radar)" tem que vir da base 28M
// (CnpjPublicCompany), nao do pool local (RadarLeadPool, ~893 no ambiente do dono). Estes testes
// prova a composicao: scope=vitrine chama CnpjBaseQueryService.countBase com o filtro ativo
// (cidade/UF/segmento) e devolve o resultado em meta.baseTotal/baseAvailable — nunca inventa
// numero fixo (o mock devolve um N arbitrario so pra provar que o dado vem de la).
test('listRadarLeadsForUser (vitrine): meta.baseTotal vem do count() da base 28M filtrado, nao do pool', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-vitrine-1',
    name: 'Loja Vitrine',
    phone: '(19) 99999-4444',
    phoneDigits: '19999994444',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'clean',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new WebscrapingService(prisma);
  let capturedInput: any = null;
  (service as any).cnpjBaseQuery = {
    countBase: async (input: any) => {
      capturedInput = input;
      return { available: true, count: 6068 };
    },
  };

  const response = await service.listRadarLeadsForUser(createUser(), {
    scope: 'vitrine',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    engine: 'hbx',
    limit: 20,
  });

  assert.equal(response.meta.baseAvailable, true);
  assert.equal(response.meta.baseTotal, 6068);
  // A prova de que NAO é o pool: o pool só tem 1 lead, mas baseTotal veio do mock (6068).
  assert.notEqual(response.meta.baseTotal, response.meta.totalAvailable);
  assert.deepEqual(capturedInput.cities, ['Campinas']);
  assert.deepEqual(capturedInput.states, ['SP']);
});

test('listRadarLeadsForUser (sem vitrine): NAO consulta a base 28M (só a tela Leads/vendedor pede vitrine)', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  let called = false;
  (service as any).cnpjBaseQuery = {
    countBase: async () => { called = true; return { available: true, count: 999 }; },
  };

  const response = await service.listRadarLeadsForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    engine: 'hbx',
    limit: 20,
  });

  assert.equal(called, false);
  assert.equal(response.meta.baseAvailable, false);
  assert.equal(response.meta.baseTotal, null);
});

test('listRadarLeadsForUser (vitrine): base 28M indisponivel no ambiente -> baseAvailable false, sem lancar', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  (service as any).cnpjBaseQuery = {
    countBase: async () => ({ available: false, count: null }),
  };

  const response = await service.listRadarLeadsForUser(createUser(), {
    scope: 'vitrine',
    engine: 'hbx',
    limit: 20,
  });

  assert.equal(response.meta.baseAvailable, false);
  assert.equal(response.meta.baseTotal, null);
  assert.equal(response.meta.available, true);
});

test('listRadarLeadsForUser (vitrine): sem CnpjBaseQueryService injetado -> degrade gracioso (nunca lanca)', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  // cnpjBaseQuery fica undefined (nao injetado) — simula ambiente/boot sem o provider.

  const response = await service.listRadarLeadsForUser(createUser(), {
    scope: 'vitrine',
    engine: 'hbx',
    limit: 20,
  });

  assert.equal(response.meta.baseAvailable, false);
  assert.equal(response.meta.baseTotal, null);
});

// ─── LIMPEZA-DESTRUTIVA L3 (04/07) — mata a bifurcação de papel na visibilidade/posse de card
// do Radar. Vitrine e funil são a MESMA lagoa da empresa pra todo papel; assignedUserId vira só
// informativo ("Responsável" = quem puxou), nunca filtro de visibilidade nem trava de claim.
test('LIMPEZA-DESTRUTIVA L3: listRadarLeadsForUser (funil, sem vitrine) devolve o MESMO conjunto de cards pra DOIS vendedores diferentes da mesma empresa', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-mine',
    name: 'Loja Puxada Por Mim',
    phone: '(19) 99999-1111',
    phoneDigits: '19999991111',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'reserved',
    createdAt: new Date(),
    updatedAt: new Date(),
    companyStates: [{ status: 'reserved', assignedUserId: 101, assignedByUserId: 101, assignedAt: new Date() }],
  });
  leads.push({
    id: 'lead-colega',
    name: 'Loja Puxada Pelo Colega',
    phone: '(19) 99999-2222',
    phoneDigits: '19999992222',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'reserved',
    createdAt: new Date(),
    updatedAt: new Date(),
    companyStates: [{ status: 'reserved', assignedUserId: 202, assignedByUserId: 202, assignedAt: new Date() }],
  });
  const service = new WebscrapingService(prisma);

  const sellerA = { id: 101, companyId: 7, role: 'USER', masterContext: { active: false } };
  const sellerB = { id: 202, companyId: 7, role: 'USER', masterContext: { active: false } };

  const inputFunil = { city: 'Campinas', state: 'SP', segment: 'Lojas', engine: 'hbx', limit: 20 };
  const responseA = await service.listRadarLeadsForUser(sellerA, inputFunil);
  const responseB = await service.listRadarLeadsForUser(sellerB, inputFunil);

  // Antes do L3: sellerA só via lead-mine (assignedUserId=101) e sellerB só via lead-colega.
  // Depois do L3: os dois veem a MESMA lagoa da empresa — os 2 cards, pra ambos os papéis.
  assert.equal(responseA.total, 2);
  assert.equal(responseB.total, 2);
  const namesA = responseA.items.map((item: any) => item.name).sort();
  const namesB = responseB.items.map((item: any) => item.name).sort();
  assert.deepEqual(namesA, ['Loja Puxada Por Mim', 'Loja Puxada Pelo Colega'].sort());
  assert.deepEqual(namesB, namesA);
});

test('LIMPEZA-DESTRUTIVA L3: vendedor consegue ver/agir num card cujo "Responsável" (assignedUserId) é OUTRO colega — sem NotFound', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-do-colega',
    name: 'Empresa Do Colega',
    phone: '(19) 99999-3333',
    phoneDigits: '19999993333',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    status: 'reserved',
    contactedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    companyStates: [{ status: 'reserved', assignedUserId: 101, assignedByUserId: 101, contactedCount: 0 }],
    events: [],
  });
  const service = new WebscrapingService(prisma) as any;

  const sellerB = { id: 202, companyId: 7, role: 'USER', masterContext: { active: false } };

  // Antes do L3: addRadarLeadEventForUser (via assertRadarLeadVisibleForUser) e
  // getRadarLeadForUser lançavam NotFoundException pro vendedor B, porque o card
  // estava "assignedUserId=101" (vendedor A). Agora é lagoa única — B pode agir.
  const result = await service.addRadarLeadEventForUser(sellerB, 'lead-do-colega', {
    eventType: 'contacted',
    note: 'Liguei e conversamos.',
  });

  assert.equal(result.item.name, 'Empresa Do Colega');

  // getRadarLeadForUser (chamado no fim de addRadarLeadEventForUser) também não bloqueia mais.
  const detail = await service.getRadarLeadForUser(sellerB, 'lead-do-colega');
  assert.equal(detail.item.name, 'Empresa Do Colega');
});

test('LIMPEZA-DESTRUTIVA L3: pullRadarLeadsForUser grava assignedUserId (Responsável) pra QUALQUER papel que puxa, não só vendedor', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-pull-admin',
    name: 'Loja Puxada Pelo Admin',
    phone: '(19) 99999-4444',
    phoneDigits: '19999994444',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'clean',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new WebscrapingService(prisma);
  const capturedUpserts: any[] = [];
  (service as any).prisma.radarLeadCompanyState.upsert = async ({ create }: any) => {
    capturedUpserts.push(create);
    return create;
  };
  // claimRadarLeadForCompany (ownership habilitado) precisa de updateMany no
  // radarLeadPool — createCampaignPrisma não tem esse método mockado.
  (service as any).prisma.radarLeadPool.updateMany = async () => ({ count: 1 });

  // createUser() = ADMIN (role ADMIN) — antes do L3, markRadarDelivered só gravava
  // assignedUserId quando isCompanySellerUser(user) era true, então admin puxando
  // pra si mesmo gravava assignedUserId=null (perdia o "Responsável").
  const response = await service.pullRadarLeadsForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    targetType: 'pj',
    quantity: 5,
    minimumStock: 1,
  }) as any;

  assert.equal(response.items.length, 1);
  assert.ok(capturedUpserts.length >= 1);
  assert.ok(capturedUpserts.every((row) => row.assignedUserId === 9));
});

// ─── VENDAS-REFAB item 4 (04/07) — queryCnpjBaseForUser: filtro AVANÇADO do "Buscar empresas"
// sobre a base 28M, aberto a admin OU vendedor (self-serve puro, item 5) — nao só ao Master.
test('queryCnpjBaseForUser: delega pro CnpjBaseQueryService.query com o input recebido', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  let capturedInput: any = null;
  (service as any).cnpjBaseQuery = {
    query: async (input: any) => {
      capturedInput = input;
      return { count: 1, sample: [{ cnpj: '123' }], cursorNext: null, statsAmostra: {} };
    },
  };

  const result = await service.queryCnpjBaseForUser(createUser(), {
    cities: ['Campinas'],
    states: ['SP'],
    donoConhecido: true,
    matrizFilial: ['matriz', 'filial'],
  } as any);

  assert.equal(result.count, 1);
  assert.deepEqual(capturedInput.cities, ['Campinas']);
  assert.equal(capturedInput.donoConhecido, true);
  assert.deepEqual(capturedInput.matrizFilial, ['matriz', 'filial']);
});

test('queryCnpjBaseForUser: vendedor (role USER da empresa) tambem pode chamar — self-serve puro, nao so ADMIN/Master', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  (service as any).cnpjBaseQuery = {
    query: async () => ({ count: 0, sample: [], cursorNext: null, statsAmostra: {} }),
  };
  const seller = { id: 42, companyId: 7, role: 'USER', masterContext: { active: false } };

  const result = await service.queryCnpjBaseForUser(seller, {});
  assert.equal(result.count, 0);
});

test('queryCnpjBaseForUser: sem CnpjBaseQueryService injetado -> ServiceUnavailableException (nunca inventa resultado)', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  // cnpjBaseQuery fica undefined — ambiente/boot sem o provider.
  await assert.rejects(() => service.queryCnpjBaseForUser(createUser(), {}));
});

test('queryCnpjBaseForUser: usuario sem empresa/id -> ForbiddenException (resolveContext)', async () => {
  const { prisma } = createCampaignPrisma();
  const service = new WebscrapingService(prisma);
  (service as any).cnpjBaseQuery = { query: async () => ({ count: 0 }) };
  await assert.rejects(() => service.queryCnpjBaseForUser({ id: 0, companyId: 0 }, {}));
});

test('pullRadarLeadsForUser entrega banco quando reposicao do motor falha', async () => {
  const { prisma, leads } = createCampaignPrisma();
  leads.push({
    id: 'lead-bank-1',
    name: 'Loja Banco',
    phone: '(19) 99999-4444',
    phoneDigits: '19999994444',
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    normalizedCity: 'campinas',
    normalizedSegment: 'lojas',
    status: 'clean',
    metadataJson: JSON.stringify({ targetType: 'pj' }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new WebscrapingService(prisma);
  (service as any).replenishRadarStockForUser = async () => {
    throw new Error('engine timeout');
  };

  const response = await service.pullRadarLeadsForUser(createUser(), {
    city: 'Campinas',
    state: 'SP',
    segment: 'Lojas',
    targetType: 'pj',
    quantity: 5,
    minimumStock: 2,
  }) as any;

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].name, 'Loja Banco');
  assert.equal(response.meta.deliveredCount, 1);
  assert.equal(response.meta.replenish.ran, true);
  assert.match(response.meta.replenish.errorMessage, /Motores em aquecimento\/cooldown/);
});

test('pullRadarLeadsForUser pesquisa direto quando banco radar nao esta disponivel', async () => {
  const previousFetch = global.fetch;
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';
  global.fetch = (async () =>
    createResponse(200, {
      results: [
        {
          name: 'Academia Direta',
          phone: '(11) 99999-1111',
          phoneDigits: '11999991111',
          source: 'hbx_scraping:free_pj',
          score: 84,
        },
      ],
    }) as any) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.pullRadarLeadsForUser(createUser(), {
      city: 'São Paulo',
      state: 'SP',
      segment: 'academia',
      targetType: 'pj',
      engine: 'hbx',
      quantity: 100,
    });

    assert.equal(response.items.length, 1);
    assert.equal(response.items[0].name, 'Academia Direta');
    assert.equal(response.items[0].city, 'São Paulo');
    assert.equal(response.items[0].ownershipStatus, 'available');
    assert.equal(response.code, 'RADAR_DIRECT_RESULTS');
    assert.equal(response.meta.direct.ran, true);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});

test('pullRadarLeadsForUser nao transforma resultado insuficiente em erro', async () => {
  const previousFetch = global.fetch;
  const previousEngineUrl = process.env.HBX_SCRAPING_ENGINE_URL;
  process.env.HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';
  global.fetch = (async () => createResponse(200, { results: [] }) as any) as any;

  const service = new WebscrapingService(createPrisma());

  try {
    const response = await service.pullRadarLeadsForUser(createUser(), {
      city: 'Americana',
      state: 'SP',
      segment: 'açougue',
      targetType: 'pj',
      engine: 'hbx',
      quantity: 100,
    });

    assert.equal(response.items.length, 0);
    assert.equal(response.code, 'RADAR_NO_RESULTS');
    assert.equal(response.retryable, false);
    assert.match(response.message, /Pesquisa concluida/);
  } finally {
    global.fetch = previousFetch;
    if (previousEngineUrl === undefined) delete process.env.HBX_SCRAPING_ENGINE_URL;
    else process.env.HBX_SCRAPING_ENGINE_URL = previousEngineUrl;
  }
});
