import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightFactoryPublicController } from './night-factory-public.controller';
import { NightFactoryService } from './night-factory.service';

function createLead(index: number) {
  const overrides: Record<string, any> = {};
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
  const prisma: any = {
    hasTable: async (name: string) => ['RadarLeadPool', 'NightFactoryRewardClaim'].includes(name),
    radarLeadPool: {
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
