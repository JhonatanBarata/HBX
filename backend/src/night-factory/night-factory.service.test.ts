import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightFactoryController } from './night-factory.controller';
import { NightFactoryPublicController } from './night-factory-public.controller';
import { NightFactoryService } from './night-factory.service';

function createLead(index: number, overridesOrIndex: Record<string, any> | number = {}) {
  const overrides: Record<string, any> = typeof overridesOrIndex === 'number' ? {} : overridesOrIndex;
  return {
    id: `lead-${index}`,
    name: `Lead ${index}`,
    phone: `1199999000${index}`,
    phoneDigits: `1199999000${index}`,
    city: 'Campinas',
    state: 'SP',
    segment: 'clinica',
    normalizedCity: 'campinas',
    normalizedSegment: 'clinica',
    opportunityScore: 95 - index,
    opportunityReason: 'Lead premium com alta intenção comercial.',
    status: 'clean',
    updatedAt: new Date(Date.now() - index * 1000),
    metadataJson: JSON.stringify({ nightFactory: { recommendedOffer: 'HBX Full' } }),
    companyId: null,
    ...overrides,
  };
}

function createUser(overrides: Record<string, any> = {}) {
  return {
    id: 9,
    companyId: 7,
    company: { id: 7, name: 'HBX' },
    masterContext: { active: false },
    ...overrides,
  };
}

test('pre-enriquecimento noturno foi removido do contrato HTTP', () => {
  const prototype = NightFactoryController.prototype as any;
  assert.equal(typeof prototype.runNow, 'undefined');
  assert.equal(typeof prototype.pause, 'undefined');
  assert.equal(typeof prototype.resume, 'undefined');
  assert.equal(typeof prototype.saveConfig, 'undefined');
});

test('status declara worker aposentado e enriquecimento somente na puxada', async () => {
  const prisma = { hasTable: async () => false } as any;
  const cnpjBaseQuery = { countBase: async () => ({ available: false, count: null }) } as any;
  const service = new NightFactoryService(prisma, cnpjBaseQuery);

  const status = await service.getStatus();

  assert.equal(status.worker.retired, true);
  assert.equal(status.worker.running, false);
  assert.equal(status.config.allowWebsiteFetch, false);
  assert.match(status.copy.subtitle, /Nenhum enriquecimento extra/i);
});

function createPrisma(options: { leads?: any[]; claims?: any[] } = {}) {
  const leads = options.leads || [];
  const claims = [...(options.claims || [])];
  const radarUpdates: any[] = [];
  const prisma: any = {
    __radarUpdates: radarUpdates,
    hasTable: async (name: string) => ['RadarLeadPool', 'NightFactoryRewardClaim'].includes(name),
    radarLeadPool: {
      update: async (args: any = {}) => {
        radarUpdates.push(args);
        return args?.data || {};
      },
      findMany: async (args: any = {}) => {
        const where = args.where || {};
        const excluded = new Set(where.id?.notIn || []);
        const included = Array.isArray(where.id?.in) ? new Set(where.id.in) : null;
        const blocked = new Set(where.status?.notIn || []);
        const minScore = Number(where.opportunityScore?.gte || 0);
        return leads
          .filter((lead) => !included || included.has(lead.id))
          .filter((lead) => !excluded.has(lead.id))
          .filter((lead) => !blocked.has(String(lead.status || '').toLowerCase()))
          .filter((lead) => Number(lead.opportunityScore || 0) >= minScore)
          .filter((lead) => String(lead.phoneDigits || lead.phone || '').replace(/\D/g, '').length >= 10)
          .sort((left, right) => Number(right.opportunityScore || 0) - Number(left.opportunityScore || 0))
          .slice(0, Number(args.take || leads.length));
      },
    },
    nightFactoryRewardClaim: {
      findFirst: async ({ where }: any) => claims
        .filter((claim) => claim.scopeKey === where.scopeKey)
        .sort((left, right) => new Date(right.claimedAt || right.createdAt || 0).getTime() - new Date(left.claimedAt || left.createdAt || 0).getTime())[0] || null,
      findMany: async (args: any = {}) => claims.filter((claim) => {
        if (args.where?.NOT?.scopeKey && claim.scopeKey === args.where.NOT.scopeKey) return false;
        return true;
      }),
      create: async ({ data }: any) => {
        const claim = { id: `claim-${claims.length + 1}`, ...data };
        claims.push(claim);
        return claim;
      },
    },
    $executeRawUnsafe: async () => null,
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
  };
  return prisma;
}

test('claim-status false quando nao ha 5 leads bons', async () => {
  const service = new NightFactoryService(createPrisma({ leads: [1, 2, 3, 4].map(createLead) })) as any;
  const status = await service.getClaimStatus(createUser());

  assert.equal(status.eligible, false);
  assert.equal(status.availableCount, 4);
  assert.equal(status.minimumRequired, 5);
});

