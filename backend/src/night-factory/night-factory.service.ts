import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_NIGHT_FACTORY_CONFIG,
  NightFactoryConfig,
  calculateHbxOpportunityScore,
} from './night-factory.types';

const CONFIG_KEY = 'night_factory';
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

function startOfLocalDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = safeInteger(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled', 'ligado'].includes(normalized);
}

@Injectable()
export class NightFactoryService {
  private readonly logger = new Logger(NightFactoryService.name);
  private running = false;
  private pausedOverride = false;
  private lastRunAt: Date | null = null;
  private lastFinishedAt: Date | null = null;
  private lastError: string | null = null;
  private lastRunStats = {
    processed: 0,
    enriched: 0,
    failed: 0,
    premium: 0,
    recovery: 0,
  };

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<NightFactoryConfig> {
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) {
      return { ...DEFAULT_NIGHT_FACTORY_CONFIG };
    }

    const row = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: CONFIG_KEY },
    }).catch(() => null);
    if (!row) return { ...DEFAULT_NIGHT_FACTORY_CONFIG };

    const metadata = parseJsonRecord(row.metadataJson);
    return this.normalizeConfig({
      ...DEFAULT_NIGHT_FACTORY_CONFIG,
      ...metadata,
      enabled: row.enabled,
      startHour: row.startHour,
      endHour: row.endHour,
      batchSize: row.batchSize,
      maxConcurrency: metadata.maxConcurrency ?? row.engineCount ?? DEFAULT_NIGHT_FACTORY_CONFIG.maxConcurrency,
      maxLeadsPerNight: metadata.maxLeadsPerNight,
    });
  }

  async saveConfig(user: any, input: Partial<NightFactoryConfig> = {}) {
    const current = await this.getConfig();
    const next = this.normalizeConfig({ ...current, ...input });
    if (await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false)) {
      const metadata = {
        maxConcurrency: next.maxConcurrency,
        maxLeadsPerNight: next.maxLeadsPerNight,
        enrichOnlyNewLeads: next.enrichOnlyNewLeads,
        allowWebsiteFetch: next.allowWebsiteFetch,
        allowScreenshot: next.allowScreenshot,
        allowAiSuggestions: next.allowAiSuggestions,
        allowRecoveryRevival: next.allowRecoveryRevival,
        allowVendasQueuePush: next.allowVendasQueuePush,
        cpuSoftLimitPercent: next.cpuSoftLimitPercent,
        memorySoftLimitPercent: next.memorySoftLimitPercent,
      };
      await (this.prisma as any).webscrapingOperationalConfig.upsert({
        where: { key: CONFIG_KEY },
        create: {
          key: CONFIG_KEY,
          enabled: next.enabled,
          preset: CONFIG_KEY,
          startHour: next.startHour,
          startMinute: 0,
          endHour: next.endHour,
          endMinute: 0,
          engineCount: next.maxConcurrency,
          intensity: 'normal',
          memoryTargetGb: 12,
          batchSize: next.batchSize,
          maxAttemptsPerTask: 3,
          engineUrlsJson: '[]',
          metadataJson: JSON.stringify(metadata),
          createdByUserId: Number(user?.id || 0) || null,
          updatedByUserId: Number(user?.id || 0) || null,
        },
        update: {
          enabled: next.enabled,
          startHour: next.startHour,
          endHour: next.endHour,
          engineCount: next.maxConcurrency,
          batchSize: next.batchSize,
          metadataJson: JSON.stringify(metadata),
          updatedByUserId: Number(user?.id || 0) || null,
        },
      });
    }
    this.pausedOverride = !next.enabled;
    return this.getStatus();
  }

  async pause(user?: any) {
    return this.saveConfig(user || {}, { enabled: false });
  }

  async resume(user?: any) {
    this.pausedOverride = false;
    return this.saveConfig(user || {}, { enabled: true });
  }

  async runNow(user?: any) {
    const result = await this.processBatch({ force: true, requestedByUserId: Number(user?.id || 0) || null });
    return {
      run: result,
      status: await this.getStatus(),
    };
  }

  async runScheduledTick() {
    const config = await this.getConfig();
    if (!config.enabled || this.pausedOverride || this.running || !this.isWithinWindow(config)) return null;
    return this.processBatch({ force: false, requestedByUserId: null });
  }

  async getStatus() {
    const config = await this.getConfig();
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

    const status = this.running
      ? 'rodando'
      : !config.enabled || this.pausedOverride
        ? 'pausado'
        : 'dormindo';

    return {
      generatedAt: now.toISOString(),
      product: 'HBX Night Factory',
      status,
      config,
      storage: {
        radarLeadPoolAvailable: leadPoolAvailable,
        radarLeadEnrichmentAvailable: enrichmentAvailable,
        recoveryOpportunityAvailable: recoveryAvailable,
      },
      window: {
        timezone: 'America/Sao_Paulo',
        startHour: config.startHour,
        endHour: config.endHour,
        activeNow: this.isWithinWindow(config, now),
        nextWindowLabel: this.nextWindowLabel(config),
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
        running: this.running,
        paused: !config.enabled || this.pausedOverride,
        lastRunAt: this.lastRunAt?.toISOString() || null,
        lastFinishedAt: this.lastFinishedAt?.toISOString() || null,
        lastError: this.lastError,
        lastRunStats: this.lastRunStats,
      },
      pipeline: [
        { key: 'captura', label: 'Captura', quantity: totalLeads, status: totalLeads > 0 ? 'ok' : 'aguardando' },
        { key: 'limpeza', label: 'Limpeza', quantity: enrichedToday, status: enrichedToday > 0 ? 'ok' : 'aguardando' },
        { key: 'enriquecimento', label: 'Enriquecimento', quantity: enrichedToday, status },
        { key: 'score', label: 'Score', quantity: premiumToday, status: premiumToday > 0 ? 'ok' : 'aguardando' },
        { key: 'script', label: 'Script', quantity: enrichedToday, status: enrichedToday > 0 ? 'ok' : 'aguardando' },
        { key: 'recovery', label: 'Recovery', quantity: recoveryToday, status: recoveryToday > 0 ? 'ok' : 'aguardando' },
        { key: 'vendas', label: 'Vendas', quantity: premiumToday, status: 'pronto' },
      ],
      topCities,
      topSegments,
      copy: {
        title: 'Enquanto você dorme, o HBX caça oportunidades.',
        subtitle: 'Seu servidor não fica parado: ele transforma dados em vendas.',
        action: premiumToday > 0 ? 'Abrir Top Oportunidades' : 'Rodar agora',
      },
    };
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
      take,
    }).catch(() => []);

    return {
      generatedAt: new Date().toISOString(),
      items: rows.map((row: any) => this.mapLeadOpportunity(row)),
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

  async processBatch(options: { force?: boolean; requestedByUserId?: number | null } = {}) {
    if (this.running) {
      return { skipped: true, reason: 'Night Factory já está rodando.' };
    }
    const config = await this.getConfig();
    if (!options.force && (!config.enabled || this.pausedOverride || !this.isWithinWindow(config))) {
      return { skipped: true, reason: 'Fora da janela da Night Factory.' };
    }
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { skipped: true, reason: 'RadarLeadPool indisponível.' };
    }

    this.running = true;
    this.lastRunAt = new Date();
    this.lastError = null;
    const stats = { processed: 0, enriched: 0, failed: 0, premium: 0, recovery: 0 };
    try {
      const leads = await this.pickLeadsForEnrichment(config);
      let cursor = 0;
      const workerCount = Math.max(1, Math.min(config.maxConcurrency, leads.length || 1));
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (cursor < leads.length) {
          const index = cursor;
          cursor += 1;
          const lead = leads[index];
          if (!lead) continue;
          stats.processed += 1;
          try {
            const result = await this.enrichLead(lead, options.requestedByUserId || null);
            stats.enriched += 1;
            if (result.opportunityScore >= 85) stats.premium += 1;
            if (['no_answer', 'duplicate'].includes(String(lead.status || ''))) stats.recovery += 1;
          } catch (error) {
            stats.failed += 1;
            await this.markLeadFailed(lead, error).catch(() => null);
          }
        }
      }));
      if (config.allowRecoveryRevival) await this.persistRecoverySeeds().catch((error) => {
        this.logger.warn(`Night Factory recovery seed falhou: ${error instanceof Error ? error.message : String(error)}`);
      });
      this.lastRunStats = stats;
      return {
        skipped: false,
        startedAt: this.lastRunAt.toISOString(),
        finishedAt: new Date().toISOString(),
        stats,
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error || 'Falha desconhecida.');
      throw error;
    } finally {
      this.running = false;
      this.lastFinishedAt = new Date();
    }
  }

  private normalizeConfig(input: Partial<NightFactoryConfig>): NightFactoryConfig {
    return {
      enabled: coerceBoolean(input.enabled, DEFAULT_NIGHT_FACTORY_CONFIG.enabled),
      startHour: clamp(input.startHour, DEFAULT_NIGHT_FACTORY_CONFIG.startHour, 0, 23),
      endHour: clamp(input.endHour, DEFAULT_NIGHT_FACTORY_CONFIG.endHour, 0, 23),
      maxConcurrency: clamp(input.maxConcurrency, DEFAULT_NIGHT_FACTORY_CONFIG.maxConcurrency, 1, 8),
      batchSize: clamp(input.batchSize, DEFAULT_NIGHT_FACTORY_CONFIG.batchSize, 1, 200),
      maxLeadsPerNight: clamp(input.maxLeadsPerNight, DEFAULT_NIGHT_FACTORY_CONFIG.maxLeadsPerNight, 10, 10000),
      enrichOnlyNewLeads: coerceBoolean(input.enrichOnlyNewLeads, DEFAULT_NIGHT_FACTORY_CONFIG.enrichOnlyNewLeads),
      allowWebsiteFetch: coerceBoolean(input.allowWebsiteFetch, DEFAULT_NIGHT_FACTORY_CONFIG.allowWebsiteFetch),
      allowScreenshot: coerceBoolean(input.allowScreenshot, DEFAULT_NIGHT_FACTORY_CONFIG.allowScreenshot),
      allowAiSuggestions: coerceBoolean(input.allowAiSuggestions, DEFAULT_NIGHT_FACTORY_CONFIG.allowAiSuggestions),
      allowRecoveryRevival: coerceBoolean(input.allowRecoveryRevival, DEFAULT_NIGHT_FACTORY_CONFIG.allowRecoveryRevival),
      allowVendasQueuePush: coerceBoolean(input.allowVendasQueuePush, DEFAULT_NIGHT_FACTORY_CONFIG.allowVendasQueuePush),
      cpuSoftLimitPercent: clamp(input.cpuSoftLimitPercent, DEFAULT_NIGHT_FACTORY_CONFIG.cpuSoftLimitPercent, 10, 100),
      memorySoftLimitPercent: clamp(input.memorySoftLimitPercent, DEFAULT_NIGHT_FACTORY_CONFIG.memorySoftLimitPercent, 10, 100),
    };
  }

  private getSaoPauloHour(now = new Date()) {
    try {
      const value = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }).format(now);
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : now.getHours();
    } catch {
      return now.getHours();
    }
  }

  private isWithinWindow(config: NightFactoryConfig, now = new Date()) {
    const hour = this.getSaoPauloHour(now);
    if (config.startHour === config.endHour) return true;
    if (config.startHour < config.endHour) return hour >= config.startHour && hour < config.endHour;
    return hour >= config.startHour || hour < config.endHour;
  }

  private nextWindowLabel(config: NightFactoryConfig) {
    return `${String(config.startHour).padStart(2, '0')}:00-${String(config.endHour).padStart(2, '0')}:00 America/Sao_Paulo`;
  }

  private async pickLeadsForEnrichment(config: NightFactoryConfig) {
    const where: Record<string, any> = {
      status: { notIn: BLOCKED_RADAR_STATUSES },
      OR: [
        { phoneDigits: { not: null } },
        { phone: { not: null } },
      ],
    };
    if (config.enrichOnlyNewLeads) {
      where.AND = [{
        OR: [
          { opportunityScore: { lte: 0 } },
          { opportunityReason: null },
          { updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
        ],
      }];
    }
    return (this.prisma as any).radarLeadPool.findMany({
      where,
      orderBy: [{ opportunityScore: 'asc' }, { lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(config.batchSize, config.maxLeadsPerNight),
    }).catch(() => []);
  }

  private buildLightweightEnrichment(lead: any) {
    const website = safeText(lead?.website, 600);
    const websiteStatus = safeText(lead?.websiteStatus || (website ? 'present' : 'none'), 40) || 'unknown';
    const sourceUrl = safeText(lead?.sourceUrl, 600);
    const hasInstagram = sourceUrl.toLowerCase().includes('instagram') || website.toLowerCase().includes('instagram');
    const hasFacebook = sourceUrl.toLowerCase().includes('facebook') || website.toLowerCase().includes('facebook');
    return {
      websiteUrl: website || null,
      websiteStatus,
      hasWebsite: Boolean(website),
      hasWhatsappOnSite: /wa\.me|api\.whatsapp|whatsapp/i.test(website) || /wa\.me|api\.whatsapp|whatsapp/i.test(sourceUrl),
      whatsappFound: null,
      hasInstagram,
      instagramUrl: hasInstagram ? sourceUrl || website : null,
      hasFacebook,
      googleMapsUrl: String(lead?.source || '').toLowerCase().includes('google') ? sourceUrl || null : null,
      pageLoadMs: null,
      sslOk: website ? website.startsWith('https://') : null,
      hasBookingLink: /agenda|booking|calendly|doctoralia/i.test([website, sourceUrl].join(' ')),
      hasCatalog: /catalog|catalogo|produto|loja/i.test([website, sourceUrl].join(' ')),
      hasMenu: /cardapio|menu/i.test([website, sourceUrl].join(' ')),
      hasPaymentLink: /pagamento|checkout|pix|mercadopago/i.test([website, sourceUrl].join(' ')),
      hasLeadCaptureForm: /form|contato|orcamento|orçamento/i.test([website, sourceUrl].join(' ')),
      formLooksBroken: false,
    };
  }

  private async enrichLead(lead: any, requestedByUserId: number | null) {
    const enrichment = this.buildLightweightEnrichment(lead);
    const score = calculateHbxOpportunityScore(lead, enrichment);
    const metadata = parseJsonRecord(lead?.metadataJson);
    const now = new Date();
    const miniAuditTitle = `Diagnóstico gratuito da presença digital da ${safeText(lead?.name, 90) || 'empresa'}`;
    const miniAuditSummary = [
      score.opportunityReason,
      `Oferta sugerida: ${score.recommendedOffer}.`,
      'A sugestão é preparada para aprovação humana. Nenhum WhatsApp é disparado automaticamente.',
    ].join(' ');

    await (this.prisma as any).radarLeadPool.update({
      where: { id: lead.id },
      data: {
        websiteStatus: enrichment.websiteStatus || lead.websiteStatus || 'unknown',
        opportunityScore: score.opportunityScore,
        opportunityReason: score.opportunityReason,
        metadataJson: JSON.stringify({
          ...metadata,
          nightFactory: {
            checkedAt: now.toISOString(),
            digitalPresenceScore: score.digitalPresenceScore,
            opportunityLevel: score.opportunityLevel,
            recommendedOffer: score.recommendedOffer,
            suggestedApproach: score.suggestedApproach,
            suggestedWhatsappMessage: score.suggestedWhatsappMessage,
            suggestedHumanOpening: score.suggestedHumanOpening,
            detectedProblems: score.detectedProblems,
            detectedAssets: score.detectedAssets,
            segmentPlaybookKey: score.segmentPlaybookKey,
            miniAuditTitle,
            miniAuditSummary,
            requestedByUserId,
          },
        }),
      },
    });

    if (await this.prisma.hasTable('RadarLeadEnrichment').catch(() => false)) {
      await (this.prisma as any).radarLeadEnrichment.upsert({
        where: { radarLeadId: lead.id },
        create: {
          radarLeadId: lead.id,
          companyId: lead.companyId || null,
          sourceLeadPoolId: lead.id,
          enrichmentStatus: 'enriched',
          checkedAt: now,
          websiteCheckedAt: now,
          websiteUrl: enrichment.websiteUrl,
          websiteStatus: enrichment.websiteStatus,
          hasWebsite: enrichment.hasWebsite,
          hasWhatsappOnSite: enrichment.hasWhatsappOnSite,
          whatsappFound: enrichment.whatsappFound,
          hasInstagram: enrichment.hasInstagram,
          instagramUrl: enrichment.instagramUrl,
          hasFacebook: enrichment.hasFacebook,
          googleMapsUrl: enrichment.googleMapsUrl,
          pageLoadMs: enrichment.pageLoadMs,
          sslOk: enrichment.sslOk,
          hasBookingLink: enrichment.hasBookingLink,
          hasCatalog: enrichment.hasCatalog,
          hasMenu: enrichment.hasMenu,
          hasPaymentLink: enrichment.hasPaymentLink,
          hasLeadCaptureForm: enrichment.hasLeadCaptureForm,
          formLooksBroken: enrichment.formLooksBroken,
          digitalPresenceScore: score.digitalPresenceScore,
          opportunityScore: score.opportunityScore,
          opportunityLevel: score.opportunityLevel,
          opportunityReason: score.opportunityReason,
          recommendedOffer: score.recommendedOffer,
          suggestedApproach: score.suggestedApproach,
          suggestedWhatsappMessage: score.suggestedWhatsappMessage,
          suggestedHumanOpening: score.suggestedHumanOpening,
          detectedProblems: JSON.stringify(score.detectedProblems),
          detectedAssets: JSON.stringify(score.detectedAssets),
          segmentPlaybookKey: score.segmentPlaybookKey,
          miniAuditTitle,
          miniAuditSummary,
        },
        update: {
          enrichmentStatus: 'enriched',
          enrichmentError: null,
          checkedAt: now,
          websiteCheckedAt: now,
          websiteUrl: enrichment.websiteUrl,
          websiteStatus: enrichment.websiteStatus,
          hasWebsite: enrichment.hasWebsite,
          hasWhatsappOnSite: enrichment.hasWhatsappOnSite,
          whatsappFound: enrichment.whatsappFound,
          hasInstagram: enrichment.hasInstagram,
          instagramUrl: enrichment.instagramUrl,
          hasFacebook: enrichment.hasFacebook,
          googleMapsUrl: enrichment.googleMapsUrl,
          pageLoadMs: enrichment.pageLoadMs,
          sslOk: enrichment.sslOk,
          hasBookingLink: enrichment.hasBookingLink,
          hasCatalog: enrichment.hasCatalog,
          hasMenu: enrichment.hasMenu,
          hasPaymentLink: enrichment.hasPaymentLink,
          hasLeadCaptureForm: enrichment.hasLeadCaptureForm,
          formLooksBroken: enrichment.formLooksBroken,
          digitalPresenceScore: score.digitalPresenceScore,
          opportunityScore: score.opportunityScore,
          opportunityLevel: score.opportunityLevel,
          opportunityReason: score.opportunityReason,
          recommendedOffer: score.recommendedOffer,
          suggestedApproach: score.suggestedApproach,
          suggestedWhatsappMessage: score.suggestedWhatsappMessage,
          suggestedHumanOpening: score.suggestedHumanOpening,
          detectedProblems: JSON.stringify(score.detectedProblems),
          detectedAssets: JSON.stringify(score.detectedAssets),
          segmentPlaybookKey: score.segmentPlaybookKey,
          miniAuditTitle,
          miniAuditSummary,
        },
      }).catch((error) => {
        this.logger.warn(`Falha ao gravar RadarLeadEnrichment: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    return score;
  }

  private async markLeadFailed(lead: any, error: unknown) {
    if (!(await this.prisma.hasTable('RadarLeadEnrichment').catch(() => false))) return;
    await (this.prisma as any).radarLeadEnrichment.upsert({
      where: { radarLeadId: lead.id },
      create: {
        radarLeadId: lead.id,
        companyId: lead.companyId || null,
        sourceLeadPoolId: lead.id,
        enrichmentStatus: 'failed',
        enrichmentError: error instanceof Error ? error.message.slice(0, 500) : String(error || 'Falha no enriquecimento.').slice(0, 500),
      },
      update: {
        enrichmentStatus: 'failed',
        enrichmentError: error instanceof Error ? error.message.slice(0, 500) : String(error || 'Falha no enriquecimento.').slice(0, 500),
      },
    });
  }

  private mapLeadOpportunity(row: any) {
    const metadata = parseJsonRecord(row?.metadataJson).nightFactory || {};
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
      score: safeInteger(row?.opportunityScore),
      level: metadata.opportunityLevel || (safeInteger(row?.opportunityScore) >= 85 ? 'premium' : safeInteger(row?.opportunityScore) >= 65 ? 'bom' : 'medio'),
      reason: row?.opportunityReason || metadata.opportunityReason || 'Oportunidade detectada pela Night Factory.',
      opportunityReason: row?.opportunityReason || metadata.opportunityReason || null,
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

    return rows.filter((row: any) => this.isRewardLeadUsable(row)).slice(0, take);
  }

  private isRewardLeadUsable(row: any) {
    const phone = String(row?.phoneDigits || row?.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return false;
    const status = String(row?.status || '').trim().toLowerCase();
    if (REWARD_BLOCKED_RADAR_STATUSES.includes(status)) return false;
    return safeInteger(row?.opportunityScore) >= 70;
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

  private async persistRecoverySeeds() {
    if (!(await this.prisma.hasTable('RecoveryOpportunity').catch(() => false))) return;
    const items = await this.buildComputedRecoveryOpportunities(30);
    for (const item of items) {
      if (!item.sourceType || !item.sourceId) continue;
      await (this.prisma as any).recoveryOpportunity.upsert({
        where: {
          sourceType_sourceId_companyId: {
            sourceType: item.sourceType,
            sourceId: String(item.sourceId),
            companyId: item.companyId || 0,
          },
        },
        create: {
          sourceType: item.sourceType,
          sourceId: String(item.sourceId),
          companyId: item.companyId || 0,
          recoveryReason: item.recoveryReason,
          recoveryScore: item.recoveryScore,
          suggestedFlow: item.suggestedFlow,
          suggestedMessage: item.suggestedMessage,
          suggestedTemplate: item.suggestedTemplate || null,
          status: 'ready',
          metadataJson: JSON.stringify({ generatedBy: 'night_factory' }),
        },
        update: {
          recoveryReason: item.recoveryReason,
          recoveryScore: item.recoveryScore,
          suggestedFlow: item.suggestedFlow,
          suggestedMessage: item.suggestedMessage,
          status: 'ready',
          metadataJson: JSON.stringify({ generatedBy: 'night_factory' }),
        },
      }).catch(() => null);
    }
  }
}
