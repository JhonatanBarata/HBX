import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';

const baseInput: any = {
  city: 'Curitiba',
  state: 'PR',
  segment: 'clinicas',
  radiusKm: 0,
  originLat: null,
  originLng: null,
  regionalCities: [],
  quantity: 20,
  engine: 'hbx',
  targetType: 'pj',
  filters: { minRating: null, minReviews: null, onlyWithWebsite: false },
  filtersJson: '{}',
  searchSignature: 'smoke:hbx:pj:20',
  cacheSignature: 'smoke:hbx:pj:20',
  normalizedCity: 'curitiba',
  normalizedSegment: 'clinicas',
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

function buildHbxCards(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    placeId: `hbx:${index + 1}`,
    name: `Clinica Operacional ${index + 1}`,
    phone: `(41) 99${String(index + 1).padStart(3, '0')}-00${String(index + 1).padStart(2, '0')}`,
    phoneDigits: `4199${String(index + 1).padStart(7, '0')}`.slice(0, 11),
    city: 'Curitiba',
    state: 'PR',
    segment: 'clinicas',
    website: `https://clinica-${index + 1}.com.br`,
    source: 'hbx_engine',
    sourceEngine: 'hbx_engine',
    score: 72,
    socialStatus: index % 2 === 0 ? 'pending' : 'error',
    enrichmentStatus: 'partial',
  }));
}

const qualityHost = {
  isGenericDirectoryName: () => false,
  nameConflictsWithRequestedSegment: () => false,
  hasUsablePublicContactChannel: (candidate: Record<string, any>) => Boolean(candidate.phoneDigits || candidate.phone || candidate.website || candidate.email),
  isBlockedLeadOfficialWebsite: () => false,
};

function createPostDeliveryPrismaMock() {
  const updates: any[] = [];
  const timelineEvents: any[] = [];
  return {
    updates,
    timelineEvents,
    radarLeadCompanyState: {
      findUnique: async () => ({ vendasLeadId: 'vendas-1' }),
    },
    vendasLead: {
      findUnique: async () => ({
        id: 'vendas-1',
        email: null,
        website: null,
        address: null,
        rating: null,
        reviews: 0,
        shortNote: null,
        nextAction: null,
      }),
      update: async (input: any) => {
        updates.push(input);
        return { id: input.where.id, ...input.data };
      },
    },
    vendasLeadTimelineEvent: {
      findMany: async (input: any) => timelineEvents
        .filter((event) => event.leadId === input.where.leadId && event.sourceType === input.where.sourceType)
        .filter((event) => {
          if (input.where.eventType?.in) return input.where.eventType.in.includes(event.eventType);
          if (input.where.eventType) return event.eventType === input.where.eventType;
          return true;
        })
        .filter((event) => input.where.resultLabel ? event.resultLabel === input.where.resultLabel : true)
        .map((event) => ({ eventType: event.eventType })),
      createMany: async (input: any) => {
        timelineEvents.push(...input.data);
        return { count: input.data.length };
      },
      create: async (input: any) => {
        timelineEvents.push(input.data);
        return input.data;
      },
    },
  };
}

test('smoke Radar entrega 20 cards PJ do HBX como qualificados', () => {
  const gate = new RadarQualityGateService();
  const orchestrator = new RadarDeliveryOrchestratorService(new RadarPostDeliveryUpdateService());
  const cards = buildHbxCards(20);
  const quality = cards.map((card) => gate.evaluate({
    candidate: card,
    filters: baseInput,
    host: qualityHost,
  }));
  const delivered = cards.map((card, index) => orchestrator.buildDeliveredState({
    lead: card,
    vendasLeadId: `vendas-${index + 1}`,
    now: '2026-05-31T12:00:00.000Z',
  }));

  assert.equal(cards.length, 20);
  assert.equal(cards.every((card) => card.source === 'hbx_engine'), true);
  assert.equal(quality.every((result) => result.deliverable && result.blocksDelivery === false), true);
  assert.equal(delivered.every((state) => state.snapshot.leadStatus === 'qualified'), true);
  assert.equal(delivered.every((state) => state.snapshot.deliveryStatus === 'delivered'), true);
});

test('smoke social pending ou error nao bloqueia delivery', () => {
  const orchestrator = new RadarDeliveryOrchestratorService(new RadarPostDeliveryUpdateService());
  const pending = orchestrator.buildDeliveredState({
    lead: { id: 'radar-1', name: 'Clinica Real', socialStatus: 'pending' },
    vendasLeadId: 'vendas-1',
    now: '2026-05-31T12:00:00.000Z',
  });
  const failed = orchestrator.markPostDeliveryFailure({
    metadata: pending.metadataPatch,
    enrichment: pending.enrichmentPatch,
    stage: 'social',
    error: new Error('social indisponivel'),
    now: '2026-05-31T12:05:00.000Z',
  });

  assert.equal(pending.snapshot.deliveryStatus, 'delivered');
  assert.equal(failed.metadata.deliveryStatus, 'delivered');
  assert.equal(failed.metadata.socialStatus, 'error');
  assert.equal(failed.metadata.radarStageIssues.at(-1).blocksDelivery, false);
});

