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

export class RadarCoreSearchRunnerMixin {
  [key: string]: any;
  private async assertSearchRunPersistence() {
    const [runTable, itemTable, engineLockTable, attemptColumn, retryColumn] = await Promise.all([
      this.prisma.hasTable('WebscrapingSearchRun'),
      this.prisma.hasTable('WebscrapingSearchRunItem'),
      this.prisma.hasTable('HbxEngineLock'),
      this.prisma.hasColumn('WebscrapingSearchRun', 'attemptCount'),
      this.prisma.hasColumn('WebscrapingSearchRun', 'nextRetryAt'),
    ]);
    if (!runTable || !itemTable || !engineLockTable || !attemptColumn || !retryColumn) {
      throw new ServiceUnavailableException({
        code: 'webscraping_search_run_schema_missing',
        message: 'Estrutura de pesquisa incremental ainda nao foi aplicada no banco.',
      });
    }
  }

  private isTerminalSearchRunStatus(status: string | null | undefined) {
    return this.getRadarSharedNormalizer().isTerminalSearchRunStatus(status);
  }

  private normalizeSearchRunStatus(status: unknown): WebscrapingSearchRunStatus {
    return this.getRadarSharedNormalizer().normalizeSearchRunStatus(status);
  }

  private normalizeRunItemStatus(status: unknown): WebscrapingSearchRunItemStatus {
    return this.getRadarSharedNormalizer().normalizeRunItemStatus(status);
  }

  private buildRadarActiveSearchSignature(filters: Partial<NormalizedRadarFilters | NormalizedSearchInput>) {
    const normalizedCity = normalizeLookupValue(String((filters as any)?.city || ''));
    const normalizedState = String((filters as any)?.state || '').trim().toUpperCase();
    const normalizedSegments = this.splitHbxBatchSegments(String((filters as any)?.segment || ''))
      .map((segment) => normalizeLookupValue(segment))
      .filter(Boolean)
      .sort();
    const regionalCities = Array.isArray((filters as any)?.regionalCities)
      ? (filters as any).regionalCities
          .map((item: any) => `${String(item?.state || '').trim().toUpperCase()}:${normalizeLookupValue(item?.city || '')}`)
          .filter((item: string) => item !== ':')
          .sort()
      : [];
    const preferredChannels = this.normalizeRadarChannels((filters as any)?.preferredChannels).sort();
    const requiredChannels = this.normalizeRadarChannels((filters as any)?.requiredChannels).sort();
    return [
      `state=${normalizedState}`,
      `city=${normalizedCity}`,
      `segments=${normalizedSegments.join(',')}`,
      `radius=${this.normalizeRadiusKm((filters as any)?.radiusKm)}`,
      `regional=${regionalCities.join(',')}`,
      `target=${normalizeTargetType((filters as any)?.targetType)}`,
      `preferred=${preferredChannels.join(',')}`,
      `required=${requiredChannels.join(',')}`,
      `match=${this.normalizeChannelMatchMode((filters as any)?.channelMatchMode)}`,
    ].join('|');
  }

  private radarRunMatchesFilters(run: any, filters: NormalizedRadarFilters) {
    const metrics = parseJsonObject(run?.metricsJson);
    const storedSignature = String(metrics?.activeSearchSignature || metrics?.searchSignature || '').trim();
    const expectedSignature = this.buildRadarActiveSearchSignature(filters);
    if (storedSignature) return storedSignature === expectedSignature;
    return this.buildRadarActiveSearchSignature(this.buildRadarFiltersFromSearchRun(run)) === expectedSignature;
  }