test('claim-status true quando ha 5 leads bons e usuario ainda nao resgatou', async () => {
  const service = new NightFactoryService(createPrisma({ leads: [1, 2, 3, 4, 5].map(createLead) })) as any;
  const status = await service.getClaimStatus(createUser());

  assert.equal(status.eligible, true);
  assert.equal(status.alreadyClaimed, false);
  assert.equal(status.availableCount, 5);
});

test('redeem entrega exatamente 5 leads e grava claim diario por empresa', async () => {
  const service = new NightFactoryService(createPrisma({ leads: [1, 2, 3, 4, 5, 6].map(createLead) })) as any;
  const payload = await service.redeemReward(createUser());

  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 5);
  assert.deepEqual(payload.items.map((item: any) => item.id), ['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5']);
});

test('redeem segunda vez retorna os mesmos leads sem duplicar resgate', async () => {
  const prisma = createPrisma({ leads: [1, 2, 3, 4, 5, 6].map(createLead) });
  const service = new NightFactoryService(prisma) as any;

  const first = await service.redeemReward(createUser());
  await assert.rejects(() => service.redeemReward(createUser()), (error: any) => {
    const response = typeof error?.getResponse === 'function' ? error.getResponse() : error?.response;
    assert.equal(response?.code, 'NIGHT_FACTORY_COOLDOWN');
    return true;
  });

  const reward = await service.getMyReward(createUser());
  assert.deepEqual(reward.items.map((item: any) => item.id), first.items.map((item: any) => item.id));
});

test('claim-status false em cooldown e true depois de 24 horas', async () => {
  const now = new Date();
  const recentClaim = {
    id: 'claim-recent',
    scopeKey: 'company:7',
    leadIdsJson: JSON.stringify(['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5']),
    claimedAt: now,
    nextAvailableAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
  };
  const cooldownService = new NightFactoryService(createPrisma({
    leads: [1, 2, 3, 4, 5].map(createLead),
    claims: [recentClaim],
  })) as any;

  const cooldownStatus = await cooldownService.getClaimStatus(createUser());
  assert.equal(cooldownStatus.eligible, false);
  assert.equal(cooldownStatus.reason, 'cooldown');

  const oldClaim = {
    ...recentClaim,
    claimedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    nextAvailableAt: new Date(now.getTime() - 60 * 60 * 1000),
  };
  const availableService = new NightFactoryService(createPrisma({
    leads: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(createLead),
    claims: [oldClaim],
  })) as any;

  const availableStatus = await availableService.getClaimStatus(createUser());
  assert.equal(availableStatus.eligible, true);
  assert.equal(availableStatus.nonCumulative, true);
});

test('controller publico da promocao exige JwtAuthGuard', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, NightFactoryPublicController) || [];
  assert.equal(guards.includes(JwtAuthGuard), true);
});

