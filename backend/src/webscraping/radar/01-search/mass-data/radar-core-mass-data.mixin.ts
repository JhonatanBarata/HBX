// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  randomUUID,
  XLSX,
  probeWebscrapingRuntime,
  buildHbxPresentationEmailDraft,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  isHbxEngineLocalhostUrl,
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  resolveCommercialPlanKeyForCapabilities,
  buildRadarLeadEnrichment,
  RADAR_LEAD_ENRICHMENT_VERSION,
  calculateLeadQualityV2,
  resolveRadarVisibilityFromQualityV2,
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
  PLACES_NEW_TEXT_SEARCH_URL,
  PLACES_NEW_DETAILS_URL,
  PLACES_TEXT_SEARCH_URL,
  PLACES_DETAILS_URL,
  MAX_QUANTITY,
  HBX_PJ_MAX_QUANTITY,
  HBX_PEOPLE_MAX_QUANTITY,
  DEFAULT_HBX_SCRAPING_ENGINE_URL,
  GLOBAL_CACHE_TTL_HOURS,
  RECENT_HISTORY_LIMIT,
  IBGE_CITIES_URL,
  CITY_CACHE_TTL_MS,
  MASS_DATA_INTERNAL_SEGMENTS,
  ACRE_CITIES_FALLBACK,
  AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK,
  AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
  AUTONOMOUS_MASS_DATA_MAX_TASKS,
  DEFAULT_MASS_DATA_ENGINE_URLS,
  TURBO_OPERATIONAL_CONFIG_KEY,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  GENERIC_DIRECTORY_NAMES,
  GENERIC_DIRECTORY_PREFIXES,
  GENERIC_DIRECTORY_CONTAINS,
  GENERIC_CATEGORY_HEADS,
  VERTICAL_TOKEN_GROUPS,
  GooglePlacesApiError,
  HbxBatchError,
  normalizePhoneDigits,
  isLikelyValidBrPhone,
  isLikelyWhatsapp,
  toNumberOrNull,
  clampQuantity,
  normalizeLookupValue,
  normalizeWebsiteKey,
  RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS,
  normalizeSocialProfileKey,
  looksLikeThirdPartySocialProfile,
  RADAR_SOCIAL_BLOCKED_PATH_PARTS,
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  socialHandleFromUrl,
  cityInitialsKey,
  socialTokenVariants,
  socialCategoryTokenVariants,
  hasTrustedEngineSocialSignal,
  socialProfileLooksCompatibleWithLead,
  getWebsiteHost,
  websiteHostLooksCompatibleWithLead,
  inferWebsiteStatus,
  RADAR_BAD_EMAIL_LOCAL_PARTS,
  RADAR_BAD_EMAIL_DOMAINS,
  RADAR_BAD_EMAIL_TLDS,
  normalizeBusinessEmail,
  parseJsonArray,
  parseJsonObject,
  isFallbackEligible,
  coerceBoolean,
  normalizeEngine,
  normalizeEnginePurpose,
  isAutomaticEnginePurpose,
  normalizeTargetType,
  parsePositiveInteger,
  maxQuantityFor,
  safeInteger,
  clampInteger,
  parsePositiveIntegerEnv,
  minutesAgo,
  formatCityWithState,
} from '../../radar-core-method-imports';

import type {
  AutonomousMassDataCandidate,
  AutonomousMassDataStrategyMode,
  AutonomousMassDataWork,
  AutonomousMassDataWorkReason,
  ExternalRuntimeStatus,
  GlobalCacheRow,
  HbxBatchStatus,
  HbxDeliveryClassification,
  HbxDeliveryProduct,
  HbxEngineLease,
  HbxEnginePurpose,
  HbxEngineSearchOutput,
  HbxRuntimeDiagnostic,
  HistoryPlaceColumnSupport,
  HbxTargetType,
  HbxVisibilityTier,
  LeadQualityResult,
  LeadQualityStatus,
  LeadQualityV2,
  LeadQualityV2SalesProfile,
  MasterMassDataCampaignInput,
  NativeRuntimeDiagnostic,
  NormalizedRadarFilters,
  NormalizedSearchInput,
  NormalizeSearchInputOptions,
  PlaceDetails,
  RadarCampaignInput,
  RadarChannelFilter,
  RadarChannelMatchMode,
  RadarFiltersInput,
  RadarLeadEventType,
  RadarLeadStatus,
  RadarOperationalState,
  RadarOpportunityLevel,
  RadarSearchRunMetrics,
  RadarSearchRunMetricsPatch,
  RadarWebsiteStatus,
  RadarWhatsappCheckMode,
  RadarWhatsappCheckStatus,
  RegionalCity,
  RuntimeStatus,
  SearchContactsInput,
  SearchExecutionContext,
  SearchExecutionOptions,
  SearchHistoryRow,
  SearchPlacesCandidate,
  SearchRunStatus,
  SearchSource,
  UsageEventType,
  UsageExecutionMeta,
  WebscrapingContactResult,
  WebscrapingEngine,
  WebscrapingHistorySummary,
  WebscrapingOperationalConfigInput,
  WebscrapingRuntimeDiagnostic,
  WebscrapingRuntimeResponse,
  WebscrapingSearchFilters,
  WebscrapingSearchResponse,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunResponse,
  WebscrapingSearchRunStatus,
} from '../../radar-core-method-imports';

