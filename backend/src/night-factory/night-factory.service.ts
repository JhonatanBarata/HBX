import { ConflictException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CnpjBaseQueryService } from '../webscraping/radar/providers/cnpj-public/cnpj-base-query.service';
import { DEFAULT_NIGHT_FACTORY_CONFIG } from './night-factory.types';

const BLOCKED_RADAR_STATUSES = ['complaint', 'denied', 'hidden', 'rejected'];
const REWARD_MINIMUM_REQUIRED = 5;
const REWARD_WINDOW_MS = 24 * 60 * 60 * 1000;
const REWARD_BLOCKED_RADAR_STATUSES = [
  ...BLOCKED_RADAR_STATUSES,
  'blocked',
  'discarded',
  'negative',
  'opt_out',
  'optout',
  'duplicate_bad',
  'bad_duplicate',
  'invalid',
  'invalid_phone',
  'no_phone',
  'no_whatsapp',
];

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function safeText(value: unknown, max = 280) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value: unknown) {
  return safeText(value, 260)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cnpjDigits(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
}

function findCnpjInRecord(value: unknown, depth = 0): string {
  if (!value || depth > 4) return '';
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      const found = findCnpjInRecord(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const [key, item] of Object.entries(value as Record<string, any>).slice(0, 120)) {
    if (normalize(key).includes('cnpj')) {
      const direct = cnpjDigits(item);
      if (direct) return direct;
    }
    const nested = findCnpjInRecord(item, depth + 1);
    if (nested) return nested;
  }
  return '';
}

function extractPoolCnpj(row: any) {
  const metadata = parseJsonRecord(row?.metadataJson);
  const evidence = parseJsonRecord(row?.evidenceJson);
  const structured = findCnpjInRecord(metadata) || findCnpjInRecord(evidence);
  if (structured) return structured;
  const sourceMatch = String(row?.sourceUrl || '').match(/(?:cnpj(?:-base)?[^0-9]*)?(\d{14})(?:\D|$)/i);
  return cnpjDigits(sourceMatch?.[1]);
}

function websiteIdentity(value: unknown) {
  const raw = safeText(value, 500);
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function poolIdentityKey(row: any, cnpj: string) {
  if (cnpj) return `cnpj:${cnpj}`;
  const placeId = safeText(row?.placeId, 240);
  if (placeId) return `place:${placeId}`;
  const host = websiteIdentity(row?.website);
  if (host) return `site:${host}`;
  const name = normalize(row?.name);
  const city = normalize(row?.city || row?.normalizedCity);
  const state = normalize(row?.state);
  if (name) return `name:${name}|${city}|${state}`;
  return `pool:${safeText(row?.id, 240)}`;
}

function extractQualityV2(row: any) {
  const enrichment = parseJsonRecord(row?.enrichmentJson);
  const metadata = parseJsonRecord(row?.metadataJson);
  const qualityV2 =
    row?.qualityV2 ||
    row?.signals?.qualityV2 ||
    enrichment?.qualityV2 ||
    enrichment?.signals?.qualityV2 ||
    metadata?.qualityV2 ||
    metadata?.signals?.qualityV2 ||
    null;
  if (!qualityV2 || qualityV2.version !== 'lead-quality-v2') return null;
  return qualityV2;
}

function leadRankScore(row: any) {
  const qualityV2 = extractQualityV2(row);
  const finalRankScore = Number(qualityV2?.finalRankScore);
  return Number.isFinite(finalRankScore) ? Math.round(finalRankScore) : safeInteger(row?.opportunityScore);
}

function startOfLocalDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = safeInteger(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

@Injectable()
export class NightFactoryService {
  private readonly logger = new Logger(NightFactoryService.name);
  private nationalActiveCountCache: { value: { available: boolean; count: number | null }; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    // VENDAS-REFAB S3 (fix P0 boot): sem módulo cruzado (night-factory não importa
    // WebscrapingModule). @Optional() + default garante instância local só-prisma sem
    // o Nest tentar resolver o provider (que arrastaria deps ausentes = crash no boot).
    @Optional() private readonly cnpjBaseQuery: CnpjBaseQueryService = new CnpjBaseQueryService(prisma),
  ) {}

  async getStatus() {
    const config = { ...DEFAULT_NIGHT_FACTORY_CONFIG };
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const [leadPoolAvailable, enrichmentAvailable, recoveryAvailable] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadEnrichment').catch(() => false),
      this.prisma.hasTable('RecoveryOpportunity').catch(() => false),
    ]);
    const [totalLeads, enrichedToday, premiumToday, recoveryToday, topCities, topSegments] = leadPoolAvailable
      ? await Promise.all([
          (this.prisma as any).radarLeadPool.count().catch(() => 0),
          (this.prisma as any).radarLeadPool.count({ where: { updatedAt: { gte: todayStart }, opportunityScore: { gt: 0 } } }).catch(() => 0),
          (this.prisma as any).radarLeadPool.count({
            where: {
              updatedAt: { gte: todayStart },
              opportunityScore: { gte: 85 },
              status: { notIn: BLOCKED_RADAR_STATUSES },
            },
          }).catch(() => 0),
          recoveryAvailable
            ? (this.prisma as any).recoveryOpportunity.count({ where: { createdAt: { gte: todayStart } } }).catch(() => 0)
            : this.countComputedRecoveryOpportunities(),
          this.getCities({ take: 5 }).then((payload) => payload.items).catch(() => []),
          this.getSegments({ take: 5 }).then((payload) => payload.items).catch(() => []),
        ])
      : [0, 0, 0, 0, [], []];

    const status = 'somente_leitura';

    return {
      generatedAt: now.toISOString(),
      product: 'HBX Lead Inventory',
      status,
      config: {
        ...config,
        enabled: false,
        allowWebsiteFetch: false,
        allowScreenshot: false,
        allowAiSuggestions: false,
        allowRecoveryRevival: false,
        allowVendasQueuePush: false,
      },
      storage: {
        radarLeadPoolAvailable: leadPoolAvailable,
        radarLeadEnrichmentAvailable: enrichmentAvailable,
        recoveryOpportunityAvailable: recoveryAvailable,
      },
      window: {
        timezone: 'America/Sao_Paulo',
        startHour: config.startHour,
        endHour: config.endHour,
        activeNow: false,
        nextWindowLabel: 'Enriquecimento somente na puxada do lead',
      },
      summary: {
        totalLeads,
        leadsProcessedToday: enrichedToday,
        leadsEnrichedToday: enrichedToday,
        premiumOpportunities: premiumToday,
        recoveryOpportunities: recoveryToday,
        potentialRevenueEstimate: premiumToday * 497 + recoveryToday * 197,
      },
      worker: {
        running: false,
        paused: true,
        retired: true,
        reason: 'pre_enrichment_removed_pull_time_only',
        lastRunAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRunStats: { processed: 0, enriched: 0, failed: 0, premium: 0, recovery: 0 },
      },
      pipeline: [
        { key: 'captura', label: 'Captura', quantity: totalLeads, status: totalLeads > 0 ? 'ok' : 'aguardando' },
        { key: 'limpeza', label: 'Limpeza', quantity: enrichedToday, status: enrichedToday > 0 ? 'ok' : 'aguardando' },
        { key: 'enriquecimento', label: 'Enriquecimento na puxada', quantity: enrichedToday, status: 'sob_demanda' },
        { key: 'score', label: 'Score', quantity: premiumToday, status: premiumToday > 0 ? 'ok' : 'aguardando' },
        { key: 'script', label: 'Script', quantity: enrichedToday, status: enrichedToday > 0 ? 'ok' : 'aguardando' },
        { key: 'recovery', label: 'Recovery', quantity: recoveryToday, status: recoveryToday > 0 ? 'ok' : 'aguardando' },
        { key: 'vendas', label: 'Vendas', quantity: premiumToday, status: 'pronto' },
      ],
      topCities,
      topSegments,
      copy: {
        title: 'O HBX localiza primeiro e enriquece quando você puxa.',
        subtitle: 'Nenhum enriquecimento extra roda sobre o estoque antes do débito do crédito.',
        action: 'Abrir Leads',
      },
    };
  }

  // Universo único do produto: CNPJs ativos da Receita ∪ identidades exclusivas do motor.
  // A deduplicação é por CNPJ e, quando ele não existe, por placeId/site/nome+localidade.
  // `total`, `baseTotal`, `availableTotal` e `universeTotal` são aliases intencionais do MESMO
  // número. `operationalPoolTotal` existe apenas como telemetria e nunca como KPI concorrente.
  async getLeadsBank() {
    const now = Date.now();
    // O total nacional muda pouco e pode ser cacheado; o pool NÃO. Assim, todo
    // lead exclusivo que acabou de chegar ao motor incrementa imediatamente o
    // universo unificado, sem esperar um TTL de painel.
    let baseCount = this.nationalActiveCountCache?.expiresAt && this.nationalActiveCountCache.expiresAt > now
      ? this.nationalActiveCountCache.value
      : null;
    if (!baseCount) {
      baseCount = await this.cnpjBaseQuery.countBase({}).catch(() => ({ available: false, count: null }));
      this.nationalActiveCountCache = { value: baseCount, expiresAt: now + 5 * 60_000 };
    }
    const poolAvailable = await this.prisma.hasTable('RadarLeadPool').catch(() => false);
    const todayStart = startOfLocalDay();
    let poolRows: any[] = [];
    let poolReadComplete = !poolAvailable;
    if (poolAvailable) {
      try {
        poolRows = await (this.prisma as any).radarLeadPool.findMany({
          where: { status: { notIn: BLOCKED_RADAR_STATUSES } },
          select: {
            id: true,
            placeId: true,
            name: true,
            city: true,
            normalizedCity: true,
            state: true,
            website: true,
            sourceUrl: true,
            metadataJson: true,
            evidenceJson: true,
            createdAt: true,
          },
        });
        poolReadComplete = true;
      } catch {
        poolRows = [];
        poolReadComplete = false;
      }
    }

    const poolCnpjs = [...new Set(poolRows.map(extractPoolCnpj).filter(Boolean))];
    const activePoolCnpjs = new Set<string>();
    let activeLookupComplete = poolCnpjs.length === 0;
    if (baseCount.available && poolCnpjs.length && (this.prisma as any).cnpjPublicCompany?.findMany) {
      try {
        for (let offset = 0; offset < poolCnpjs.length; offset += 5_000) {
          const rows = await (this.prisma as any).cnpjPublicCompany.findMany({
            where: { cnpj: { in: poolCnpjs.slice(offset, offset + 5_000) }, situacao: 'ativa' },
            select: { cnpj: true },
          });
          for (const row of rows) {
            const cnpj = cnpjDigits(row?.cnpj);
            if (cnpj) activePoolCnpjs.add(cnpj);
          }
        }
        activeLookupComplete = true;
      } catch {
        activeLookupComplete = false;
      }
    }

    const exclusiveIdentities = new Map<string, Date>();
    for (const row of poolRows) {
      const cnpj = extractPoolCnpj(row);
      if (cnpj && activePoolCnpjs.has(cnpj)) continue;
      const key = poolIdentityKey(row, cnpj);
      const createdAt = new Date(row?.createdAt || 0);
      const existing = exclusiveIdentities.get(key);
      if (!existing || createdAt.getTime() < existing.getTime()) exclusiveIdentities.set(key, createdAt);
    }

    const nationalActiveTotal = typeof baseCount.count === 'number' ? baseCount.count : null;
    const unionExact = nationalActiveTotal != null && poolReadComplete && activeLookupComplete;
    const poolExclusiveTotal = unionExact ? exclusiveIdentities.size : null;
    const universeTotal = unionExact ? nationalActiveTotal + exclusiveIdentities.size : null;
    const deltaToday = unionExact
      ? [...exclusiveIdentities.values()].filter((createdAt) => createdAt >= todayStart).length
      : null;
    const value = {
      generatedAt: new Date().toISOString(),
      total: universeTotal,
      universeTotal,
      availableTotal: universeTotal,
      deltaToday,
      available: unionExact,
      label: 'Empresas disponíveis no Brasil',
      baseAvailable: baseCount.available,
      baseTotal: universeTotal,
      nationalActiveTotal,
      operationalPoolTotal: poolReadComplete ? poolRows.length : null,
      poolExclusiveTotal,
      poolAvailable,
      unionExact,
      deduplication: 'cnpj|placeId|website|name+city+state',
    };
    return value;
  }

  async getTopOpportunities(options: { take?: number } = {}) {
    const take = clamp(options.take, 20, 1, 80);
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: {
        status: { notIn: BLOCKED_RADAR_STATUSES },
        phoneDigits: { not: null },
        opportunityScore: { gte: 40 },
      },
      orderBy: [{ opportunityScore: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(take * 3, take),
    }).catch(() => []);
    const orderedRows = [...rows].sort((left: any, right: any) => {
      const rankDelta = leadRankScore(right) - leadRankScore(left);
      if (rankDelta !== 0) return rankDelta;
      return safeInteger(right?.opportunityScore) - safeInteger(left?.opportunityScore);
    }).slice(0, take);

    return {
      generatedAt: new Date().toISOString(),
      items: orderedRows.map((row: any) => this.mapLeadOpportunity(row)),
    };
  }

  async getClaimStatus(user: any) {
    const scope = this.resolveClaimScope(user);
    const minimumRequired = REWARD_MINIMUM_REQUIRED;
    const claimStorageAvailable = await this.prisma.hasTable('NightFactoryRewardClaim').catch(() => false);

    if (!claimStorageAvailable) {
      return {
        eligible: false,
        alreadyClaimed: false,
        alreadyClaimedInWindow: false,
        availableCount: 0,
        minimumRequired,
        nextAvailableAt: null,
        secondsUntilNextClaim: 0,
        nonCumulative: true,
        rewardSize: REWARD_MINIMUM_REQUIRED,
        reason: 'storage_unavailable',
        headline: 'Missão noturna concluída',
        title: 'Night Factory em preparação',
        description: 'A recompensa ainda não está disponível.',
        ctaLabel: 'Ver Night Factory',
        href: '/night-factory',
      };
    }

    const now = new Date();
    const latestClaim = await this.findLatestRewardClaim(scope.scopeKey);
    const nextAvailableAt = this.resolveNextAvailableAt(latestClaim);
    const secondsUntilNextClaim = this.secondsUntil(nextAvailableAt, now);
    const alreadyClaimedInWindow = Boolean(latestClaim && secondsUntilNextClaim > 0);

    if (alreadyClaimedInWindow) {
      return {
        eligible: false,
        alreadyClaimed: true,
        alreadyClaimedInWindow: true,
        availableCount: 0,
        minimumRequired,
        nextAvailableAt: nextAvailableAt?.toISOString() || null,
        secondsUntilNextClaim,
        nonCumulative: true,
        rewardSize: REWARD_MINIMUM_REQUIRED,
        reason: 'cooldown',
        headline: 'Missão noturna concluída',
        title: 'Recompensa diária já resgatada',
        description: 'A recompensa é diária e não acumulativa.',
        ctaLabel: 'Ver recompensa',
        href: '/night-factory',
      };
    }

    const rows = await this.findClaimableOpportunityRows(user, minimumRequired);
    const availableCount = rows.length;
    const hasEnoughLeads = availableCount >= minimumRequired;
    return {
      eligible: hasEnoughLeads,
      alreadyClaimed: false,
      alreadyClaimedInWindow: false,
      availableCount,
      minimumRequired,
      nextAvailableAt: nextAvailableAt?.toISOString() || null,
      secondsUntilNextClaim: 0,
      nonCumulative: true,
      rewardSize: REWARD_MINIMUM_REQUIRED,
      reason: hasEnoughLeads ? null : 'insufficient_leads',
      headline: 'Missão noturna concluída',
      title: 'Você tem 5 leads premium',
      description: 'A Night Factory separou sua recompensa diária.',
      ctaLabel: 'Resgatar recompensa',
      href: '/night-factory',
    };
  }

  async getMyReward(user: any) {
    const scope = this.resolveClaimScope(user);
    const claim = await this.findLatestRewardClaim(scope.scopeKey);
    const nextAvailableAt = this.resolveNextAvailableAt(claim);
    const secondsUntilNextClaim = this.secondsUntil(nextAvailableAt);
    const alreadyClaimedInWindow = Boolean(claim && secondsUntilNextClaim > 0);
    if (!claim) {
      return {
        ok: false,
        alreadyClaimed: false,
        alreadyClaimedInWindow: false,
        claimedAt: null,
        nextAvailableAt: null,
        secondsUntilNextClaim: 0,
        nonCumulative: true,
        rewardSize: REWARD_MINIMUM_REQUIRED,
        items: [],
      };
    }

    return {
      ok: true,
      alreadyClaimed: alreadyClaimedInWindow,
      alreadyClaimedInWindow,
      claimedAt: claim.claimedAt ? new Date(claim.claimedAt).toISOString() : null,
      nextAvailableAt: nextAvailableAt?.toISOString() || null,
      secondsUntilNextClaim,
      nonCumulative: true,
      rewardSize: REWARD_MINIMUM_REQUIRED,
      items: await this.hydrateRewardItemsFromClaim(claim),
    };
  }

  async redeemReward(user: any) {
    const scope = this.resolveClaimScope(user);
    if (!(await this.prisma.hasTable('NightFactoryRewardClaim').catch(() => false))) {
      throw new ConflictException('A recompensa da Night Factory ainda não está disponível.');
    }

    try {
      return await (this.prisma as any).$transaction(async (tx: any) => {
        await this.acquireRewardScopeLock(tx, scope.scopeKey);
        const latestClaim = await this.findLatestRewardClaim(scope.scopeKey, tx);
        const nextAvailableAt = this.resolveNextAvailableAt(latestClaim);
        const secondsUntilNextClaim = this.secondsUntil(nextAvailableAt);
        if (latestClaim && secondsUntilNextClaim > 0) {
          throw new ConflictException({
            ok: false,
            code: 'NIGHT_FACTORY_COOLDOWN',
            message: 'A recompensa diária da Night Factory ainda está em cooldown.',
            reason: 'cooldown',
            nextAvailableAt: nextAvailableAt?.toISOString() || null,
            secondsUntilNextClaim,
            nonCumulative: true,
            rewardSize: REWARD_MINIMUM_REQUIRED,
          });
        }

        const rows = await this.findClaimableOpportunityRows(user, REWARD_MINIMUM_REQUIRED, undefined, tx);
        if (rows.length < REWARD_MINIMUM_REQUIRED) {
          throw new ConflictException({
            ok: false,
            code: 'NIGHT_FACTORY_INSUFFICIENT_LEADS',
            message: 'A Night Factory ainda está preparando seus leads.',
            reason: 'insufficient_leads',
            availableCount: rows.length,
            minimumRequired: REWARD_MINIMUM_REQUIRED,
          });
        }

        const now = new Date();
        const nextClaimAt = new Date(now.getTime() + REWARD_WINDOW_MS);
        const leadIds = rows.slice(0, REWARD_MINIMUM_REQUIRED).map((row: any) => String(row.id));
        const claim = await tx.nightFactoryRewardClaim.create({
          data: {
            scopeKey: scope.scopeKey,
            userId: scope.userId,
            companyId: scope.companyId,
            leadIdsJson: JSON.stringify(leadIds),
            claimedAt: now,
            nextAvailableAt: nextClaimAt,
            windowKey: `${scope.scopeKey}:${now.toISOString()}`,
            metadataJson: JSON.stringify({
              source: 'night_factory_reward',
              minimumRequired: REWARD_MINIMUM_REQUIRED,
              nonCumulative: true,
              noWhatsappAutoSend: true,
            }),
          },
        });

        this.logger.log(`[night-factory-reward] redeemed scope=${scope.scopeKey} leads=${leadIds.length}`);
        return {
          ok: true,
          alreadyClaimed: false,
          alreadyClaimedInWindow: true,
          claimedAt: claim.claimedAt ? new Date(claim.claimedAt).toISOString() : now.toISOString(),
          nextAvailableAt: nextClaimAt.toISOString(),
          secondsUntilNextClaim: Math.ceil(REWARD_WINDOW_MS / 1000),
          nonCumulative: true,
          rewardSize: REWARD_MINIMUM_REQUIRED,
          items: rows.slice(0, REWARD_MINIMUM_REQUIRED).map((row: any) => this.mapRewardItem(row)),
        };
      });
    } catch (error: any) {
      if (error instanceof ConflictException) throw error;
      throw error;
    }
  }

  async getClaimableOpportunitiesForUser(user: any, take = REWARD_MINIMUM_REQUIRED) {
    const rows = await this.findClaimableOpportunityRows(user, take);
    return rows.map((row: any) => this.mapRewardItem(row));
  }

  async getDailyReport() {
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const [topOpportunities, recovery, cities, segments] = await Promise.all([
      this.getTopOpportunities({ take: 20 }),
      this.getRecoveryOpportunities({ take: 20 }),
      this.getCities({ take: 10 }),
      this.getSegments({ take: 10 }),
    ]);
    const leadPoolAvailable = await this.prisma.hasTable('RadarLeadPool').catch(() => false);
    const [cardsRaw, cleanLeads, weakSites, noWhatsapp] = leadPoolAvailable
      ? await Promise.all([
          (this.prisma as any).radarLeadPool.count({ where: { createdAt: { gte: todayStart } } }).catch(() => 0),
          (this.prisma as any).radarLeadPool.count({
            where: { updatedAt: { gte: todayStart }, status: { notIn: BLOCKED_RADAR_STATUSES } },
          }).catch(() => 0),
          (this.prisma as any).radarLeadPool.count({ where: { updatedAt: { gte: todayStart }, websiteStatus: { in: ['weak', 'broken', 'unreachable'] } } }).catch(() => 0),
          (this.prisma as any).radarLeadPool.count({ where: { updatedAt: { gte: todayStart }, opportunityReason: { contains: 'WhatsApp' } } }).catch(() => 0),
        ])
      : [0, 0, 0, 0];

    const topSegment = segments.items[0]?.segment || '-';
    const topCity = cities.items[0]?.city || '-';
    return {
      generatedAt: now.toISOString(),
      title: 'O que o HBX fez enquanto você dormia?',
      greeting: 'Bom dia, Jhonatan.',
      summary: {
        cardsRaw,
        cleanLeads,
        premiumOpportunities: topOpportunities.items.filter((item: any) => item.score >= 85).length,
        weakSites,
        noWhatsapp,
        recoveryOpportunities: recovery.items.length,
        scriptsGenerated: topOpportunities.items.length,
        topSegment,
        topCity,
        potentialRevenueEstimate: topOpportunities.items.length * 497 + recovery.items.length * 197,
      },
      recommendedAction: topOpportunities.items.length
        ? `Atacar o Top 20 com ${topOpportunities.items[0].recommendedOffer}.`
        : 'Rodar Night Factory agora para montar oportunidades.',
      topOpportunities: topOpportunities.items,
      recovery: recovery.items,
      cities: cities.items,
      segments: segments.items,
    };
  }

  async getSegments(options: { take?: number } = {}) {
    const take = clamp(options.take, 20, 1, 80);
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }
    const rows = await (this.prisma as any).radarLeadPool.groupBy({
      by: ['normalizedSegment', 'segment'],
      _count: { _all: true },
      _avg: { opportunityScore: true },
      where: { status: { notIn: BLOCKED_RADAR_STATUSES } },
    }).catch(() => []);
    const items = rows
      .map((row: any) => ({
        segment: row.segment || row.normalizedSegment || 'sem segmento',
        normalizedSegment: row.normalizedSegment || '',
        totalLeads: Number(row?._count?._all || 0),
        averageScore: Math.round(Number(row?._avg?.opportunityScore || 0)),
      }))
      .filter((item: any) => item.totalLeads > 0)
      .sort((left: any, right: any) => right.averageScore - left.averageScore || right.totalLeads - left.totalLeads)
      .slice(0, take);
    return { generatedAt: new Date().toISOString(), items };
  }

  async getCities(options: { take?: number } = {}) {
    const take = clamp(options.take, 20, 1, 100);
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }
    const rows = await (this.prisma as any).radarLeadPool.groupBy({
      by: ['normalizedCity', 'city', 'state'],
      _count: { _all: true },
      _avg: { opportunityScore: true },
      where: { status: { notIn: BLOCKED_RADAR_STATUSES } },
    }).catch(() => []);
    const items = rows
      .map((row: any) => ({
        city: row.city || row.normalizedCity || 'sem cidade',
        state: row.state || null,
        totalLeads: Number(row?._count?._all || 0),
        averageScore: Math.round(Number(row?._avg?.opportunityScore || 0)),
        recommendedOffer: Number(row?._avg?.opportunityScore || 0) >= 65 ? 'HBX Full — Bot e IA' : 'HBX List',
      }))
      .sort((left: any, right: any) => right.averageScore - left.averageScore || right.totalLeads - left.totalLeads)
      .slice(0, take);
    return { generatedAt: new Date().toISOString(), items };
  }

  async getRecoveryOpportunities(options: { take?: number } = {}) {
    const take = clamp(options.take, 20, 1, 80);
    if (await this.prisma.hasTable('RecoveryOpportunity').catch(() => false)) {
      const rows = await (this.prisma as any).recoveryOpportunity.findMany({
        where: { status: { in: ['queued', 'ready', 'assigned'] } },
        orderBy: [{ recoveryScore: 'desc' }, { updatedAt: 'desc' }],
        take,
      }).catch(() => []);
      if (rows.length) {
        return {
          generatedAt: new Date().toISOString(),
          items: rows.map((row: any) => ({
            id: row.id,
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            companyId: row.companyId || null,
            recoveryReason: row.recoveryReason,
            recoveryScore: row.recoveryScore,
            suggestedFlow: row.suggestedFlow || 'follow_up_humano',
            suggestedMessage: row.suggestedMessage || null,
            status: row.status,
          })),
        };
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      items: await this.buildComputedRecoveryOpportunities(take),
    };
  }

  private mapLeadOpportunity(row: any) {
    const metadata = parseJsonRecord(row?.metadataJson).nightFactory || {};
    const qualityV2 = extractQualityV2(row);
    const score = leadRankScore(row);
    return {
      id: String(row?.id || ''),
      source: 'night_factory',
      radarLeadId: String(row?.id || ''),
      name: row?.name || 'Lead sem nome',
      phone: row?.phone || row?.phoneDigits || null,
      city: row?.city || row?.normalizedCity || null,
      state: row?.state || null,
      segment: row?.segment || row?.normalizedSegment || null,
      website: row?.website || null,
      score,
      level: metadata.opportunityLevel || (score >= 85 ? 'premium' : score >= 65 ? 'bom' : 'medio'),
      reason: qualityV2?.reasons?.[0] || row?.opportunityReason || metadata.opportunityReason || 'Oportunidade detectada pela Night Factory.',
      opportunityReason: row?.opportunityReason || metadata.opportunityReason || null,
      qualityV2,
      recommendedOffer: metadata.recommendedOffer || 'HBX Full — Bot e IA',
      suggestedApproach: metadata.suggestedApproach || null,
      suggestedWhatsappMessage: metadata.suggestedWhatsappMessage || null,
      suggestedHumanOpening: metadata.suggestedHumanOpening || null,
      detectedProblems: Array.isArray(metadata.detectedProblems) ? metadata.detectedProblems : [],
      detectedAssets: Array.isArray(metadata.detectedAssets) ? metadata.detectedAssets : [],
      miniAudit: {
        title: metadata.miniAuditTitle || `Diagnóstico gratuito da presença digital da ${safeText(row?.name, 90) || 'empresa'}`,
        summary: metadata.miniAuditSummary || row?.opportunityReason || null,
        status: 'text_ready',
      },
      action: {
        label: 'Enviar para Vendas',
        href: `/vendas?radarLeadId=${encodeURIComponent(String(row?.id || ''))}`,
      },
    };
  }

  private resolveClaimScope(user: any) {
    const companyId = safeInteger(
      user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId ?? user?.company?.id,
      0,
    ) || null;
    const userId = safeInteger(user?.id, 0) || null;

    if (companyId) {
      return { scopeKey: `company:${companyId}`, companyId, userId };
    }
    if (userId) {
      return { scopeKey: `user:${userId}`, companyId: null, userId };
    }
    throw new ForbiddenException('Usuário autenticado não identificado.');
  }

  private async findLatestRewardClaim(scopeKey: string, tx?: any) {
    const client = tx || (this.prisma as any);
    if (!(await this.prisma.hasTable('NightFactoryRewardClaim').catch(() => false))) return null;
    return client.nightFactoryRewardClaim.findFirst({
      where: { scopeKey },
      orderBy: [{ claimedAt: 'desc' }, { createdAt: 'desc' }],
    }).catch(() => null);
  }

  private async getClaimedRewardLeadIds(exceptScopeKey?: string, tx?: any) {
    const client = tx || (this.prisma as any);
    if (!(await this.prisma.hasTable('NightFactoryRewardClaim').catch(() => false))) return new Set<string>();
    const rows = await client.nightFactoryRewardClaim.findMany({
      where: {
        ...(exceptScopeKey ? { NOT: { scopeKey: exceptScopeKey } } : {}),
      },
      select: { leadIdsJson: true },
      take: 1000,
    }).catch(() => []);

    const ids = new Set<string>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(String(row?.leadIdsJson || '[]'));
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => {
            const normalized = String(id || '').trim();
            if (normalized) ids.add(normalized);
          });
        }
      } catch {
        // ignore malformed historical rows
      }
    }
    return ids;
  }

  private buildRewardLeadWhere(user: any, excludedIds: string[]) {
    const scope = this.resolveClaimScope(user);
    const where: any = {
      status: { notIn: REWARD_BLOCKED_RADAR_STATUSES },
      opportunityScore: { gte: 70 },
      OR: [{ phoneDigits: { not: null } }, { phone: { not: null } }],
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
    };

    if (scope.companyId) {
      where.AND = [
        {
          OR: [{ companyId: null }, { companyId: { not: scope.companyId } }],
        },
      ];
    }
    return where;
  }

  private resolveNextAvailableAt(claim: any) {
    if (!claim) return null;
    if (claim.nextAvailableAt) return new Date(claim.nextAvailableAt);
    if (claim.claimedAt) return new Date(new Date(claim.claimedAt).getTime() + REWARD_WINDOW_MS);
    return null;
  }

  private secondsUntil(date: Date | null, now = new Date()) {
    if (!date) return 0;
    const delta = date.getTime() - now.getTime();
    return delta > 0 ? Math.ceil(delta / 1000) : 0;
  }

  private async acquireRewardScopeLock(tx: any, scopeKey: string) {
    if (!tx?.$executeRawUnsafe) return;
    const escaped = String(scopeKey || '').replace(/'/g, "''");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('night_factory_reward:${escaped}'))`).catch(() => null);
  }

  private async findClaimableOpportunityRows(user: any, take = REWARD_MINIMUM_REQUIRED, scopeKey?: string, tx?: any) {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return [];
    const client = tx || (this.prisma as any);
    const claimedIds = await this.getClaimedRewardLeadIds(scopeKey, tx);
    const rows = await client.radarLeadPool.findMany({
      where: this.buildRewardLeadWhere(user, Array.from(claimedIds)),
      orderBy: [{ opportunityScore: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(take * 3, take),
    }).catch(() => []);

    return rows
      .filter((row: any) => this.isRewardLeadUsable(row))
      .sort((left: any, right: any) => leadRankScore(right) - leadRankScore(left))
      .slice(0, take);
  }

  private isRewardLeadUsable(row: any) {
    const phone = String(row?.phoneDigits || row?.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return false;
    const status = String(row?.status || '').trim().toLowerCase();
    if (REWARD_BLOCKED_RADAR_STATUSES.includes(status)) return false;
    const qualityV2 = extractQualityV2(row);
    if (qualityV2?.decision === 'protect' || qualityV2?.decision === 'discard') return false;
    return leadRankScore(row) >= 70;
  }

  private async hydrateRewardItemsFromClaim(claim: any, tx?: any) {
    const client = tx || (this.prisma as any);
    const leadIds = this.parseClaimLeadIds(claim);
    if (!leadIds.length || !(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return [];
    const rows = await client.radarLeadPool.findMany({
      where: { id: { in: leadIds } },
      take: leadIds.length,
    }).catch(() => []);
    const byId = new Map(rows.map((row: any) => [String(row.id), row]));
    return leadIds.map((id) => byId.get(id)).filter(Boolean).map((row: any) => this.mapRewardItem(row));
  }

  private parseClaimLeadIds(claim: any) {
    try {
      const parsed = JSON.parse(String(claim?.leadIdsJson || '[]'));
      if (!Array.isArray(parsed)) return [];
      return parsed.map((id) => String(id || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private mapRewardItem(row: any) {
    const item = this.mapLeadOpportunity(row);
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      city: item.city,
      state: item.state,
      segment: item.segment,
      score: item.score,
      opportunityReason: item.opportunityReason || item.reason,
      recommendedOffer: item.recommendedOffer,
      action: item.action,
    };
  }

  private async countComputedRecoveryOpportunities() {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return 0;
    return (this.prisma as any).radarLeadPool.count({
      where: {
        OR: [
          { status: { in: ['no_answer', 'duplicate'] } },
          { noAnswerCount: { gte: 1 } },
          { lastContactAt: { lt: new Date(Date.now() - 48 * 60 * 60_000) } },
        ],
        status: { notIn: ['complaint', 'denied', 'hidden', 'rejected'] },
      },
    }).catch(() => 0);
  }

  private async buildComputedRecoveryOpportunities(take: number) {
    const items: any[] = [];
    if (await this.prisma.hasTable('RadarLeadPool').catch(() => false)) {
      const rows = await (this.prisma as any).radarLeadPool.findMany({
        where: {
          OR: [
            { status: { in: ['no_answer', 'duplicate'] } },
            { noAnswerCount: { gte: 1 } },
            { lastContactAt: { lt: new Date(Date.now() - 48 * 60 * 60_000) } },
          ],
          status: { notIn: ['complaint', 'denied', 'hidden', 'rejected'] },
        },
        orderBy: [{ opportunityScore: 'desc' }, { updatedAt: 'desc' }],
        take,
      }).catch(() => []);
      rows.forEach((row: any) => {
        items.push({
          id: `radar:${row.id}`,
          sourceType: 'radar',
          sourceId: row.id,
          companyId: row.companyId || null,
          name: row.name,
          phone: row.phone || row.phoneDigits || null,
          recoveryReason: row.noAnswerCount > 0 ? 'Lead sem resposta pode receber nova tentativa com contexto.' : 'Lead antigo ainda tem histórico útil.',
          recoveryScore: Math.max(40, Math.min(100, safeInteger(row.opportunityScore) + 10 + safeInteger(row.noAnswerCount) * 8)),
          suggestedFlow: 'follow_up_humano',
          suggestedMessage: 'Retomar com contexto do problema detectado, sem envio automático.',
          status: 'ready',
        });
      });
    }

    if (items.length < take && await this.prisma.hasTable('VendasLead').catch(() => false)) {
      const stale = await (this.prisma as any).vendasLead.findMany({
        where: {
          status: { in: ['contato', 'retorno', 'novo'] },
          OR: [
            { returnAt: { lt: new Date() } },
            { lastContactAt: { lt: new Date(Date.now() - 48 * 60 * 60_000) } },
            { attemptCount: { gte: 2 } },
          ],
        },
        orderBy: [{ updatedAt: 'asc' }],
        take: take - items.length,
      }).catch(() => []);
      stale.forEach((lead: any) => {
        items.push({
          id: `vendas:${lead.id}`,
          sourceType: 'vendas',
          sourceId: lead.id,
          companyId: lead.companyId,
          name: lead.name,
          phone: lead.phone || lead.phoneNormalized || null,
          recoveryReason: 'Lead de vendas parado com retorno vencido ou múltiplas tentativas.',
          recoveryScore: Math.min(100, 55 + safeInteger(lead.attemptCount) * 8),
          suggestedFlow: 'retorno_vendas',
          suggestedMessage: 'Retomar perguntando se ainda faz sentido continuar a conversa.',
          status: 'ready',
        });
      });
    }

    return items.slice(0, take);
  }

}