test('selecao de recompensa nao chama Google', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('Google nao deve ser chamado.');
  }) as typeof fetch;
  try {
    const service = new NightFactoryService(createPrisma({ leads: [1, 2, 3, 4, 5].map(createLead) })) as any;
    await service.getClaimableOpportunitiesForUser(createUser(), 5);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('top opportunities preferem LeadQualityV2 finalRankScore quando disponivel', async () => {
  const lowRawHighRank = createLead(1, {
    id: 'lead-quality-v2',
    opportunityScore: 45,
    enrichmentJson: JSON.stringify({
      qualityV2: {
        version: 'lead-quality-v2',
        identityScore: 90,
        segmentFitScore: 90,
        contactabilityScore: 90,
        commercialIntentScore: 85,
        freshnessScore: 80,
        riskScore: 0,
        opportunityScore: 88,
        finalRankScore: 96,
        decision: 'deliver',
        reasons: ['WhatsApp provável + sem site + boa avaliação.'],
        discardReason: null,
        protectionReason: null,
        recommendedChannel: 'whatsapp',
        productFit: { listFit: 90, leadFit: 92, botFit: 60, recoveryFit: 10, websiteFit: 85 },
      },
    }),
  });
  const highRawLowRank = createLead(2, {
    id: 'lead-raw',
    opportunityScore: 95,
    enrichmentJson: JSON.stringify({
      qualityV2: {
        version: 'lead-quality-v2',
        identityScore: 70,
        segmentFitScore: 60,
        contactabilityScore: 55,
        commercialIntentScore: 50,
        freshnessScore: 70,
        riskScore: 20,
        opportunityScore: 55,
        finalRankScore: 52,
        decision: 'review',
        reasons: ['Contato pede revisão.'],
        discardReason: null,
        protectionReason: null,
        recommendedChannel: 'review',
        productFit: { listFit: 50, leadFit: 50, botFit: 40, recoveryFit: 10, websiteFit: 40 },
      },
    }),
  });
  const service = new NightFactoryService(createPrisma({ leads: [highRawLowRank, lowRawHighRank] })) as any;

  const result = await service.getTopOpportunities({ take: 2 });

  assert.equal(result.items[0].id, 'lead-quality-v2');
  assert.equal(result.items[0].score, 96);
});

// Universo do produto = RFB ativa U identidades exclusivas do motor. Os aliases exibidos ao
// cliente precisam ser o mesmo número; a contagem do pool fica somente como telemetria.
function createLeadsBankPrisma(options: {
  rows?: any[];
  activeCnpjs?: string[];
  hasRadarLeadPool?: boolean;
} = {}) {
  const rows = options.rows || [];
  const activeCnpjs = new Set(options.activeCnpjs || []);
  return {
    hasTable: async (name: string) => (name === 'RadarLeadPool' ? options.hasRadarLeadPool !== false : false),
    radarLeadPool: {
      findMany: async () => rows,
    },
    cnpjPublicCompany: {
      findMany: async ({ where }: any) => (where?.cnpj?.in || [])
        .filter((cnpj: string) => activeCnpjs.has(cnpj))
        .map((cnpj: string) => ({ cnpj })),
    },
  } as any;
}

test('getLeadsBank: Total, Disponiveis e baseTotal sao a mesma uniao deduplicada', async () => {
  const activeCnpj = '11222333000181';
  const prisma = createLeadsBankPrisma({
    activeCnpjs: [activeCnpj],
    rows: [
      { id: 'rfb-1', name: 'Ja na RFB', metadataJson: JSON.stringify({ cnpj: activeCnpj }), createdAt: new Date() },
      { id: 'web-1', name: 'Exclusiva Motor', city: 'Campinas', state: 'SP', placeId: 'place-1', createdAt: new Date() },
      { id: 'web-dup', name: 'Exclusiva Motor', city: 'Campinas', state: 'SP', placeId: 'place-1', createdAt: new Date() },
    ],
  });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: true, count: 6068 }) };
  const service = new NightFactoryService(prisma, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, true);
  assert.equal(result.total, 6069);
  assert.equal(result.universeTotal, 6069);
  assert.equal(result.availableTotal, 6069);
  assert.equal(result.baseAvailable, true);
  assert.equal(result.baseTotal, 6069);
  assert.equal(result.nationalActiveTotal, 6068);
  assert.equal(result.operationalPoolTotal, 3);
  assert.equal(result.poolExclusiveTotal, 1);
  assert.equal(result.deltaToday, 1);
});

test('getLeadsBank: RadarLeadPool ausente -> universo e a RFB ativa', async () => {
  const prisma = createLeadsBankPrisma({ hasRadarLeadPool: false });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: true, count: 6068 }) };
  const service = new NightFactoryService(prisma, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, true);
  assert.equal(result.total, 6068);
  assert.equal(result.baseAvailable, true);
  assert.equal(result.baseTotal, 6068);
  assert.equal(result.operationalPoolTotal, 0);
  assert.equal(result.poolExclusiveTotal, 0);
});

test('getLeadsBank: base RFB indisponivel -> nao inventa nem soma uma uniao inexata', async () => {
  const prisma = createLeadsBankPrisma({
    rows: [{ id: 'web-1', name: 'Exclusiva Motor', city: 'Campinas', state: 'SP', createdAt: new Date() }],
  });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: false, count: null }) };
  const service = new NightFactoryService(prisma, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, false);
  assert.equal(result.total, null);
  assert.equal(result.universeTotal, null);
  assert.equal(result.baseAvailable, false);
  assert.equal(result.baseTotal, null);
  assert.equal(result.poolExclusiveTotal, null);
});

test('getLeadsBank: lead exclusivo novo incrementa imediatamente sem esperar cache nacional', async () => {
  const rows: any[] = [];
  const prisma = createLeadsBankPrisma({ rows });
  let nationalCountReads = 0;
  const fakeCnpjBaseQuery: any = {
    countBase: async () => {
      nationalCountReads += 1;
      return { available: true, count: 6068 };
    },
  };
  const service = new NightFactoryService(prisma, fakeCnpjBaseQuery) as any;

  const before = await service.getLeadsBank();
  rows.push({ id: 'motor-new', placeId: 'place-new', name: 'Nova do Motor', city: 'Campinas', state: 'SP', createdAt: new Date() });
  const after = await service.getLeadsBank();

  assert.equal(before.universeTotal, 6068);
  assert.equal(after.universeTotal, 6069);
  assert.equal(after.availableTotal, 6069);
  assert.equal(nationalCountReads, 1);
});
