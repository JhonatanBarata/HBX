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
} from '../radar-core-method-imports';

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
} from '../radar-core-method-imports';

export class RadarCoreCampaignPlannerMixin {
  [key: string]: any;
  private normalizeRadarCampaignInput(input: RadarCampaignInput = {}) {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const segment = String(input.segment || '').trim();
    const mode = String(input.mode || '').trim().toLowerCase() === 'mass_data' ? 'mass_data' : 'radar_database';
    const rawTargetType = String(input.targetType || '').trim().toLowerCase();
    const targetType = mode === 'mass_data' && rawTargetType === 'both' ? 'both' : normalizeTargetType(input.targetType);
    const targetTotal = Math.min(Math.max(Math.trunc(Number(input.targetTotal || (mode === 'mass_data' ? 0 : 100)) || 0), 0), 100_000);
    const configuredBatchSize = parsePositiveIntegerEnv('HBX_RADAR_BATCH_SIZE', mode === 'mass_data' ? 20 : 25);
    const batchSizeMax = mode === 'mass_data' ? 20 : 50;
    const batchSize = Math.min(Math.max(Math.trunc(Number(input.batchSize || configuredBatchSize) || configuredBatchSize), 1), batchSizeMax);
    const allowedStartHour = Math.min(Math.max(Math.trunc(Number(input.allowedStartHour ?? parsePositiveIntegerEnv('HBX_RADAR_NIGHT_START_HOUR', mode === 'mass_data' ? 20 : 0))), 0), 23);
    const allowedEndHour = Math.min(Math.max(Math.trunc(Number(input.allowedEndHour ?? parsePositiveIntegerEnv('HBX_RADAR_NIGHT_END_HOUR', mode === 'mass_data' ? 8 : 6))), 0), 23);
    const timezone = String(input.timezone || process.env.HBX_RADAR_NIGHT_TIMEZONE || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
    const nightOnly = input.nightOnly == null ? false : coerceBoolean(input.nightOnly); // Sem janela por padrão: Elasticidade é o único freio (ordem do dono 24/06).
    const maxAttemptsPerTask = Math.min(Math.max(Math.trunc(Number(input.maxAttemptsPerTask || 3) || 3), 1), 10);
    const maxAttempts = mode === 'mass_data' ? maxAttemptsPerTask : Math.max(Math.ceil(Math.max(1, targetTotal) / Math.max(1, batchSize)) * 3, 40);
    const preferredChannels = this.normalizeRadarChannels(input.preferredChannels || []);
    const requiredChannels = this.normalizeRadarChannels(input.requiredChannels || []);
    const channelMatchMode = this.normalizeChannelMatchMode(input.channelMatchMode);
    const freshness = this.normalizeFreshness(input.freshness);
    return {
      city,
      state,
      segment,
      mode,
      targetType,
      targetTotal,
      batchSize,
      maxAttempts,
      maxAttemptsPerTask,
      nightOnly,
      allowedStartHour,
      allowedEndHour,
      timezone,
      preferredChannels,
      requiredChannels,
      channelMatchMode,
      freshness,
    };
  }

  private getZonedHour(timezone: string, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
      return Number.isFinite(hour) ? hour : date.getHours();
    } catch {
      return date.getHours();
    }
  }

  private isWithinRadarWindow(_campaign: any, _date = new Date()) {
    // Janela de horário DELETADA (ordem do dono 24/06): produz quando a campanha está ativa, sem relógio.
    // O liga/desliga vive no STATUS da campanha; a Elasticidade (governor) é o único freio de carga.
    return true;
  }

  private nextRadarWindowAt(campaign: any, date = new Date()) {
    const next = new Date(date);
    const hour = this.getZonedHour(String(campaign.timezone || 'America/Sao_Paulo'), date);
    const start = safeInteger(campaign.allowedStartHour, 0);
    if (this.isWithinRadarWindow(campaign, date)) return date;
    const hoursUntilStart = (start - hour + 24) % 24 || 24;
    next.setHours(next.getHours() + hoursUntilStart, 0, 0, 0);
    return next;
  }

  private scheduleRadarCampaignPump(delayMs = 0) {
    setTimeout(() => {
      void this.processNextRadarCampaigns();
    }, Math.max(0, delayMs));
  }

  private buildRadarCampaignQuery(input: NormalizedSearchInput, attempt: number) {
    if (input.targetType === 'pj') {
      const queries = this.buildHbxBatchQueries(input);
      return queries[Math.max(0, attempt - 1) % queries.length] || input.segment;
    }
    return this.buildHbxBatchQuery(input, attempt);
  }

  private buildMassDataTaskQuery(city: string, state: string, segment: string, attempt: number) {
    const variation = Math.min(Math.max(Math.trunc(Number(attempt || 1)), 1), 3);
    if (variation === 1) return this.compactQuery([segment, city, state, 'telefone']);
    if (variation === 2) return this.compactQuery([segment, city, state, 'whatsapp']);
    return this.compactQuery([segment, city, state, 'contato']);
  }

  private async listMassDataCities(state: string, city?: string | null) {
    const normalizedState = String(state || '').trim().toUpperCase();
    const requestedCity = String(city || '').trim();
    if (requestedCity) return [requestedCity];
    try {
      const rows = await this.loadBrazilianCities();
      const suffix = ` - ${normalizedState}`;
      const cities = rows
        .filter((item) => item.endsWith(suffix))
        .map((item) => item.slice(0, -suffix.length).trim())
        .filter(Boolean);
      if (cities.length) return cities;
    } catch {
      // Fallback below keeps AC mass-data acceptance usable when IBGE is unavailable.
    }
    return normalizedState === 'AC' ? ACRE_CITIES_FALLBACK : [];
  }

  private getMassDataSegments(segment?: string | null) {
    const explicit = String(segment || '').trim();
    if (!explicit || ['aberto', 'todos', 'todas'].includes(normalizeLookupValue(explicit))) {
      return MASS_DATA_INTERNAL_SEGMENTS;
    }
    return [explicit, ...MASS_DATA_INTERNAL_SEGMENTS.filter((item) => normalizeLookupValue(item) !== normalizeLookupValue(explicit))];
  }

