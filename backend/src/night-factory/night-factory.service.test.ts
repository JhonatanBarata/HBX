import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

function createCrawler(result: any, calls: any[] = []) {
  return {
    calls,
    crawl: async (url: string) => {
      calls.push(url);
      return result;
    },
  };
}

test('enrichLead com allowWebsiteFetch grava email confirmado, social e dor no pool', async () => {
  const lead = createLead(1, {
    id: 'lead-site',
    name: 'Clinica Horizonte',
    website: 'https://clinicahorizonte.com.br',
    websiteStatus: 'unknown',
    email: null,
  });
  const prisma = createPrisma({ leads: [lead] });
  const crawler = createCrawler({
    status: 'completed',
    reason: 'website_crawl_light_executado',
    evidence: {
      requestedUrl: 'https://clinicahorizonte.com.br',
      normalizedUrl: 'https://clinicahorizonte.com.br/',
      pages: [{ url: 'https://clinicahorizonte.com.br/', status: 'fetched', httpStatus: 200 }],
    },
    fields: {
      emails: ['contato@clinicahorizonte.com.br'],
      instagramUrls: ['https://instagram.com/clinicahorizonte'],
      facebookUrls: [],
      whatsappUrls: ['https://wa.me/5511999990001'],
      whatsappPhoneDigits: ['5511999990001'],
      contactLinks: [],
      budgetLinks: [],
      chatLinks: [],
      formLinks: [],
      hasContactForm: true,
      hasBudgetIntent: false,
    },
  });
  const service = new NightFactoryService(prisma, crawler as any) as any;
  service.emailMxCheck = async () => 'ok';

  await service.enrichLead(lead, null, { allowWebsiteFetch: true });

  assert.equal(crawler.calls.length, 1);
  const data = prisma.__radarUpdates[0]?.data || {};
  assert.equal(data.email, 'contato@clinicahorizonte.com.br');
  assert.equal(data.emailStatus, 'confirmed');
  assert.ok(Number(data.emailConfidence) >= 92);
  assert.equal(data.emailSource, 'website');
  assert.equal(data.instagramUrl, 'https://instagram.com/clinicahorizonte');
  assert.equal(data.websiteStatus, 'present');
  assert.equal(typeof data.painType, 'string');
  assert.ok(data.painType.length > 0);
  // Crawl nunca promove WhatsApp: canal recomendado não pode ser whatsapp sem Webwhats.
  assert.notEqual(data.recommendedChannel, 'whatsapp');
  const metadata = JSON.parse(data.metadataJson || '{}');
  assert.equal(metadata.nightFactory?.websiteFetch?.fetchedPages, 1);
});

test('email achado no site mas sem MX e rebaixado para invalid', async () => {
  const lead = createLead(1, {
    id: 'lead-no-mx',
    name: 'Clinica Horizonte',
    website: 'https://clinicahorizonte.com.br',
    websiteStatus: 'unknown',
    email: null,
  });
  const prisma = createPrisma({ leads: [lead] });
  const crawler = createCrawler({
    status: 'completed',
    reason: 'website_crawl_light_executado',
    evidence: {
      requestedUrl: 'https://clinicahorizonte.com.br',
      normalizedUrl: 'https://clinicahorizonte.com.br/',
      pages: [{ url: 'https://clinicahorizonte.com.br/', status: 'fetched', httpStatus: 200 }],
    },
    fields: {
      emails: ['contato@dominio-que-nao-existe-xyz.com.br'],
      instagramUrls: [],
      facebookUrls: [],
      whatsappUrls: [],
      whatsappPhoneDigits: [],
      contactLinks: [],
      budgetLinks: [],
      chatLinks: [],
      formLinks: [],
      hasContactForm: false,
      hasBudgetIntent: false,
    },
  });
  const service = new NightFactoryService(prisma, crawler as any) as any;
  service.emailMxCheck = async () => 'no_mx';

  await service.enrichLead(lead, null, { allowWebsiteFetch: true });

  const data = prisma.__radarUpdates[0]?.data || {};
  assert.equal(data.emailStatus, 'invalid');
  assert.equal(data.emailConfidence, 0);
  assert.notEqual(data.recommendedChannel, 'email');
  const metadata = JSON.parse(data.metadataJson || '{}');
  assert.equal(metadata.nightFactory?.websiteFetch?.emailMx, 'no_mx');
});