test('smoke CNPJ local e vertical falham como fontes opcionais', async () => withEnv({
  HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
  HBX_RADAR_LOCAL_DIRECTORIES_ENABLED: 'true',
  HBX_RADAR_VERTICAL_SOURCES_ENABLED: 'true',
}, async () => {
  const throwingProvider = { search: async () => { throw new Error('fonte fora do ar'); } } as any;
  const results = await Promise.all([
    new RadarCnpjPublicSourceService(throwingProvider).run({ normalized: baseInput, limit: 1 }),
    new RadarLocalDirectorySourceService(throwingProvider).run({ normalized: baseInput, limit: 1 }),
    new RadarVerticalSourceService(throwingProvider).run({ normalized: baseInput, limit: 1 }),
  ]);

  assert.deepEqual(results.map((result) => result.status), ['partial_error', 'partial_error', 'partial_error']);
  assert.equal(results.every((result) => result.retryable), true);
  assert.equal(results.every((result) => result.issue?.blocksDelivery === false), true);
}));

test('smoke Vendas recebe card entregue', () => {
  const orchestrator = new RadarDeliveryOrchestratorService(new RadarPostDeliveryUpdateService());
  const state = orchestrator.buildDeliveredState({
    lead: { id: 'radar-1', name: 'Clinica Real' },
    vendasLeadId: 'vendas-1',
    now: '2026-05-31T12:00:00.000Z',
  });

  assert.equal(state.metadataPatch.vendasLeadId, 'vendas-1');
  assert.equal(state.metadataPatch.deliveryStatus, 'delivered');
  assert.equal(state.metadataPatch.postDeliveryUpdate.status, 'scheduled');
});

test('smoke post-delivery update nao duplica evento de timeline', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const prisma = createPostDeliveryPrismaMock();
  const input = {
    prisma,
    context: { companyId: 7, userId: 9, user: {} } as any,
    row: { id: 'radar-1', companyStates: [{ vendasLeadId: 'vendas-1' }] },
    data: {
      website: 'https://clinica-real.com.br',
      email: 'contato@clinica-real.com.br',
      whatsappStatus: 'probable',
      opportunityReason: 'Atendimento digital pode melhorar.',
    },
  };

  await service.syncAfterRadarEnrichment(input);
  const firstCount = prisma.timelineEvents.length;
  await service.syncAfterRadarEnrichment(input);
  const eventTypes = prisma.timelineEvents.map((event) => event.eventType);

  assert.equal(firstCount > 0, true);
  assert.equal(prisma.timelineEvents.length, firstCount);
  assert.equal(new Set(eventTypes).size, eventTypes.length);
});

test('smoke WhatsApp confirmed vem de WebWhats ou confirmado ja persistido, nao do website crawl', () => {
  const merger = new RadarResultMergerService();
  const unsafe = merger.mergeSources([
    {
      source: 'hbx_engine',
      results: [{ placeId: 'hbx:1', name: 'Clinica Real', phone: '41999999999', phoneDigits: '41999999999' } as any],
    },
    {
      source: 'website_crawl_light',
      results: [{ placeId: 'site:1', name: 'Clinica Real', phone: '41999999999', phoneDigits: '41999999999', whatsappStatus: 'confirmed' } as any],
    },
  ]).results[0] as any;
  const webwhats = merger.mergeSources([
    {
      source: 'hbx_engine',
      results: [{ placeId: 'hbx:2', name: 'Clinica Dois', phone: '41999999998', phoneDigits: '41999999998' } as any],
    },
    {
      source: 'webwhats_check',
      results: [{ placeId: 'webwhats:2', name: 'Clinica Dois', phone: '41999999998', phoneDigits: '41999999998', whatsappStatus: 'confirmed' } as any],
    },
  ]).results[0] as any;
  const persisted = merger.mergeSources([
    {
      source: 'radar_database',
      results: [{ placeId: 'radar:3', name: 'Clinica Tres', phone: '41999999997', phoneDigits: '41999999997', whatsappStatus: 'confirmed' } as any],
    },
    {
      source: 'website_crawl_light',
      results: [{ placeId: 'site:3', name: 'Clinica Tres', phone: '41999999997', phoneDigits: '41999999997', whatsappStatus: 'confirmed' } as any],
    },
  ]).results[0] as any;

  assert.equal(unsafe.whatsappStatus, 'unverified');
  assert.equal(webwhats.whatsappStatus, 'confirmed');
  assert.equal(persisted.whatsappStatus, 'confirmed');
});

test('smoke enriquecimento nao altera importedCount', () => {
  const postDeliverySource = readFileSync(join(process.cwd(), 'src/webscraping/radar/05-delivery/radar-post-delivery-update.service.ts'), 'utf8');
  const vendasUpdateSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/05-delivery/radar-post-delivery-vendas-update.service.ts'), 'utf8');
  const enrichmentPipelineSource = readFileSync(join(process.cwd(), 'src/webscraping/radar/03-enrichment/radar-enrichment-job-pipeline.service.ts'), 'utf8');

  assert.equal(/importedCount/.test(postDeliverySource), false);
  assert.equal(/importedCount/.test(vendasUpdateSource), false);
  assert.equal(/importedCount/.test(enrichmentPipelineSource), false);
});