  private getMassDataTargetTypes(value: unknown): HbxTargetType[] {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'both' || normalized === 'pf_pj' || normalized === 'pj_pf') return ['pj', 'pf'];
    if (normalized === 'pf') return ['pf'];
    return ['pj'];
  }

  private async createMassDataTasks(campaignId: string, state: string, city: string | null, segment: string | null, targetType: unknown, maxAttempts: number) {
    const cities = await this.listMassDataCities(state, city);
    if (!cities.length) throw new BadRequestException('Nao encontrei cidades para o estado informado.');
    const segments = this.getMassDataSegments(segment);
    const targetTypes = this.getMassDataTargetTypes(targetType);
    let created = 0;
    for (const taskCity of cities) {
      for (const taskSegment of segments) {
        for (const taskTargetType of targetTypes) {
          const query = this.buildMassDataTaskQuery(taskCity, state, taskSegment, 1);
          const inserted = await (this.prisma as any).webscrapingCampaignTask.upsert({
            where: {
              campaignId_state_city_segment_targetType: {
                campaignId,
                state,
                city: taskCity,
                segment: taskSegment,
                targetType: taskTargetType,
              },
            },
            create: {
              campaignId,
              state,
              city: taskCity,
              segment: taskSegment,
              targetType: taskTargetType,
              query,
              maxAttempts,
            },
            update: {
              query,
              status: 'queued',
              attemptCount: 0,
              maxAttempts,
              foundCount: 0,
              duplicateCount: 0,
              rejectedCount: 0,
              lastError: null,
              lockedByEngineId: null,
              lockedUntil: null,
              startedAt: null,
              finishedAt: null,
            },
          });
          created += 1;
        }
      }
    }
    return { cityCount: cities.length, taskCount: created, segmentCount: segments.length, targetTypeCount: targetTypes.length };
  }

  private async listAutonomousMassDataLocations() {
    try {
      const rows = await this.loadBrazilianCities();
      const parsed = rows
        .map((item) => {
          const match = String(item || '').trim().match(/^(.*?)\s-\s([A-Za-z]{2})$/);
          return match ? { city: match[1].trim(), state: match[2].trim().toUpperCase() } : null;
        })
        .filter((item): item is { city: string; state: string } => Boolean(item?.city && item?.state));
      if (parsed.length) return parsed;
    } catch {
      // Fallback keeps the autonomous queue alive if IBGE is temporarily unavailable.
    }
    return AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK;
  }

  private deterministicHash(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private rotateMassDataPool<T>(items: T[], seed: string) {
    if (!items.length) return [];
    const offset = this.deterministicHash(seed) % items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
  }

  private autonomousRotationSeed(campaign: any, suffix: string, now = new Date()) {
    const hourBucket = now.toISOString().slice(0, 13);
    return [
      hourBucket,
      campaign?.id || 'no-campaign',
      campaign?.companyId || 'no-company',
      campaign?.state || '',
      campaign?.city || '',
      campaign?.segment || '',
      suffix,
    ].join('|');
  }

  private isExplicitMassDataSegment(value: unknown) {
    const normalized = normalizeLookupValue(String(value || ''));
    return Boolean(normalized && !['segmentos internos', 'aberto', 'todos', 'todas'].includes(normalized));
  }

  private async buildAutonomousMassDataLocationPool(campaign: any, now = new Date()) {
    const guidedState = String(campaign?.state || '').trim().toUpperCase();
    const guidedCity = String(campaign?.city || '').trim();
    if (guidedState && guidedCity) return [{ city: guidedCity, state: guidedState }];

    if (guidedState) {
      const cities = await this.listMassDataCities(guidedState, null).catch(() => []);
      if (cities.length) {
        return this.rotateMassDataPool(
          cities.map((city) => ({ city, state: guidedState })),
          this.autonomousRotationSeed(campaign, `state:${guidedState}`, now),
        );
      }
      const fallback = AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK.filter((item) => item.state === guidedState);
      if (fallback.length) return this.rotateMassDataPool(fallback, this.autonomousRotationSeed(campaign, `fallback-state:${guidedState}`, now));
    }

    const national = await this.listAutonomousMassDataLocations();
    const rotated = this.rotateMassDataPool(national, this.autonomousRotationSeed(campaign, 'national-location', now));
    if (guidedCity) {
      const cityKey = normalizeLookupValue(guidedCity);
      const matches = rotated.filter((item) => normalizeLookupValue(item.city) === cityKey);
      if (matches.length) return matches;
    }
    return rotated;
  }

  private buildAutonomousMassDataSegments(campaign: any, now = new Date()) {
    const explicitSegment = String(campaign?.segment || '').trim();
    const base = this.isExplicitMassDataSegment(explicitSegment)
      ? [explicitSegment, ...MASS_DATA_INTERNAL_SEGMENTS.filter((segment) => normalizeLookupValue(segment) !== normalizeLookupValue(explicitSegment))]
      : MASS_DATA_INTERNAL_SEGMENTS;
    return this.rotateMassDataPool(base, this.autonomousRotationSeed(campaign, 'segment', now));
  }

  private buildAutonomousMassDataCandidateKey(input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    return [
      String(input.state || '').trim().toUpperCase(),
      normalizeLookupValue(input.city),
      normalizeLookupValue(input.segment),
      normalizeTargetType(input.targetType),
    ].join('|');
  }

  private async hasMassDataTaskForCampaign(campaignId: string, input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    if (!campaignId) return false;
    const existingTask = await (this.prisma as any).webscrapingCampaignTask.findFirst({
      where: {
        campaignId,
        state: String(input.state || '').trim().toUpperCase(),
        city: input.city,
        segment: input.segment,
        targetType: input.targetType,
      },
      select: { id: true },
    }).catch(() => null);
    return Boolean(existingTask);
  }

  private async getAutonomousMassDataCombinationMetrics(input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    const normalizedCity = normalizeLookupValue(input.city);
    const normalizedSegment = normalizeLookupValue(input.segment);
    const state = String(input.state || '').trim().toUpperCase();
    const usableStockWhere = {
      normalizedCity,
      state,
      normalizedSegment,
      phoneDigits: { not: null },
      status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'hidden'] as any },
    } as any;
    if (await this.supportsRadarOwnershipPersistence()) {
      usableStockWhere.ownerCompanyId = null;
    }
    const [stockCount, taskHistory, recentBatch] = await Promise.all([
      (this.prisma as any).radarLeadPool.count({ where: usableStockWhere }).catch(() => 0),
      (this.prisma as any).webscrapingCampaignTask.findFirst({
        where: {
          state,
          city: input.city,
          segment: input.segment,
          targetType: input.targetType,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          attemptCount: true,
          foundCount: true,
          duplicateCount: true,
          rejectedCount: true,
          updatedAt: true,
        },
      }).catch(() => null),
      (this.prisma as any).webscrapingCampaignBatch.findFirst({
        where: {
          task: {
            state,
            city: input.city,
            segment: input.segment,
            targetType: input.targetType,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          approvedCount: true,
          duplicateCount: true,
          rejectedCount: true,
          createdAt: true,
        },
      }).catch(() => null),
    ]);
    const approved = safeInteger(recentBatch?.approvedCount) + safeInteger(taskHistory?.foundCount);
    const duplicate = safeInteger(recentBatch?.duplicateCount) + safeInteger(taskHistory?.duplicateCount);
    const rejected = safeInteger(recentBatch?.rejectedCount) + safeInteger(taskHistory?.rejectedCount);
    const total = Math.max(1, approved + duplicate + rejected);
    const explored = Boolean(taskHistory);
    // ATTEMPTED = de fato RODOU (gerou lote OU teve tentativa), não só ficou na fila. Importa pro
    // freio não confundir "cancelei a fila" com "combo provado vazio": tarefa cancelada-sem-rodar
    // (attemptCount 0, sem lote) NÃO é morta — pode ser re-escolhida; só é morta o que tentou e deu 0.
    const attempted = Boolean(recentBatch) || safeInteger(taskHistory?.attemptCount) > 0
      || ['exhausted', 'completed', 'failed'].includes(String(taskHistory?.status || ''));
    return {
      stockCount: safeInteger(stockCount),
      explored,
      approved,
      // COMBO MORTO: já foi TENTADO e NUNCA aprovou nada (cidade vazia p/ aquele segmento).
      // O ranqueador antigo tratava estoque-0 como `low_stock` = prioridade MÁXIMA → re-enfileirava
      // eternamente a cidade vazia. Este flag faz o planner PULAR esses combos (freio na fonte).
      dead: attempted && approved === 0,
      duplicateRatio: duplicate / total,
      lastWorkedAt: taskHistory?.updatedAt instanceof Date
        ? taskHistory.updatedAt
        : recentBatch?.createdAt instanceof Date
          ? recentBatch.createdAt
          : null,
    };
  }

  private async rankAutonomousMassDataWorkCandidates(
    campaign: any,
    options: { limit?: number; excludeKeys?: Set<string>; now?: Date } = {},
  ): Promise<AutonomousMassDataCandidate[]> {
    const now = options.now || new Date();
    const campaignId = String(campaign?.id || '').trim();
    const desiredStock = clampInteger(campaign?.desiredStock || campaign?.targetTotal, 300, 20, 1000);
    const minimumStock = Math.min(desiredStock, clampInteger(campaign?.minimumStock, 80, 1, 500));
    const hasGuidedFilter = Boolean(
      String(campaign?.state || '').trim()
      || String(campaign?.city || '').trim()
      || this.isExplicitMassDataSegment(campaign?.segment),
    );
    const mode: AutonomousMassDataStrategyMode = hasGuidedFilter ? 'guided' : 'automatic';
    const locationLimit = hasGuidedFilter ? 160 : 80;
    const candidateLimit = Math.min(Math.max(safeInteger(options.limit, 120), 20), 360);
    const locations = (await this.buildAutonomousMassDataLocationPool(campaign, now)).slice(0, locationLimit);
    const segments = this.buildAutonomousMassDataSegments(campaign, now);
    const targetTypes = this.rotateMassDataPool(this.getMassDataTargetTypes(campaign?.targetType || 'pj'), this.autonomousRotationSeed(campaign, 'target-type', now));
    const rawCandidates: Array<{ city: string; state: string; segment: string; targetType: HbxTargetType; key: string }> = [];
    const seen = new Set<string>();

    for (const location of locations) {
      const state = String(location.state || '').trim().toUpperCase();
      const city = String(location.city || '').trim();
      if (!state || !city) continue;
      for (const segment of segments) {
        for (const targetType of targetTypes) {
          const key = this.buildAutonomousMassDataCandidateKey({ state, city, segment, targetType });
          if (seen.has(key) || options.excludeKeys?.has(key)) continue;
          seen.add(key);
          rawCandidates.push({ state, city, segment, targetType, key });
          if (rawCandidates.length >= candidateLimit) break;
        }
        if (rawCandidates.length >= candidateLimit) break;
      }
      if (rawCandidates.length >= candidateLimit) break;
    }

    const scored: AutonomousMassDataCandidate[] = [];
    for (const candidate of rawCandidates) {
      const [taskExists, metrics] = await Promise.all([
        this.hasMassDataTaskForCampaign(campaignId, candidate),
        this.getAutonomousMassDataCombinationMetrics(candidate),
      ]);
      if (taskExists) continue;
      // FREIO: combo já explorado que nunca rendeu nada = cidade vazia → NÃO re-enfileira (a não ser
      // que o dono tenha guiado essa cidade/segmento de propósito). Mata o ciclo Acarape na fonte.
      if (metrics.dead && !hasGuidedFilter) continue;
      const lowStock = metrics.stockCount < minimumStock;
      const lowDuplicateRecent = metrics.explored && metrics.duplicateRatio <= 0.35;
      const reason: AutonomousMassDataWorkReason = hasGuidedFilter
        ? 'guided_filter'
        : lowStock
          ? 'low_stock'
          : lowDuplicateRecent
            ? 'low_duplicate_recent'
            : !metrics.explored
              ? 'unexplored'
              : 'fallback_national';
      scored.push({
        ...candidate,
        mode,
        desiredStock,
        minimumStock,
        reason,
        stockCount: metrics.stockCount,
        taskExists,
        duplicateRatio: metrics.duplicateRatio,
        explored: metrics.explored,
        lastWorkedAt: metrics.lastWorkedAt,
      });
    }

    return scored.sort((left, right) => {
      const reasonRank: Record<AutonomousMassDataWorkReason, number> = {
        guided_filter: 0,
        low_stock: 0,
        low_duplicate_recent: 1,
        unexplored: 2,
        fallback_national: 3,
      };
      const leftRank = reasonRank[left.reason] ?? 3;
      const rightRank = reasonRank[right.reason] ?? 3;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left.stockCount !== right.stockCount) return left.stockCount - right.stockCount;
      if (left.duplicateRatio !== right.duplicateRatio) return left.duplicateRatio - right.duplicateRatio;
      const leftWorked = left.lastWorkedAt ? left.lastWorkedAt.getTime() : 0;
      const rightWorked = right.lastWorkedAt ? right.lastWorkedAt.getTime() : 0;
      if (leftWorked !== rightWorked) return leftWorked - rightWorked;
      return left.key.localeCompare(right.key);
    });
  }

  private async resolveAutonomousMassDataWork(
    campaign: any = {},
    options: { excludeKeys?: Set<string>; now?: Date; log?: boolean; limit?: number } = {},
  ): Promise<AutonomousMassDataWork> {
    const candidates = await this.rankAutonomousMassDataWorkCandidates(campaign, {
      limit: options.limit || 120,
      excludeKeys: options.excludeKeys,
      now: options.now,
    });
    const selected = candidates[0];
    if (selected) {
      const work: AutonomousMassDataWork = {
        mode: selected.mode,
        state: selected.state,
        city: selected.city,
        segment: selected.segment,
        targetType: selected.targetType,
        desiredStock: selected.desiredStock,
        minimumStock: selected.minimumStock,
        reason: selected.reason,
        stockCount: selected.stockCount,
      };
      if (options.log) {
        const prefix = work.mode === 'guided' ? 'guided work selected' : 'automatic work selected';
        this.logger.log(`[autonomous-bank] ${prefix} state=${work.state} city=${work.city} segment=${work.segment} reason=${work.reason}`);
        this.logger.log('[autonomous-bank] skipped google for autonomous bank');
      }
      return work;
    }

    const fallback = this.rotateMassDataPool(AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK, this.autonomousRotationSeed(campaign, 'empty-fallback', options.now || new Date()))[0]
      || AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK[0];
    const segment = this.buildAutonomousMassDataSegments(campaign, options.now || new Date())[0] || MASS_DATA_INTERNAL_SEGMENTS[0];
    const work: AutonomousMassDataWork = {
      mode: this.isExplicitMassDataSegment(campaign?.segment) || String(campaign?.state || '').trim() || String(campaign?.city || '').trim() ? 'guided' : 'automatic',
      state: fallback.state,
      city: fallback.city,
      segment,
      targetType: this.getMassDataTargetTypes(campaign?.targetType || 'pj')[0] || 'pj',
      desiredStock: 300,
      minimumStock: 80,
      reason: 'fallback_national',
      stockCount: 0,
    };
    if (options.log) {
      const prefix = work.mode === 'guided' ? 'guided work selected' : 'automatic work selected';
      this.logger.log(`[autonomous-bank] ${prefix} state=${work.state} city=${work.city} segment=${work.segment} reason=${work.reason}`);
      this.logger.log('[autonomous-bank] skipped google for autonomous bank');
    }
    return work;
  }

  private async createAutonomousMassDataTasks(campaign: any, desiredCount: number) {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) return { created: 0, checked: 0 };
    const maxAttempts = Math.max(1, safeInteger(campaign?.maxAttempts, 3));
    const limit = Math.min(Math.max(safeInteger(desiredCount, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS), 1), AUTONOMOUS_MASS_DATA_MAX_TASKS);
    const ranked = await this.rankAutonomousMassDataWorkCandidates(campaign, { limit: Math.min(360, Math.max(80, limit * 3)) });
    const selectedForLog = ranked[0] || await this.resolveAutonomousMassDataWork(campaign, { log: false });
    let created = 0;
    let checked = ranked.length;

    for (const work of ranked) {
      if (created >= limit) break;
      const query = this.buildMassDataTaskQuery(work.city, work.state, work.segment, 1);
      const inserted = await (this.prisma as any).webscrapingCampaignTask.upsert({
        where: {
          campaignId_state_city_segment_targetType: {
            campaignId,
            state: work.state,
            city: work.city,
            segment: work.segment,
            targetType: work.targetType,
          },
        },
        create: {
          campaignId,
          state: work.state,
          city: work.city,
          segment: work.segment,
          targetType: work.targetType,
          query,
          maxAttempts,
        },
        update: {
          query,
          status: 'queued',
          attemptCount: 0,
          maxAttempts,
          foundCount: 0,
          duplicateCount: 0,
          rejectedCount: 0,
          lastError: null,
          lockedByEngineId: null,
          lockedUntil: null,
          startedAt: null,
          finishedAt: null,
        },
      }).catch(() => null);
      if (inserted) created += 1;
    }

    if (created > 0 && selectedForLog) {
      const mode = selectedForLog.mode || 'automatic';
      const prefix = mode === 'guided' ? 'guided work selected' : 'automatic work selected';
      this.logger.log(`[autonomous-bank] ${prefix} state=${selectedForLog.state} city=${selectedForLog.city} segment=${selectedForLog.segment} reason=${selectedForLog.reason}`);
      this.logger.log('[autonomous-bank] skipped google for autonomous bank');
    }
    return { created, checked };
  }

  private async recoverRadarCampaignWork() {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const now = new Date();
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { status: 'running', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { status: 'queued', lockedByEngineId: null, lockedUntil: null, lastError: 'Lock expirado e liberado na retomada.' },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: { in: ['running', 'partial_error', 'sleeping'] } },
      data: { status: 'queued', nextRunAt: now },
    }).catch(() => null);
    this.scheduleRadarCampaignPump(0);
  }

  private parseOperationalMetadata(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      const channelFilters = parsed?.channelFilters && typeof parsed.channelFilters === 'object' ? parsed.channelFilters : {};
      return {
        forcedUntil: typeof parsed?.forcedUntil === 'string' ? parsed.forcedUntil : null,
        forcedAt: typeof parsed?.forcedAt === 'string' ? parsed.forcedAt : null,
        autonomousFillEnabled: parsed?.autonomousFillEnabled == null ? true : coerceBoolean(parsed.autonomousFillEnabled),
        autonomousFillBatchSize: clampInteger(
          parsed?.autonomousFillBatchSize,
          AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
          1,
          AUTONOMOUS_MASS_DATA_MAX_TASKS,
        ),
        timezone: typeof parsed?.timezone === 'string' && parsed.timezone.trim() ? parsed.timezone.trim() : 'America/Sao_Paulo',
        emergencyStop: parsed?.emergencyStop == null ? false : coerceBoolean(parsed.emergencyStop),
        stopOutsideWindow: parsed?.stopOutsideWindow == null ? true : coerceBoolean(parsed.stopOutsideWindow),
        weekdaysOnly: parsed?.weekdaysOnly == null ? false : coerceBoolean(parsed.weekdaysOnly),
        weekendAlwaysOn: parsed?.weekendAlwaysOn == null ? false : coerceBoolean(parsed.weekendAlwaysOn),
        factoryState: typeof parsed?.factoryState === 'string' ? parsed.factoryState.trim().toUpperCase() : '',
        factoryCity: typeof parsed?.factoryCity === 'string' ? parsed.factoryCity.trim() : '',
        factoryMaxEngines: clampInteger(parsed?.factoryMaxEngines, getConfiguredHbxEngineCount(), 0, getConfiguredHbxEngineCount()),
        factoryMinEngines: clampInteger(parsed?.factoryMinEngines, 0, 0, getConfiguredHbxEngineCount()),
        drainTimeoutSeconds: clampInteger(parsed?.drainTimeoutSeconds, 90, 10, 900),
        preferredChannels: this.normalizeRadarChannels(parsed?.preferredChannels ?? channelFilters.preferredChannels ?? []),
        requiredChannels: this.normalizeRadarChannels(parsed?.requiredChannels ?? channelFilters.requiredChannels ?? []),
        channelMatchMode: this.normalizeChannelMatchMode(parsed?.channelMatchMode ?? channelFilters.channelMatchMode),
        freshness: this.normalizeFreshness(parsed?.freshness ?? channelFilters.freshness),
      };
    } catch {
      return {
        forcedUntil: null,
        forcedAt: null,
        autonomousFillEnabled: true,
        autonomousFillBatchSize: AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
        timezone: 'America/Sao_Paulo',
        emergencyStop: false,
        stopOutsideWindow: true,
        weekdaysOnly: false,
        weekendAlwaysOn: false,
        factoryState: '',
        factoryCity: '',
        factoryMaxEngines: getConfiguredHbxEngineCount(),
        factoryMinEngines: 0,
        drainTimeoutSeconds: 90,
        preferredChannels: [],
        requiredChannels: [],
        channelMatchMode: 'prefer',
        freshness: 'hybrid',
      };
    }
  }

  private buildOperationalChannelSearchInput(config: any = {}) {
    const metadata = this.parseOperationalMetadata(config?.metadataJson);
    return {
      preferredChannels: this.normalizeRadarChannels(config?.preferredChannels ?? metadata.preferredChannels ?? []),
      requiredChannels: this.normalizeRadarChannels(config?.requiredChannels ?? metadata.requiredChannels ?? []),
      channelMatchMode: this.normalizeChannelMatchMode(config?.channelMatchMode ?? metadata.channelMatchMode),
      freshness: this.normalizeFreshness(config?.freshness ?? metadata.freshness),
    };
  }

  private getForcedUntilDate(config: any) {
    const raw = String(config?.forcedUntil || this.parseOperationalMetadata(config?.metadataJson).forcedUntil || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private isForcedOperationalWindow(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const forcedUntil = this.getForcedUntilDate(config);
    return Boolean(forcedUntil && forcedUntil.getTime() > date.getTime());
  }

  private isWithinConfiguredOperationalWindow(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const current = date.getHours() * 60 + date.getMinutes();
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const end = safeInteger(config.endHour, 8) * 60 + safeInteger(config.endMinute, 0);
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  private nextOperationalWindowEndAt(config: any, date = new Date()) {
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const end = safeInteger(config.endHour, 8) * 60 + safeInteger(config.endMinute, 0);
    const startAt = this.nextOperationalWindowAt({ ...config, forcedUntil: null }, date);
    const startDate = new Date(startAt);
    if (!Number.isFinite(startDate.getTime())) return new Date(date.getTime() + 2 * 60 * 60_000);
    const endDate = new Date(startDate);
    endDate.setHours(Math.floor(end / 60), end % 60, 0, 0);
    if (end <= start) endDate.setDate(endDate.getDate() + 1);
    if (this.isWithinConfiguredOperationalWindow(config, date)) {
      const currentEnd = new Date(date);
      currentEnd.setHours(Math.floor(end / 60), end % 60, 0, 0);
      if (end <= start && (date.getHours() * 60 + date.getMinutes()) >= start) currentEnd.setDate(currentEnd.getDate() + 1);
      if (end > start && currentEnd.getTime() <= date.getTime()) currentEnd.setDate(currentEnd.getDate() + 1);
      return currentEnd;
    }
    return endDate;
  }

  private buildForcedUntil(config: any, date = new Date()) {
    const windowEnd = this.nextOperationalWindowEndAt(config, date);
    return windowEnd.toISOString();
  }

  private normalizeOperationalConfigInput(input: WebscrapingOperationalConfigInput = {}, existingConfig?: any) {
    const existingMetadataJson = existingConfig?.metadataJson;
    const rawIntensity = String(input.intensity || existingConfig?.intensity || 'turbo').trim().toLowerCase();
    const intensity = rawIntensity === 'economico' || rawIntensity === 'econÃ´mico'
      ? 'economico'
      : rawIntensity === 'normal'
        ? 'normal'
        : 'turbo';
    const base = {
      enabled: input.enabled == null ? (existingConfig?.enabled == null ? true : Boolean(existingConfig.enabled)) : coerceBoolean(input.enabled),
      preset: String(existingConfig?.preset || TURBO_OPERATIONAL_CONFIG_KEY),
      startHour: clampInteger(input.startHour, safeInteger(existingConfig?.startHour, 20), 0, 23),
      startMinute: clampInteger(input.startMinute, safeInteger(existingConfig?.startMinute, 0), 0, 59),
      endHour: clampInteger(input.endHour, safeInteger(existingConfig?.endHour, 8), 0, 23),
      endMinute: clampInteger(input.endMinute, safeInteger(existingConfig?.endMinute, 0), 0, 59),
      engineCount: clampInteger(input.engineCount, safeInteger(existingConfig?.engineCount, getConfiguredHbxEngineCount()), 1, getConfiguredHbxEngineCount()),
      intensity,
      memoryTargetGb: clampInteger(input.memoryTargetGb, safeInteger(existingConfig?.memoryTargetGb, 16), 1, 256),
      batchSize: clampInteger(input.batchSize, safeInteger(existingConfig?.batchSize, 20), 1, 20),
      maxAttemptsPerTask: clampInteger(input.maxAttemptsPerTask, safeInteger(existingConfig?.maxAttemptsPerTask, 3), 1, 10),
      engineUrlsJson: existingConfig?.engineUrlsJson || JSON.stringify(DEFAULT_MASS_DATA_ENGINE_URLS),
    };
    const existingMetadata = this.parseOperationalMetadata(existingMetadataJson);
    const autonomousFillEnabled = input.autonomousFillEnabled == null
      ? existingMetadata.autonomousFillEnabled
      : coerceBoolean(input.autonomousFillEnabled);
    const autonomousFillBatchSize = clampInteger(
      input.autonomousFillBatchSize,
      existingMetadata.autonomousFillBatchSize,
      1,
      AUTONOMOUS_MASS_DATA_MAX_TASKS,
    );
    const timezone = String(input.timezone || existingMetadata.timezone || 'America/Sao_Paulo').trim();
    const emergencyStop = input.emergencyStop == null ? existingMetadata.emergencyStop : coerceBoolean(input.emergencyStop);
    const stopOutsideWindow = input.stopOutsideWindow == null ? existingMetadata.stopOutsideWindow : coerceBoolean(input.stopOutsideWindow);
    const weekdaysOnly = input.weekdaysOnly == null ? existingMetadata.weekdaysOnly : coerceBoolean(input.weekdaysOnly);
    const weekendAlwaysOn = input.weekendAlwaysOn == null ? existingMetadata.weekendAlwaysOn : coerceBoolean(input.weekendAlwaysOn);
    const factoryState = input.factoryState == null
      ? existingMetadata.factoryState
      : String(input.factoryState || '').trim().toUpperCase().slice(0, 2);
    const factoryCity = input.factoryCity == null
      ? existingMetadata.factoryCity
      : String(input.factoryCity || '').trim().slice(0, 80);
    const factoryMaxEngines = clampInteger(input.maxEngines ?? input.engineCount ?? base.engineCount, base.engineCount, 0, getConfiguredHbxEngineCount());
    const factoryMinEngines = clampInteger(input.minEngines ?? factoryMaxEngines, factoryMaxEngines, 0, factoryMaxEngines);
    const drainTimeoutSeconds = clampInteger(input.drainTimeoutSeconds, existingMetadata.drainTimeoutSeconds || 90, 10, 900);
    const preferredChannels = Object.prototype.hasOwnProperty.call(input, 'preferredChannels')
      ? this.normalizeRadarChannels(input.preferredChannels || [])
      : existingMetadata.preferredChannels;
    const requiredChannels = Object.prototype.hasOwnProperty.call(input, 'requiredChannels')
      ? this.normalizeRadarChannels(input.requiredChannels || [])
      : existingMetadata.requiredChannels;
    const channelMatchMode = Object.prototype.hasOwnProperty.call(input, 'channelMatchMode')
      ? this.normalizeChannelMatchMode(input.channelMatchMode)
      : existingMetadata.channelMatchMode;
    const freshness = Object.prototype.hasOwnProperty.call(input, 'freshness')
      ? this.normalizeFreshness(input.freshness)
      : existingMetadata.freshness;
    const forcedUntilProvided = Object.prototype.hasOwnProperty.call(input, 'forcedUntil');
    const explicitForcedUntil = String(input.forcedUntil || '').trim();
    const now = new Date();
    const forcedUntil = coerceBoolean(input.forceNow)
      ? this.buildForcedUntil(base, now)
      : forcedUntilProvided
        ? (explicitForcedUntil || null)
        : explicitForcedUntil
          ? explicitForcedUntil
          : existingMetadata.forcedUntil && new Date(existingMetadata.forcedUntil).getTime() > now.getTime()
            ? existingMetadata.forcedUntil
            : null;
    return {
      ...base,
      metadataJson: JSON.stringify({
        forcedUntil,
        forcedAt: coerceBoolean(input.forceNow) ? now.toISOString() : existingMetadata.forcedAt,
        autonomousFillEnabled,
        autonomousFillBatchSize,
        timezone,
        emergencyStop,
        stopOutsideWindow,
        weekdaysOnly,
        weekendAlwaysOn,
        factoryState,
        factoryCity,
        factoryMaxEngines,
        factoryMinEngines,
        drainTimeoutSeconds,
        preferredChannels,
        requiredChannels,
        channelMatchMode,
        freshness,
      }),
      forcedUntil,
      autonomousFillEnabled,
      autonomousFillBatchSize,
      timezone,
      emergencyStop,
      stopOutsideWindow,
      weekdaysOnly,
      weekendAlwaysOn,
      factoryState,
      factoryCity,
      factoryMaxEngines,
      factoryMinEngines,
      drainTimeoutSeconds,
      preferredChannels,
      requiredChannels,
      channelMatchMode,
      freshness,
    };
  }

  private async getOperationalConfig() {
    const defaults = this.normalizeOperationalConfigInput();
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) {
      return { key: TURBO_OPERATIONAL_CONFIG_KEY, ...defaults, createdAt: null, updatedAt: null };
    }
    const row = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
    }).catch(() => null);
    if (!row) return { key: TURBO_OPERATIONAL_CONFIG_KEY, ...defaults, createdAt: null, updatedAt: null };
    const metadata = this.parseOperationalMetadata(row.metadataJson);
    return {
      key: row.key,
      enabled: Boolean(row.enabled),
      preset: row.preset || TURBO_OPERATIONAL_CONFIG_KEY,
      startHour: safeInteger(row.startHour, defaults.startHour),
      startMinute: safeInteger(row.startMinute, defaults.startMinute),
      endHour: safeInteger(row.endHour, defaults.endHour),
      endMinute: safeInteger(row.endMinute, defaults.endMinute),
      engineCount: Math.min(Math.max(safeInteger(row.engineCount, defaults.engineCount), 1), getConfiguredHbxEngineCount()),
      intensity: String(row.intensity || defaults.intensity),
      memoryTargetGb: safeInteger(row.memoryTargetGb, defaults.memoryTargetGb),
      batchSize: Math.min(Math.max(safeInteger(row.batchSize, defaults.batchSize), 1), 20),
      maxAttemptsPerTask: Math.min(Math.max(safeInteger(row.maxAttemptsPerTask, defaults.maxAttemptsPerTask), 1), 10),
      engineUrlsJson: row.engineUrlsJson || defaults.engineUrlsJson,
      metadataJson: row.metadataJson || null,
      forcedUntil: metadata.forcedUntil,
      forcedAt: metadata.forcedAt,
      autonomousFillEnabled: metadata.autonomousFillEnabled,
      autonomousFillBatchSize: metadata.autonomousFillBatchSize,
      timezone: metadata.timezone,
      emergencyStop: metadata.emergencyStop,
      stopOutsideWindow: metadata.stopOutsideWindow,
      weekdaysOnly: metadata.weekdaysOnly,
      weekendAlwaysOn: metadata.weekendAlwaysOn,
      factoryState: metadata.factoryState,
      factoryCity: metadata.factoryCity,
      factoryMaxEngines: metadata.factoryMaxEngines,
      factoryMinEngines: metadata.factoryMinEngines,
      drainTimeoutSeconds: metadata.drainTimeoutSeconds,
      preferredChannels: metadata.preferredChannels,
      requiredChannels: metadata.requiredChannels,
      channelMatchMode: metadata.channelMatchMode,
      freshness: metadata.freshness,
      isTurboForcedNow: Boolean(metadata.forcedUntil && new Date(metadata.forcedUntil).getTime() > Date.now()),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private async saveOperationalConfig(masterUserId: number, input: WebscrapingOperationalConfigInput = {}) {
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) {
      throw new ServiceUnavailableException('Estrutura de configuracao operacional do Webscraping ainda nao foi aplicada no banco.');
    }
    const current = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
      select: {
        enabled: true,
        preset: true,
        startHour: true,
        startMinute: true,
        endHour: true,
        endMinute: true,
        engineCount: true,
        intensity: true,
        memoryTargetGb: true,
        batchSize: true,
        maxAttemptsPerTask: true,
        engineUrlsJson: true,
        metadataJson: true,
      },
    }).catch(() => null);
    const normalized = this.normalizeOperationalConfigInput(input, current);
    const { forcedUntil } = normalized;
    const data = {
      enabled: normalized.enabled,
      preset: normalized.preset,
      startHour: normalized.startHour,
      startMinute: normalized.startMinute,
      endHour: normalized.endHour,
      endMinute: normalized.endMinute,
      engineCount: normalized.engineCount,
      intensity: normalized.intensity,
      memoryTargetGb: normalized.memoryTargetGb,
      batchSize: normalized.batchSize,
      maxAttemptsPerTask: normalized.maxAttemptsPerTask,
      engineUrlsJson: normalized.engineUrlsJson,
      metadataJson: normalized.metadataJson,
    };
    const saved = await (this.prisma as any).webscrapingOperationalConfig.upsert({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
      create: {
        key: TURBO_OPERATIONAL_CONFIG_KEY,
        ...data,
        createdByUserId: masterUserId || null,
        updatedByUserId: masterUserId || null,
      },
      update: {
        ...data,
        updatedByUserId: masterUserId || null,
      },
    });
    return {
      key: saved.key,
      enabled: saved.enabled,
      preset: saved.preset,
      startHour: saved.startHour,
      startMinute: saved.startMinute,
      endHour: saved.endHour,
      endMinute: saved.endMinute,
      engineCount: saved.engineCount,
      intensity: saved.intensity,
      memoryTargetGb: saved.memoryTargetGb,
      batchSize: saved.batchSize,
      maxAttemptsPerTask: saved.maxAttemptsPerTask,
      forcedUntil,
      forcedAt: this.parseOperationalMetadata(saved.metadataJson).forcedAt,
      autonomousFillEnabled: this.parseOperationalMetadata(saved.metadataJson).autonomousFillEnabled,
      autonomousFillBatchSize: this.parseOperationalMetadata(saved.metadataJson).autonomousFillBatchSize,
      timezone: this.parseOperationalMetadata(saved.metadataJson).timezone,
      emergencyStop: this.parseOperationalMetadata(saved.metadataJson).emergencyStop,
      stopOutsideWindow: this.parseOperationalMetadata(saved.metadataJson).stopOutsideWindow,
      weekdaysOnly: this.parseOperationalMetadata(saved.metadataJson).weekdaysOnly,
      weekendAlwaysOn: this.parseOperationalMetadata(saved.metadataJson).weekendAlwaysOn,
      factoryState: this.parseOperationalMetadata(saved.metadataJson).factoryState,
      factoryCity: this.parseOperationalMetadata(saved.metadataJson).factoryCity,
      factoryMaxEngines: this.parseOperationalMetadata(saved.metadataJson).factoryMaxEngines,
      factoryMinEngines: this.parseOperationalMetadata(saved.metadataJson).factoryMinEngines,
      drainTimeoutSeconds: this.parseOperationalMetadata(saved.metadataJson).drainTimeoutSeconds,
      preferredChannels: this.parseOperationalMetadata(saved.metadataJson).preferredChannels,
      requiredChannels: this.parseOperationalMetadata(saved.metadataJson).requiredChannels,
      channelMatchMode: this.parseOperationalMetadata(saved.metadataJson).channelMatchMode,
      freshness: this.parseOperationalMetadata(saved.metadataJson).freshness,
      isTurboForcedNow: Boolean(forcedUntil && new Date(forcedUntil).getTime() > Date.now()),
      createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : null,
      updatedAt: saved.updatedAt instanceof Date ? saved.updatedAt.toISOString() : null,
    };
  }

  private isWithinOperationalWindow(config: any, date = new Date()) {
    return this.isForcedOperationalWindow(config, date) || this.isWithinConfiguredOperationalWindow(config, date);
  }

  private nextOperationalWindowAt(config: any, date = new Date()) {
    const next = new Date(date);
    if (this.isWithinConfiguredOperationalWindow(config, date)) return next.toISOString();
    const current = date.getHours() * 60 + date.getMinutes();
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const minutesUntilStart = (start - current + 24 * 60) % (24 * 60) || 24 * 60;
    next.setMinutes(next.getMinutes() + minutesUntilStart, 0, 0);
    return next.toISOString();
  }

  private async resolveMasterCampaignContext(user: any, companyIdInput?: number | string | null) {
    const explicitCompanyId = Number(companyIdInput || 0) || 0;
    const contextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0) || 0;
    const userCompanyId = Number(user?.companyId || 0) || 0;
    let companyId = explicitCompanyId || contextCompanyId || userCompanyId;
    if (!companyId) {
      const company = await this.prisma.company.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      companyId = Number(company?.id || 0);
    }
    const userId = Number(user?.id || 0);
    if (!companyId) throw new BadRequestException('Nenhuma empresa ativa encontrada para vincular a campanha.');
    if (!userId) throw new ForbiddenException('Usuario MASTER nao identificado.');
    return { companyId, userId, user: { ...user, companyId } };
  }

  private formatTimeLabel(hour?: number | null, minute?: number | null) {
    const safeHour = clampInteger(hour, 20, 0, 23);
    const safeMinute = clampInteger(minute, 0, 0, 59);
    return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
  }

  private buildMasterLiveFeed(input: {
    campaigns: any[];
    latestLeads: any[];
    recentSearchRuns: any[];
    engines: any[];
    forcedTurboActive: boolean;
    forcedUntil: string | null;
    capacity: any;
    now: Date;
  }) {
    const items = [
      ...(input.forcedTurboActive ? [{
        id: `turbo-forced-${input.forcedUntil || input.now.toISOString()}`,
        type: 'turbo_forced',
        message: 'Turbo forcado ativo',
        detail: input.forcedUntil ? `Expira em ${new Date(input.forcedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Expiracao configurada no controle operacional.',
        createdAt: input.now.toISOString(),
      }] : []),
      ...input.engines
        .filter((engine: any) => engine.active || ['cooldown', 'offline', 'degraded'].includes(String(engine.status || '').toLowerCase()))
        .map((engine: any) => ({
          id: `engine-${engine.id}-${engine.lastActivityAt || engine.lastCheckedAt || input.now.toISOString()}`,
          type: engine.active ? 'motor_activated' : String(engine.status || '') === 'cooldown' ? 'cooldown' : String(engine.status || '') === 'offline' ? 'error' : 'motor_idle',
          message: `${engine.shortLabel || engine.id} Â· ${engine.stateLabel || engine.status}`,
          detail: engine.detail || null,
          createdAt: engine.lastActivityAt || engine.lastCheckedAt || input.now.toISOString(),
        })),
      ...input.latestLeads.map((lead: any) => ({
        id: `lead-${lead.id}`,
        type: 'lead_saved',
        message: `Card salvo: ${lead.name || 'Lead'}`,
        detail: [lead.city, lead.state, lead.segment, lead.phoneDigits].filter(Boolean).join(' â€¢ '),
        createdAt: lead.lastSeenAt instanceof Date ? lead.lastSeenAt.toISOString() : null,
      })),
      ...input.campaigns.flatMap((campaign: any) => [
        {
          id: `campaign-${campaign.id}`,
          type: String(campaign.status || '') === 'running' ? 'mass_data_started' : 'motor_idle',
          message: `Campanha ${campaign.status || 'ativa'}`,
          detail: [campaign.state, campaign.currentCity || campaign.city, campaign.segment || 'segmentos internos'].filter(Boolean).join(' â€¢ '),
          createdAt: campaign.updatedAt instanceof Date ? campaign.updatedAt.toISOString() : campaign.createdAt instanceof Date ? campaign.createdAt.toISOString() : null,
        },
        ...(campaign.tasks || []).slice(0, 12).map((task: any) => ({
          id: `task-${task.id}`,
          type: String(task.status || '') === 'running'
            ? 'task_started'
            : String(task.status || '') === 'completed'
              ? 'task_completed'
              : String(task.status || '') === 'failed'
                ? 'error'
                : String(task.status || '') === 'exhausted'
                  ? 'rejected'
                  : 'motor_idle',
          message: String(task.status || '') === 'running'
            ? `${task.lockedByEngineId || 'HBX'} coletando`
            : String(task.status || '') === 'completed'
              ? 'Tarefa concluida'
              : String(task.status || '') === 'failed'
                ? 'Tarefa com falha'
                : String(task.status || '') === 'exhausted'
                  ? 'Tarefa esgotada'
                  : 'Tarefa aguardando lote',
          detail: [task.city, task.state, task.segment, task.targetType].filter(Boolean).join(' â€¢ '),
          createdAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : null,
        })),
        ...(campaign.batches || []).slice(0, 8).map((batch: any) => ({
          id: `batch-${batch.id}`,
          type: String(batch.status || '').includes('error')
            ? 'error'
            : safeInteger(batch.duplicateCount) > 0
              ? 'duplicate_skipped'
              : safeInteger(batch.rejectedCount) > 0
                ? 'rejected'
                : 'task_completed',
          message: batch.engineId ? `${batch.engineId} finalizou lote` : 'Lote processado',
          detail: [
            batch.queryUsed,
            safeInteger(batch.approvedCount) ? `${safeInteger(batch.approvedCount)} aprovados` : null,
            safeInteger(batch.duplicateCount) ? `${safeInteger(batch.duplicateCount)} duplicados` : null,
            safeInteger(batch.rejectedCount) ? `${safeInteger(batch.rejectedCount)} rejeitados` : null,
            batch.errorMessage,
          ].filter(Boolean).join(' â€¢ '),
          createdAt: batch.finishedAt instanceof Date ? batch.finishedAt.toISOString() : batch.startedAt instanceof Date ? batch.startedAt.toISOString() : batch.createdAt instanceof Date ? batch.createdAt.toISOString() : null,
        })),
      ]),
      ...input.recentSearchRuns.map((run: any) => ({
        id: `run-${run.id}`,
        type: String(run.status || '') === 'running'
          ? 'task_started'
          : String(run.status || '') === 'queued'
            ? 'motor_idle'
            : String(run.status || '') === 'failed'
              ? 'error'
              : 'task_completed',
        message: run.assignedEngineId ? `${run.assignedEngineId} Â· busca ${run.status}` : `Busca ${run.status}`,
        detail: [
          run.city,
          run.state,
          run.segment,
          safeInteger(run.foundCount) ? `${safeInteger(run.foundCount)} cards` : null,
          run.lastBatchError,
        ].filter(Boolean).join(' â€¢ '),
        createdAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : null,
      })),
    ]
      .filter((item: any) => item.createdAt)
      .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 24);

    if (items.length > 0) return items;
    if (Number(input.capacity?.queuedCount || 0) > 0 || Number(input.capacity?.runningCount || 0) > 0) {
      return [{
        id: `waiting-${input.now.toISOString()}`,
        type: 'motor_idle',
        message: 'Aguardando proximo lote',
        detail: `Fila ${safeInteger(input.capacity?.queuedCount)} â€¢ rodando ${safeInteger(input.capacity?.runningCount)}`,
        createdAt: input.now.toISOString(),
      }];
    }
    if (input.campaigns.length > 0) {
      return [{
        id: `standby-${input.now.toISOString()}`,
        type: 'motor_idle',
        message: 'Motores em standby, aguardando trabalho',
        detail: 'Campanhas carregadas, sem lote em execucao neste instante.',
        createdAt: input.now.toISOString(),
      }];
    }
    return [];
  }
}