test('falha total de fetch nao rebaixa site present nem apaga email existente', async () => {
  const lead = createLead(1, {
    id: 'lead-fetch-fail',
    website: 'https://empresa.com.br',
    websiteStatus: 'present',
    email: 'dono@empresa.com.br',
    emailStatus: 'confirmed',
  });
  const prisma = createPrisma({ leads: [lead] });
  const crawler = createCrawler({
    status: 'partial_error',
    reason: 'website_crawl_fetch_failed',
    evidence: { requestedUrl: 'https://empresa.com.br', normalizedUrl: 'https://empresa.com.br/', pages: [{ url: 'https://empresa.com.br/', status: 'error' }] },
    fields: { emails: [], instagramUrls: [], facebookUrls: [], whatsappUrls: [], whatsappPhoneDigits: [], contactLinks: [], budgetLinks: [], chatLinks: [], formLinks: [] },
  });
  const service = new NightFactoryService(prisma, crawler as any) as any;

  await service.enrichLead(lead, null, { allowWebsiteFetch: true });

  const data = prisma.__radarUpdates[0]?.data || {};
  assert.equal(data.websiteStatus, 'present');
  assert.equal('email' in data, false);
  assert.equal('emailStatus' in data, false);
});

test('allowWebsiteFetch desligado nao chama o crawler', async () => {
  const lead = createLead(1, { id: 'lead-no-fetch', website: 'https://empresa.com.br' });
  const prisma = createPrisma({ leads: [lead] });
  const crawler = createCrawler({ status: 'completed', evidence: { pages: [] }, fields: {} });
  const service = new NightFactoryService(prisma, crawler as any) as any;

  await service.enrichLead(lead, null, { allowWebsiteFetch: false });

  assert.equal(crawler.calls.length, 0);
  assert.equal(prisma.__radarUpdates.length, 1);
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

// ─── VENDAS-REFAB S3 — getLeadsBank ganha baseTotal/baseAvailable (base 28M real via
// CnpjBaseQueryService.countBase), sem substituir o `total` do pool (RadarLeadPool) que outras
// telas ainda usam para "pronto pra puxar". Nunca inventa numero fixo — o mock devolve um N
// arbitrario so pra provar que o dado vem do count() da base, nao do pool local.
function createLeadsBankPrisma(options: { poolCount?: number; hasRadarLeadPool?: boolean } = {}) {
  const poolCount = options.poolCount ?? 3;
  return {
    hasTable: async (name: string) => (name === 'RadarLeadPool' ? options.hasRadarLeadPool !== false : false),
    radarLeadPool: {
      count: async () => poolCount,
    },
  } as any;
}

test('getLeadsBank: baseTotal vem do countBase() da base 28M, total continua o pool local', async () => {
  const prisma = createLeadsBankPrisma({ poolCount: 3 });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: true, count: 6068 }) };
  const service = new NightFactoryService(prisma, undefined as any, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, true);
  assert.equal(result.total, 3);
  assert.equal(result.baseAvailable, true);
  assert.equal(result.baseTotal, 6068);
  assert.notEqual(result.baseTotal, result.total);
});

test('getLeadsBank: RadarLeadPool ausente -> pool indisponivel, mas baseTotal segue reportado', async () => {
  const prisma = createLeadsBankPrisma({ hasRadarLeadPool: false });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: true, count: 6068 }) };
  const service = new NightFactoryService(prisma, undefined as any, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, false);
  assert.equal(result.total, 0);
  assert.equal(result.baseAvailable, true);
  assert.equal(result.baseTotal, 6068);
});

test('getLeadsBank: base 28M indisponivel neste ambiente -> baseAvailable false, nunca lanca', async () => {
  const prisma = createLeadsBankPrisma({ poolCount: 3 });
  const fakeCnpjBaseQuery: any = { countBase: async () => ({ available: false, count: null }) };
  const service = new NightFactoryService(prisma, undefined as any, fakeCnpjBaseQuery) as any;

  const result = await service.getLeadsBank();

  assert.equal(result.available, true);
  assert.equal(result.total, 3);
  assert.equal(result.baseAvailable, false);
  assert.equal(result.baseTotal, null);
});
