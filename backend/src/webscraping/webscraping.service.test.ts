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

test('normalizeOperationalConfigInput preserves midnight start and end hours', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const normalized = service.normalizeOperationalConfigInput({
    startHour: 0,
    startMinute: 15,
    endHour: 0,
    endMinute: 45,
  });

  assert.equal(normalized.startHour, 0);
  assert.equal(normalized.startMinute, 15);
  assert.equal(normalized.endHour, 0);
  assert.equal(normalized.endMinute, 45);
  assert.equal(service.formatTimeLabel(0, 0), '00:00');
});

test('normalizeOperationalConfigInput preserves existing schedule on partial update', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const normalized = service.normalizeOperationalConfigInput(
    { startHour: 19, startMinute: 30 },
    {
      enabled: true,
      preset: 'turbo_noturno',
      startHour: 20,
      startMinute: 0,
      endHour: 9,
      endMinute: 15,
      engineCount: 4,
      intensity: 'normal',
      memoryTargetGb: 24,
      batchSize: 12,
      maxAttemptsPerTask: 4,
      engineUrlsJson: '[]',
      metadataJson: '{"weekendAlwaysOn":true,"factoryMaxEngines":3}',
    },
  );

  assert.equal(normalized.startHour, 19);
  assert.equal(normalized.startMinute, 30);
  assert.equal(normalized.endHour, 9);
  assert.equal(normalized.endMinute, 15);
  assert.equal(normalized.engineCount, 4);
  assert.equal(normalized.weekendAlwaysOn, true);
  assert.equal(normalized.factoryMaxEngines, 4);
});

test('mass data guided city has enough independent segments for one hundred engines', () => {
  const service = new WebscrapingService(createPrisma()) as any;

  const segments = service.getMassDataSegments('empresas');

  assert.ok(segments.length >= 100);
  assert.equal(segments[0], 'empresas');
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

test('saveSearchRunResults salva baixa aderencia como skipped e entrega so aprovado', async () => {
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
  const skipped = items.find((item) => item.status === 'skipped');

  assert.equal(counts.found, 1);
  assert.equal(counts.skipped, 1);
  assert.equal(run.foundCount, 1);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].name, 'Auto Mecânica São José');
  assert.ok(skipped);
  assert.equal(skipped.segment, null);
  assert.equal(JSON.parse(skipped.rawJson).quality.status, 'segment_mismatch');
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

test('buildHbxBatchQueries nao usa rede social como fonte primaria quando canal foi pedido', () => {
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

  assert.equal(queries.some((query) => /\binstagram\b/i.test(query)), false);
  assert.equal(queries.some((query) => /\bfacebook\b/i.test(query)), false);
});

test('buildSearchRunResponse items preserva campos sociais do rawJson', () => {
  const { run, items } = createSearchRunPrisma({
    foundCount: 1,
    targetQuantity: 1,
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
  assert.equal(item.recommendedChannel, 'whatsapp');
  assert.equal(item.opportunityScore, 82);
  assert.equal(item.enrichmentScore, 77);
  assert.equal(item.qualityV2?.channelAvailability?.instagram, true);
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

test('isRunItemQualityDeliverable rejeita item sem Instagram quando filtro exige Instagram', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram'],
    channelMatchMode: 'all_required',
    qualityMode: 'list',
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

  assert.equal(service.isRunItemQualityDeliverable(item, input), false);
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
    qualityMode: 'list',
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

test('isRunItemQualityDeliverable aceita Facebook quando Instagram e Facebook exigem rede social', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const input = {
    city: 'Campinas',
    state: 'SP',
    segment: 'barbearia',
    targetType: 'pj',
    requiredChannels: ['instagram', 'facebook'],
    channelMatchMode: 'all_required',
    qualityMode: 'list',
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

test('buildHbxBatchAttemptTask percorre cidade, segmento e variacao em ordem', () => {
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
  assert.equal(sixth.input.segment, 'açougues');
  assert.equal(seventh.input.segment, 'alimentos naturais');
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
  });

  return { prisma, campaign, batches, leads, tasks };
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

test('campanha massa de dados reabastece fila autonoma quando a fila manual termina', async () => {
  const { prisma, campaign, tasks, leads } = createCampaignPrisma({
    mode: 'mass_data',
    status: 'running',
    city: '',
    state: 'AC',
    segment: 'segmentos internos',
    targetType: 'pj',
    targetTotal: 0,
    batchSize: 20,
    maxAttempts: 3,
  });
  tasks.push({
    id: 'task-manual-1',
    campaignId: 'campaign-1',
    state: 'AC',
    city: 'Rio Branco',
    segment: 'empresas',
    targetType: 'pj',
    query: 'empresas Rio Branco AC telefone',
    status: 'completed',
    attemptCount: 1,
    maxAttempts: 3,
    foundCount: 2,
    duplicateCount: 0,
    rejectedCount: 0,
    createdAt: new Date('2026-05-06T12:00:00.000Z'),
    updatedAt: new Date('2026-05-06T12:05:00.000Z'),
  });
  leads.push({
    id: 'lead-covered-1',
    name: 'Loja ja puxada',
    normalizedCity: 'campinas',
    state: 'SP',
    normalizedSegment: 'servicos',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new WebscrapingService(prisma) as any;
  service.getOperationalConfig = async () => ({
    autonomousFillEnabled: true,
    autonomousFillBatchSize: 3,
  });
  service.loadBrazilianCities = async () => ['Rio Branco - AC', 'Campinas - SP', 'Curitiba - PR'];

  await service.refreshMassDataCampaignState('campaign-1');

  const queuedTasks = tasks.filter((task) => task.status === 'queued');
  assert.equal(campaign.status, 'running');
  assert.equal(queuedTasks.length, 3);
  assert.match(String(campaign.lastErrorMessage || ''), /autônoma reabastecida/i);
  assert.equal(queuedTasks.some((task) =>
    task.city === 'Rio Branco' &&
    task.state === 'AC' &&
    task.segment === 'empresas' &&
    task.targetType === 'pj'), false);
  assert.equal(queuedTasks.some((task) =>
    task.city === 'Campinas' &&
    task.state === 'SP' &&
    task.segment === 'serviços'), false);
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
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