  private buildRunInputFromRow(run: any): SearchContactsInput {
    const metrics = parseJsonObject(run?.metricsJson);
    const storedFilters = parseJsonObject(run?.filtersJson);
    const metricsFilters = parseJsonObject(metrics?.filters);
    const metricsChannelFilters = parseJsonObject(metrics?.channelFilters);
    const channelFilters: Record<string, any> = {
      ...storedFilters,
      ...metricsFilters,
      ...metricsChannelFilters,
      ...(Array.isArray(metrics?.preferredChannels) ? { preferredChannels: metrics.preferredChannels } : {}),
      ...(Array.isArray(metrics?.requiredChannels) ? { requiredChannels: metrics.requiredChannels } : {}),
      ...(metrics?.channelMatchMode ? { channelMatchMode: metrics.channelMatchMode } : {}),
    };
    const salesProfile = metrics?.salesProfile || channelFilters.salesProfile || storedFilters.salesProfile || null;
    return {
      city: String(run?.city || ''),
      state: String(run?.state || ''),
      segment: String(run?.segment || ''),
      quantity: Math.max(1, Math.trunc(Number(run?.targetQuantity || 1))),
      engine: normalizeEngine(run?.engine),
      targetType: normalizeTargetType(run?.targetType),
      radiusKm: this.normalizeRadiusKm(metrics?.radiusKm),
      originLat: this.normalizeCoordinate(metrics?.originLat),
      originLng: this.normalizeCoordinate(metrics?.originLng),
      preferredChannels: this.normalizeRadarChannels(channelFilters.preferredChannels),
      requiredChannels: this.normalizeRadarChannels(channelFilters.requiredChannels),
      channelMatchMode: this.normalizeChannelMatchMode(channelFilters.channelMatchMode),
      salesProfile,
    };
  }

  private buildSearchRunMetricsJson(normalized: NormalizedSearchInput) {
    return JSON.stringify({
      activeSearchSignature: this.buildRadarActiveSearchSignature(normalized),
      radiusKm: normalized.radiusKm,
      originLat: normalized.originLat,
      originLng: normalized.originLng,
      regionalCities: normalized.regionalCities.map((item) => ({
        city: item.city,
        state: item.state,
        distanceKm: item.distanceKm,
      })),
      channelFilters: {
        preferredChannels: normalized.preferredChannels,
        requiredChannels: normalized.requiredChannels,
        channelMatchMode: normalized.channelMatchMode,
      },
      sourceDiagnostics: [],
      radarStageIssues: [],
      ...(normalized.salesProfile ? { salesProfile: normalized.salesProfile } : {}),
    });
  }

  private getHbxRunBatchLimit(targetQuantity: number) {
    return this.getRadarSearchRunConfig().getHbxRunBatchLimit(targetQuantity);
  }

  private getHbxRunMaxAttempts(targetQuantity: number, batchLimit: number) {
    return this.getRadarSearchRunConfig().getHbxRunMaxAttempts(targetQuantity, batchLimit);
  }

  private getHbxRunMaxEmptyBatches() {
    return this.getRadarSearchRunConfig().getHbxRunMaxEmptyBatches();
  }

  private getHbxRunMaxFailedBatches() {
    return this.getRadarSearchRunConfig().getHbxRunMaxFailedBatches();
  }

  private getHbxRunMaxStalledPartialBatches() {
    return this.getRadarSearchRunConfig().getHbxRunMaxStalledPartialBatches();
  }

  private getHbxSearchRunRestDelayMs() {
    return this.getRadarSearchRunConfig().getHbxSearchRunRestDelayMs();
  }

  private getHbxSearchRunMaxRestCycles() {
    return this.getRadarSearchRunConfig().getHbxSearchRunMaxRestCycles();
  }

  private getHbxSearchRunRestThresholdRatio() {
    return this.getRadarSearchRunConfig().getHbxSearchRunRestThresholdRatio();
  }

  private getRadarCampaignMaxEmptyBatches() {
    return this.getRadarSearchRunConfig().getRadarCampaignMaxEmptyBatches();
  }

  private getRadarCampaignMaxErrorBatches() {
    return this.getRadarSearchRunConfig().getRadarCampaignMaxErrorBatches();
  }

  private getHbxBatchTimeoutMs() {
    return this.getRadarSearchRunConfig().getHbxBatchTimeoutMs();
  }

  private getHbxSocialBatchTimeoutMs() {
    return this.getRadarSearchRunConfig().getHbxSocialBatchTimeoutMs(this.getHbxBatchTimeoutMs());
  }

  private getRadarClientRequestTimeoutMs() {
    return this.getRadarSearchRunConfig().getRadarClientRequestTimeoutMs();
  }

  private getRadarPullEngineAttempts() {
    return this.getRadarSearchRunConfig().getRadarPullEngineAttempts(getConfiguredHbxEngineCount());
  }

  private shouldUseGoogleFallbackAfterHbx(input: NormalizedSearchInput, options: SearchExecutionOptions) {
    if (input.engine !== 'hbx' || input.targetType !== 'pj') return false;
    if (options.usageEventType === 'GOOGLE_EMERGENCY_EXECUTED') return false;
    return options.purpose === 'radar_digital';
  }

  private getHbxRetryDelayMs(consecutiveEngineErrors: number) {
    return this.getRadarSearchRunConfig().getHbxRetryDelayMs(consecutiveEngineErrors);
  }