export class RadarCoreMassDataMixin {
  [key: string]: any;
  async getMasterMassDataControl(user: any) {
    const now = new Date();
    const todayStart = this.startOfLocalDay(now);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const config = await this.getOperationalConfig();
    const tableSupport = await Promise.all([
      this.prisma.hasTable('WebscrapingCampaign').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignBatch').catch(() => false),
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('WebscrapingSearchRun').catch(() => false),
    ]);
    const [hasCampaign, hasTask, hasBatch, hasLeadPool, hasSearchRun] = tableSupport;
    const databaseMessages: string[] = [];
    let databaseStatus: 'ok' | 'warning' | 'error' = 'ok';
    const markDatabaseWarning = () => {
      if ((databaseStatus as string) !== 'error') databaseStatus = 'warning';
    };
    const withDatabaseGuard = async <T>(label: string, fallback: T, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (error) {
        databaseStatus = 'error';
        const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
        databaseMessages.push(`${label}: ${message}`);
        return fallback;
      }
    };

    const engines = await this.getEnginePool().getDashboardEngineStatus().catch((error) => {
      markDatabaseWarning();
      databaseMessages.push(`Motores: ${error instanceof Error ? error.message : String(error || 'healthcheck indisponivel')}`);
      return null;
    });
    const capacity = engines?.capacity || null;
    const schedulerStatus = capacity?.scheduler || await this.getEnginePool().getSchedulerStatus().catch(() => null);
    const hbxEngines = (engines?.engines || []).filter((engine: any) => String(engine.id || '').startsWith('hbx-engine'));
    const configuredHbxEngines = hbxEngines.filter((engine: any) => engine.configured);
    const isPausedEngine = (engine: any) => {
      const pausedUntil = engine?.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;
      return Boolean(engine?.manualPaused)
        || String(engine?.status || '').toLowerCase() === 'paused'
        || String(engine?.stateLabel || '').toLowerCase().includes('pausado')
        || (Number.isFinite(pausedUntil) && pausedUntil > now.getTime());
    };
    const onlineHbxEngines = configuredHbxEngines.filter((engine: any) => engine.online);
    const pausedHbxEngines = configuredHbxEngines.filter((engine: any) => isPausedEngine(engine));
    const cooldownHbxEngines = configuredHbxEngines.filter((engine: any) => !isPausedEngine(engine) && this.dashboardEngineStatus(engine) === 'cooldown');
    const runningHbxEngines = configuredHbxEngines.filter((engine: any) => !isPausedEngine(engine) && this.dashboardEngineStatus(engine) === 'running');
    const offlineHbxEngines = configuredHbxEngines.filter((engine: any) => {
      if (isPausedEngine(engine) || this.dashboardEngineStatus(engine) === 'cooldown') return false;
      const status = String(engine.status || '').toLowerCase();
      return !engine.online || ['offline', 'missing', 'degraded', 'error'].includes(status);
    });
    const allOffline = configuredHbxEngines.length > 0 && offlineHbxEngines.length === configuredHbxEngines.length;
    const configuredEngineCount = getConfiguredHbxEngineCount();
    const totalConfiguredEngines = Math.max(configuredEngineCount, configuredHbxEngines.length);
    const activeEngineCount = Math.max(1, Math.min(configuredEngineCount, safeInteger(capacity?.activeEngineCount, safeInteger(config.engineCount, configuredEngineCount))));
    const activeQueue = safeInteger(capacity?.queuedCount) + safeInteger(capacity?.runningCount);

    const [campaigns, productionRows, cardsTodayCount, batchRows, taskStatusRows, errors24hParts] = await Promise.all([
      hasCampaign
        ? withDatabaseGuard('Campanhas', [], () => (this.prisma as any).webscrapingCampaign.findMany({
            where: { mode: 'mass_data' },
            orderBy: { createdAt: 'desc' },
            take: 6,
            include: {
              batches: { orderBy: { createdAt: 'desc' }, take: 8 },
              tasks: { orderBy: { updatedAt: 'desc' }, take: 500 },
            },
          }))
        : Promise.resolve([]),
      hasLeadPool
        ? withDatabaseGuard('ProduÃ§Ã£o', [], () => (this.prisma as any).radarLeadPool.findMany({
            orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
            take: 24,
            select: {
              id: true,
              name: true,
              phone: true,
              phoneDigits: true,
              city: true,
              state: true,
              source: true,
              sourceEngine: true,
              status: true,
              lastSeenAt: true,
              createdAt: true,
            },
          }))
        : Promise.resolve([]),
      hasLeadPool
        ? withDatabaseGuard('Cards hoje', 0, () => (this.prisma as any).radarLeadPool.count({
            where: { createdAt: { gte: todayStart } },
          }))
        : Promise.resolve(0),
      hasBatch
        ? withDatabaseGuard('Lotes por motor', [], () => (this.prisma as any).webscrapingCampaignBatch.findMany({
            where: { createdAt: { gte: todayStart } },
            select: {
              engineId: true,
              approvedCount: true,
              duplicateCount: true,
              rejectedCount: true,
              status: true,
              errorMessage: true,
              finishedAt: true,
              startedAt: true,
              createdAt: true,
            },
            take: 5000,
          }))
        : Promise.resolve([]),
      hasTask
        ? withDatabaseGuard('Fila de tarefas', [], () => (this.prisma as any).webscrapingCampaignTask.groupBy({
            by: ['status'],
            _count: { _all: true },
          }))
        : Promise.resolve([]),
      Promise.all([
        hasCampaign
          ? withDatabaseGuard('Erros de campanha 24h', 0, () => (this.prisma as any).webscrapingCampaign.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
        hasTask
          ? withDatabaseGuard('Erros de tarefa 24h', 0, () => (this.prisma as any).webscrapingCampaignTask.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
        hasBatch
          ? withDatabaseGuard('Erros de lote 24h', 0, () => (this.prisma as any).webscrapingCampaignBatch.count({
              where: {
                createdAt: { gte: twentyFourHoursAgo },
                OR: [
                  { status: { contains: 'error' } },
                  { errorMessage: { not: null } },
                ],
              },
            }))
          : Promise.resolve(0),
        hasSearchRun
          ? withDatabaseGuard('Erros de busca 24h', 0, () => (this.prisma as any).webscrapingSearchRun.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
      ]),
    ]);

    if (!hasLeadPool || !hasBatch || !hasTask) {
      markDatabaseWarning();
      databaseMessages.push('Algumas tabelas operacionais ainda nÃ£o estÃ£o disponÃ­veis para o painel completo.');
    }

    const statsByEngine = new Map<string, {
      cardsFabricated: number;
      batches: number;
      duplicates: number;
      rejected: number;
      lastError: string | null;
    }>();
    for (const row of batchRows as any[]) {
      const engineId = String(row?.engineId || '').trim();
      if (!engineId) continue;
      const current = statsByEngine.get(engineId) || {
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        lastError: null,
      };
      current.cardsFabricated += safeInteger(row?.approvedCount);
      current.batches += 1;
      current.duplicates += safeInteger(row?.duplicateCount);
      current.rejected += safeInteger(row?.rejectedCount);
      if (!current.lastError && row?.errorMessage) current.lastError = String(row.errorMessage).slice(0, 220);
      statsByEngine.set(engineId, current);
    }

    const queueByStatus = (taskStatusRows as any[]).reduce((acc: Record<string, number>, item: any) => {
      const status = String(item?.status || 'queued');
      acc[status] = safeInteger(item?._count?._all);
      return acc;
    }, {});

    const elapsedMinutesToday = Math.max(1, (now.getTime() - todayStart.getTime()) / 60_000);
    const cardsPerMinuteAvg = Math.round((safeInteger(cardsTodayCount) / elapsedMinutesToday) * 100) / 100;
    const forcedTurboActive = this.isForcedOperationalWindow(config, now);
    const scheduledTurboActive = this.isWithinConfiguredOperationalWindow(config, now);
    const turboEndsAt = forcedTurboActive
      ? this.toIso(config.forcedUntil)
      : this.nextOperationalWindowEndAt(config, now).toISOString();
    const criticalReason = allOffline
      ? 'Todos os motores HBX estÃ£o offline.'
      : String(capacity?.operationalStatus || '') === 'degraded'
        ? capacity?.message || 'Campanha travada sem progresso real.'
        : (databaseStatus as string) === 'error'
          ? 'Banco indisponÃ­vel para o dashboard operacional.'
          : null;
    const currentMode = criticalReason
      ? 'CRÃTICO'
      : forcedTurboActive
        ? 'TURBO FORÃ‡ADO'
        : scheduledTurboActive
          ? 'TURBO NOTURNO'
          : activeQueue > 0
            ? 'FILA ATIVA'
            : 'STANDBY';
    const engineHealthStatus: 'ok' | 'warning' | 'error' = allOffline
      ? 'error'
      : offlineHbxEngines.length > 0
        ? 'warning'
        : 'ok';
    const queueStatus: 'ok' | 'warning' | 'error' = String(capacity?.operationalStatus || '') === 'degraded'
      ? 'error'
      : safeInteger(capacity?.oldestQueuedAgeMinutes) >= 5
        ? 'warning'
        : 'ok';
    const diagnosticsMessages = [
      activeQueue > 0 ? `Fila ativa com ${activeQueue} item(ns).` : 'Fila sem pendÃªncias.',
      databaseStatus === 'ok' ? 'GravaÃ§Ãµes no banco acessÃ­veis.' : null,
      engineHealthStatus === 'ok' ? 'Motores com healthcheck saudÃ¡vel.' : null,
      pausedHbxEngines.length > 0 ? `${pausedHbxEngines.length} motor(es) pausado(s) pelo painel.` : null,
      ...databaseMessages,
      ...offlineHbxEngines.slice(0, getConfiguredHbxEngineCount()).map((engine: any) => `${engine.shortLabel || engine.id}: ${engine.lastError || engine.stateLabel || 'sem resposta'}`),
      criticalReason,
    ].filter(Boolean) as string[];

    const localhostLockWarnings = hbxEngines
      .filter((engine: any) => {
        const lockUrl = String(engine?.lockUrl || engine?.url || '').trim();
        return Boolean(engine?.localhostInProduction || (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && lockUrl && isHbxEngineLocalhostUrl(lockUrl)));
      })
      .map((engine: any) => ({
        route: engine.id || 'hbx-engine',
        statusCode: 0,
        message: 'Motor configurado com localhost em produÃ§Ã£o. Isso quebra o Docker. Corrigir URLs dos motores.',
        createdAt: now.toISOString(),
      }));

    const dashboardEngineCount = Math.max(totalConfiguredEngines, hbxEngines.length);
    const dashboardEngines = Array.from({ length: dashboardEngineCount }, (_, index) => {
      const engine = hbxEngines[index] || null;
      const id = String(engine?.id || `hbx-engine-${index + 1}`);
      const status = this.dashboardEngineStatus(engine);
      const productionStats = statsByEngine.get(id) || {
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        lastError: null,
      };
      const queue = status === 'offline' || status === 'paused' || status === 'cooldown'
        ? 0
        : status === 'running'
          ? Math.max(1, safeInteger(engine?.queueShare) ? Math.ceil(activeQueue * (safeInteger(engine?.queueShare) / 100)) : safeInteger(capacity?.runningCount))
          : activeQueue > 0 && index < activeEngineCount
            ? Math.ceil(activeQueue / activeEngineCount)
            : 0;
      return {
        id,
        label: `M${index + 1}`,
        status,
        desiredState: engine?.desiredState || null,
        actualState: engine?.actualState || null,
        containerName: engine?.containerName || id,
        memoryRssMb: engine?.memoryRssMb ?? null,
        memoryEwmaMb: engine?.memoryEwmaMb ?? null,
        drainUntil: engine?.drainUntil || null,
        idleSince: engine?.idleSince || null,
        priorityClass: engine?.priorityClass || null,
        lastLeasePurpose: engine?.lastLeasePurpose || null,
        leaseActive: Boolean(engine?.leaseActive),
        stopEligible: Boolean(engine?.stopEligible),
        configured: Boolean(engine?.configured ?? index < totalConfiguredEngines),
        online: Boolean(engine?.online),
        busy: Boolean(engine?.busy || engine?.activeRunId || engine?.activeCampaignId),
        active: Boolean(engine?.active),
        usagePercent: safeInteger(engine?.usagePercent),
        stateLabel: engine?.stateLabel || null,
        detail: engine?.detail || null,
        cardsFabricated: productionStats.cardsFabricated,
        batches: productionStats.batches,
        duplicates: productionStats.duplicates,
        rejected: productionStats.rejected,
        queue,
        lastActivityAt: this.toIso(engine?.lastActivityAt || engine?.lastCheckedAt),
        activeCampaignId: engine?.activeCampaignId || null,
        lastError: engine?.lastError || productionStats.lastError || null,
        lockUrl: engine?.lockUrl || null,
        cooldownUntil: engine?.cooldownUntil || null,
        manualPaused: Boolean(engine?.manualPaused),
        pausedUntil: engine?.pausedUntil || null,
        localhostInProduction: Boolean(engine?.localhostInProduction),
      };
    });

    const warnings = [
      ...localhostLockWarnings,
      ...offlineHbxEngines.map((engine: any) => ({
        route: engine.id || 'hbx-engine',
        statusCode: 0,
        message: engine.lastError || engine.detail || 'Motor sem healthcheck.',
        createdAt: now.toISOString(),
      })),
      ...(String(capacity?.operationalStatus || '') === 'degraded'
        ? [{
            route: 'webscraping/capacity',
            statusCode: 0,
            message: capacity?.message || 'Fila travada sem progresso.',
            createdAt: now.toISOString(),
          }]
        : []),
      ...databaseMessages.map((message) => ({
        route: 'database',
        statusCode: 0,
        message,
        createdAt: now.toISOString(),
      })),
    ].slice(0, 8);
    const autonomousWork = hasTask
      ? await withDatabaseGuard<AutonomousMassDataWork | null>(
          'Estrategia autonoma',
          null,
          () => this.resolveAutonomousMassDataWork((campaigns as any[])[0] || {}, { now, limit: 40 }),
        )
      : null;

    return {
      generatedAt: now.toISOString(),
      turbo: {
        active: forcedTurboActive,
        scheduledActive: scheduledTurboActive,
        startedAt: forcedTurboActive ? this.toIso(config.forcedAt || config.updatedAt) : null,
        endsAt: turboEndsAt,
        remainingSeconds: forcedTurboActive ? this.secondsUntil(turboEndsAt, now) : 0,
        startLabel: this.formatTimeLabel(config.startHour, config.startMinute),
        endLabel: this.formatTimeLabel(config.endHour, config.endMinute),
      },
      summary: {
        cardsToday: safeInteger(cardsTodayCount),
        cardsPerMinuteAvg,
        activeQueue,
        errors24h: (errors24hParts as number[]).reduce((sum, value) => sum + safeInteger(value), 0),
        totalConfiguredEngines,
        onlineEngines: onlineHbxEngines.length,
        activeEngineLimit: activeEngineCount,
        runningEngines: runningHbxEngines.length,
        cooldownEngines: cooldownHbxEngines.length,
        pausedEngines: pausedHbxEngines.length,
        offlineEngines: offlineHbxEngines.length,
        totalEngines: totalConfiguredEngines,
      },
      scheduler: {
        manualReservedEngines: safeInteger(schedulerStatus?.manualReservedEngines),
        automaticAllowedEngines: safeInteger(schedulerStatus?.automaticAllowedEngines),
        memoryPressurePercent: safeInteger(schedulerStatus?.memoryPressurePercent),
        googleMode: 'manual_only',
        manualDemandActive: Boolean(schedulerStatus?.manualDemandActive),
        productionMode: schedulerStatus?.productionMode || 'full',
      },
      autonomousStrategy: {
        mode: autonomousWork?.mode || 'automatic',
        selectedState: autonomousWork?.state || null,
        selectedCity: autonomousWork?.city || null,
        selectedSegment: autonomousWork?.segment || null,
        reason: autonomousWork?.reason || 'fallback_national',
      },
      engines: dashboardEngines,
      production: (productionRows as any[]).map((row: any) => {
        const status = String(row?.status || '').toLowerCase();
        return {
          id: String(row?.id || ''),
          name: String(row?.name || 'Card sem nome'),
          phone: row?.phone || row?.phoneDigits || null,
          city: row?.city || null,
          state: row?.state || null,
          source: row?.source || row?.sourceEngine || null,
          createdAt: this.toIso(row?.lastSeenAt || row?.createdAt) || now.toISOString(),
          dbStatus: status === 'rejected' || status === 'duplicate' ? 'error' : row?.phone || row?.phoneDigits ? 'saved' : 'pending',
        };
      }),
      diagnostics: {
        queueStatus,
        databaseStatus,
        engineHealthStatus,
        messages: diagnosticsMessages.slice(0, 8),
      },
      warnings,
      status: {
        resumeEnabled: true,
        currentMode,
        critical: Boolean(criticalReason),
        criticalReason,
        nextTurboAt: this.nextOperationalWindowAt(config, now),
        localTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
        estimatedMemoryGb: Math.min(safeInteger(config.memoryTargetGb, 16), safeInteger(config.engineCount, 4) * 4),
        isTurboEnabled: Boolean(config.enabled),
        isTurboWindowActive: scheduledTurboActive,
        isTurboForcedNow: forcedTurboActive,
        forcedUntil: config.forcedUntil || null,
        operationalMessage: criticalReason
          || (forcedTurboActive
            ? `Turbo forÃ§ado ativo atÃ© ${this.formatTimeLabel(config.endHour, config.endMinute)}.`
            : `Turbo pronto. Ative para manter os motores atÃ© ${this.formatTimeLabel(config.endHour, config.endMinute)}.`),
      },
      config: {
        ...config,
        engineUrlsJson: undefined,
      },
      campaigns: (campaigns as any[]).map((campaign: any) => this.buildRadarCampaignResponse(campaign)),
      taskStatusCounts: queueByStatus,
    };
  }

  private async ensureAutonomousMassDataCampaign(user: any, config: any) {
    if (!config?.enabled || !config?.autonomousFillEnabled) return null;
    if (!(await this.supportsMassDataCampaignPersistence())) return null;
    const context = await this.resolveMasterCampaignContext(user, null);
    const active = await (this.prisma as any).webscrapingCampaign.findFirst({
      where: {
        companyId: context.companyId,
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    }).catch(() => null);
    if (active) return active;
    const campaign = await this.createRadarCampaignForUser(context.user, {
      mode: 'mass_data',
      state: '',
      city: '',
      segment: '',
      targetType: 'pj',
      targetTotal: config.autonomousFillBatchSize || AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
      batchSize: config.batchSize,
      maxAttemptsPerTask: config.maxAttemptsPerTask,
      preferredChannels: config.preferredChannels,
      requiredChannels: config.requiredChannels,
      channelMatchMode: config.channelMatchMode,
      freshness: config.freshness,
      nightOnly: true,
      allowedStartHour: config.startHour,
      allowedEndHour: config.endHour,
      timezone: 'America/Sao_Paulo',
    });
    this.logger.log(`[autonomous-bank] automatic campaign ensured campaign=${campaign?.id || 'created'} reason=no_guided_queue`);
    return campaign;
  }

  async saveMasterTurboConfig(user: any, input: WebscrapingOperationalConfigInput = {}) {
    const saved = await this.saveOperationalConfig(Number(user?.id || 0), input);
    if (!saved.enabled || saved.emergencyStop || safeInteger(saved.factoryMaxEngines) <= 0) {
      this.scheduleRadarCampaignPump(0);
      return {
        config: saved,
        control: await this.getMasterMassDataControl(user),
      };
    }
    const guidedLocationActive = Boolean(String(saved.factoryState || '').trim() && String(saved.factoryCity || '').trim());
    if (guidedLocationActive) {
      await (this.prisma as any).webscrapingCampaign.updateMany({
        where: {
          mode: 'mass_data',
          status: { in: ['queued', 'running', 'sleeping', 'partial_error', 'paused'] },
          OR: [
            { state: { not: saved.factoryState } },
            { city: { not: saved.factoryCity } },
          ],
        },
        data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null, lastErrorMessage: 'Substituida pela cidade fixa da fÃ¡brica.' },
      }).catch(() => null);
    }
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: {
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error', 'paused'] },
      },
      data: {
        nightOnly: !guidedLocationActive,
        allowedStartHour: saved.startHour,
        allowedEndHour: saved.endHour,
        batchSize: saved.batchSize,
        maxAttempts: saved.maxAttemptsPerTask,
      },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: {
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error'] },
      },
      data: { nextRunAt: new Date() },
    }).catch(() => null);
    if (guidedLocationActive) {
      await this.ensureNightFactoryWork(user).catch((error) => {
        this.logger.warn(`[radar-factory] guided campaign ensure failed: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
      });
    } else {
      await this.ensureAutonomousMassDataCampaign(user, saved).catch((error) => {
        this.logger.warn(`[autonomous-bank] automatic campaign ensure failed: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
      });
    }
    this.scheduleRadarCampaignPump(0);
    return {
      config: saved,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async forceMasterTurboNow(user: any, input: WebscrapingOperationalConfigInput = {}) {
    return this.saveMasterTurboConfig(user, {
      ...input,
      enabled: true,
      forceNow: true,
    });
  }

  async stopFactoryNow(user: any) {
    const saved = await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: true,
      emergencyStop: true,
      stopOutsideWindow: true,
      forcedUntil: '',
      maxEngines: 0,
      minEngines: 0,
    });
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'PARAR TUDO ativo pelo MASTER.', nextRunAt: null },
        update: { enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'PARAR TUDO ativo pelo MASTER.', nextRunAt: null },
      }).catch(() => null);
    }
    const drainUntil = new Date(Date.now() + Math.max(10, safeInteger(saved.drainTimeoutSeconds, 90)) * 1000);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error'] } },
      data: { status: 'paused', nextRunAt: null, lastErrorMessage: 'PARAR TUDO ativo pelo MASTER.' },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaign: { mode: 'mass_data' }, status: 'running', lockedByEngineId: { not: null } },
      data: { lockedUntil: drainUntil, lastError: 'PARAR TUDO ativo; batch atual deve drenar rapidamente.' },
    }).catch(() => null);
    await (this.prisma as any).hbxEngineLock?.updateMany?.({
      where: { lockedRunId: { contains: ':mass:' } },
      data: { lockedUntil: drainUntil, lastError: 'PARAR TUDO ativo; lock automÃ¡tico em drenagem curta.' },
    }).catch(() => null);
    await this.getEnginePool().drainFactoryEngines({
      force: true,
      seconds: safeInteger(saved.drainTimeoutSeconds, 90),
      reason: 'emergency_stop',
    }).catch((error) => {
      this.logger.warn(`[factory-stop] falha ao parar motores da fabrica: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
    });
    this.logger.warn('[factory-stop] emergency stop active; automaticAllowed=0');
    return {
      config: saved,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async cancelForcedRadarFactory(user: any, input: { seconds?: number | null; force?: boolean | null } = {}) {
    const saved = await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: false,
      emergencyStop: false,
      forcedUntil: '',
      maxEngines: 0,
      minEngines: 0,
      autonomousFillEnabled: false,
    });
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'Scraping forcado cancelado pelo MASTER.', nextRunAt: null },
        update: { enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'Scraping forcado cancelado pelo MASTER.', nextRunAt: null },
      }).catch(() => null);
    }
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error', 'paused'] } },
      data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null, lastErrorMessage: 'Scraping forcado cancelado pelo MASTER.' },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaign: { mode: 'mass_data' }, status: { in: ['queued', 'running'] } },
      data: {
        status: 'canceled',
        lockedByEngineId: null,
        lockedUntil: null,
        finishedAt: new Date(),
        lastError: 'Scraping forcado cancelado pelo MASTER.',
      },
    }).catch(() => null);
    await this.getEnginePool().drainFactoryEngines({
      force: Boolean(input.force),
      seconds: input.seconds,
      reason: 'cancel_forced',
    }).catch((error) => {
      this.logger.warn(`[factory-stop] falha ao drenar motores do cancelamento forcado: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
    });
    this.logger.warn('[factory-stop] forced factory canceled; automaticAllowed=0');
    return {
      config: saved,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async resumeFactorySchedule(user: any) {
    const saved = await this.saveOperationalConfig(Number(user?.id || 0), {
      emergencyStop: false,
      enabled: true,
      stopOutsideWindow: true,
      forcedUntil: '',
    });
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: true, forcedOn: false, status: 'idle', reasonStopped: null, nextRunAt: new Date() },
        update: { enabled: true, forcedOn: false, status: 'idle', reasonStopped: null, nextRunAt: new Date() },
      }).catch(() => null);
    }
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: 'paused' },
      data: { status: 'queued', nextRunAt: new Date(), lastErrorMessage: 'Agenda da fÃ¡brica retomada pelo MASTER.' },
    }).catch(() => null);
    this.scheduleRadarCampaignPump(0);
    return {
      config: saved,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async createMasterMassDataCampaign(user: any, input: MasterMassDataCampaignInput = {}) {
    const config = await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: input.enabled ?? true,
      startHour: input.startHour,
      startMinute: input.startMinute,
      endHour: input.endHour,
      endMinute: input.endMinute,
      engineCount: input.engineCount,
      intensity: input.intensity,
      memoryTargetGb: input.memoryTargetGb,
      batchSize: input.batchSize,
      maxAttemptsPerTask: input.maxAttemptsPerTask,
      autonomousFillEnabled: input.autonomousFillEnabled,
      autonomousFillBatchSize: input.autonomousFillBatchSize,
      preferredChannels: input.preferredChannels,
      requiredChannels: input.requiredChannels,
      channelMatchMode: input.channelMatchMode,
      freshness: input.freshness,
    });
    const context = await this.resolveMasterCampaignContext(user, input.companyId);
    const campaign = await this.createRadarCampaignForUser(context.user, {
      mode: 'mass_data',
      state: input.state,
      city: input.city || '',
      segment: input.segment || '',
      targetType: input.targetType || 'pj',
      targetTotal: input.targetTotal || 0,
      batchSize: config.batchSize,
      maxAttemptsPerTask: config.maxAttemptsPerTask,
      preferredChannels: config.preferredChannels,
      requiredChannels: config.requiredChannels,
      channelMatchMode: config.channelMatchMode,
      freshness: config.freshness,
      nightOnly: true,
      allowedStartHour: config.startHour,
      allowedEndHour: config.endHour,
      timezone: 'America/Sao_Paulo',
    });
    return {
      campaign,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async pauseRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id, mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error'] } },
      data: { status: 'paused', pausedAt: new Date(), nextRunAt: null },
    });
    return this.getMasterMassDataControl({});
  }

  async resumeRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    const row = await (this.prisma as any).webscrapingCampaign.findUnique({ where: { id } }).catch(() => null);
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    const sleeping = row.nightOnly && !this.isWithinRadarWindow(row);
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id },
      data: { status: sleeping ? 'sleeping' : 'queued', pausedAt: null, nextRunAt: sleeping ? this.nextRadarWindowAt(row) : new Date() },
    });
    this.scheduleRadarCampaignPump(0);
    return this.getMasterMassDataControl({});
  }

  async cancelRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id, mode: 'mass_data', status: { notIn: ['completed', 'failed', 'canceled'] } },
      data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null },
    });
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaignId: id, status: { in: ['queued', 'running'] } },
      data: { status: 'canceled', lockedByEngineId: null, lockedUntil: null, finishedAt: new Date() },
    }).catch(() => null);
    return this.getMasterMassDataControl({});
  }

  private async recalculateRadarCampaignCounters(campaignId: string) {
    const [campaign, rows, batches] = await Promise.all([
      (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null),
      (this.prisma as any).radarLeadPool.findMany({
        where: { campaignId },
        select: {
          status: true,
        },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignBatch.findMany({
        where: { campaignId },
        select: {
          duplicateCount: true,
          rejectedCount: true,
        },
      }).catch(() => []),
    ]);
    const foundCount = rows.length;
    const approvedCount = rows.filter((row: any) => ['clean', 'new'].includes(String(row.status || 'clean'))).length;
    const duplicateRows = rows.filter((row: any) => String(row.status || '') === 'duplicate').length;
    const rejectedRows = rows.filter((row: any) => String(row.status || '') === 'rejected').length;
    const duplicateBatches = batches.reduce((sum: number, row: any) => sum + safeInteger(row.duplicateCount), 0);
    const rejectedBatches = batches.reduce((sum: number, row: any) => sum + safeInteger(row.rejectedCount), 0);
    const duplicateCount = Math.max(duplicateRows, duplicateBatches);
    const rejectedCount = Math.max(rejectedRows, rejectedBatches);
    const complaintCount = rows.filter((row: any) => String(row.status || '') === 'complaint').length;
    const deniedCount = rows.filter((row: any) => String(row.status || '') === 'denied').length;
    const noAnswerCount = rows.filter((row: any) => String(row.status || '') === 'no_answer').length;
    if (campaign) {
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          foundCount,
          approvedCount,
          duplicateCount,
          rejectedCount,
          complaintCount,
          deniedCount,
          noAnswerCount,
        },
      }).catch(() => null);
    }
    return { foundCount, approvedCount, duplicateCount, rejectedCount, complaintCount, deniedCount, noAnswerCount };
  }

  private buildRadarCampaignResponse(campaign: any) {
    const batches = Array.isArray(campaign?.batches) ? campaign.batches : [];
    const tasks = Array.isArray(campaign?.tasks) ? campaign.tasks : [];
    const taskStatusCounts = tasks.reduce((acc: Record<string, number>, task: any) => {
      const status = String(task?.status || 'queued');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const cityTaskStates = new Map<string, { total: number; terminal: number }>();
    const activeCities = new Set<string>();
    for (const task of tasks) {
      const city = String(task?.city || '').trim();
      if (!city) continue;
      const status = String(task?.status || '');
      const current = cityTaskStates.get(city) || { total: 0, terminal: 0 };
      current.total += 1;
      if (['completed', 'exhausted', 'failed', 'canceled'].includes(status)) current.terminal += 1;
      cityTaskStates.set(city, current);
      if (status === 'running') activeCities.add(city);
    }
    const completedCityCount = Array.from(cityTaskStates.values()).filter((item) => item.total > 0 && item.total === item.terminal).length;
    return {
      id: campaign.id,
      status: campaign.status,
      mode: campaign.mode,
      city: campaign.city,
      state: campaign.state || null,
      segment: campaign.segment,
      targetType: String(campaign.mode || '') === 'mass_data' && String(campaign.targetType || '').toLowerCase() === 'both'
        ? 'both'
        : normalizeTargetType(campaign.targetType),
      targetTotal: safeInteger(campaign.targetTotal),
      batchSize: safeInteger(campaign.batchSize),
      foundCount: safeInteger(campaign.foundCount),
      approvedCount: safeInteger(campaign.approvedCount),
      duplicateCount: safeInteger(campaign.duplicateCount),
      rejectedCount: safeInteger(campaign.rejectedCount),
      complaintCount: safeInteger(campaign.complaintCount),
      deniedCount: safeInteger(campaign.deniedCount),
      noAnswerCount: safeInteger(campaign.noAnswerCount),
      currentAttempt: safeInteger(campaign.currentAttempt),
      maxAttempts: safeInteger(campaign.maxAttempts),
      consecutiveEmptyBatchCount: safeInteger(campaign.consecutiveEmptyBatchCount),
      consecutiveErrorCount: safeInteger(campaign.consecutiveErrorCount),
      lastQueryUsed: campaign.lastQueryUsed || null,
      lastEngineUrl: String(campaign.mode || '') === 'mass_data' ? null : campaign.lastEngineUrl || null,
      lastErrorMessage: campaign.lastErrorMessage || null,
      taskStatusCounts,
      completedCityCount,
      currentCity: Array.from(activeCities)[0] || tasks[0]?.city || null,
      progressMessage: campaign.lastErrorMessage || (
        safeInteger(campaign.foundCount) > 0
          ? `Encontramos ${safeInteger(campaign.foundCount)} cards ate agora. Continuando nos proximos lotes.`
          : `Rodando lote ${Math.min(safeInteger(campaign.currentAttempt) + 1, safeInteger(campaign.maxAttempts))}/${safeInteger(campaign.maxAttempts)}.`
      ),
      nextRunAt: campaign.nextRunAt instanceof Date ? campaign.nextRunAt.toISOString() : null,
      nightOnly: Boolean(campaign.nightOnly),
      allowedStartHour: safeInteger(campaign.allowedStartHour),
      allowedEndHour: safeInteger(campaign.allowedEndHour),
      timezone: campaign.timezone || 'America/Sao_Paulo',
      startedAt: campaign.startedAt instanceof Date ? campaign.startedAt.toISOString() : null,
      pausedAt: campaign.pausedAt instanceof Date ? campaign.pausedAt.toISOString() : null,
      finishedAt: campaign.finishedAt instanceof Date ? campaign.finishedAt.toISOString() : null,
      createdAt: campaign.createdAt instanceof Date ? campaign.createdAt.toISOString() : null,
      updatedAt: campaign.updatedAt instanceof Date ? campaign.updatedAt.toISOString() : null,
      batches: batches.map((batch: any) => ({
        id: batch.id,
        status: batch.status,
        attemptNumber: safeInteger(batch.attemptNumber),
        engineId: batch.engineId || null,
        engineUrl: String(campaign.mode || '') === 'mass_data' ? null : batch.engineUrl || null,
        queryUsed: batch.queryUsed || null,
        batchSize: safeInteger(batch.batchSize),
        fetchedUrlCount: safeInteger(batch.fetchedUrlCount),
        parsedCount: safeInteger(batch.parsedCount),
        approvedCount: safeInteger(batch.approvedCount),
        duplicateCount: safeInteger(batch.duplicateCount),
        rejectedCount: safeInteger(batch.rejectedCount),
        errorMessage: batch.errorMessage || null,
        startedAt: batch.startedAt instanceof Date ? batch.startedAt.toISOString() : null,
        finishedAt: batch.finishedAt instanceof Date ? batch.finishedAt.toISOString() : null,
      })),
      tasks: tasks.map((task: any) => ({
        id: task.id,
        campaignId: task.campaignId,
        state: task.state,
        city: task.city,
        segment: task.segment,
        targetType: task.targetType || 'pj',
        query: task.query,
        status: task.status,
        attemptCount: safeInteger(task.attemptCount),
        maxAttempts: safeInteger(task.maxAttempts),
        foundCount: safeInteger(task.foundCount),
        duplicateCount: safeInteger(task.duplicateCount),
        rejectedCount: safeInteger(task.rejectedCount),
        lastError: task.lastError || null,
        lockedByEngineId: task.lockedByEngineId || null,
        lockedUntil: task.lockedUntil instanceof Date ? task.lockedUntil.toISOString() : null,
        startedAt: task.startedAt instanceof Date ? task.startedAt.toISOString() : null,
        finishedAt: task.finishedAt instanceof Date ? task.finishedAt.toISOString() : null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : null,
        updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : null,
      })),
    };
  }

  async createRadarCampaignForUser(user: any, input: RadarCampaignInput = {}) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de campanhas do Radar ainda nao foi aplicada no banco.');
    }
    const normalized = this.normalizeRadarCampaignInput(input);
    if (normalized.mode === 'mass_data' && !(await this.supportsMassDataCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de tarefas MASSA DE DADOS ainda nao foi aplicada no banco.');
    }
    if (normalized.mode !== 'mass_data' && !normalized.segment.trim()) throw new BadRequestException('Informe o nicho/segmento da campanha.');
    if (normalized.mode !== 'mass_data' && normalized.targetType !== 'pj' && (!normalized.city || !normalized.state)) {
      throw new BadRequestException('Cidade e estado sao obrigatorios para campanhas PF.');
    }
    const now = new Date();
    const sleeping = normalized.nightOnly && !this.isWithinRadarWindow(normalized, now);
    const campaign = await (this.prisma as any).webscrapingCampaign.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: sleeping ? 'sleeping' : 'queued',
        mode: normalized.mode,
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment || (normalized.mode === 'mass_data' ? 'segmentos internos' : ''),
        targetType: normalized.targetType,
        targetTotal: normalized.targetTotal,
        batchSize: normalized.batchSize,
        maxAttempts: normalized.maxAttempts,
        nightOnly: normalized.nightOnly,
        allowedStartHour: normalized.allowedStartHour,
        allowedEndHour: normalized.allowedEndHour,
        timezone: normalized.timezone,
        nextRunAt: sleeping ? this.nextRadarWindowAt(normalized, now) : now,
      },
      include: { batches: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (normalized.mode === 'mass_data') {
      const guidedByState = Boolean(normalized.state);
      const taskStats = guidedByState
        ? await this.createMassDataTasks(
            campaign.id,
            normalized.state,
            normalized.city || null,
            normalized.segment || null,
            normalized.targetType,
            normalized.maxAttemptsPerTask,
          )
        : await this.createAutonomousMassDataTasks(
            {
              ...campaign,
              state: normalized.state || null,
              city: normalized.city || null,
              segment: normalized.segment || null,
              targetType: normalized.targetType,
              targetTotal: normalized.targetTotal,
              maxAttempts: normalized.maxAttemptsPerTask,
            },
            normalized.targetTotal || AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
          );
      if (guidedByState) {
        this.logger.log(`[autonomous-bank] guided work selected state=${normalized.state} city=${normalized.city || '*'} segment=${normalized.segment || 'segmentos internos'} reason=guided_filter`);
      }
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaign.id },
        data: {
          targetTotal: normalized.targetTotal || safeInteger((taskStats as any).taskCount || (taskStats as any).created) * normalized.batchSize,
          maxAttempts: normalized.maxAttemptsPerTask,
          lastErrorMessage: guidedByState
            ? `MASSA DE DADOS pronta: ${(taskStats as any).cityCount} cidade(s), ${(taskStats as any).segmentCount} isca(s), ${(taskStats as any).targetTypeCount} tipo(s), ${(taskStats as any).taskCount} tarefa(s).`
            : `MASSA DE DADOS autonoma pronta: ${(taskStats as any).created} tarefa(s), ${(taskStats as any).checked} combinaÃ§Ã£o(Ãµes) avaliadas.`,
        },
      }).catch(() => null);
      const reloaded = await (this.prisma as any).webscrapingCampaign.findUnique({
        where: { id: campaign.id },
        include: {
          batches: { orderBy: { createdAt: 'desc' }, take: 10 },
          tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
        },
      });
      this.scheduleRadarCampaignPump(0);
      return this.buildRadarCampaignResponse(reloaded || campaign);
    }
    this.scheduleRadarCampaignPump(0);
    return this.buildRadarCampaignResponse(campaign);
  }

  async listRadarCampaignsForUser(user: any) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) return { items: [] };
    const rows = await (this.prisma as any).webscrapingCampaign.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        batches: { orderBy: { createdAt: 'desc' }, take: 5 },
        tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
      },
    });
    return { items: rows.map((row: any) => this.buildRadarCampaignResponse(row)) };
  }

  async getRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de campanhas do Radar ainda nao foi aplicada no banco.');
    }
    const row = await (this.prisma as any).webscrapingCampaign.findFirst({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId },
      include: {
        batches: { orderBy: { createdAt: 'desc' }, take: 30 },
        tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
      },
    });
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    return this.buildRadarCampaignResponse(row);
  }

  async pauseRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId, status: { in: ['queued', 'running', 'sleeping'] } },
      data: { status: 'paused', pausedAt: new Date(), nextRunAt: null },
    });
    return this.getRadarCampaignForUser(user, campaignId);
  }

  async resumeRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    const row = await (this.prisma as any).webscrapingCampaign.findFirst({ where: { id: String(campaignId || '').trim(), companyId: context.companyId } });
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    const sleeping = row.nightOnly && !this.isWithinRadarWindow(row);
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: row.id },
      data: { status: sleeping ? 'sleeping' : 'queued', pausedAt: null, nextRunAt: sleeping ? this.nextRadarWindowAt(row) : new Date() },
    });
    this.scheduleRadarCampaignPump(0);
    return this.getRadarCampaignForUser(user, campaignId);
  }

  async cancelRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId, status: { notIn: ['completed', 'completed_insufficient_results', 'failed', 'canceled'] } },
      data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null },
    });
    return this.getRadarCampaignForUser(user, campaignId);
  }

  private async processNextRadarCampaigns() {
    if (this.radarCampaignPumpActive) return;
    if (!(await this.supportsRadarCampaignPersistence().catch(() => false))) return;
    this.radarCampaignPumpActive = true;
    try {
      const [capacity, scheduler] = await Promise.all([
        this.getEnginePool().getCurrentCapacityLevel().catch(() => null),
        this.getEnginePool().getSchedulerStatus().catch(() => null),
      ]);
      const maxParallel = Math.min(
        Math.max(safeInteger(scheduler?.automaticAllowedEngines, safeInteger(capacity?.activeEngineCount, parsePositiveIntegerEnv('HBX_RADAR_MAX_PARALLEL_ENGINES', getConfiguredHbxEngineCount()))), 0),
        getConfiguredHbxEngineCount(),
      );
      if (maxParallel <= 0) {
        this.logger.log(`[factory-scheduler] automaticAllowed=0 reason=${scheduler?.factory?.reason || 'protected'}; campaign pump will not acquire mass_data engines`);
      }
      const due = await (this.prisma as any).webscrapingCampaign.findMany({
        where: {
          OR: [
            {
              status: { in: ['queued', 'sleeping'] },
              OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
            },
            {
              status: { in: ['running', 'partial_error'] },
              nextRunAt: { lte: new Date() },
            },
          ],
        },
        orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
        take: Math.max(1, getConfiguredHbxEngineCount()),
      });
      for (const campaign of due) {
        if (['completed', 'completed_insufficient_results', 'failed', 'canceled', 'paused'].includes(String(campaign.status))) continue;
        if (!this.isWithinRadarWindow(campaign)) {
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: { status: 'sleeping', nextRunAt: this.nextRadarWindowAt(campaign) },
          }).catch(() => null);
          continue;
        }
        if (String(campaign.mode || '') === 'mass_data') {
          await this.processMassDataCampaignQueue(campaign, Math.max(0, Math.min(maxParallel, safeInteger(scheduler?.automaticAllowedEngines, maxParallel))));
          continue;
        }
        const lease = await this.getEnginePool().acquireEngine(campaign.id, campaign.companyId, campaign.userId, { purpose: 'radar_pull' });
        if (!lease) {
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: { status: 'queued', nextRunAt: new Date(Date.now() + 10_000), lastErrorMessage: 'Aguardando motor livre.' },
          }).catch(() => null);
          continue;
        }
        void this.processRadarCampaignBatch(campaign.id, lease);
      }
    } finally {
      this.radarCampaignPumpActive = false;
    }
  }

  private async processMassDataCampaignQueue(campaign: any, maxParallel: number) {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const now = new Date();
    if (maxParallel <= 0) {
      this.logger.log(`[engine-scheduler] automatic production paused campaign=${campaign.id} reason=protected`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'running', nextRunAt: new Date(Date.now() + 15_000), lastErrorMessage: 'ProduÃ§Ã£o protegida: aguardando capacidade sobrar.' },
      }).catch(() => null);
      return;
    }
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaignId: campaign.id, status: 'running', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { status: 'queued', lockedByEngineId: null, lockedUntil: null, lastError: 'Lock expirado; tarefa devolvida para fila.' },
    }).catch(() => null);

    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: campaign.id },
      data: { status: 'running', startedAt: campaign.startedAt || now, nextRunAt: null },
    }).catch(() => null);

    let queuedTasks = await (this.prisma as any).webscrapingCampaignTask.count({
      where: { campaignId: campaign.id, status: 'queued' },
    }).catch(() => 0);
    const minimumQueued = Math.max(maxParallel * 2, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS);
    if (safeInteger(queuedTasks) < minimumQueued) {
      const config = await this.getOperationalConfig().catch(() => null);
      if (config?.autonomousFillEnabled) {
        const refill = await this.createAutonomousMassDataTasks(
          campaign,
          Math.max(minimumQueued, safeInteger(config.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS)),
        );
        if (refill.created > 0) {
          queuedTasks += refill.created;
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: {
              lastErrorMessage: `Fila autonoma reabastecida: ${refill.created} nova(s) tarefa(s).`,
              nextRunAt: new Date(Date.now() + 500),
            },
          }).catch(() => null);
        }
      }
    }
    if (safeInteger(queuedTasks) < maxParallel) {
      void this.ensureNightFactoryWork().catch((error) => {
        this.logger.warn(`[factoryPump] falha ao criar campanha extra para ocupar motores: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
      });
    }

    let started = 0;
    let highestEngineIndex = 0;
    for (let index = 0; index < maxParallel; index += 1) {
      const lease = await this.getEnginePool().acquireEngine(
        `${campaign.id}:mass:${index}:${Date.now()}`,
        campaign.companyId,
        campaign.userId,
        { purpose: 'mass_data' },
      );
      if (!lease) break;
      const task = await this.claimNextMassDataTask(campaign.id, lease);
      if (!task) {
        await this.getEnginePool().releaseEngine(lease.engineId);
        break;
      }
      started += 1;
      highestEngineIndex = Math.max(highestEngineIndex, Number(lease.engineIndex || 0) + 1);
      void this.processMassDataTask(campaign.id, task.id, lease);
    }

    this.logger.log(`[factoryPump] leased ${started} engines this cycle; highestEngineIndex=${highestEngineIndex || 0}; maxParallel=${maxParallel}; campaign=${campaign.id}`);

    if (started === 0) {
      await this.refreshMassDataCampaignState(campaign.id);
    }
  }

  private async claimNextMassDataTask(campaignId: string, lease: HbxEngineLease) {
    const candidates = await (this.prisma as any).webscrapingCampaignTask.findMany({
      where: { campaignId, status: 'queued' },
      orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    }).catch(() => []);
    for (const task of candidates) {
      const updated = await (this.prisma as any).webscrapingCampaignTask.updateMany({
        where: { id: task.id, status: 'queued' },
        data: {
          status: 'running',
          lockedByEngineId: lease.engineId,
          lockedUntil: lease.lockedUntil,
          startedAt: task.startedAt || new Date(),
        },
      });
      if (updated.count > 0) {
        return (this.prisma as any).webscrapingCampaignTask.findUnique({ where: { id: task.id } });
      }
    }
    return null;
  }

  private async processMassDataTask(campaignId: string, taskId: string, lease: HbxEngineLease) {
    const task = await (this.prisma as any).webscrapingCampaignTask.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    }).catch(() => null);
    if (!task || !task.campaign || ['paused', 'canceled', 'completed', 'failed'].includes(String(task.campaign.status))) {
      await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }
    const attempt = safeInteger(task.attemptCount) + 1;
    const maxAttempts = Math.max(1, safeInteger(task.maxAttempts, 3));
    const operationalConfig = await this.getOperationalConfig().catch(() => null);
    const channelFilters = this.buildOperationalChannelSearchInput(operationalConfig || task.campaign || {});
    const normalized = this.normalizeSearchInput({
      city: task.city,
      state: task.state,
      segment: task.segment,
      quantity: Math.min(Math.max(safeInteger(task.campaign.batchSize, 20), 1), 20),
      engine: 'hbx',
      targetType: normalizeTargetType(task.targetType),
      ...channelFilters,
    });
    const queryUsed = this.buildMassDataTaskQuery(task.city, task.state, task.segment, attempt);
    let batch: any = null;
    try {
      batch = await (this.prisma as any).webscrapingCampaignBatch.create({
        data: {
          campaignId,
          taskId,
          status: 'running',
          attemptNumber: attempt,
          engineId: lease.engineId,
          engineUrl: lease.url,
          queryUsed,
          batchSize: normalized.quantity,
          startedAt: new Date(),
        },
      });
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: { attemptCount: { increment: 1 }, query: queryUsed, lockedUntil: lease.lockedUntil },
      });
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: { currentAttempt: { increment: 1 }, lastQueryUsed: queryUsed, lastEngineUrl: lease.url, lastErrorMessage: null },
      }).catch(() => null);

      const existingLeads = await (this.prisma as any).radarLeadPool.findMany({
        where: { phoneDigits: { not: null } },
        select: { phoneDigits: true, website: true, sourceUrl: true },
        take: 50_000,
      }).catch(() => []);
      const existingPhones = new Set<string>(existingLeads.map((row: any) => normalizePhoneDigits(row.phoneDigits)).filter(Boolean) as string[]);
      const output = await this.searchHbxEngine(
        {
          ...normalized,
          requiredChannels: [],
          channelMatchMode: 'prefer',
        },
        Array.from(existingPhones),
        lease.url,
        {
          queryText: queryUsed,
          batchLimit: normalized.quantity,
          timeoutMs: this.getHbxBatchTimeoutMs(),
          excludeUrls: existingLeads.flatMap((row: any) => [row.website, row.sourceUrl]).map((url: any) => String(url || '').trim()).filter(Boolean),
        },
      );
      const persisted = await this.persistRadarLeadPoolBatch(normalized, output.results, 'hbx_mass_data', {
        campaignId,
        strictLocalDdd: normalizeTargetType(task.targetType) === 'pf',
        engineUrl: lease.url,
      });
      const approvedCount = safeInteger(persisted.approvedCount);
      const batchRejectedCount = persisted.rejectedCount + safeInteger(output.rejectedCount);
      const duplicateCount = persisted.duplicateCount + safeInteger(output.duplicateCount);
      const finalTaskStatus = approvedCount > 0
        ? 'completed'
        : attempt >= maxAttempts
          ? 'exhausted'
          : 'queued';
      await (this.prisma as any).webscrapingCampaignBatch.update({
        where: { id: batch.id },
        data: {
          status: approvedCount > 0 ? 'completed' : 'empty_batch',
          approvedCount,
          duplicateCount,
          rejectedCount: batchRejectedCount,
          errorMessage: output.rawErrorMessage || null,
          parsedCount: Array.isArray(output.results) ? output.results.length : 0,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: {
          status: finalTaskStatus,
          foundCount: { increment: approvedCount },
          duplicateCount: { increment: duplicateCount },
          rejectedCount: { increment: batchRejectedCount },
          lastError: output.rawErrorMessage || null,
          lockedByEngineId: null,
          lockedUntil: null,
          finishedAt: ['completed', 'exhausted'].includes(finalTaskStatus) ? new Date() : null,
        },
      });
      await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      await this.refreshMassDataCampaignState(campaignId);
    } catch (error) {
      const message = this.extractHbxErrorMessage(error);
      if (batch?.id) {
        await (this.prisma as any).webscrapingCampaignBatch.update({
          where: { id: batch.id },
          data: { status: 'batch_error', errorMessage: message, finishedAt: new Date() },
        }).catch(() => null);
      }
      const exhausted = attempt >= maxAttempts;
      const retryable = this.isRetryableHbxError(error) || /timeout|fetch failed|econnreset|socket hang up/i.test(message);
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: {
          status: exhausted ? (retryable ? 'exhausted' : 'failed') : 'queued',
          lastError: message,
          lockedByEngineId: null,
          lockedUntil: null,
          finishedAt: exhausted ? new Date() : null,
        },
      }).catch(() => null);
      await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      await this.refreshMassDataCampaignState(campaignId);
    } finally {
      await this.getEnginePool().releaseEngine(lease.engineId);
      this.scheduleRadarCampaignPump(1_000);
    }
  }

  private async refreshMassDataCampaignState(campaignId: string) {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const [campaign, grouped, batches, latestTask] = await Promise.all([
      (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null),
      (this.prisma as any).webscrapingCampaignTask.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { _all: true },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignBatch.findMany({
        where: { campaignId },
        select: { approvedCount: true, duplicateCount: true, rejectedCount: true },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignTask.findFirst({
        where: { campaignId },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => null),
    ]);
    if (!campaign) return;
    const counts = new Map<string, number>(grouped.map((row: any) => [String(row.status), safeInteger(row._count?._all)]));
    const queued = counts.get('queued') || 0;
    const running = counts.get('running') || 0;
    const completed = counts.get('completed') || 0;
    const exhausted = counts.get('exhausted') || 0;
    const failed = counts.get('failed') || 0;
    const canceled = counts.get('canceled') || 0;
    const total = queued + running + completed + exhausted + failed + canceled;
    const approvedCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.approvedCount), 0);
    const duplicateCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.duplicateCount), 0);
    const rejectedCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.rejectedCount), 0);
    const reachedTarget = safeInteger(campaign.targetTotal) > 0 && approvedCount >= safeInteger(campaign.targetTotal);
    const done = total > 0 && queued === 0 && running === 0;
    const config = await this.getOperationalConfig().catch(() => null);
    const autonomousEnabled = String(campaign.mode || '') === 'mass_data' && Boolean(config?.autonomousFillEnabled);
    if (done && autonomousEnabled && !['paused', 'canceled', 'failed'].includes(String(campaign.status || ''))) {
      const refill = await this.createAutonomousMassDataTasks(
        campaign,
        safeInteger(config?.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS),
      );
      if (refill.created > 0) {
        await (this.prisma as any).webscrapingCampaign.update({
          where: { id: campaignId },
          data: {
            status: 'running',
            foundCount: approvedCount,
            approvedCount,
            duplicateCount,
            rejectedCount,
            lastErrorMessage: `Fila autonoma reabastecida: ${refill.created} nova(s) tarefa(s) sem dados puxados.`,
            nextRunAt: new Date(Date.now() + 1_000),
            finishedAt: null,
          },
        }).catch(() => null);
        return;
      }
    }
    const finalStatus = (!autonomousEnabled && reachedTarget) || done ? 'completed' : 'running';
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: campaignId },
      data: {
        status: finalStatus,
        foundCount: approvedCount,
        approvedCount,
        duplicateCount,
        rejectedCount,
        lastErrorMessage: latestTask
          ? `${latestTask.city}/${latestTask.state}: ${latestTask.segment} -> ${latestTask.status}`
          : done && autonomousEnabled
            ? 'Fila autonoma nÃ£o encontrou novas combinaÃ§Ãµes sem dados puxados.'
            : null,
        nextRunAt: finalStatus === 'completed' ? null : new Date(Date.now() + 1_000),
        finishedAt: finalStatus === 'completed' ? new Date() : null,
      },
    }).catch(() => null);
  }

  private async processRadarCampaignBatch(campaignId: string, lease: HbxEngineLease) {
    const campaign = await (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null);
    if (!campaign || ['paused', 'canceled', 'completed', 'completed_insufficient_results', 'failed'].includes(String(campaign.status))) {
      await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }
    const attempt = safeInteger(campaign.currentAttempt) + 1;
    const normalized = this.normalizeSearchInput({
      city: campaign.city,
      state: campaign.state || '',
      segment: campaign.segment,
      quantity: Math.min(Math.max(safeInteger(campaign.batchSize, 25), 1), 50),
      engine: 'hbx',
      targetType: normalizeTargetType(campaign.targetType),
    });
    const queryUsed = this.buildRadarCampaignQuery(normalized, attempt);
    let batch: any = null;
    try {
      batch = await (this.prisma as any).webscrapingCampaignBatch.create({
        data: {
          campaignId,
          status: 'running',
          attemptNumber: attempt,
          engineId: lease.engineId,
          engineUrl: lease.url,
          queryUsed,
          batchSize: normalized.quantity,
          startedAt: new Date(),
        },
      });
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'running',
          startedAt: campaign.startedAt || new Date(),
          currentAttempt: { increment: 1 },
          lastQueryUsed: queryUsed,
          lastEngineUrl: lease.url,
          nextRunAt: null,
        },
      });
      const existingLeads = await (this.prisma as any).radarLeadPool.findMany({
        where: {
          normalizedCity: normalized.normalizedCity,
          normalizedSegment: normalized.normalizedSegment,
          phoneDigits: { not: null },
        },
        select: { phoneDigits: true, website: true, sourceUrl: true },
        take: 10_000,
      }).catch(() => []);
      const excludeUrls = existingLeads
        .flatMap((row: any) => [row.website, row.sourceUrl])
        .map((url: any) => String(url || '').trim())
        .filter(Boolean);
      const output = await this.searchHbxEngine(
        {
          ...normalized,
          requiredChannels: [],
          channelMatchMode: 'prefer',
        },
        existingLeads.map((row: any) => row.phoneDigits).filter(Boolean),
        lease.url,
        {
          queryText: queryUsed,
          batchLimit: normalized.quantity,
          timeoutMs: this.getHbxBatchTimeoutMs(),
          excludeUrls,
        },
      );
      const persisted = await this.persistRadarLeadPoolBatch(normalized, output.results, 'hbx_campaign', {
        campaignId,
        strictLocalDdd: normalized.targetType === 'pf',
        engineUrl: lease.url,
      });
      await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      const empty = persisted.approvedCount === 0;
      const batchRejectedCount = persisted.rejectedCount + safeInteger(output.rejectedCount);
      const nextConsecutiveEmpty = empty ? safeInteger(campaign.consecutiveEmptyBatchCount) + 1 : 0;
      const reachedMaxEmptyBatches = empty && nextConsecutiveEmpty >= this.getRadarCampaignMaxEmptyBatches();
      await (this.prisma as any).webscrapingCampaignBatch.update({
        where: { id: batch.id },
        data: {
          status: empty ? 'empty_batch' : 'completed',
          approvedCount: persisted.approvedCount,
          duplicateCount: persisted.duplicateCount,
          rejectedCount: batchRejectedCount,
          errorMessage: output.rawErrorMessage || null,
          parsedCount: Array.isArray(output.results) ? output.results.length : 0,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      const counters = await this.recalculateRadarCampaignCounters(campaignId);
      const reachedTarget = counters.approvedCount >= safeInteger(campaign.targetTotal);
      const reachedAttempts = attempt >= safeInteger(campaign.maxAttempts);
      const finalStatus = reachedTarget
        ? 'completed'
        : reachedAttempts
          ? counters.foundCount > 0 ? 'completed_insufficient_results' : 'failed'
          : reachedMaxEmptyBatches
            ? 'completed_insufficient_results'
          : empty ? 'queued' : 'running';
      const terminal = ['completed', 'completed_insufficient_results', 'failed'].includes(finalStatus);
      const finalMessage = reachedTarget
        ? `Campanha concluida com ${counters.approvedCount} cards limpos.`
        : reachedAttempts && counters.foundCount === 0
          ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}.`
          : reachedMaxEmptyBatches
            ? `Campanha tentou ${attempt} lotes; os ultimos ${nextConsecutiveEmpty} vieram vazios. Ultima query: ${queryUsed}.`
            : empty
              ? `Lote ${attempt} sem cards aprovados. Tentando proxima query.`
              : `Encontramos ${counters.approvedCount} cards ate agora. Continuando nos proximos lotes.`;
      const nextRetryAt = terminal ? null : new Date(Date.now() + 1_000);
      this.logger.log(`[radar-campaign-batch] ${JSON.stringify({
        runId: campaignId,
        attempt,
        batchLimit: normalized.quantity,
        queryUsed,
        engineUrl: lease.url,
        httpStatus: output.httpStatus || null,
        errorMessage: output.rawErrorMessage || null,
        approvedCount: persisted.approvedCount,
        rejectedCount: batchRejectedCount,
        duplicateCount: persisted.duplicateCount,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
      })}`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          consecutiveEmptyBatchCount: nextConsecutiveEmpty,
          consecutiveErrorCount: 0,
          lastErrorMessage: finalMessage,
          nextRunAt: nextRetryAt,
          finishedAt: terminal ? new Date() : null,
        },
      }).catch(() => null);
    } catch (error) {
      await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      const httpStatus = this.extractHbxHttpStatus(error);
      const message = this.extractHbxErrorMessage(error);
      const retryable = this.isRetryableHbxError(error);
      const counters = await this.recalculateRadarCampaignCounters(campaignId).catch(() => ({ foundCount: safeInteger(campaign.foundCount) }));
      const nextConsecutiveError = safeInteger(campaign.consecutiveErrorCount) + 1;
      const nextRunAt = new Date(Date.now() + (retryable ? this.getHbxRetryDelayMs(nextConsecutiveError) : 30_000));
      const reachedAttempts = attempt >= safeInteger(campaign.maxAttempts);
      const finalStatus = reachedAttempts
        ? counters.foundCount > 0 ? 'completed_insufficient_results' : 'failed'
        : counters.foundCount > 0 ? 'partial_error' : 'queued';
      const terminal = ['completed_insufficient_results', 'failed'].includes(finalStatus);
      const effectiveNextRunAt = terminal ? null : nextRunAt;
      if (batch?.id) {
        await (this.prisma as any).webscrapingCampaignBatch.update({
          where: { id: batch.id },
          data: {
            status: 'batch_error',
            errorMessage: message,
            finishedAt: new Date(),
          },
        }).catch(() => null);
      }
      this.logger.warn(`[radar-campaign-batch] ${JSON.stringify({
        runId: campaignId,
        attempt,
        batchLimit: safeInteger(campaign.batchSize, 25),
        queryUsed,
        engineUrl: lease.url,
        httpStatus,
        errorMessage: message,
        approvedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        nextRetryAt: effectiveNextRunAt ? effectiveNextRunAt.toISOString() : null,
      })}`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          consecutiveErrorCount: nextConsecutiveError,
          lastErrorMessage: finalStatus === 'failed'
            ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}. Erro: ${message}`
            : terminal && counters.foundCount > 0
              ? `Busca parcial: ${counters.foundCount} cards encontrados. O motor tentou ${attempt} lotes, mas nao atingiu a meta.`
              : httpStatus ? `Ultimo lote falhou com ${httpStatus}. Tentando novamente.` : message,
          nextRunAt: effectiveNextRunAt,
          finishedAt: terminal ? new Date() : null,
        },
      }).catch(() => null);
    } finally {
      await this.getEnginePool().releaseEngine(lease.engineId);
      this.scheduleRadarCampaignPump(1_000);
    }
  }
}