  private scheduleSearchRunPump(delayMs = 0) {
    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, Math.max(0, delayMs));
  }

  private async scheduleNextDueSearchRunPump() {
    const next = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        status: { in: ['queued', 'running', 'sleeping'] },
        assignedEngineId: null,
        nextRetryAt: { not: null },
      },
      orderBy: { nextRetryAt: 'asc' },
      select: { nextRetryAt: true },
    }).catch(() => null);
    if (!(next?.nextRetryAt instanceof Date)) return;
    const delayMs = Math.min(60_000, Math.max(0, next.nextRetryAt.getTime() - Date.now()));
    this.scheduleSearchRunPump(delayMs);
  }

  private parseHbxRoleNiche(segment: string, targetType: HbxTargetType) {
    const raw = String(segment || '').replace(/\s+/g, ' ').trim();
    const withoutDdd = raw.replace(/\bDDD\s*\d{2}\b/gi, '').replace(/\s+/g, ' ').trim();
    const roles = ['consultor', 'corretor', 'vendedor', 'representante', 'autonomo', 'autonomo', 'prestador'];
    const normalized = normalizeLookupValue(withoutDdd);
    const role = roles.find((item) => normalized === item || normalized.startsWith(`${item} `))
      || (targetType === 'pf' || targetType === 'agenda_pf' ? 'consultor' : 'empresa');
    const niche = role && normalizeLookupValue(withoutDdd).startsWith(normalizeLookupValue(role))
      ? withoutDdd.slice(role.length).trim()
      : withoutDdd;
    return {
      role: role || withoutDdd || 'contato',
      niche: niche || withoutDdd || raw || 'contato',
    };
  }

  private extractDddFromSegment(segment: string) {
    const match = String(segment || '').match(/\bDDD\s*(\d{2})\b/i);
    return match?.[1] || '';
  }

  private compactQuery(parts: Array<string | null | undefined>) {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  private expandHbxSegmentAliases(segments: string[]) {
    const aliases = new Map<string, string[]>([
      ['acougue', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['acougues', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['casa de carnes', ['casa de carnes', 'açougue', 'açougues', 'carnes']],
    ]);
    const expanded: string[] = [];
    for (const segment of segments) {
      const raw = String(segment || '').replace(/\s+/g, ' ').trim();
      if (!raw) continue;
      expanded.push(raw);
      const key = normalizeLookupValue(raw);
      for (const [aliasKey, values] of aliases.entries()) {
        if (key === aliasKey || key.includes(aliasKey)) expanded.push(...values);
      }
    }
    return Array.from(new Set(expanded.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 30);
  }


  
  private splitHbxBatchSegments(segment: string) {
    const raw = String(segment || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [];

    const categoryKey = normalizeLookupValue(raw);
    if (categoryKey && HBX_CATEGORY_SEGMENTS[categoryKey]) {
      return Array.from(new Set(
        HBX_CATEGORY_SEGMENTS[categoryKey]
          .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      )).slice(0, 20);
    }

    const segments = raw.includes(',')
      ? raw.split(',').map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [raw];

    return Array.from(new Set(segments)).slice(0, 5);
  }

  private getSearchCityTargets(input: NormalizedSearchInput) {
    const primary = {
      city: input.city,
      state: input.state,
      normalizedCity: input.normalizedCity,
      distanceKm: 0,
    };
    const region = input.radiusKm > 0 && input.regionalCities.length > 0
      ? input.regionalCities
      : [];
    const ordered = [primary, ...region]
      .filter((item) => item.city || item.state);
    const seen = new Set<string>();
    return ordered.filter((item) => {
      const key = [normalizeLookupValue(item.city), String(item.state || '').trim().toUpperCase()].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildSearchInputForAttempt(input: NormalizedSearchInput, attempt: number) {
    const targets = this.getSearchCityTargets(input);
    if (targets.length <= 1) return input;
    const target = targets[Math.max(0, attempt - 1) % targets.length];
    return {
      ...input,
      city: target.city,
      state: target.state,
      normalizedCity: target.normalizedCity,
      radiusKm: 0,
      originLat: null,
      originLng: null,
      regionalCities: [],
    };
  }

  private buildSingleScopeSearchInput(input: NormalizedSearchInput, target: RegionalCity, segment: string): NormalizedSearchInput {
    return {
      ...input,
      city: target.city,
      state: target.state,
      segment,
      normalizedCity: target.normalizedCity,
      normalizedSegment: normalizeLookupValue(segment),
      radiusKm: 0,
      originLat: null,
      originLng: null,
      regionalCities: [],
    };
  }


  
  private profileTextValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    if (value && typeof value === 'object') {
      const source = value as Record<string, any>;
      return [
        ...(Array.isArray(source.labels) ? source.labels : []),
        ...(Array.isArray(source.hardReject) ? source.hardReject : []),
        ...(source.notes ? [source.notes] : []),
      ].map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(value || '').trim() ? [String(value).trim()] : [];
  }

  private isSeniorHealthCommercialIntent(input: NormalizedSearchInput) {
    const profile = input.salesProfile || null;
    if (!profile) return false;
    const offerText = normalizeLookupValue([
      (profile as any).whatDoYouSell,
      (profile as any).offerCategory,
    ].filter(Boolean).join(' '));
    const audienceText = normalizeLookupValue(this.profileTextValues((profile as any).targetAudience).join(' '));
    const sellsHealthPlan = ['plano de saude', 'convenio medico', 'saude'].some((term) => offerText.includes(normalizeLookupValue(term)));
    const targetsSeniors = ['idosos', '60', 'aposentados', 'melhor idade', 'terceira idade'].some((term) => audienceText.includes(normalizeLookupValue(term)));
    return sellsHealthPlan && targetsSeniors;
  }

  private hasIntentSensitiveDiscovery(input: NormalizedSearchInput) {
    return Boolean(input.salesProfile);
  }

  private hasSocialDiscoveryIntent(_input: Pick<NormalizedSearchInput, 'preferredChannels' | 'requiredChannels'>) {
    return false;
  }

  private isSocialDiscoveryQuery(query: string | null | undefined) {
    const normalized = String(query || '').toLowerCase();
    return /(^|\s)site:(www\.)?(instagram|facebook)\.com\b/.test(normalized)
      || /\b(instagram|facebook)\b/.test(normalized);
  }

  private buildHbxBatchQueryVariants(input: NormalizedSearchInput, segment: string, target: RegionalCity) {
    const city = target.city;
    const state = target.state;
    const ddd = this.extractDddFromSegment(segment);
    const { role, niche } = this.parseHbxRoleNiche(segment, input.targetType);
    const normalizedNiche = normalizeLookupValue(niche);
    const normalizedRole = normalizeLookupValue(role);
    const effectiveNiche = normalizedNiche && normalizedNiche !== 'empresa' && normalizedNiche !== normalizedRole
      ? niche
      : segment;
    const requestedChannels = new Set([...(input.preferredChannels || []), ...(input.requiredChannels || [])]);
    const channelQueries: string[] = [];
    const socialDiscovery = this.hasSocialDiscoveryIntent(input);
    if (socialDiscovery || requestedChannels.has('instagram')) {
      channelQueries.push(
        this.compactQuery(['site:instagram.com', effectiveNiche, city, state]),
        this.compactQuery([effectiveNiche, city, state, 'instagram oficial']),
      );
    }
    if (socialDiscovery || requestedChannels.has('facebook')) {
      channelQueries.push(
        this.compactQuery(['site:facebook.com', effectiveNiche, city, state]),
        this.compactQuery([effectiveNiche, city, state, 'facebook oficial']),
      );
    }
    if (requestedChannels.has('website') || requestedChannels.has('email')) {
      channelQueries.push(
        this.compactQuery([effectiveNiche, city, state, 'site oficial']),
        this.compactQuery([effectiveNiche, city, state, 'contato email']),
        this.compactQuery([effectiveNiche, city, state, 'fale conosco']),
      );
    }
    if (this.isSeniorHealthCommercialIntent(input)) {
      for (const compatible of [
        'clínicas geriátricas',
        'cuidadores de idosos',
        'farmácias',
        'laboratórios',
        'fisioterapia',
        'óticas',
        'casas de repouso',
        'associações terceira idade',
      ]) {
        channelQueries.push(this.compactQuery([compatible, city, state, 'contato']));
      }
    }

    if (input.targetType === 'pj') {
      const base = this.compactQuery([effectiveNiche, city, state]);
      return Array.from(new Set([
        ...channelQueries,
        base,
        this.compactQuery([effectiveNiche, city, state, 'telefone']),
        this.compactQuery([effectiveNiche, city, state, 'whatsapp']),
        this.compactQuery([effectiveNiche, city, state, 'contato']),
        ddd ? this.compactQuery([effectiveNiche, 'DDD', ddd]) : '',
      ].filter(Boolean)));
    }

    return Array.from(new Set([
      ...channelQueries,
      this.compactQuery([role, niche, city, state, 'whatsapp']),
      this.compactQuery([role, niche, city, state, 'telefone']),
      this.compactQuery([niche, city, state, 'contato']),
      ddd ? this.compactQuery([role, niche, 'DDD', ddd]) : '',
    ].filter(Boolean)));
  }

  private buildHbxBatchQueryTasks(input: NormalizedSearchInput) {
    const cities = this.getSearchCityTargets(input);
    const segments = this.splitHbxBatchSegments(input.segment);
    const tasks: Array<{
      input: NormalizedSearchInput;
      query: string;
      searchScope: Record<string, any>;
    }> = [];
    for (const [cityIndex, cityTarget] of cities.entries()) {
      const segmentTasks = segments.map((segment, segmentIndex) => {
        const scopedInput = this.buildSingleScopeSearchInput(input, cityTarget, segment);
        const variants = Array.from(new Set(this.buildHbxBatchQueryVariants(input, segment, cityTarget))).filter(Boolean);
        return { segment, segmentIndex, scopedInput, variants };
      });
      const maxQueryCount = Math.max(0, ...segmentTasks.map((item) => item.variants.length));
      for (let queryIndex = 0; queryIndex < maxQueryCount; queryIndex += 1) {
        for (const segmentTask of segmentTasks) {
          const query = segmentTask.variants[queryIndex];
          if (!query) continue;
          tasks.push({
            input: segmentTask.scopedInput,
            query,
            searchScope: {
              currentCity: cityTarget.city,
              currentState: cityTarget.state,
              currentSegment: segmentTask.segment,
              cityIndex: cityIndex + 1,
              cityCount: cities.length,
              segmentIndex: segmentTask.segmentIndex + 1,
              segmentCount: segments.length,
              queryIndex: queryIndex + 1,
              queryCount: segmentTask.variants.length,
              taskIndex: tasks.length + 1,
              taskCount: 0,
              radiusKm: input.radiusKm,
              regionalCities: cities.map((item) => ({
                city: item.city,
                state: item.state,
                distanceKm: item.distanceKm,
              })),
              selectedSegments: segments,
            },
          });
        }
      }
    }
    for (const task of tasks) {
      task.searchScope.taskCount = tasks.length;
    }
    return tasks;
  }

  private getHbxMinimumCoverageAttempts(input: NormalizedSearchInput) {
    const cityCount = Math.max(1, this.getSearchCityTargets(input).length || 1);
    const segmentCount = Math.max(1, this.splitHbxBatchSegments(input.segment).length || 1);
    if (cityCount <= 1 && segmentCount <= 1) return 0;
    const taskCount = this.buildHbxBatchQueryTasks(input).length;
    return Math.min(taskCount, cityCount * segmentCount);
  }

  private hasCompletedHbxMinimumCoverage(input: NormalizedSearchInput, completedAttempts: number) {
    const minimumAttempts = this.getHbxMinimumCoverageAttempts(input);
    return !minimumAttempts || safeInteger(completedAttempts) >= minimumAttempts;
  }

  private buildHbxBatchAttemptTask(input: NormalizedSearchInput, attempt: number) {
    const tasks = this.buildHbxBatchQueryTasks(input);
    if (!tasks.length) {
      return {
        input,
        query: input.segment,
        searchScope: {
          currentCity: input.city,
          currentState: input.state,
          currentSegment: input.segment,
          cityIndex: 1,
          cityCount: 1,
          segmentIndex: 1,
          segmentCount: 1,
          queryIndex: 1,
          queryCount: 1,
          taskIndex: 1,
          taskCount: 1,
          radiusKm: input.radiusKm,
          regionalCities: [],
          selectedSegments: this.splitHbxBatchSegments(input.segment),
        },
      };
    }
    return tasks[Math.max(0, attempt - 1) % tasks.length];
  }

  private buildHbxBatchQueries(input: NormalizedSearchInput) {
    return Array.from(new Set(this.buildHbxBatchQueryTasks(input).map((task) => task.query).filter(Boolean)));
  }

  private buildHbxBatchQuery(input: NormalizedSearchInput, attempt: number) {
    const queries = this.buildHbxBatchQueries(input);
    if (!queries.length) return input.segment;
    return queries[Math.max(0, attempt - 1) % queries.length];
  }

  private extractHbxHttpStatus(error: unknown) {
    return this.getRadarHbxEngineErrors().extractHbxHttpStatus(error);
  }

  private extractHbxErrorMessage(error: unknown) {
    return this.getRadarHbxEngineErrors().extractHbxErrorMessage(error);
  }

  private isRetryableHbxError(error: unknown) {
    return this.getRadarHbxEngineErrors().isRetryableHbxError(error);
  }

  private buildSearchRunProgressMessage(foundCount: number) {
    return this.getRadarSearchRunConfig().buildSearchRunProgressMessage(foundCount);
  }

  private buildSearchRunRetryMessage(errorMessage: string, httpStatus: number | null, foundCount: number) {
    return this.getRadarSearchRunConfig().buildSearchRunRetryMessage(errorMessage, httpStatus, foundCount);
  }

  private buildSearchRunInsufficientMessage(foundCount: number, attempts: number) {
    return this.getRadarSearchRunConfig().buildSearchRunInsufficientMessage(foundCount, attempts);
  }

  private buildSearchRunNoCardsMessage(attempts: number, lastQuery: string | null | undefined) {
    return this.getRadarSearchRunConfig().buildSearchRunNoCardsMessage(attempts, lastQuery);
  }

  private buildSearchRunRestMessage(foundCount: number, targetQuantity: number, nextRetryAt: Date) {
    return this.getRadarSearchRunConfig().buildSearchRunRestMessage(foundCount, targetQuantity, nextRetryAt);
  }

  private buildSearchRunFilterReviewMessage(foundCount: number, targetQuantity: number) {
    return this.getRadarSearchRunConfig().buildSearchRunFilterReviewMessage(foundCount, targetQuantity);
  }

  private getSearchRunRestCount(run: any) {
    return this.getRadarSearchRunConfig().getSearchRunRestCount(
      run?.metricsJson,
      (value) => this.parseMaybeJsonObject(value),
    );
  }

  private shouldRestSearchRun(run: any, foundCount: number, targetQuantity: number) {
    // Manual Radar must not wake up later and deliver cached cards after the Vendas stock target is reached.
    void run;
    void foundCount;
    void targetQuantity;
    return false;
  }

  private async restSearchRunIfEligible(
    runId: string,
    current: any,
    foundCount: number,
    targetQuantity: number,
    reason: string,
  ) {
    if (!this.shouldRestSearchRun(current, foundCount, targetQuantity)) return false;
    const nextRetryAt = new Date(Date.now() + this.getHbxSearchRunRestDelayMs());
    const nextRestCount = this.getSearchRunRestCount(current) + 1;
    await this.updateSearchRunMetrics(runId, {
      radarRestCount: nextRestCount,
      radarRestReason: reason,
      radarRestThresholdRatio: this.getHbxSearchRunRestThresholdRatio(),
      radarRestMaxCycles: this.getHbxSearchRunMaxRestCycles(),
      radarRestNextRetryAt: nextRetryAt.toISOString(),
      status: 'sleeping',
    }).catch(() => null);
    await this.prisma.webscrapingSearchRun.update({
      where: { id: runId },
      data: {
        status: 'sleeping',
        lastBatchStatus: 'radar_resting',
        errorMessage: this.buildSearchRunRestMessage(foundCount, targetQuantity, nextRetryAt),
        nextRetryAt,
        assignedEngineId: null,
        assignedEngineUrl: null,
        assignedEngineIndex: null,
        attemptCount: 0,
        consecutiveEmptyBatchCount: 0,
        consecutiveEngineErrorCount: 0,
        finishedAt: null,
      },
    });
    return true;
  }

  private logHbxBatch(data: {
    runId: string;
    attempt: number;
    batchLimit: number;
    query: string;
    engineUrl: string | null;
    httpStatus: number | null;
    errorMessage: string | null;
    approvedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    nextRetryAt: Date | null;
  }) {
    console.log(`[webscraping-hbx-batch] ${JSON.stringify({
      runId: data.runId,
      attempt: data.attempt,
      batchLimit: data.batchLimit,
      query: data.query,
      engineUrl: data.engineUrl,
      httpStatus: data.httpStatus,
      errorMessage: data.errorMessage,
      approvedCount: data.approvedCount,
      rejectedCount: data.rejectedCount,
      duplicateCount: data.duplicateCount,
      nextRetryAt: data.nextRetryAt ? data.nextRetryAt.toISOString() : null,
    })}`);
  }
}
